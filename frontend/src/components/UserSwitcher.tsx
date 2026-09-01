/**
 * components/UserSwitcher.tsx
 *
 * Floating persona switcher shown in the top-right corner of the app shell.
 *
 * Lets the developer instantly change the active persona without typing
 * credentials. In real-backend mode the new persona's ID is forwarded
 * via the X-Mock-User header on subsequent API calls.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useActiveSeedUser } from '../contexts/AuthContext';
import { SEED_USERS, type SeedUser } from '../config/seedUsers';
import { useReducedMotion } from '../motion/hooks';

export function UserSwitcher() {
  const { user, switchPersona, signOut } = useAuth();
  const active = useActiveSeedUser();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!user) return null;

  const handleSelect = (u: SeedUser) => {
    switchPersona(u);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 100,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch persona"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '6px 10px 6px 6px',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-1)';
        }}
      >
        <Avatar name={active?.name ?? user.name} role={user.role} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 500, lineHeight: 1.2 }}>{active?.name ?? user.name}</span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.2,
            }}
          >
            {user.role}
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            color: 'var(--color-text-muted)',
          }}
        >
          <path
            d="M3 5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduced ? 0 : 0.12 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '320px',
              maxHeight: '480px',
              overflowY: 'auto',
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              padding: 'var(--space-2)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-muted)',
                padding: 'var(--space-2)',
              }}
            >
              Switch persona
            </div>

            {SEED_USERS.map((u) => (
              <PersonaItem
                key={u.id}
                user={u}
                active={u.id === user.id}
                onSelect={() => handleSelect(u)}
              />
            ))}

            <div
              style={{
                borderTop: '1px solid var(--color-border)',
                marginTop: 'var(--space-2)',
                paddingTop: 'var(--space-2)',
              }}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PersonaItem({
  user,
  active,
  onSelect,
}: {
  user: SeedUser;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        width: '100%',
        padding: '6px 8px',
        background: active ? 'var(--color-surface-3)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = active
          ? 'var(--color-surface-3)'
          : 'transparent';
      }}
    >
      <Avatar name={user.name} role={user.role} small />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: active ? 600 : 500,
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}
        >
          {user.name}
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.2,
          }}
        >
          {user.email}
        </div>
      </div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {user.role}
      </div>
    </button>
  );
}

function Avatar({ name, role, small }: { name: string; role: string; small?: boolean }) {
  const size = small ? 24 : 28;
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colors: Record<string, string> = {
    BRAND: '#5b8def',
    CREATOR: '#f59e0b',
    ADMIN: '#a855f7',
    HRT: '#10b981',
  };
  const bg = colors[role] ?? '#888';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: small ? '11px' : '12px',
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
