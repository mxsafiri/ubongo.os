import { CardShell } from "./CardShell";
import { Play, Pause, SkipBack, SkipForward, Music } from "lucide-react";
import type { MusicInfo } from "@/lib/types";

interface Props {
  info: MusicInfo;
  onAction?: (action: string) => void;
}

export function MusicCard({ info, onAction }: Props) {
  return (
    <CardShell className="flex items-center gap-4">
      {/* Album art */}
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-indigo-900/40 to-violet-900/40">
        {info.artwork_url ? (
          <img src={info.artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-7 h-7 text-indigo-400/40" />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-[15px] font-semibold text-slate-100 truncate">{info.track}</h4>
        <p className="text-[13px] text-slate-400 truncate">{info.artist}</p>
        {info.album && (
          <p className="text-[12px] text-slate-500 truncate">{info.album}</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
          onClick={(e) => { e.stopPropagation(); onAction?.("previous"); }}
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          className="w-11 h-11 rounded-full flex items-center justify-center bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition-all"
          onClick={(e) => { e.stopPropagation(); onAction?.(info.is_playing ? "pause" : "play"); }}
        >
          {info.is_playing ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
          onClick={(e) => { e.stopPropagation(); onAction?.("next"); }}
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>
    </CardShell>
  );
}
