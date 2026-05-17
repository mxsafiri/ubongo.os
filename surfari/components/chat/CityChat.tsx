'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Radio } from 'lucide-react';
import { ZoneChat } from './ZoneChat';

export function CityChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating action button — sits above the bottom nav */}
      <motion.button
        className="absolute z-[25]"
        style={{ bottom: 'calc(var(--safe-bottom) + 100px)', right: '16px' }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        aria-label="Open city chat"
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
            boxShadow: '0 4px 20px rgba(0,153,194,0.4), 0 0 0 1px rgba(0,153,194,0.15)',
          }}
        >
          <MessageCircle size={20} style={{ color: '#fff' }} />
        </div>
        {/* Live pulse ring */}
        <span
          className="absolute inset-0 rounded-full animate-ping pointer-events-none"
          style={{ background: 'rgba(0,153,194,0.18)', animationDuration: '2.8s' }}
        />
      </motion.button>

      {/* Full-panel chat overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 z-[28]"
              style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            {/* Panel slides up */}
            <motion.div
              className="absolute left-0 right-0 bottom-0 z-[29] flex flex-col rounded-t-3xl overflow-hidden"
              style={{
                height: '75%',
                background: 'var(--color-bg)',
                borderTop: '1px solid var(--border-mid)',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
                paddingBottom: 'calc(var(--safe-bottom) + 88px)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-mid)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(0,153,194,0.1)', border: '1px solid rgba(0,153,194,0.2)' }}
                  >
                    <Radio size={14} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                      City Chat
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Dar es Salaam · live
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}
                >
                  <X size={14} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 20px' }} />

              {/* Chat — no zoneId = city-wide */}
              <div className="flex-1 min-h-0">
                <ZoneChat />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
