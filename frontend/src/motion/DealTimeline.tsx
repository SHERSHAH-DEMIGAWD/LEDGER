/**
 * motion/DealTimeline.tsx
 *
 * A data-driven transaction timeline.
 *
 * The timeline is purely presentational. It receives a list of steps
 * (and which one is current) and renders them in order. It does NOT
 * decide state transitions or business behavior.
 *
 * Per Ledger's animation philosophy:
 * - Completed steps: filled circle
 * - Current step:    filled circle with subtle ring
 * - Future steps:    outline circle
 * - The current step indicator animates in once on mount.
 *
 * No perpetual animations. No fabricated transitions.
 */

import { motion, AnimatePresence } from 'motion/react';
import type { Variants } from 'motion/react';
import { useReducedMotion } from './hooks';
import type { Status } from './StatusBadge';
import { duration, easing } from './variants';

// ---------------------------------------------------------------------------
// Step type — data-driven, no business logic
// ---------------------------------------------------------------------------

export interface TimelineStep {
  /** Stable id for the step */
  id: string;
  /** Human label, e.g., "Deal Pending" */
  label: string;
  /** Status for visual treatment (statuses come from the parent, not the timeline) */
  status: Status;
  /** Optional human timestamp, pre-formatted on the parent */
  timestamp?: string;
  /** Optional actor, e.g., "Buyer accepted" */
  actor?: string;
}

export interface DealTimelineProps {
  steps: TimelineStep[];
  /** The id of the current step. Optional — if absent, all steps are 'past' or 'future' based on status. */
  currentId?: string;
  /** Optional ref to a container element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Internal step state computation
// ---------------------------------------------------------------------------

type StepVisualState = 'past' | 'current' | 'future' | 'active';

/**
 * Compute a step's visual state from status and current id.
 * This is purely visual — the source of truth is `status` (from backend) and
 * `currentId` (provided by the parent from authoritative state).
 */
function computeStepState(
  step: TimelineStep,
  isCurrent: boolean
): StepVisualState {
  if (isCurrent) return 'current';

  const activeStatuses: Status[] = ['pending', 'in_progress', 'submitted', 'disputed'];
  if (activeStatuses.includes(step.status)) return 'active';

  const doneStatuses: Status[] = ['accepted', 'funded', 'approved', 'resolved', 'completed'];
  if (doneStatuses.includes(step.status)) return 'past';

  return 'future';
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.out },
  },
};

// ---------------------------------------------------------------------------
// DealTimeline
// ---------------------------------------------------------------------------

export function DealTimeline({ steps, currentId, className }: DealTimelineProps) {
  const reduced = useReducedMotion();

  if (steps.length === 0) {
    return null;
  }

  return (
    <motion.ol
      className={className}
      aria-label="Deal timeline"
      initial="hidden"
      animate="visible"
      variants={reduced ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : containerVariants}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        position: 'relative',
      }}
    >
      {steps.map((step, index) => {
        const isCurrent = step.id === currentId;
        const state = computeStepState(step, isCurrent);
        const isLast = index === steps.length - 1;

        return (
          <motion.li
            key={step.id}
            variants={reduced ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : itemVariants}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              gap: 'var(--space-3)',
              paddingBottom: isLast ? 0 : 'var(--space-5)',
            }}
          >
            {/* Vertical connector line */}
            {!isLast && (
              <motion.span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 15,
                  top: 22,
                  bottom: 0,
                  width: 1,
                  background:
                    state === 'past' || state === 'current'
                      ? 'var(--color-status-completed)'
                      : 'var(--color-border)',
                  transform: 'translateX(-0.5px)',
                }}
              />
            )}

            {/* Step indicator */}
            <TimelineDot state={state} status={step.status} />

            {/* Step content */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                paddingTop: 2,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-2)',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontWeight: state === 'current' ? 600 : 500,
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-base)',
                  }}
                >
                  {step.label}
                </span>
                {state === 'current' && (
                  <AnimatePresence>
                    <motion.span
                      key="current"
                      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                      animate={
                        reduced
                          ? { opacity: 1 }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={{ duration: duration.normal, ease: easing.out }}
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Current
                    </motion.span>
                  </AnimatePresence>
                )}
              </div>

              {step.actor && (
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {step.actor}
                </span>
              )}

              {step.timestamp && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {step.timestamp}
                </span>
              )}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

// ---------------------------------------------------------------------------
// TimelineDot
// ---------------------------------------------------------------------------

interface TimelineDotProps {
  state: StepVisualState;
  status: Status;
}

function TimelineDot({ state, status }: TimelineDotProps) {
  const reduced = useReducedMotion();

  const statusToColor: Record<Status, string> = {
    pending: 'var(--color-status-pending)',
    accepted: 'var(--color-status-accepted)',
    funded: 'var(--color-status-funded)',
    in_progress: 'var(--color-status-in-progress)',
    submitted: 'var(--color-status-submitted)',
    approved: 'var(--color-status-approved)',
    disputed: 'var(--color-status-disputed)',
    resolved: 'var(--color-status-resolved)',
    completed: 'var(--color-status-completed)',
  };

  const isFilled = state === 'past' || state === 'current' || state === 'active';

  return (
    <motion.span
      initial={reduced ? { scale: 1 } : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: duration.normal, ease: easing.out }}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: isFilled ? statusToColor[status] : 'transparent',
        border: `2px solid ${
          isFilled ? statusToColor[status] : 'var(--color-border-strong)'
        }`,
        flexShrink: 0,
        margin: '6px 0',
        position: 'relative',
      }}
    >
      {state === 'current' && !reduced && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [1, 1.7, 2.2],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeOut',
            repeatDelay: 0.2,
          }}
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: `2px solid ${statusToColor[status]}`,
          }}
        />
      )}
    </motion.span>
  );
}
