'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/game';
import { PLACES, distanceM } from '@/lib/game/places';
import { fullPay, rankFor, rankTitle } from '@/lib/game/work';
import { WorkPanel } from '@/components/life/WorkPanel';
import { fmtDistance } from '@/components/life/useLife';

/** WORK: your shift in progress, or jobs around town and your career so far. */
export function WorkScreen() {
  const shift = useGameStore((s) => s.life.shift);
  const xp = useGameStore((s) => s.life.xp);
  const pos = useGameStore((s) => s.life.pos);
  const selectPlace = useGameStore((s) => s.selectPlace);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const jobs = PLACES.flatMap((place) => place.jobs.map((job) => ({ place, job, d: pos ? distanceM(pos, place) : 0 })))
    .sort((a, b) => a.d - b.d);
  const career = jobs.filter(({ job }) => (xp[job.id] ?? 0) > 0);

  const open = (placeId: string) => {
    selectPlace(placeId);
    if (window.innerWidth < 1024) setActiveTab('map');
  };

  return (
    <motion.div className="absolute inset-0 z-[15] overflow-y-auto"
      style={{ paddingTop: 'var(--screen-pad-top)', paddingBottom: 'var(--screen-pad-bottom)', background: 'var(--color-bg)' }}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
      <div className="flex flex-col gap-4 px-4 pt-2">
        <Heading title="KAZI" sub="WORK" />
        {shift ? <WorkPanel /> : (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Pick a job, go there, and work the shift. Do the work well and the pay goes up; keep coming back and you get promoted.
          </p>
        )}

        {career.length > 0 && (
          <section className="flex flex-col gap-2">
            <Label>YOUR CAREER</Label>
            {career.map(({ job, place }) => {
              const done = xp[job.id] ?? 0;
              const rank = rankFor(done);
              return (
                <div key={job.id} className="flex items-center gap-3" style={row}>
                  <span style={{ fontSize: 20 }}>{job.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{rankTitle(job, done)}</p>
                    <p style={mono}>{place.name.toUpperCase()} · {done} SHIFTS</p>
                  </div>
                  <div className="flex gap-1">
                    {job.ranks.map((_, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i <= rank ? 'var(--color-gold)' : 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }} />)}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Label>JOBS IN DAR · NEAREST FIRST</Label>
          {jobs.map(({ job, place, d }) => (
            <button key={job.id} onClick={() => open(place.id)} className="flex items-center gap-3 text-left" style={row}>
              <span style={{ fontSize: 20 }}>{job.emoji}</span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{rankTitle(job, xp[job.id] ?? 0)}</p>
                <p style={mono}>{place.icon} {place.name.toUpperCase()}{pos ? ` · ${fmtDistance(d)}` : ''}</p>
              </div>
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 17, color: 'var(--color-gold)' }}>~{fullPay(job, { perf: 50, goodDone: 0 }, xp[job.id] ?? 0)}</span>
            </button>
          ))}
        </section>
      </div>
    </motion.div>
  );
}

export function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3" style={{ borderLeft: '3px solid var(--color-primary)', paddingLeft: 10 }}>
      <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: 32, letterSpacing: '0.06em', color: 'var(--text-primary)', lineHeight: 1 }}>{title}</h2>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', color: 'var(--text-muted)' }}>{sub}</span>
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.24em', color: 'var(--text-muted)' }}>{children}</p>;
}

export const row: React.CSSProperties = { padding: '12px 14px', borderRadius: 12, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' };
export const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: 2 };
