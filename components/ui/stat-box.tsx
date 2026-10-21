import { cn } from "@/lib/utils";

export interface StatBoxProps {
  label: string;
  sublabel?: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function StatBox({
  label,
  sublabel,
  value,
  highlight,
  muted,
  className,
  "aria-label": ariaLabel,
}: StatBoxProps) {
  const ariaLabelValue = ariaLabel || ` ${label}: ${value}`;
  return (
    <div
      role="group"
      className={cn(
        "border-b border-white/5 px-2 py-3 text-center last:border-r-0 sm:border-r sm:px-4 sm:py-5",
        className,
      )}
      aria-label={ariaLabelValue}
    >
      <div className="mb-0.5 text-xs text-neutral-400 sm:mb-1 sm:text-sm">
        {label}
        {sublabel && (
          <span className="block text-[10px] text-neutral-500 sm:text-xs">
            {sublabel}
          </span>
        )}
      </div>
      <div
        className={cn(
          "truncate text-base font-semibold sm:text-lg",
          highlight &&
            "cursor-pointer text-green-400 underline decoration-green-400/30 underline-offset-2 hover:text-green-300",
          muted && "text-neutral-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}
