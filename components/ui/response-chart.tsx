type ResponseChartProps = {
  heartbeats: { ping: number | null; time: string }[];
  maxPing: number;
  "aria-label"?: string;
};

export function ResponseChart({
  heartbeats,
  maxPing,
  "aria-label": ariaLabel,
}: ResponseChartProps) {
  if (heartbeats.length < 2) {
    return (
      <div
        role="status"
        className="h-[80px] flex items-center justify-center text-neutral-500 text-sm"
      >
        Not enough data for chart
      </div>
    );
  }

  const points = heartbeats.slice(0, 100).reverse();
  const chartMax = Math.max(maxPing * 1.1, 100);
  const chartAriaLabel = ariaLabel || "Response time chart";

  return (
    <div className="h-[80px]">
      <div className="h-full relative">
        {/* Y-axis */}
        <div className="absolute left-0 top-0 h-[40px] w-8 flex flex-col justify-between text-[10px] text-neutral-600 pr-1 text-right">
          <span>{Math.round(chartMax)}</span>
          <span>0</span>
        </div>

        {/* Chart */}
        <div className="ml-10 h-[56px]">
          <svg
            role="img"
            className="w-full h-[40px]"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
            aria-label={chartAriaLabel}
          >
            {/* Grid */}
            <line
              x1="0"
              y1="0"
              x2="100"
              y2="0"
              stroke="#404040"
              strokeWidth="0.5"
            />
            <line
              x1="0"
              y1="50"
              x2="100"
              y2="50"
              stroke="#333"
              strokeWidth="0.5"
              strokeDasharray="2"
            />
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="100"
              stroke="#404040"
              strokeWidth="0.5"
            />

            {/* Area fill */}
            <path
              d={`M 0 100 ${points
                .map((p, i) => {
                  const x = (i / (points.length - 1)) * 100;
                  const y = 100 - ((p.ping || 0) / chartMax) * 100;
                  return `L ${x} ${y}`;
                })
                .join(" ")} L 100 100 Z`}
              fill="url(#areaGradient)"
            />

            {/* Line */}
            <path
              d={`M ${points
                .map((p, i) => {
                  const x = (i / (points.length - 1)) * 100;
                  const y = 100 - ((p.ping || 0) / chartMax) * 100;
                  return `${i === 0 ? "" : "L "}${x} ${y}`;
                })
                .join(" ")}`}
              fill="none"
              stroke="#22c55e"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />

            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between text-xs text-neutral-600 mt-1">
            <span>
              {new Date(points[0]?.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>
              {new Date(points[points.length - 1]?.time).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" },
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
