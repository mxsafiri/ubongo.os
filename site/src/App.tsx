import { useState, useEffect, useRef, useCallback } from 'react'
import { LayoutGroup, motion, AnimatePresence, useScroll, useTransform } from 'motion/react'
import { TextRotate } from '@/components/ui/text-rotate'

/* ═══════════════════════════════════════════════════════════════════════════
   Prevent theme flash
   ═══════════════════════════════════════════════════════════════════════════ */
const _saved = localStorage.getItem('ubongo-theme')
if (_saved) document.documentElement.setAttribute('data-theme', _saved)

/* ═══════════════════════════════════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════════════════════════════════ */

const DEMOS = [
  { query: 'summarize my meeting notes', response: ['3 action items extracted', 'Review proposal by Thursday'] },
  { query: 'find the Q3 report', response: ['~/Documents/Q3-Report.pdf', 'Last modified 3 days ago'] },
  { query: 'rewrite this more formally', response: ['Dear Ms. Chen, Thank you for your', 'prompt response regarding the project...'] },
  { query: 'what does this error mean', response: ['TypeError: Cannot read .map() of null', 'Fix: add null check at line 42'] },
]

const CAPS = ['WRITE', 'FIND', 'DEBUG', 'SUMMARIZE', 'BRAINSTORM', 'PRIVATE', 'DESKTOP', 'INSTANT']

/* ═══════════════════════════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════════════════════════ */

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('ubongo-theme') as 'dark' | 'light') || 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ubongo-theme', theme)
  }, [theme])
  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])
  return { theme, toggle }
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, v }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Animation Components
   ═══════════════════════════════════════════════════════════════════════════ */

/** Stagger grid — dots pulse in waves from center */
function StaggerGrid() {
  const cols = 18
  const rows = 11
  const DURATION = 5
  const dots = Array.from({ length: rows * cols }, (_, i) => {
    const x = (i % cols) / (cols - 1) * 100
    const y = Math.floor(i / cols) / (rows - 1) * 100
    const dist = Math.sqrt((x - 50) ** 2 + (y - 50) ** 2) / 10
    // Negative delay = already mid-animation at t=0, creating perpetual wave
    const phaseOffset = (dist * 0.22) % DURATION
    return { x, y, delay: -phaseOffset }
  })
  return (
    <div className="stagger-grid">
      {dots.map((d, i) => (
        <div
          key={i}
          className="grid-dot"
          style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }}
        />
      ))}
    </div>
  )
}

/** Live typing terminal */
function TerminalDemo() {
  const [demoIdx, setDemoIdx] = useState(0)
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'responding' | 'clearing'>('typing')
  const demo = DEMOS[demoIdx]

  useEffect(() => {
    if (phase === 'typing') {
      if (typed >= demo.query.length) {
        const t = setTimeout(() => setPhase('responding'), 500)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setTyped(n => n + 1), 50 + Math.random() * 35)
      return () => clearTimeout(t)
    }
    if (phase === 'responding') {
      const t = setTimeout(() => setPhase('clearing'), 2800)
      return () => clearTimeout(t)
    }
    if (phase === 'clearing') {
      const t = setTimeout(() => {
        setDemoIdx(i => (i + 1) % DEMOS.length)
        setTyped(0)
        setPhase('typing')
      }, 400)
      return () => clearTimeout(t)
    }
  }, [phase, typed, demo.query.length])

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-dots"><span /><span /><span /></div>
        <span className="terminal-title">ubongo</span>
      </div>
      <div className="terminal-body" style={{ opacity: phase === 'clearing' ? 0 : 1 }}>
        <div className="terminal-line">
          <span className="terminal-prompt">›</span>
          <span>{demo.query.slice(0, typed)}</span>
          {phase === 'typing' && <span className="cursor-blink" />}
        </div>
        {phase === 'responding' && demo.response.map((line, i) => (
          <motion.div
            key={`${demoIdx}-${i}`}
            className="terminal-response"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.15, duration: 0.35, ease: [0.25, 0.1, 0, 1] }}
          >
            {line}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** Scroll-linked line — grows left→right as section enters viewport */
function ScrollLine() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const scaleX = useTransform(scrollYProgress, [0, 0.35], [0, 1])

  return (
    <div ref={ref} className="max-w-5xl mx-auto px-6 py-4">
      <motion.div
        className="h-px w-full"
        style={{ scaleX, transformOrigin: 'left', background: 'linear-gradient(90deg, var(--accent), var(--accent-cool), var(--accent-warm))', opacity: 0.35 }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Layout Components
   ═══════════════════════════════════════════════════════════════════════════ */

/** Scroll-triggered reveal with optional tilt */
function Reveal({ children, className = '', delay = 0, rotate = 0 }: {
  children: React.ReactNode; className?: string; delay?: number; rotate?: number
}) {
  const { ref, v } = useInView()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 30, rotate }}
      animate={v ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: 30, rotate }}
      transition={{ type: 'spring', damping: 25, stiffness: 180, delay }}
    >
      {children}
    </motion.div>
  )
}

function SectionLabel({ num, label }: { num: string; label: string }) {
  const { ref, v } = useInView()
  return (
    <motion.div
      ref={ref}
      className="flex items-center gap-3 mb-6"
      initial={{ opacity: 0, x: -12 }}
      animate={v ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="w-5 h-px" style={{ background: 'var(--accent)' }} />
      <motion.span
        className="section-num font-mono"
        style={{ color: 'var(--accent)' }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={v ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
      >
        {num}
      </motion.span>
      <div className="w-5 h-px" style={{ background: 'var(--accent)', opacity: 0.3 }} />
      <span className="section-num uppercase">{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════════════════ */

export default function App() {
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // ── Scroll-driven values ──
  const { scrollYProgress, scrollY } = useScroll()

  // Hero parallax layers (different speeds = depth)
  const videoY = useTransform(scrollY, [0, 600], [0, -40])
  const videoScale = useTransform(scrollY, [0, 600], [1, 1.08])
  const gridY = useTransform(scrollY, [0, 600], [0, -80])
  const headlineY = useTransform(scrollY, [0, 600], [0, -40])
  const terminalY = useTransform(scrollY, [0, 600], [0, 20])
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0])

  // Floating decorative shapes (parallax at different rates)
  const f1 = useTransform(scrollY, [0, 3000], [0, -120])
  const f2 = useTransform(scrollY, [0, 3000], [0, -200])
  const f3 = useTransform(scrollY, [0, 3000], [0, -80])
  const f4 = useTransform(scrollY, [0, 3000], [0, -160])

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg)' }}>
      {/* Scroll progress bar */}
      <motion.div className="scroll-progress" style={{ scaleX: scrollYProgress }} />

      {/* Stars */}
      <div className="stars-bg" />

      {/* Corners */}
      <div className="corner corner--tl" />
      <div className="corner corner--tr" />
      <div className="corner corner--bl" />
      <div className="corner corner--br" />

      {/* ── Scroll indicator (right edge) ── */}
      <div
        className="fixed right-3 top-1/2 -translate-y-1/2 w-px h-16 z-40 hidden lg:block"
        style={{ background: 'var(--border)' }}
      >
        <motion.div
          className="w-full rounded-full"
          style={{ height: '100%', scaleY: scrollYProgress, transformOrigin: 'top', background: 'linear-gradient(180deg, var(--accent), var(--accent-cool))' }}
        />
      </div>

      {/* ── Floating parallax shapes (colored) ── */}
      <motion.div className="fixed right-[10%] top-[18vh] pointer-events-none z-0 hidden lg:block" style={{ y: f1, color: 'var(--accent)', fontSize: '14px', fontFamily: 'var(--font-mono)', opacity: 0.35 }}>✦</motion.div>
      <motion.div className="fixed left-[7%] top-[52vh] pointer-events-none z-0 hidden lg:block" style={{ y: f2, color: 'var(--accent-warm)', fontSize: '10px', fontFamily: 'var(--font-mono)', opacity: 0.3 }}>◇</motion.div>
      <motion.div className="fixed right-[14%] top-[68vh] pointer-events-none z-0 hidden lg:block" style={{ y: f3, color: 'var(--accent-cool)', fontSize: '11px', fontFamily: 'var(--font-mono)', opacity: 0.3 }}>○</motion.div>
      <motion.div className="fixed left-[11%] top-[82vh] pointer-events-none z-0 hidden lg:block" style={{ y: f4, color: 'var(--accent-rose)', fontSize: '16px', fontFamily: 'var(--font-mono)', opacity: 0.25 }}>+</motion.div>

      {/* ═══ NAV ═══ */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-sm"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--nav-bg)' }}
      >
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm tracking-[0.15em]" style={{ color: 'var(--text-strong)' }}>
              <span style={{ color: 'var(--accent)' }}>U</span>BONGO
            </span>
            <div className="h-3 w-px" style={{ background: 'var(--accent)', opacity: 0.3 }} />
            <span className="text-[9px] tracking-widest" style={{ color: 'var(--accent)', opacity: 0.5 }}>v0.4.0</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#download" className="text-[10px] tracking-wider hidden sm:block hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>DOWNLOAD</a>
            <button onClick={toggle} className="theme-toggle" aria-label="Toggle theme">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={theme}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center"
                >
                  {theme === 'dark' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                  )}
                </motion.div>
              </AnimatePresence>
            </button>
            <a href="#access" className="btn-ghost text-[10px] px-3 py-1 tracking-wider">GET ACCESS</a>
          </div>
        </div>
      </nav>

      {/* ═══ HERO — 4 parallax layers ═══ */}
      <section className="relative min-h-screen flex items-center pt-12 overflow-hidden">
        {/* Layer 0: Ambient video (deepest, slowest parallax) */}
        <motion.div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ y: videoY, scale: videoScale }}
          aria-hidden
        >
          <video
            className="hero-video"
            src="/hero-bg.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />
          {/* Blend masks: bottom fade + vignette + tint */}
          <div className="hero-video__tint" />
          <div className="hero-video__vignette" />
          <div className="hero-video__fade" />
        </motion.div>

        {/* Layer 1: Grid (fastest parallax — recedes first) */}
        <motion.div className="absolute inset-0" style={{ y: gridY }}>
          <StaggerGrid />
        </motion.div>

        {/* Layer 2+3: Content (fades on scroll) */}
        <motion.div
          className="relative z-10 max-w-5xl mx-auto px-6 lg:px-16 w-full"
          style={{ opacity: heroOpacity }}
        >
          <div className="max-w-xl">
            {/* Layer 2: Headline (medium parallax) */}
            <motion.div style={{ y: headlineY }}>
              <motion.div
                className="flex items-center gap-2 mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ delay: 0.2 }}
              >
                <div className="w-8 h-px" style={{ background: 'var(--accent)' }} />
                <span className="text-[10px] font-mono tracking-wider" style={{ color: 'var(--accent)' }}>001</span>
                <div className="flex-1 h-px max-w-16" style={{ background: 'var(--accent)', opacity: 0.2 }} />
              </motion.div>

              <motion.h1
                className="font-mono font-bold leading-[1.1] tracking-[0.06em] mb-6"
                style={{ color: 'var(--text-strong)', fontSize: 'clamp(1.75rem, 5vw, 3.2rem)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.25, 0.1, 0, 1] }}
              >
                YOUR WORK,
                <br />
                <LayoutGroup>
                  <motion.span layout className="inline-flex mt-1">
                    <TextRotate
                      texts={['UNBLOCKED.', 'ACCELERATED.', 'UNLOCKED.', 'SIMPLIFIED.']}
                      mainClassName="overflow-hidden"
                      elementLevelClassName="accent-text"
                      staggerDuration={0.02}
                      staggerFrom="first"
                      rotationInterval={3000}
                      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    />
                  </motion.span>
                </LayoutGroup>
              </motion.h1>
            </motion.div>

            {/* Layer 3: Terminal (inverse parallax — moves slightly down, feels closer) */}
            <motion.div style={{ y: terminalY }} className="mb-6">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.7, duration: 0.5, type: 'spring', damping: 25 }}
              >
                <TerminalDemo />
              </motion.div>
            </motion.div>

            {/* Keyboard hint */}
            <motion.div
              className="flex items-center gap-3 mb-7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <div className="flex items-center gap-1.5">
                <motion.span className="keyboard-key" animate={{ y: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}>Alt</motion.span>
                <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>+</span>
                <motion.span className="keyboard-key keyboard-key--wide" animate={{ y: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', delay: 0.1 }}>Space</motion.span>
              </div>
              <span className="text-[10px] tracking-wider" style={{ color: 'var(--text-faint)' }}>to summon</span>
            </motion.div>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.15 }}
            >
              <a href="#download" className="btn-primary px-6 py-2.5 text-xs tracking-wider text-center">DOWNLOAD</a>
              <a href="#access" className="btn-ghost px-6 py-2.5 text-xs tracking-wider text-center">GET EARLY ACCESS</a>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ═══ MARQUEE ═══ */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {[...CAPS, ...CAPS].map((cap, i) => {
            const colors = ['var(--accent)', 'var(--accent-warm)', 'var(--accent-cool)', 'var(--accent-rose)']
            return (
              <span key={i} className="text-[11px] tracking-[0.2em] whitespace-nowrap font-mono" style={{ color: colors[i % colors.length], opacity: 0.45 }}>{cap}</span>
            )
          })}
        </div>
      </div>

      {/* ── Scroll line ── */}
      <ScrollLine />

      {/* ═══ DOWNLOAD ═══ */}
      <section id="download" className="py-20 px-6 max-w-5xl mx-auto">
        <SectionLabel num="002" label="DOWNLOAD" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          {/* macOS — tilts in from left */}
          <Reveal delay={0.1} rotate={-2}>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                <span className="text-[10px] tracking-widest" style={{ color: 'var(--text-muted)' }}>macOS</span>
              </div>
              <div className="text-[10px] font-mono mb-1" style={{ color: 'var(--text-faint)' }}>Apple Silicon (M1+)</div>
              <div className="text-[9px] font-mono mb-4" style={{ color: 'var(--text-faint)' }}>v0.4.0 &middot; 138 MB</div>
              <a href="https://github.com/mxsafiri/ubongo.os/releases/latest/download/ubongo_0.4.0_aarch64.dmg" className="btn-primary w-full px-4 py-2.5 text-[11px] tracking-wider">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7l-7 7-7-7" /></svg>
                DOWNLOAD .DMG
              </a>
            </div>
          </Reveal>

          {/* Windows — tilts in from right */}
          <Reveal delay={0.2} rotate={2}>
            <div className="card" style={{ opacity: 0.4 }}>
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4" style={{ color: 'var(--text-faint)' }} viewBox="0 0 24 24" fill="currentColor"><path d="M3 12V6.5l8-1.1V12H3zm9-6.8L22 3v9h-10V5.2zM22 12.5V21l-10-1.4V12.5h10zm-11 0V19.4L3 18V12.5h8z" /></svg>
                <span className="text-[10px] tracking-widest" style={{ color: 'var(--text-faint)' }}>Windows</span>
              </div>
              <div className="text-[10px] font-mono mb-1" style={{ color: 'var(--text-faint)' }}>x64</div>
              <div className="text-[9px] font-mono mb-4" style={{ color: 'var(--text-faint)' }}>Coming soon</div>
              <div className="btn-ghost w-full px-4 py-2.5 text-[11px] tracking-wider cursor-not-allowed" style={{ opacity: 0.5 }}>NOTIFY ME</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Scroll line ── */}
      <ScrollLine />

      {/* ═══ SETUP ═══ */}
      <section id="setup" className="py-20 px-6 max-w-5xl mx-auto">
        <SectionLabel num="003" label="SETUP" />

        <div className="space-y-3 max-w-lg">
          {[
            { n: '01', title: 'INSTALL', desc: 'Open .dmg, drag to Applications', code: null },
            { n: '02', title: 'OPEN', desc: 'Right-click \u2192 Open (bypass unsigned warning)', code: null },
            { n: '03', title: 'TERMINAL', desc: 'Or remove quarantine flag:', code: 'xattr -dr com.apple.quarantine /Applications/ubongo.app' },
            { n: '04', title: 'ACTIVATE', desc: 'Enter invite code on first launch', code: null },
          ].map((s, i) => (
            <Reveal key={s.n} delay={0.06 + i * 0.04} rotate={i % 2 === 0 ? -1 : 1}>
              <div className="card flex gap-4 items-start">
                <span className="step-n select-none shrink-0 hidden sm:block">{s.n}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-mono font-semibold text-[11px] tracking-[0.1em] mb-0.5" style={{ color: 'var(--text-strong)' }}>{s.title}</h3>
                  <p className="text-[11px] leading-relaxed font-mono" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
                  {s.code ? <div className="code-block mt-2 select-all text-[11px]">{s.code}</div> : null}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Scroll line ── */}
      <ScrollLine />

      {/* ═══ GET ACCESS ═══ */}
      <section id="access" className="py-20 px-6 max-w-5xl mx-auto">
        <SectionLabel num="004" label="EARLY ACCESS" />

        <Reveal delay={0.1}>
          {submitted ? (
            <motion.div
              className="card max-w-sm"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <motion.span
                  style={{ color: 'var(--accent)' }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.2 }}
                >
                  &#x2713;
                </motion.span>
                <span className="font-mono text-[11px] tracking-wider" style={{ color: 'var(--text-strong)' }}>YOU&apos;RE IN</span>
              </div>
              <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                We&apos;ll email <span style={{ color: 'var(--text)' }}>{email}</span> when your spot opens.
              </p>
            </motion.div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) setSubmitted(true) }}
              className="flex flex-col sm:flex-row gap-2 max-w-sm"
            >
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 px-4 py-2.5 text-[11px] tracking-wider" />
              <button type="submit" className="btn-primary px-6 py-2.5 text-[11px] tracking-wider whitespace-nowrap">REQUEST</button>
            </form>
          )}
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-3 px-6 mt-8" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 text-[9px] font-mono" style={{ color: 'var(--text-faint)' }}>
            <span>&copy; {new Date().getFullYear()} UBONGO</span>
            <span>&middot;</span>
            <span>BUILT IN TANZANIA</span>
          </div>
          <div className="flex items-center gap-4 text-[9px] font-mono" style={{ color: 'var(--text-faint)' }}>
            <a href="https://github.com/ubongo-ai" target="_blank" rel="noopener" className="hover:opacity-70 transition-opacity">GITHUB</a>
            <a href="https://twitter.com/ubongo_ai" target="_blank" rel="noopener" className="hover:opacity-70 transition-opacity">TWITTER</a>
            <div className="flex gap-1 items-center">
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent)', opacity: 0.5, animationDelay: '0.3s' }} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
