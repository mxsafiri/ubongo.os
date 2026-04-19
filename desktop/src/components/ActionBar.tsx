/**
 * Bottom action bar — Raycast-style keyboard hints + status.
 */

import type { StatusData } from "@/lib/types";

interface Props {
  hasResults: boolean;
  status: StatusData | null;
}

export function ActionBar({ hasResults, status }: Props) {
  const used = status?.monthly_query_count ?? 0;
  const limit = status?.query_limit ?? 200;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.04]">
      {/* Left: keyboard hints */}
      <div className="flex items-center gap-3">
        {hasResults ? (
          <>
            <Hint keys="↑↓" label="navigate" />
            <Hint keys="↵" label="run" />
            <Hint keys="esc" label="clear" />
          </>
        ) : (
          <>
            <Hint keys="↵" label="send" />
            <Hint keys="esc" label="dismiss" />
          </>
        )}
      </div>

      {/* Right: usage */}
      <div className="flex items-center gap-2">
        <div className="w-16 h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500/60 to-violet-500/60 rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.round((used / limit) * 100))}%`,
            }}
          />
        </div>
        <span className="text-[9px] text-slate-600 tabular-nums font-mono">
          {used}/{limit}
        </span>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-slate-600">
      <kbd className="px-1 py-[1px] rounded bg-white/[0.04] border border-white/[0.06] font-mono text-[8px] text-slate-500">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
