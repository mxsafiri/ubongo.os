/**
 * MarkdownResponse — quick-action display, not a chatbot wall of text.
 *
 * Philosophy for ubongo (quick-action assistant):
 *  - The first paragraph is the HEADLINE (big, light). You read it at a glance.
 *  - Numbered/bulleted lists = follow-up ACTIONS → rendered as tappable cards
 *    with an icon + arrow. One tap re-queries ubongo with that action text.
 *  - Body text is generously sized (15px) for quick readability.
 *  - Long responses collapse after 8 blocks to keep the UI compact.
 */

import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronDown,
  ArrowRight,
  Search,
  FolderPlus,
  Folder,
  FileText,
  Settings,
  Play,
  Zap,
  CheckCircle2,
  Plus,
  Rocket,
} from "lucide-react";

interface Props {
  content: string;
  /** When provided, list items render as tappable cards that fire this callback. */
  onActionTap?: (text: string) => void;
}

/* ── Pick an icon based on the action text ─────────────────────────── */

function iconForAction(text: string): React.ReactNode {
  const t = text.toLowerCase();
  if (/\b(search|find|look)\b/.test(t))                 return <Search className="w-4 h-4" />;
  if (/\b(create|make|new|add)\b.*folder/.test(t))      return <FolderPlus className="w-4 h-4" />;
  if (/\b(create|make|new|add)\b/.test(t))              return <Plus className="w-4 h-4" />;
  if (/\b(check|browse|view)\b.*(folder|desktop|documents|downloads)/.test(t))
                                                        return <Folder className="w-4 h-4" />;
  if (/\b(open|launch|start|run)\b/.test(t))            return <Rocket className="w-4 h-4" />;
  if (/\b(play|music|song|track)\b/.test(t))            return <Play className="w-4 h-4" />;
  if (/\b(file|document|note|text)\b/.test(t))          return <FileText className="w-4 h-4" />;
  if (/\b(setting|config|prefer)/.test(t))              return <Settings className="w-4 h-4" />;
  if (/\b(done|complete|finish|ok|yes)\b/.test(t))      return <CheckCircle2 className="w-4 h-4" />;
  return <Zap className="w-4 h-4" />;
}

/* ── Inline formatting (bold / italic / code / link) ───────────────── */

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    if (match[2]) {
      parts.push(
        <strong key={match.index} className="text-white font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={match.index} className="text-slate-200">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={match.index}
          className="text-[13px] text-indigo-300 bg-indigo-500/[0.1] border border-indigo-500/15 rounded px-1.5 py-0.5 font-mono"
        >
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-400/40"
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

/* ── Tappable action card (list item rendered as button) ──────────── */

function ActionCard({
  text,
  accent = false,
  onTap,
}: {
  text: string;
  accent?: boolean;
  onTap?: () => void;
}) {
  const interactive = !!onTap;
  const icon = iconForAction(text);

  return (
    <motion.button
      type="button"
      onClick={onTap}
      disabled={!interactive}
      whileHover={interactive ? { scale: 1.015, x: 2 } : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      className={`group flex items-center gap-3 w-full rounded-xl px-3.5 py-3 text-left transition-colors
        ${
          interactive
            ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-indigo-500/30 cursor-pointer"
            : "bg-white/[0.02] border border-white/[0.04] cursor-default"
        }`}
    >
      {/* Icon chip */}
      <div
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-105
          ${
            accent
              ? "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_4px_12px_-2px_rgba(139,92,246,0.5)]"
              : "bg-gradient-to-br from-slate-700 to-slate-800 ring-1 ring-white/10"
          }`}
      >
        {icon}
      </div>

      {/* Label */}
      <span className="flex-1 text-[15px] font-medium text-slate-100 leading-snug">
        {parseInline(text)}
      </span>

      {/* Arrow */}
      {interactive && (
        <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all shrink-0" />
      )}
    </motion.button>
  );
}

/* ── Block parser ──────────────────────────────────────────────────── */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "action"; text: string }
  | { kind: "para"; text: string }
  | { kind: "code"; text: string }
  | { kind: "blank" };

function toBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ kind: "heading", level: 3, text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", level: 2, text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "heading", level: 1, text: line.slice(2) });
    } else if (/^[-*•] /.test(line)) {
      blocks.push({ kind: "action", text: line.replace(/^[-*•]\s*/, "") });
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ kind: "action", text: line.replace(/^\d+\.\s*/, "") });
    } else if (line.trim() === "") {
      blocks.push({ kind: "blank" });
    } else {
      blocks.push({ kind: "para", text: line });
    }
    i++;
  }
  return blocks;
}

/* ── Main renderer ─────────────────────────────────────────────────── */

export function MarkdownResponse({ content, onActionTap }: Props) {
  const [expanded, setExpanded] = useState(false);

  const blocks = useMemo(() => toBlocks(content), [content]);

  // First non-empty paragraph gets headline treatment.
  const firstParaIdx = blocks.findIndex((b) => b.kind === "para");
  // Index of the first action block (gets accent treatment)
  const firstActionIdx = blocks.findIndex((b) => b.kind === "action");

  // Split into visible vs hidden based on a threshold of meaningful blocks
  const MAX_COLLAPSED = 8;
  let meaningful = 0;
  const visible: { block: Block; idx: number }[] = [];
  const hidden: { block: Block; idx: number }[] = [];
  blocks.forEach((block, idx) => {
    if (block.kind === "blank") {
      (meaningful < MAX_COLLAPSED ? visible : hidden).push({ block, idx });
      return;
    }
    if (meaningful < MAX_COLLAPSED) {
      visible.push({ block, idx });
    } else {
      hidden.push({ block, idx });
    }
    meaningful++;
  });

  const hiddenMeaningful = hidden.filter((h) => h.block.kind !== "blank").length;
  const isTruncated = hiddenMeaningful > 0 && !expanded;

  function render({ block, idx }: { block: Block; idx: number }) {
    switch (block.kind) {
      case "heading": {
        const cls: Record<1 | 2 | 3, string> = {
          1: "text-[22px] text-white font-bold mt-2 mb-1 font-display tracking-tight",
          2: "text-[19px] text-slate-50 font-bold mt-3 mb-1 font-display tracking-tight",
          3: "text-[16px] text-slate-100 font-semibold mt-3 mb-0.5 font-display uppercase tracking-wide",
        };
        const tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
        return React.createElement(
          tag,
          { key: idx, className: cls[block.level] },
          parseInline(block.text)
        );
      }

      case "action": {
        // "Label: rest" → use label as the tap target (crisp)
        const labelSplit = block.text.match(/^(.{3,60}?):\s+(.+)$/);
        const label = labelSplit ? labelSplit[1].replace(/\*\*/g, "") : block.text;
        return (
          <ActionCard
            key={idx}
            text={label}
            accent={idx === firstActionIdx}
            onTap={onActionTap ? () => onActionTap(label) : undefined}
          />
        );
      }

      case "code":
        return (
          <pre
            key={idx}
            className="text-[13px] text-slate-200 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 font-mono overflow-x-auto"
          >
            {block.text}
          </pre>
        );

      case "para": {
        // First paragraph gets the headline treatment (large, light)
        if (idx === firstParaIdx) {
          return (
            <p
              key={idx}
              className="text-[18px] leading-snug text-slate-50 font-medium tracking-tight"
            >
              {parseInline(block.text)}
            </p>
          );
        }
        return (
          <p key={idx} className="text-[15px] leading-relaxed text-slate-300">
            {parseInline(block.text)}
          </p>
        );
      }

      case "blank":
        return <div key={idx} className="h-1" />;
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {visible.map(render)}
      {expanded && hidden.map(render)}

      {isTruncated && (
        <motion.button
          className="flex items-center gap-1.5 mt-1 text-[13px] text-indigo-400/70 hover:text-indigo-300 transition-colors self-start"
          onClick={() => setExpanded(true)}
          whileHover={{ x: 2 }}
        >
          <ChevronDown className="w-4 h-4" />
          Show {hiddenMeaningful} more
        </motion.button>
      )}

      {expanded && hiddenMeaningful > 0 && (
        <motion.button
          className="flex items-center gap-1.5 mt-1 text-[13px] text-indigo-400/70 hover:text-indigo-300 transition-colors self-start"
          onClick={() => setExpanded(false)}
          whileHover={{ x: 2 }}
        >
          <ChevronDown className="w-4 h-4 rotate-180" />
          Show less
        </motion.button>
      )}
    </div>
  );
}
