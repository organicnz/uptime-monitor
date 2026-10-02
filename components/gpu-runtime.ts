"use client";

import { init, type Gpu } from "vgpu";

/**
 * One GPU context per page, shared by every consumer.
 *
 * `init()` acquires an adapter and device and must not be raced: creating two
 * concurrently and disposing the first tears down pipeline and bind-group state
 * the second still depends on, which shows up as a chart that sometimes renders
 * and sometimes stays blank. React's StrictMode double-mount makes that race
 * routine rather than rare, so the context is created once here and is not
 * disposed on unmount -- the browser reclaims it when the page goes away, and a
 * device per navigation would be wasted work regardless.
 */
let pending: Promise<Gpu> | null = null;

type DeviceLostListener = (reason: string) => void;
const lostListeners = new Set<DeviceLostListener>();
let lossHandled = false;

function handleDeviceLoss(gpu: Gpu): void {
  // A lost device cannot be revived; drop the cached promise so the next mount
  // acquires a fresh one instead of handing out a dead context forever.
  void gpu.gpu.lost
    .then((info: { message?: string }) => {
      if (pending === null) return;
      pending = null;
      lossHandled = false;
      for (const listener of lostListeners) {
        listener(info.message || "GPU device lost");
      }
    })
    .catch(() => {
      // `lost` only rejects for programming errors; nothing to recover.
    });
}

export function acquireGpu(): Promise<Gpu> {
  if (pending === null) {
    pending = init().then((gpu) => {
      if (!lossHandled) {
        lossHandled = true;
        handleDeviceLoss(gpu);
      }
      return gpu;
    });
    pending = pending.catch((error: unknown) => {
      // Never cache a rejection: a later mount gets a fresh attempt, which is
      // what makes a transient adapter failure recoverable.
      pending = null;
      lossHandled = false;
      throw error;
    });
  }
  return pending;
}

/** Notifies when the shared device is lost so views can show a fallback. */
export function onDeviceLost(listener: DeviceLostListener): () => void {
  lostListeners.add(listener);
  return () => {
    lostListeners.delete(listener);
  };
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Both canvases animate continuously: the trend pulses its newest sample and
 * the backdrop drifts. That is exactly the kind of motion that triggers
 * vestibular symptoms, so honour the OS preference and render a single static
 * frame instead of looping.
 *
 * Read once per mount. Reacting live to a mid-session change would mean swapping
 * between a one-shot `frame()` and a `frameLoop()`, which is more machinery
 * than the preference warrants; a remount picks it up.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
