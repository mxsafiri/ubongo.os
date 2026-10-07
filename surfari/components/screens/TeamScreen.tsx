'use client';

import { motion } from 'framer-motion';
import { Heading, Label, row } from './WorkScreen';

/** TEAM: your crew, meetings and money — the next slice. */
export function TeamScreen() {
  const soon = [
    ['👥', 'Your team', 'Invite coworkers with a link and see where everyone is in the city.'],
    ['📅', 'Meetings', 'Call a meeting at a place — Posta, a café, the office — and your team gets the invite and a one-tap way there.'],
    ['💬', 'Team chat', 'Messages with your team, right here on your work computer.'],
    ['💸', 'NEDApay', 'Send and receive money with your team.'],
  ];
  return (
    <motion.div className="absolute inset-0 z-[15] overflow-y-auto"
      style={{ paddingTop: 'var(--screen-pad-top)', paddingBottom: 'var(--screen-pad-bottom)', background: 'var(--color-bg)' }}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Heading title="TIMU" sub="TEAM" />
        <Label>INAKUJA · COMING NEXT</Label>
        {soon.map(([icon, title, text]) => (
          <div key={title} className="flex items-start gap-3" style={row}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 2 }}>{text}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
