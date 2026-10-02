"use client";

import { useEffect, useRef, useState } from "react";
import {
  effect,
  frame,
  frameLoop,
  clock,
  storage,
  uniforms,
  surface,
} from "vgpu";
import { latencyTrendShader } from "./shaders/latency-trend";
import { acquireGpu, onDeviceLost, prefersReducedMotion } from "./gpu-runtime";

export type GPUChartPoint = {
  ping: number | null;
  status: number;
};

type GPUResponseChartProps = {
  points: GPUChartPoint[];
  height?: number;
};

/** Mirrors `struct Sample` in latency-trend.ts: vec2f + f32 + f32 = 16 bytes. */
const FLOATS_PER_SAMPLE = 4;
const MAX_SAMPLES = 512;

type Renderer = {
  writeSamples: (points: GPUChartPoint[]) => void;
  dispose: () => void;
};

export function GPUResponseChart({
  points,
  height = 220,
}: GPUResponseChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [status, setStatus] = useState<
    "pending" | "ready" | "lost" | "unsupported"
  >("pending");

  // Points are read through a ref so a new array identity from the parent cannot
  // tear down the GPU context. Re-creating a device per render is both wasteful
  // and, in practice, leaves the canvas blank. The ref is written in an effect
  // rather than during render, which is not concurrent-safe.
  const pointsRef = useRef(points);

  useEffect(() => onDeviceLost(() => setStatus("lost")), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderer: Renderer | undefined;

    (async () => {
      try {
        const gpu = await acquireGpu();
        if (cancelled) return;

        const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
        const sampleBuffer = storage(
          gpu,
          MAX_SAMPLES * FLOATS_PER_SAMPLE * 4,
          "read",
        );

        // Field names must match `struct Params`; vgpu adopts the WGSL layout
        // from this binding and validates later shaders against it.
        const params = uniforms(gpu, {
          count: 0,
          time: 0,
          resolution: [1, 1] as [number, number],
          padding: [0, 0] as [number, number],
        });

        const chart = effect(gpu, latencyTrendShader, {
          set: { params, samples: sampleBuffer },
        });
        const time = clock(gpu);

        const writeSamples = (next: GPUChartPoint[]) => {
          const usable = next.slice(-MAX_SAMPLES);
          if (usable.length === 0) {
            params.set({ count: 0 });
            return;
          }

          const latencies = usable
            .map((p) => p.ping)
            .filter((p): p is number => typeof p === "number" && p > 0);
          const peak = Math.max(...latencies, 1);

          const data = new Float32Array(usable.length * FLOATS_PER_SAMPLE);
          usable.forEach((point, index) => {
            const base = index * FLOATS_PER_SAMPLE;
            data[base] = index / Math.max(usable.length - 1, 1);
            data[base + 1] = (point.ping ?? 0) / peak;
            data[base + 2] = point.status;
            data[base + 3] = 0;
          });

          sampleBuffer.write(data);
          params.set({ count: usable.length });
        };

        writeSamples(pointsRef.current);

        const drawOnce = () => {
          const [width, surfaceHeight] = canvasSurface.size;
          params.set({ time: time.time, resolution: [width, surfaceHeight] });
          frame(gpu, (f) => f.pass(canvasSurface, chart));
        };

        let stop: () => void;
        if (prefersReducedMotion()) {
          // One static frame, and time pinned to 0 so the head marker does not
          // pulse either.
          params.set({ time: 0 });
          drawOnce();
          stop = () => {};
        } else {
          const loop = frameLoop(gpu, (f) => {
            const [width, surfaceHeight] = canvasSurface.size;
            params.set({
              time: time.time,
              resolution: [width, surfaceHeight],
            });
            f.pass(canvasSurface, chart);
          });
          stop = () => loop.stop();
        }

        renderer = { writeSamples, dispose: stop };

        if (!cancelled) {
          rendererRef.current = renderer;
          setStatus("ready");
        }
      } catch (error) {
        console.warn("[GPUResponseChart] WebGPU unavailable:", error);
        if (!cancelled) setStatus("unsupported");
      }
    })();

    return () => {
      cancelled = true;
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, []);

  // Data updates only: push new samples into the existing buffer.
  useEffect(() => {
    pointsRef.current = points;
    rendererRef.current?.writeSamples(points);
  }, [points]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full rounded-xl border border-white/5 bg-neutral-950"
        role="img"
        aria-label="Response time trend"
      />
      {status === "pending" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
        </div>
      )}
      {(status === "unsupported" || status === "lost") && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {status === "lost" ? "Graphics context lost" : "WebGPU unavailable"}
        </p>
      )}
      {status === "ready" && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          WebGPU
        </span>
      )}
    </div>
  );
}
