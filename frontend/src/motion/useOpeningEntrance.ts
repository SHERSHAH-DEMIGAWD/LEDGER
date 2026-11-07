import { useLayoutEffect, useState, type RefObject } from 'react';
import { animate, frame, type AnimationSequence } from 'motion/react';

// Document-lifetime only: route changes/remounts stay immediate; a reload may replay.
// Claim in the effect, not render, so React's StrictMode probe cannot consume it.
let entranceClaimed = false;

export function useOpeningEntrance(background: RefObject<HTMLDivElement>) {
  const [shouldPlay] = useState(() => !entranceClaimed);

  useLayoutEffect(() => {
    const environment = background.current;
    const root = environment?.parentElement;
    const photograph = environment?.firstElementChild as HTMLElement | null;
    if (!shouldPlay || !root || !photograph) return;
    entranceClaimed = true;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const beganAt = performance.now();
    let finished = false;
    let controls: ReturnType<typeof animate> | undefined;
    let pageObserver: MutationObserver | undefined;
    let readinessTimer: number;
    const temporaryStyles = new Map<HTMLElement, string[]>();
    const remember = (element: HTMLElement, properties: string[]) => {
      temporaryStyles.set(element, properties);
      return element;
    };
    const clearTemporaryStyles = () => {
      for (const [element, properties] of temporaryStyles) {
        for (const property of properties) element.style.removeProperty(property);
      }
    };

    // Keep links, autofill, keyboard navigation and forms usable even mid-entrance.
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(readinessTimer);
      window.clearTimeout(deadline);
      pageObserver?.disconnect();
      controls?.stop();
      delete root.dataset.ledgerEntrance;
      clearTemporaryStyles();
      // Motion can commit its final values on the next render step. Remove those
      // too, so no perspective/filter or masking layer survives the entrance.
      if (controls) frame.postRender(clearTemporaryStyles);
      root.removeEventListener('pointerdown', finish, true);
      root.removeEventListener('focusin', finish);
      window.removeEventListener('keydown', finish, true);
      window.removeEventListener('popstate', finish);
      reduced.removeEventListener('change', finish);
    };

    root.dataset.ledgerEntrance = 'preparing';
    root.addEventListener('pointerdown', finish, true);
    root.addEventListener('focusin', finish);
    window.addEventListener('keydown', finish, true);
    window.addEventListener('popstate', finish);
    reduced.addEventListener('change', finish);
    // A slow/missing photograph or interrupted animation must never hold the UI.
    const deadline = window.setTimeout(finish, 1800);

    const start = () => {
      if (finished) return;
      // A guarded initial URL can still be exiting before /login mounts. Wait
      // for actual page content so it joins the same reveal, without rerouting.
      if (!root.querySelector('.login-page, .ledger-app-shell')) {
        pageObserver ??= new MutationObserver(start);
        pageObserver.observe(root, { childList: true, subtree: true });
        return;
      }
      pageObserver?.disconnect();
      const mobile = window.matchMedia('(max-width: 600px)').matches;
      const sequence: AnimationSequence = [];
      const reveal = (selector: string, at: number, duration: number, light = true) => {
        for (const element of root.querySelectorAll<HTMLElement>(selector)) {
          remember(element, ['opacity', 'mask-position']);
          sequence.push([
            element,
            light && !reduced.matches
              ? { opacity: [0, 1], maskPosition: ['100% 0%', '0% 0%'] }
              : { opacity: [0, 1] },
            { at: reduced.matches ? 0 : at, duration: reduced.matches ? 0.16 : duration, ease: [0.2, 0.65, 0.25, 1] },
          ]);
        }
      };

      remember(photograph, ['opacity', 'transform', 'filter']);
      sequence.push([photograph, { opacity: [0, 1] }, { at: 0, duration: reduced.matches ? 0.16 : 0.48 }]);
      if (!reduced.matches) {
        // Move the sole photograph. Never isolate, redraw or duplicate its coin.
        sequence.push([photograph, {
          transform: mobile ? [
            'perspective(1800px) translate3d(4%, 1%, 0) rotateY(-3deg) scale(1.16)',
            'perspective(1800px) translate3d(0.2%, 0, 0) rotateY(0.12deg) scale(1.008)',
            'perspective(1800px) translate3d(0, 0, 0) rotateY(0deg) scale(1)',
          ] : [
            'perspective(1800px) translate3d(8%, 4%, 0) rotateY(-7deg) scale(1.48)',
            'perspective(1800px) translate3d(0.35%, 0.1%, 0) rotateY(0.22deg) scale(1.014)',
            'perspective(1800px) translate3d(0, 0, 0) rotateY(0deg) scale(1)',
          ],
        }, { at: 0, duration: 1.32, times: [0, 0.72, 1], ease: [0.12, 0.7, 0.2, 1] }]);
        // Brief exposure change lets the photographed sunlight catch the rim.
        sequence.push([photograph, {
          filter: ['brightness(0.82)', 'brightness(1.07)', 'brightness(1)'],
        }, { at: 0.12, duration: 0.98, times: [0, 0.6, 1], ease: 'easeOut' }]);
      }

      reveal('.auth-wordmark', 0.48, 0.42, false);
      reveal('.login-page__head .transaction-eyebrow, .login-page__head .transaction-title', 0.56, 0.5);
      reveal('.login-page__head .transaction-intro', 0.76, 0.46);
      reveal('.login-page__register', 0.9, 0.62);
      reveal('.login-page__foot, .auth-personas, .auth-caption', 1.08, 0.44);
      // Verification/status content and an already signed-in shell keep their layout.
      reveal('.login-page__panel > :not(.login-page__head, .login-page__register, .login-page__foot, .auth-personas), .ledger-app-shell', 0.56, 0.6);
      root.dataset.ledgerEntrance = 'running';
      controls = animate(sequence);
      // Include readiness/guard time in the budget, even on a protected entry URL.
      if (!reduced.matches) {
        controls.speed = Math.max(1, 1.52 / Math.max(0.16, (1700 - (performance.now() - beganAt)) / 1000));
      }
      void controls.then(finish);
    };

    // Decode off-DOM; this is the same cached asset, never a second visible coin.
    // Bound readiness to 200ms so the entrance cannot become a loading screen.
    const image = new Image();
    image.src = '/ledger-master-bg.png';
    const ready = new Promise<void>((resolve) => {
      readinessTimer = window.setTimeout(resolve, reduced.matches ? 0 : 200);
      void image.decode().then(resolve, resolve);
    });
    void ready.then(start).catch(finish);

    return finish;
  }, [background, shouldPlay]);
}
