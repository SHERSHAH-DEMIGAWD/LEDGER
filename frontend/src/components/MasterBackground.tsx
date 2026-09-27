import { useRef } from 'react';
import { useOpeningEntrance } from '../motion/useOpeningEntrance';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { environmentTransform, routeEase, routeScene } from '../motion/routeMotion';
import { useMediaPreference } from '../motion/useMediaPreference';

/** One fixed photographic environment, mounted outside route transitions. */
export function MasterBackground() {
  const background = useRef<HTMLDivElement>(null);
  useOpeningEntrance(background);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const compact = useMediaPreference('(max-width: 600px)');
  const reduced = useMediaPreference('(prefers-reduced-motion: reduce)');
  const scene = user ? routeScene(pathname) : null;

  return (
    <div ref={background} className="ledger-master-background" aria-hidden="true">
      <div className="ledger-master-background__photograph">
        {/* Separate transform owners keep the opening choreography untouched. */}
        <motion.div
          className="ledger-master-background__viewpoint"
          initial={false}
          animate={{ transform: reduced ? 'none' : environmentTransform(scene, compact) }}
          transition={{ duration: reduced ? 0 : compact ? 0.38 : 0.56, ease: routeEase }}
        />
      </div>
    </div>
  );
}
