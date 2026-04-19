/**
 * ScreenshotCard — renders a captured screenshot as a rich visual card.
 *
 * Two flavours:
 *  - Raw screenshot: just the image + "Open" / "Copy path" actions.
 *  - describe_screen: image + vision-generated description underneath.
 *
 * The backend includes `base64` only when vision was used; otherwise we
 * load the file via a local URL (convertFileSrc → tauri://localfile).
 */

import { motion } from "motion/react";
import { Camera, FolderOpen, Copy, Check, Eye } from "lucide-react";
import { useState, useMemo } from "react";
import { convertFileSrc, invoke } from "@/lib/tauri";
import { CardShell } from "./CardShell";
import type { ScreenshotInfo } from "@/lib/types";

interface Props {
  info: ScreenshotInfo;
}

export function ScreenshotCard({ info }: Props) {
  const [copied, setCopied] = useState(false);

  const imageSrc = useMemo(() => {
    if (info.base64) return `data:image/png;base64,${info.base64}`;
    try {
      return convertFileSrc(info.path);
    } catch {
      return "";
    }
  }, [info.base64, info.path]);

  const openFile = () => {
    invoke("open_file", { path: info.path }).catch(() => {});
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(info.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const modeLabel =
    info.mode === "window" ? "Window"
    : info.mode === "selection" ? "Selection"
    : "Full screen";

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-2 px-1">
        <Camera className="w-4 h-4 text-indigo-400/70" />
        <span className="text-[13px] font-semibold text-slate-300 uppercase tracking-wider">
          Screenshot
        </span>
        <span className="text-[12px] text-slate-500">{modeLabel}</span>
      </div>

      <CardShell className="p-0 overflow-hidden">
        {/* ── Image preview ── */}
        {imageSrc && (
          <motion.div
            className="relative w-full bg-black/40 cursor-zoom-in overflow-hidden"
            onClick={openFile}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <img
              src={imageSrc}
              alt={info.filename}
              className="w-full max-h-[340px] object-contain"
              draggable={false}
            />
            {/* hover scrim with "open" hint */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <div className="flex items-center gap-1.5 text-[12px] text-white/90 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10">
                <Eye className="w-3.5 h-3.5" />
                <span>Open in Preview</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Vision description (if present) ── */}
        {info.description && (
          <div className="px-4 py-3 border-t border-white/[0.05] bg-white/[0.015]">
            <p className="text-[14px] leading-[1.55] text-slate-200 whitespace-pre-wrap">
              {info.description}
            </p>
          </div>
        )}

        {/* ── Footer: filename + actions ── */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-white/[0.05]">
          <span className="flex-1 min-w-0 text-[12px] text-slate-400 truncate font-mono">
            {info.filename}
          </span>

          <button
            onClick={copyPath}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] rounded-md px-2 py-1 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy path</span>
              </>
            )}
          </button>

          <button
            onClick={openFile}
            className="inline-flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/[0.12] rounded-md px-2 py-1 transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Open</span>
          </button>
        </div>
      </CardShell>
    </div>
  );
}
