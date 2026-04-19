import { CardShell } from "./CardShell";
import { Cpu } from "lucide-react";
import type { SystemMetric } from "@/lib/types";

interface Props {
  metrics: SystemMetric[];
}

function GaugeBar({ metric }: { metric: SystemMetric }) {
  const pct = Math.min(100, Math.round((metric.value / metric.max) * 100));
  const color =
    pct > 85 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="flex-1 min-w-[140px]">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[14px] text-slate-200 font-semibold">{metric.label}</span>
        <span className="text-[12px] text-slate-400">
          {metric.value.toFixed(1)}{metric.unit} / {metric.max.toFixed(1)}{metric.unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SystemCard({ metrics }: Props) {
  if (!metrics.length) return null;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-2 px-1">
        <Cpu className="w-4 h-4 text-indigo-400/70" />
        <span className="text-[13px] font-semibold text-slate-300 uppercase tracking-wider">
          System
        </span>
      </div>

      <CardShell>
        <div className="flex flex-wrap gap-5">
          {metrics.map((m, i) => (
            <GaugeBar key={i} metric={m} />
          ))}
        </div>
      </CardShell>
    </div>
  );
}
