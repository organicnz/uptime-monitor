"use client";

import dynamic from "next/dynamic";

export const GPUStatusBackground = dynamic(
  () =>
    import("./gpu-status-background").then((mod) => mod.GPUStatusBackground),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 -z-10" aria-hidden="true" />
    ),
  },
);
