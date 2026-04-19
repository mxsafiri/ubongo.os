/**
 * AskBar — compact, always-visible input pinned at the bottom of the screen.
 *
 * Design:
 *  - Single rounded pill, no morph/expand states. Just one bar.
 *  - Height = single-line by default, auto-grows up to ~6 lines.
 *  - Left: `+` mode menu (Auto / Max / Search / Plan) — dropdown pops UPWARD.
 *  - Middle: textarea with "Ask ubongo" placeholder.
 *  - Right: circular violet send button.
 *  - Selected-mode chips appear as a row ABOVE the input when non-empty.
 *
 * Exposes a `focus()` method via forwardRef so the orb can focus it on click.
 */

import React from "react"
import { cx } from "class-variance-authority"
import { AnimatePresence, motion } from "motion/react"
import { Plus, ArrowUp, X, Zap, Gauge, Search as SearchIcon, ListChecks } from "lucide-react"

type ModeOption = "Auto" | "Max" | "Search" | "Plan"

const MODE_META: Record<ModeOption, { icon: React.ReactNode; desc: string; accent: string }> = {
  Auto:   { icon: <Zap className="w-3.5 h-3.5" />,      desc: "Let ubongo decide",       accent: "text-indigo-300" },
  Max:    { icon: <Gauge className="w-3.5 h-3.5" />,    desc: "Maximum reasoning depth", accent: "text-fuchsia-300" },
  Search: { icon: <SearchIcon className="w-3.5 h-3.5" />,desc: "Force web search",        accent: "text-sky-300" },
  Plan:   { icon: <ListChecks className="w-3.5 h-3.5" />,desc: "Plan before acting",      accent: "text-amber-300" },
}

const ALL_MODES: ModeOption[] = ["Auto", "Max", "Search", "Plan"]

export interface AskBarHandle {
  focus: () => void
}

interface AskBarProps {
  onSubmit?: (message: string, modes?: ModeOption[]) => void
  isRunning?: boolean
  /** Max width of the pill. Defaults to 560px. */
  width?: number | string
  placeholder?: string
}

/* ────────────────────────────────────────────────────────────── */

export const AskBar = React.forwardRef<AskBarHandle, AskBarProps>(function AskBar(
  { onSubmit, isRunning, width = 560, placeholder = "Ask ubongo" },
  ref
) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const [value, setValue] = React.useState("")
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [modes, setModes] = React.useState<ModeOption[]>([])
  const [focused, setFocused] = React.useState(false)

  // Expose focus() to the parent (orb click → focus the bar)
  React.useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  // Auto-resize textarea
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    const lineHeight = 22
    const maxHeight = lineHeight * 6 + 12
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px"
  }, [value])

  // Close mode menu on outside click
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function submit() {
    const msg = value.trim()
    if (!msg || isRunning) return
    onSubmit?.(msg, modes.length ? modes : undefined)
    setValue("")
    // Keep modes selected for chained queries — comment out next line to reset.
    // setModes([])
  }

  function handleKeys(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function toggleMode(opt: ModeOption) {
    setModes(prev => (prev.includes(opt) ? prev.filter(m => m !== opt) : [...prev, opt]))
    setMenuOpen(false)
  }

  const isDisabled = !value.trim() || !!isRunning

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="flex flex-col"
      style={{ width, maxWidth: "92vw" }}
    >
      {/* ── Mode tags row (above the input) ── */}
      <AnimatePresence>
        {modes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-wrap gap-1.5 mb-1.5 px-1 overflow-hidden"
          >
            {modes.map((m) => (
              <ModeTag key={m} option={m} onRemove={() => toggleMode(m)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The pill ── */}
      <div
        className={cx(
          "relative flex items-end gap-2 rounded-[22px] px-2 py-2 transition-colors",
          "bg-[rgba(10,12,20,0.92)] backdrop-blur-xl",
          "border",
          focused
            ? "border-indigo-400/30 shadow-[0_0_0_3px_rgba(99,102,241,0.08),0_20px_40px_-20px_rgba(0,0,0,0.7)]"
            : "border-white/[0.08] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]"
        )}
      >
        {/* Mode menu button (bottom-left) */}
        <div className="relative shrink-0 self-end pb-0.5" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
            aria-label="Mode options"
            className={cx(
              "h-8 w-8 flex items-center justify-center rounded-full transition-all",
              "bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white",
              "border border-white/[0.08]",
              menuOpen && "bg-white/[0.14] text-white rotate-45"
            )}
          >
            <Plus className="w-4 h-4 transition-transform" />
          </button>

          <ModeMenu open={menuOpen} selected={modes} onToggle={toggleMode} />
        </div>

        {/* Auto-grow textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeys}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={isRunning ? "Thinking…" : placeholder}
          disabled={isRunning}
          rows={1}
          spellCheck={false}
          className={cx(
            "flex-1 min-w-0 self-center resize-none bg-transparent outline-none",
            "text-[15px] leading-[22px] text-slate-100 placeholder:text-slate-500",
            "px-1 py-1.5 max-h-[144px] overflow-y-auto"
          )}
        />

        {/* Circular send button (bottom-right) */}
        <button
          type="submit"
          aria-label="Send"
          disabled={isDisabled}
          className={cx(
            "shrink-0 self-end h-8 w-8 flex items-center justify-center rounded-full transition-all",
            isDisabled
              ? "bg-white/[0.05] text-slate-600 cursor-not-allowed"
              : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_4px_12px_-2px_rgba(139,92,246,0.55)] hover:shadow-[0_6px_20px_-2px_rgba(139,92,246,0.75)] hover:scale-105 active:scale-95"
          )}
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    </form>
  )
})

/* ── Mode dropdown (pops upward) ──────────────────────────────── */

function ModeMenu({
  open,
  selected,
  onToggle,
}: {
  open: boolean
  selected: ModeOption[]
  onToggle: (opt: ModeOption) => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute bottom-full left-0 mb-2 min-w-[200px] rounded-xl border border-white/[0.08] bg-[rgba(16,18,28,0.98)] backdrop-blur-xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.7)] p-1 z-30"
        >
          {ALL_MODES.map((opt) => {
            const isSel = selected.includes(opt)
            const meta = MODE_META[opt]
            return (
              <button
                key={opt}
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle(opt) }}
                className={cx(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-left",
                  "hover:bg-white/[0.06]",
                  isSel && "bg-white/[0.04]"
                )}
              >
                <span className={cx("shrink-0", meta.accent)}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-100">{opt}</div>
                  <div className="text-[11px] text-slate-500">{meta.desc}</div>
                </div>
                {isSel && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
              </button>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Mode tag chip ─────────────────────────────────────────────── */

function ModeTag({ option, onRemove }: { option: ModeOption; onRemove: () => void }) {
  const meta = MODE_META[option]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[12px] text-slate-200"
    >
      <span className={meta.accent}>{meta.icon}</span>
      <span>{option}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="h-3.5 w-3.5 flex items-center justify-center rounded-full hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
        aria-label={`Remove ${option}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </motion.div>
  )
}

/* ── Back-compat aliases ──────────────────────────────────────── */

export const MorphPanel = AskBar
export default AskBar
