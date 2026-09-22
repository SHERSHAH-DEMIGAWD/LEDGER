import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEV_PERSONAS_ENABLED } from '../services/auth';
import { SEED_USERS } from '../config/seedUsers';

export function UserSwitcher() {
  const { user, switchPersona, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <div ref={container} style={{ position: 'relative' }}>
    <button ref={trigger} className="account-trigger" type="button" aria-label="Account menu" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}><span aria-hidden="true">{initials}</span><span><strong>{user.name}</strong><small>{user.role === 'HRT' ? 'Resolution team' : user.role.toLowerCase()}</small></span><span aria-hidden="true">⌄</span></button>
    {open && <div className="account-menu" id="account-menu"><p>{user.email}</p>{DEV_PERSONAS_ENABLED && SEED_USERS.map((persona) => <button key={persona.id} type="button" onClick={() => { switchPersona(persona); setOpen(false); }}>{persona.name}<small>{persona.role}</small></button>)}<button type="button" onClick={() => { setOpen(false); signOut(); }}>Sign out</button></div>}
  </div>;
}
