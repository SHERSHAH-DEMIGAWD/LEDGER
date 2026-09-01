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

interface DealNavigationValue {
  direction: DealNavDirection;
  recordNavigation: (dir: DealNavDirection) => void;
  resetDirection: () => void;
}

const DealNavigationContext = createContext<DealNavigationValue>({
  direction: 'none',
  recordNavigation: () => {},
  resetDirection: () => {},
});

export function DealNavigationProvider({ children }: { children: ReactNode }) {
  const [direction, setDirection] = useState<DealNavDirection>('none');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      value={{ direction, recordNavigation, resetDirection }}
    >
      {children}
    </DealNavigationContext.Provider>
  );
}

export function useDealNavigation(): DealNavigationValue {
  return useContext(DealNavigationContext);
}
