import { useState } from "react";
import { Check, Copy, CornerDownLeft, PenLine } from "lucide-react";
import { CardShell } from "./CardShell";
import { invoke } from "@/lib/tauri";
import type { DraftInfo } from "@/lib/types";

/**
 * A draft Ubongo wrote: editable, then Copy or Insert into the app the user
 * was in. Nothing is typed anywhere until the user clicks Insert.
 */
export function DraftCard({ info }: { info: DraftInfo }) {
  const [text, setText] = useState(info.text);
  const [status, setStatus] = useState<"idle" | "copied" | "inserting" | "inserted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async (cmd: "draft_copy" | "draft_insert") => {
    setError(null);
    setStatus(cmd === "draft_insert" ? "inserting" : "idle");
    try {
      const res: any = await invoke(cmd, cmd === "draft_insert" ? { text, target: info.app } : { text });
      if (res?.detail) throw new Error(res.detail);
      setStatus(cmd === "draft_insert" ? "inserted" : "copied");
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message || "That didn't work. Try Copy instead.");
      setStatus("error");
    }
  };

  return (
    <CardShell className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <PenLine className="w-4 h-4 text-indigo-300" />
        <span className="text-[13px] font-semibold text-slate-100 truncate">
          {info.title || "Draft"}
        </span>
        {info.app && (
          <span className="ml-auto text-[11px] text-slate-500 shrink-0">for {info.app}</span>
        )}
      </div>

      <textarea
        aria-label="Draft text"
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus("idle"); }}
        rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
        className="w-full resize-y rounded-lg bg-black/20 border border-white/[0.06] focus:border-indigo-400/40
                   outline-none px-3 py-2 text-[13px] leading-relaxed text-slate-200"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => run("draft_copy")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5
                     text-[12px] text-slate-200 hover:border-indigo-400/40 hover:bg-indigo-500/[0.06]"
        >
          {status === "copied" ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          {status === "copied" ? "Copied" : "Copy"}
        </button>
        {info.app && (
          <button
            onClick={() => run("draft_insert")}
            disabled={status === "inserting" || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 px-3 py-1.5
                       text-[12px] font-medium text-white disabled:opacity-50"
          >
            {status === "inserted" ? <Check className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
            {status === "inserted" ? `Inserted into ${info.app}` : `Insert into ${info.app}`}
          </button>
        )}
      </div>

      {error && <p className="text-[12px] text-rose-300">{error}</p>}
    </CardShell>
  );
}
