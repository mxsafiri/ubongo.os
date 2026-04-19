import { CardShell } from "./CardShell";
import { Rocket, XCircle, AlertCircle } from "lucide-react";
import type { AppInfo } from "@/lib/types";

interface Props {
  info: AppInfo;
}

export function AppCard({ info }: Props) {
  const isSuccess = info.status === "success";
  const isFailed = info.status === "failed" || info.status === "not_found";

  return (
    <CardShell className="flex items-center gap-4">
      {/* App icon placeholder */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 ${
          isSuccess
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-red-500/15 text-red-400"
        }`}
      >
        {info.app_name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-[15px] font-semibold text-slate-100">{info.app_name}</h4>
        <p className="text-[13px] text-slate-400 capitalize">{info.action}</p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 shrink-0">
        {isSuccess ? (
          <>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[13px] text-emerald-400 font-medium">Done</span>
          </>
        ) : (
          <>
            {isFailed ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-[13px] text-red-400">
              {info.status === "not_found" ? "Not found" : "Failed"}
            </span>
          </>
        )}
      </div>
    </CardShell>
  );
}
