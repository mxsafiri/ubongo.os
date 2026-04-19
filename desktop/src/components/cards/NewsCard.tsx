import { CardShell } from "./CardShell";
import { Globe, ExternalLink } from "lucide-react";
import type { NewsItem } from "@/lib/types";

function faviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

function relativeDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

interface Props {
  items: NewsItem[];
  onOpenUrl: (url: string) => void;
}

export function NewsCard({ items, onOpenUrl }: Props) {
  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Globe className="w-4 h-4 text-indigo-400/70" />
        <span className="text-[13px] font-semibold text-slate-300 uppercase tracking-wider">
          News
        </span>
        <span className="text-[12px] text-slate-500">{items.length} stories</span>
      </div>

      {items.slice(0, 5).map((item, i) => (
        <CardShell
          key={i}
          delay={i * 0.06}
          onClick={() => onOpenUrl(item.url)}
          className="flex gap-3.5 items-start group"
        >
          {/* Thumbnail */}
          <div className="w-[88px] h-[64px] rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-indigo-900/30 to-violet-900/30">
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Globe className="w-6 h-6 text-indigo-400/30" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Source + date */}
            <div className="flex items-center gap-2 mb-1">
              {item.source_url && (
                <img
                  src={faviconUrl(item.source_url)}
                  alt=""
                  className="w-4 h-4 rounded-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span className="text-[12px] text-slate-500 truncate">{item.source}</span>
              {item.date && (
                <>
                  <span className="text-[12px] text-slate-600">·</span>
                  <span className="text-[12px] text-slate-500">{relativeDate(item.date)}</span>
                </>
              )}
            </div>

            {/* Headline */}
            <h4 className="text-[14px] font-medium text-slate-200 leading-snug line-clamp-2 group-hover:text-white transition-colors">
              {item.headline}
            </h4>

            {/* Snippet */}
            {item.snippet && (
              <p className="text-[12px] text-slate-400 leading-relaxed mt-0.5 line-clamp-1">
                {item.snippet}
              </p>
            )}
          </div>

          {/* External link indicator */}
          <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
        </CardShell>
      ))}
    </div>
  );
}
