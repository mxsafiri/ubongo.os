import { CardShell } from "./CardShell";
import { Search, ExternalLink } from "lucide-react";
import type { SearchItem } from "@/lib/types";

function faviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace("www.", "") + (u.pathname !== "/" ? u.pathname.slice(0, 30) : "");
  } catch {
    return url.slice(0, 40);
  }
}

interface Props {
  query: string;
  items: SearchItem[];
  onOpenUrl: (url: string) => void;
}

export function SearchResultCard({ query, items, onOpenUrl }: Props) {
  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Search className="w-4 h-4 text-indigo-400/70" />
        <span className="text-[13px] text-slate-400">
          Results for <span className="text-slate-200 font-semibold">"{query}"</span>
        </span>
      </div>

      {items.slice(0, 6).map((item, i) => (
        <CardShell
          key={i}
          delay={i * 0.05}
          onClick={() => onOpenUrl(item.url)}
          className="group"
        >
          <div className="flex items-start gap-3">
            {/* Favicon */}
            <img
              src={faviconUrl(item.url)}
              alt=""
              className="w-5 h-5 rounded-sm mt-0.5 shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />

            <div className="flex-1 min-w-0">
              {/* URL */}
              <span className="text-[11px] text-slate-500 block truncate mb-0.5">
                {shortUrl(item.url)}
              </span>

              {/* Title */}
              <h4 className="text-[14px] font-medium text-indigo-300 group-hover:text-indigo-200 leading-snug line-clamp-1 transition-colors">
                {item.title}
              </h4>

              {/* Snippet */}
              {item.snippet && (
                <p className="text-[12px] text-slate-400 leading-relaxed mt-0.5 line-clamp-2">
                  {item.snippet}
                </p>
              )}
            </div>

            <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
          </div>
        </CardShell>
      ))}
    </div>
  );
}
