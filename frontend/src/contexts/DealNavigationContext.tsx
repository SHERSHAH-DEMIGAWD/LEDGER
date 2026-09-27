/**
 * contexts/DealNavigationContext.tsx
 *
 * Tracks deal-to-deal navigation direction so the app can apply the
 * correct slide animation:
 *   - Moving to the NEXT deal → new deal slides up from below
 *   - Moving to the PREVIOUS deal → new deal slides down from above
 *
 * This context is consumed by App.tsx to pick the correct animation variant
 * for the AnimatePresence transition.
 *
 * Usage:
 *   import { DealNavigationProvider, useDealNavigation } from '../contexts/DealNavigationContext';
 *   const { direction, recordNavigation } = useDealNavigation();
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';

/**
 * Navigation intent types:
 *   - 'forward': Register -> Deal (enters from right, leaves left)
 *   - 'backward': Deal -> Register (enters from left, leaves right)
 *   - 'next-record': Deal N -> Deal N+1 (leaves up, enters from below)
 *   - 'prev-record': Deal N -> Deal N-1 (leaves down, enters from above)
 *   - 'none': Default fallback transition
 */
export type DealNavDirection = 'forward' | 'backward' | 'next-record' | 'prev-record' | 'up' | 'down' | 'none';

export interface RecordOrigin {
  id: string;
  from: string;
  to: string;
}

export interface RecordSnapshot {
  element: HTMLElement;
  bounds: DOMRect;
}

interface DealNavigationValue {
  direction: DealNavDirection;
  recordNavigation: (dir: DealNavDirection) => void;
  resetDirection: () => void;
  recordOrigin: RecordOrigin | null;
  recordSnapshot: MutableRefObject<RecordSnapshot | null>;
  openRecord: (element: HTMLAnchorElement, id: string, from: string) => void;
  clearRecord: () => void;
}

const DealNavigationContext = createContext<DealNavigationValue>({
  direction: 'none',
  recordNavigation: () => {},
  resetDirection: () => {},
  recordOrigin: null,
  recordSnapshot: { current: null },
  openRecord: () => {},
  clearRecord: () => {},
});

export function DealNavigationProvider({ children }: { children: ReactNode }) {
  const [direction, setDirection] = useState<DealNavDirection>('none');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recordOrigin, setRecordOrigin] = useState<RecordOrigin | null>(null);
  const recordSnapshot = useRef<RecordSnapshot | null>(null);
  const openRecord = useCallback((element: HTMLAnchorElement, id: string, from: string) => {
    // A decorative DOM snapshot only; the detail still loads its own live data.
    // Capture before the router's existing scroll reset. No navigation is delayed.
    recordSnapshot.current = { element: element.cloneNode(true) as HTMLElement, bounds: element.getBoundingClientRect() };
    setRecordOrigin({ id, from, to: new URL(element.href).pathname });
  }, []);
  const clearRecord = useCallback(() => {
    recordSnapshot.current = null;
    setRecordOrigin(null);
  }, []);

  const recordNavigation = useCallback((dir: DealNavDirection) => {
    // Clear any pending reset
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setDirection(dir);
  }, []);

  const resetDirection = useCallback(() => {
    // Defer reset so the animation has time to pick up the value.
    // Must match the 400ms animation duration in App.tsx.
    resetTimer.current = setTimeout(() => {
      setDirection('none');
      resetTimer.current = null;
    }, 420);
  }, []);

  return (
    <DealNavigationContext.Provider
      value={{ direction, recordNavigation, resetDirection, recordOrigin, recordSnapshot, openRecord, clearRecord }}
    >
      {children}
    </DealNavigationContext.Provider>
  );
}

export function useDealNavigation(): DealNavigationValue {
  return useContext(DealNavigationContext);
}
