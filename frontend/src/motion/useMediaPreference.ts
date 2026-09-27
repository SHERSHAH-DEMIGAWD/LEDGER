import { useCallback, useSyncExternalStore } from 'react';

/** Includes live preference/viewport changes, including during a transition. */
export function useMediaPreference(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
