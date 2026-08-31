/**
 * motion/DealStateTimeline.tsx
 *
 * A horizontal deal state machine timeline.
 *
 * Visualizes a deal's progression through the state machine.
 * Uses the centralized DEAL_STATES registry from types/dealStates.ts.
 *
 * Per Ledger's animation philosophy:
 * - Past states: filled, connected
 * - Current state: highlighted, pulsing ring
 * - Future states: outlined, grayed
 *
 * No perpetual animations. No business logic.
 * All state values come from the authoritative backend state.
 */

import { motion, AnimatePresence } from 'motion/react';
import { useReducedMotion } from './hooks';
import { duration, easing } from './variants';
import { DEAL_STATES, DEAL_STATE_ORDER, type DealStatus } from '../types/dealStates';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DealStateTimelineProps {
  /**
   * The current deal status from the backend.
   * This is the authoritative source — never hard-coded or inferred.
   */
  currentStatus: DealStatus;
  /**
   * Optional: custom steps to display. Defaults to all states in order.
   * Use this to show only a subset (e.g., after a certain state).
   */
  steps?: DealStatus[];
  /**
   * Show a compact variant (fewer details, smaller indicators).
   */
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPastState(stateOrder: number, currentOrder: number): boolean {
  return stateOrder < currentOrder;
}

function isCurrentState(stateOrder: number, currentOrder: number): boolean {
  return stateOrder === currentOrder;
}

function isFutureState(stateOrder: number, currentOrder: number): boolean {
  return stateOrder > currentOrder;
}

// ---------------------------------------------------------------------------
// DealStateTimeline
// ---------------------------------------------------------------------------

export function DealStateTimeline({
  currentStatus,
  steps,
  compact = false,
  className,
}: DealStateTimelineProps) {
  const reduced = useReducedMotion();
  const config = DEAL_STATES[currentStatus];
  const currentOrder = config?.order ?? 0;

  // Default to all states in order; allow filtering
  const displaySteps = steps ?? DEAL_STATE_ORDER;

  if (displaySteps.length === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 'var(--space-3)' : 'var(--space-4)',
      }}
    >
      {/* State labels row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          position: 'relative',
        }}
        role="list"
        aria-label="Deal status timeline"
      >
        {displaySteps.map((status, index) => {
          const stateConfig = DEAL_STATES[status];
          const order = stateConfig?.order ?? 0;
          const isPast = isPastState(order, currentOrder);
          const isCurrent = isCurrentState(order, currentOrder);
          const isFuture = isFutureState(order, currentOrder);
          const isLast = index === displaySteps.length - 1;

          const color = `var(${stateConfig?.colorVar ?? '--color-text-muted'})`;

          return (
            <div
              key={status}
              role="listitem"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                minWidth: 0,
              }}
            >
              {/* Connector line (top of state node) */}
              {!isLast && (
                <div
                  style={{
                    position: 'absolute',
                    top: compact ? 10 : 13,
                    left: `calc(${100 / displaySteps.length}% * ${index} + ${50 / displaySteps.length}%)`,
                    right: `calc(${100 / displaySteps.length}% * ${displaySteps.length - index - 1} + ${50 / displaySteps.length}%)`,
                    height: 1,
                    background:
                      isPast
                        ? 'var(--color-status-completed)'
                        : 'var(--color-border)',
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                  aria-hidden
                />
              )}

              {/* State dot */}
              <StateDot
                isPast={isPast}
                isCurrent={isCurrent}
                isFuture={isFuture}
                color={color}
                reduced={reduced}
                compact={compact}
              />

              {/* Label */}
              <span
                style={{
                  fontSize: compact ? 'var(--text-xs)' : 'var(--text-xs)',
                  fontWeight: isCurrent ? 600 : 400,
                  color: isFuture
                    ? 'var(--color-text-muted)'
                    : 'var(--color-text-secondary)',
                  textAlign: 'center',
                  marginTop: 'var(--space-2)',
                  lineHeight: 1.3,
                  padding: '0 2px',
                  maxWidth: '100%',
                  wordBreak: 'break-word',
                  hyphens: 'auto',
                }}
              >
                {stateConfig?.label ?? status}
              </span>

              {/* Current indicator */}
              {isCurrent && !compact && (
                <AnimatePresence>
                  <motion.span
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{
                      duration: reduced ? 0 : duration.normal,
                      ease: easing.out,
                    }}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                      marginTop: 2,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Current
                  </motion.span>
                </AnimatePresence>
              )}
            </div>
          );
        })}
      </div>

      {/* Current state detail card */}
      <AnimatePresence>
        <motion.div
          key={currentStatus}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : duration.normal, ease: easing.out }}
          style={{
            padding: compact ? 'var(--space-3) var(--space-4)' : 'var(--space-4) var(--space-5)',
            background: `var(${config?.bgVar ?? 'rgba(79, 79, 99, 0.10)'})`,
            border: `1px solid var(${config?.colorVar ?? '--color-text-muted'}, 0.2)`,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <StateDot
            isPast={false}
            isCurrent={true}
            isFuture={false}
            color={`var(${config?.colorVar ?? '--color-text-muted'})`}
            reduced={reduced}
            compact={false}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {config?.label ?? currentStatus}
            </span>
            {config?.isTerminal && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Terminal state
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StateDot — the indicator at each timeline node
// ---------------------------------------------------------------------------

interface StateDotProps {
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  color: string;
  reduced: boolean;
  compact?: boolean;
}

function StateDot({ isPast, isCurrent, color, reduced, compact }: StateDotProps) {
  const size = compact ? 20 : 26;

  return (
    <motion.span
      initial={reduced ? { scale: 1 } : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: reduced ? 0 : duration.normal, ease: easing.out }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isPast || isCurrent ? color : 'transparent',
        border: `2px solid ${isPast || isCurrent ? color : 'var(--color-border-strong)'}`,
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}
      aria-hidden
    >
      {/* Pulse ring for current state */}
      {isCurrent && !reduced && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 0.5, 0],
            scale: [1, 1.6, 2.2],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeOut',
            repeatDelay: 0.3,
          }}
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: `2px solid ${color}`,
          }}
        />
      )}
    </motion.span>
  );
}
