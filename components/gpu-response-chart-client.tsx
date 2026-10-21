"use client";

import dynamic from "next/dynamic";

export const GPUResponseChart = dynamic(
  () => import("./gpu-response-chart").then((mod) => mod.GPUResponseChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Initializing GPU renderer...
        </p>
      </div>
    ),
  },
);
