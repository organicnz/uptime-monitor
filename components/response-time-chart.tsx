"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subHours } from "date-fns";

type Heartbeat = {
  id: string;
  status: number;
  ping: number | null;
  time: string;
};

type ResponseTimeChartProps = {
  heartbeats: Heartbeat[];
  monitorId: string;
};

type TimeRange = "24h" | "7d" | "30d";

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export function ResponseTimeChart({
  heartbeats,
  monitorId,
}: ResponseTimeChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const filteredData = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case "24h":
        startDate = subHours(now, 24);
        break;
      case "7d":
        startDate = subDays(now, 7);
        break;
      case "30d":
        startDate = subDays(now, 30);
        break;
    }

    const filtered = heartbeats
      .filter((hb) => new Date(hb.time) >= startDate && hb.ping !== null)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Aggregate data points for smoother charts
    if (timeRange === "30d" && filtered.length > 100) {
      const grouped = new Map<
        string,
        { sum: number; count: number; status: number }
      >();
      filtered.forEach((hb) => {
        const key = format(new Date(hb.time), "yyyy-MM-dd HH:00");
        const existing = grouped.get(key) || { sum: 0, count: 0, status: 1 };
        grouped.set(key, {
          sum: existing.sum + (hb.ping || 0),
          count: existing.count + 1,
          status: hb.status === 0 ? 0 : existing.status,
        });
      });
      return Array.from(grouped.entries()).map(([time, data]) => ({
        time,
        ping: Math.round(data.sum / data.count),
        status: data.status,
      }));
    }

    if (timeRange === "7d" && filtered.length > 200) {
      const grouped = new Map<
        string,
        { sum: number; count: number; status: number }
      >();
      filtered.forEach((hb) => {
        const date = new Date(hb.time);
        const minutes = Math.floor(date.getMinutes() / 15) * 15;
        date.setMinutes(minutes, 0, 0);
        const key = date.toISOString();
        const existing = grouped.get(key) || { sum: 0, count: 0, status: 1 };
        grouped.set(key, {
          sum: existing.sum + (hb.ping || 0),
          count: existing.count + 1,
          status: hb.status === 0 ? 0 : existing.status,
        });
      });
      return Array.from(grouped.entries()).map(([time, data]) => ({
        time,
        ping: Math.round(data.sum / data.count),
        status: data.status,
      }));
    }

    return filtered.map((hb) => ({
      time: hb.time,
      ping: hb.ping || 0,
      status: hb.status,
    }));
  }, [heartbeats, timeRange]);

  const stats = useMemo(() => {
    if (filteredData.length === 0) return { avg: 0, min: 0, max: 0 };
    const pings = filteredData.map((d) => d.ping);
    return {
      avg: Math.round(pings.reduce((a, b) => a + b, 0) / pings.length),
      min: Math.min(...pings),
      max: Math.max(...pings),
    };
  }, [filteredData]);

  const formatXAxis = useCallback(
    (time: string) => {
      const date = new Date(time);
      if (timeRange === "24h") {
        return format(date, "HH:mm");
      }
      if (timeRange === "7d") {
        return format(date, "EEE");
      }
      return format(date, "MMM d");
    },
    [timeRange],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = useCallback((props: any) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
          <p className="text-muted-foreground mb-1">
            {format(new Date(data.payload.time), "MMM d, HH:mm")}
          </p>
          <p className="font-semibold">
            <span
              className={cn(
                data.payload.status === 0 ? "text-red-500" : "text-emerald-500",
              )}
            >
              {data.value}ms
            </span>
          </p>
        </div>
      );
    }
    return null;
  }, []);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Activity className="h-4 w-4 text-primary" />
            Response Time
          </CardTitle>
          <div className="flex items-center gap-1">
            {timeRanges.map((range) => (
              <Button
                key={range.value}
                variant={timeRange === range.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setTimeRange(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
          <span>
            Avg:{" "}
            <span className="font-medium text-foreground">{stats.avg}ms</span>
          </span>
          <span>
            Min:{" "}
            <span className="font-medium text-emerald-500">{stats.min}ms</span>
          </span>
          <span>
            Max:{" "}
            <span className="font-medium text-amber-500">{stats.max}ms</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {filteredData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient
                    id={`gradient-${monitorId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatXAxis}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}ms`}
                  width={50}
                />
                <Tooltip content={renderTooltip} />
                <Area
                  type="monotone"
                  dataKey="ping"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill={`url(#gradient-${monitorId})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "hsl(var(--primary))",
                    stroke: "hsl(var(--background))",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No data available for this time range
          </div>
        )}
      </CardContent>
    </Card>
  );
}
