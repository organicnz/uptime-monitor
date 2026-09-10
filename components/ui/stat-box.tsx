import { cn } from "@/lib/utils";

export interface StatBoxProps {
  label: string;
  sublabel?: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
  className?: string;
}

export function StatBox({
  label,
  sublabel,
  value,
  highlight,
  muted,
  className,
}: StatBoxProps) {
  return (
    <div
      className={cn(
        "py-3 sm:py-5 px-2 sm:px-4 text-center border-b border-white/5 sm:border-r last:border-r-0",
        className,
      )}
    >
      <div className="text-xs sm:text-sm text-neutral-400 mb-0.5 sm:mb-1">
        {label}
        {sublabel && (
          <span className="block text-[10px] sm:text-xs text-neutral-500">
            {sublabel}
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-base sm:text-lg font-semibold truncate",
          highlight &&
            "text-green-400 underline decoration-green-400/30 underline-offset-2 cursor-pointer hover:text-green-300",
          muted && "text-neutral-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}
