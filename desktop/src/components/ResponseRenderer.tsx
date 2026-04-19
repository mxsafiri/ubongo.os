/**
 * ResponseRenderer — dispatches rich cards based on response type.
 * Falls back to MarkdownResponse for plain text.
 */

import { invoke } from "@/lib/tauri";
import type { ResponseCard } from "@/lib/types";
import { NewsCard } from "./cards/NewsCard";
import { SearchResultCard } from "./cards/SearchResultCard";
import { FileCard } from "./cards/FileCard";
import { MusicCard } from "./cards/MusicCard";
import { AppCard } from "./cards/AppCard";
import { SystemCard } from "./cards/SystemCard";
import { MarkdownResponse } from "./cards/MarkdownResponse";
import { ScreenshotCard } from "./cards/ScreenshotCard";

interface Props {
  cards: ResponseCard[];
  fallbackText?: string | null;
  model?: string | null;
  onMusicAction?: (action: string) => void;
  /** When provided, markdown list items become tappable re-queries. */
  onActionTap?: (text: string) => void;
}

function openUrl(url: string) {
  // Use Tauri shell to open URLs in default browser
  invoke("open_url", { url }).catch(() => {
    window.open(url, "_blank");
  });
}

function openFile(path: string) {
  invoke("open_file", { path }).catch(() => {
    console.warn("Could not open file:", path);
  });
}

export function ResponseRenderer({ cards, fallbackText, model, onMusicAction, onActionTap }: Props) {
  // If we have cards, render them
  const hasCards = cards && cards.length > 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Model badge */}
      {model && (
        <span className="inline-block self-start text-[11px] text-indigo-400/60 bg-indigo-500/[0.08] border border-indigo-500/[0.12] rounded-md px-2 py-0.5 font-mono">
          {model}
        </span>
      )}

      {/* Rich cards */}
      {hasCards &&
        cards.map((card, i) => {
          switch (card.type) {
            case "news":
              return <NewsCard key={i} items={card.data.items} onOpenUrl={openUrl} />;
            case "search":
              return (
                <SearchResultCard
                  key={i}
                  query={card.data.query}
                  items={card.data.items}
                  onOpenUrl={openUrl}
                />
              );
            case "file":
              return <FileCard key={i} items={card.data.items} onOpenFile={openFile} />;
            case "music":
              return <MusicCard key={i} info={card.data} onAction={onMusicAction} />;
            case "app":
              return <AppCard key={i} info={card.data} />;
            case "system":
              return <SystemCard key={i} metrics={card.data.metrics} />;
            case "markdown":
              return (
                <MarkdownResponse
                  key={i}
                  content={card.data.content}
                  onActionTap={onActionTap}
                />
              );
            case "screenshot":
              return <ScreenshotCard key={i} info={card.data} />;
            default:
              return null;
          }
        })}

      {/* Fallback text (when no cards or additional AI commentary) */}
      {fallbackText && !hasCards && (
        <MarkdownResponse content={fallbackText} onActionTap={onActionTap} />
      )}

      {/* If we have cards AND fallback text, show the text below cards as additional context */}
      {fallbackText && hasCards && (
        <div className="mt-1 pt-2 border-t border-white/[0.04]">
          <MarkdownResponse content={fallbackText} onActionTap={onActionTap} />
        </div>
      )}
    </div>
  );
}
