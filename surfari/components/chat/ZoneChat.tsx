'use client';

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useGameStore } from '@/store/game';
import type { ChatMessage } from '@/types';

export function ZoneChat({ zoneId }: { zoneId?: string }) {
  const player = useGameStore((s) => s.player);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCreatedAt = useRef<string | null>(null);

  const fetchInitial = async () => {
    const url = zoneId ? `/api/chat?zone_id=${zoneId}` : '/api/chat';
    const res = await fetch(url);
    if (!res.ok) return;
    const { messages: msgs } = await res.json();
    setMessages(msgs);
    if (msgs.length > 0) lastCreatedAt.current = msgs[msgs.length - 1].created_at;
  };

  useEffect(() => {
    fetchInitial();
    const interval = setInterval(async () => {
      if (!lastCreatedAt.current) return;
      const base = zoneId ? `/api/chat?zone_id=${zoneId}` : '/api/chat';
      const res = await fetch(`${base}&after=${encodeURIComponent(lastCreatedAt.current)}`);
      if (!res.ok) return;
      const { messages: fresh } = await res.json();
      if (fresh.length > 0) {
        setMessages((prev) => [...prev, ...fresh]);
        lastCreatedAt.current = fresh[fresh.length - 1].created_at;
      }
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || !player || sending) return;
    const body = text.trim();
    setSending(true);
    setText('');
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      zone_id: zoneId ?? null,
      player_id: player.id,
      player_handle: player.handle,
      player_color: player.avatar_color,
      content: body,
      msg_type: 'user',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_id: zoneId ?? null,
        player_id: player.id,
        player_handle: player.handle,
        player_color: player.avatar_color,
        content: body,
      }),
    });
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0' }}>
            No messages yet — start the conversation.
          </p>
        )}
        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} isMe={msg.player_id === player?.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {player ? (
          <>
            <div
              className="flex-1 flex items-center px-3 rounded-xl"
              style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Say something…"
                maxLength={500}
                className="flex-1 bg-transparent outline-none py-2.5"
                style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              />
            </div>
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
              style={{
                background: text.trim() ? 'var(--color-primary)' : 'var(--surface-subtle)',
                border: `1px solid ${text.trim() ? 'transparent' : 'var(--border-mid)'}`,
                transition: 'all 0.15s',
              }}
            >
              <Send size={14} style={{ color: text.trim() ? '#fff' : 'var(--text-muted)' }} />
            </button>
          </>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
            Sign in to chat
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  if (msg.msg_type === 'event') {
    return (
      <div className="flex justify-center py-0.5">
        <span
          className="px-3 py-1 rounded-full"
          style={{
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-4"
        style={{ background: msg.player_color ?? 'var(--color-primary)' }}
      >
        <span style={{ fontSize: '8px', color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {(msg.player_handle ?? '?')[0].toUpperCase()}
        </span>
      </div>
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          @{msg.player_handle}
        </span>
        <div
          className="px-3 py-2"
          style={{
            background: isMe ? 'var(--color-primary)' : 'var(--surface-panel)',
            border: isMe ? 'none' : '1px solid var(--border-subtle)',
            borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          }}
        >
          <p style={{ fontSize: '13px', color: isMe ? '#fff' : 'var(--text-primary)', lineHeight: 1.45 }}>
            {msg.content}
          </p>
        </div>
      </div>
    </div>
  );
}
