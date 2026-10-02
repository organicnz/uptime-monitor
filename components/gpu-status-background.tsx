"use client";

import { useEffect, useRef, useState } from "react";
import { effect, frame, frameLoop, clock, uniforms, surface } from "vgpu";
import { statusBackdropShader } from "./shaders/status-backdrop";
import { acquireGpu, prefersReducedMotion } from "./gpu-runtime";

type GPUStatusBackgroundProps = {
  status: "up" | "down" | "pending" | "degraded" | "maintenance";
  className?: string;
};

/** Must stay in sync with HEARTBEAT_STATUS in lib/monitor-status.ts. */
const STATUS_CODE: Record<GPUStatusBackgroundProps["status"], number> = {
  down: 0,
  up: 1,
  pending: 2,
  maintenance: 3,
  degraded: 4,
};

/**
 * Kept low: this sits behind body text on a public page, so it must never
 * compete with the status banner for attention.
 */
const INTENSITY: Record<GPUStatusBackgroundProps["status"], number> = {
  down: 0.5,
  degraded: 0.36,
  pending: 0.26,
  maintenance: 0.22,
  up: 0.16,
};

export function GPUStatusBackground({
  status,
  className = "",
}: GPUStatusBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  // Written in an effect, not during render, which is not concurrent-safe.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    (async () => {
      try {
        const gpu = await acquireGpu();
        if (cancelled) return;

        const canvasSurface = surface(gpu, canvas, { dpr: [1, 1.5] });
        // Seeded from props but driven by the ref, so a status change never
        // re-creates the device.
        const params = uniforms(gpu, {
          time: 0,
          status: STATUS_CODE[statusRef.current],
          aspect: 1,
          intensity: INTENSITY[statusRef.current],
          resolution: [1, 1] as [number, number],
          padding: [0, 0] as [number, number],
        });
        const backdrop = effect(gpu, statusBackdropShader, {
          set: { params },
        });
        const time = clock(gpu);

        const apply = (frozen: boolean) => {
          const [width, height] = canvasSurface.size;
          const current = statusRef.current;
          params.set({
            time: frozen ? 0 : time.time,
            status: STATUS_CODE[current],
            intensity: INTENSITY[current],
            aspect: width / Math.max(height, 1),
            resolution: [width, height],
          });
        };

        if (prefersReducedMotion()) {
          // Static single frame: the noise field is not animated at all.
          apply(true);
          frame(gpu, (f) => f.pass(canvasSurface, backdrop));
          teardown = () => {};
        } else {
          const loop = frameLoop(gpu, (f) => {
            apply(false);
            f.pass(canvasSurface, backdrop);
          });
          teardown = () => loop.stop();
        }

        if (!cancelled) setSupported(true);
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  if (supported === false) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 h-full w-full ${className}`}
    />
  );
}
