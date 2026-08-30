/**
 * components/ui.tsx
 *
 * Base UI component primitives with micro-interactions.
 *
 * Every interactive element uses Motion for:
 * - hover / press / focus feedback
 *
 * No decorative animations. No perpetual motion.
 * These are the building blocks for feature components.
 */

import { forwardRef, type ReactNode, type InputHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ComponentProps<typeof motion.button> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg)',
    border: '1px solid var(--color-text-primary)',
  },
  secondary: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--color-status-disputed-bg)',
    color: 'var(--color-status-disputed)',
    border: '1px solid var(--color-status-disputed)',
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--text-sm)' },
  md: { padding: '8px 16px', fontSize: 'var(--text-base)' },
  lg: { padding: '12px 24px', fontSize: 'var(--text-md)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      children,
      disabled,
      className,
      style,
      ...rest
    },
    ref
  ) {
    const reduced = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        className={className}
        whileHover={!reduced && !disabled && !loading ? { scale: 1.02 } : undefined}
        whileTap={!reduced && !disabled && !loading ? { scale: 0.97 } : undefined}
        transition={{ duration: duration.fast, ease: easing.snap }}
        disabled={disabled || loading}
        aria-busy={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 500,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
            }}
          />
        ) : null}
        {children}
      </motion.button>
    );
  }
);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, hint, id, className, style, ...rest }, ref) {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? 'true' : undefined}
          style={{
            padding: '8px 12px',
            background: 'var(--color-surface-2)',
            border: `1px solid ${error ? 'var(--color-status-disputed)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-base)',
            outline: 'none',
            transition: 'border-color 0.15s',
            ...style,
          }}
          {...rest}
        />
        {hint && !error && (
          <span id={hintId} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {hint}
          </span>
        )}
        {error && (
          <span
            id={errorId}
            role="alert"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-disputed)' }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextProps {
  as?: keyof JSX.IntrinsicElements;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Typographic component with semantic defaults */
export function Text({ as: Tag = 'p', children, className, style }: TextProps) {
  return (
    <Tag className={className} style={{ margin: 0, ...style }}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

export interface SpacerProps {
  size?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/** A responsive gap spacer */
export function Spacer({ size = 4 }: SpacerProps) {
  const space = `var(--space-${size})`;
  return (
    <div
      aria-hidden
      style={{ height: space, minHeight: space }}
    />
  );
}
