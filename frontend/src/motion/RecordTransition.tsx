import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { animate } from 'motion/react';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import { useMediaPreference } from './useMediaPreference';
import { routeEase } from './routeMotion';

/** A bounded visual handoff; it never supplies data to, or delays, a route. */
export function RecordTransition({ from, to, navigationKey }: { from: string; to: string; navigationKey: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const lastNavigation = useRef<string>();
  const { recordOrigin, recordSnapshot, clearRecord } = useDealNavigation();
  const compact = useMediaPreference('(max-width: 600px)');
  const reduced = useMediaPreference('(prefers-reduced-motion: reduce)');

  // The layer is scoped to the signed-in shell, including account changes.
  useLayoutEffect(() => clearRecord, [clearRecord]);

  useLayoutEffect(() => {
    const host = layer.current;
    if (!host || !recordOrigin || from === to) return;
    // Preference/viewport changes cancel the handoff, rather than replaying it.
    if (lastNavigation.current === navigationKey) return;
    lastNavigation.current = navigationKey;
    const opening = from === recordOrigin.from && to === recordOrigin.to;
    const returning = from === recordOrigin.to && to === recordOrigin.from;
    if (!opening && !returning) { clearRecord(); return; }

    const content = document.querySelector('.ledger-content');
    if (!content) return;
    const marked = new Map<HTMLElement, string[]>();
    const mark = (element: HTMLElement, attribute: string) => {
      element.setAttribute(attribute, '');
      marked.set(element, [...(marked.get(element) ?? []), attribute]);
    };
    const row = () => Array.from(content.querySelectorAll<HTMLElement>('.record-row[data-record-id]'))
      .find(element => element.dataset.recordId === recordOrigin.id);
    let controls: ReturnType<typeof animate> | undefined;
    let observer: MutationObserver | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(deadline);
      observer?.disconnect();
      controls?.stop();
      host.replaceChildren();
      for (const [element, attributes] of marked) attributes.forEach(attribute => element.removeAttribute(attribute));
      window.removeEventListener('resize', finish);
      window.removeEventListener('keydown', finish, true);
      window.removeEventListener('pointerdown', finish, true);
    };
    const deadline = window.setTimeout(finish, reduced ? 220 : 700);
    // A user can keep working immediately. A second navigation cancels, never queues.
    window.addEventListener('resize', finish);
    window.addEventListener('keydown', finish, true);
    window.addEventListener('pointerdown', finish, true);

    if (opening) {
      const source = row();
      // Browser Forward can use the freshly rendered row, never a cached deal value.
      const snapshot = recordSnapshot.current ?? (source ? {
        element: source.cloneNode(true) as HTMLElement,
        bounds: source.getBoundingClientRect(),
      } : null);
      recordSnapshot.current = null;
      if (snapshot) {
        const { element, bounds } = snapshot;
        const topbar = document.querySelector('.ledger-topbar')?.getBoundingClientRect();
        const minimumTop = Math.max(12, (topbar?.bottom ?? 0) + 12);
        const maximumTop = window.innerHeight - bounds.height - 16;
        // Very tall/off-screen rows simply use the normal record reveal.
        if (maximumTop >= minimumTop && bounds.bottom > 0 && bounds.top < window.innerHeight) {
          const top = Math.max(minimumTop, Math.min(bounds.top, maximumTop));
          const targetTop = Math.min(maximumTop, minimumTop + (compact ? 0 : 104));
          const travel = reduced ? 0 : compact ? -Math.min(8, top - minimumTop) : targetTop - top;
          for (const node of [element, ...element.querySelectorAll<HTMLElement>('*')]) {
            for (const attribute of ['id', 'href', 'tabindex', 'data-record-id', 'data-record-selected', 'aria-describedby', 'aria-labelledby']) node.removeAttribute(attribute);
          }
          element.setAttribute('inert', '');
          Object.assign(element.style, { position: 'absolute', left: `${bounds.left}px`, top: `${top}px`, width: `${bounds.width}px`, margin: '0', transformOrigin: 'left center' });
          host.append(element);
          if (source) {
            mark(source, 'data-record-selected');
            const page = source.closest<HTMLElement>('.transaction-page');
            if (page) mark(page, 'data-record-opening');
            const surface = source.closest<HTMLElement>('.ledger-context');
            if (surface) mark(surface, 'data-record-handoff');
          }
          controls = animate(element, {
            y: [0, travel],
            opacity: [1, 1, 0],
          }, { duration: reduced ? 0.12 : compact ? 0.34 : 0.52, times: [0, 0.62, 1], ease: routeEase });
        }
      }
    }

    // Group the actual header and body only once, when authoritative content mounts.
    // Slow/error responses fall back to their existing loading/error UI at the deadline.
    const reveal = () => {
      const destination = opening
        ? Array.from(content.querySelectorAll<HTMLElement>('[data-record-detail]')).find(element => element.dataset.recordDetail === recordOrigin.id)
        : row();
      if (!destination) return;
      mark(destination, opening ? 'data-record-reveal' : 'data-record-returning');
      observer?.disconnect();
    };
    observer = new MutationObserver(reveal);
    observer.observe(content, { childList: true, subtree: true });
    reveal();
    return finish;
  }, [from, to, navigationKey, recordOrigin, recordSnapshot, clearRecord, compact, reduced]);

  return createPortal(<div ref={layer} className="ledger-record-bridge" aria-hidden="true" />, document.body);
}
