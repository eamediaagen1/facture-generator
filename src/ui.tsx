import type { ReactNode } from 'react';

// ── PageContainer ──────────────────────────────────────────────────────────────
// Standard page wrapper: consistent padding, max-width, vertical rhythm.

export function PageContainer({
  children,
  maxWidth = 'max-w-[1400px]',
}: {
  children:  ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className={`px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 ${maxWidth} mx-auto`}>
      {children}
    </div>
  );
}

// ── PageHeader ─────────────────────────────────────────────────────────────────
// Title (left) + optional subtitle + optional actions (right).

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title:     string;
  subtitle?: string;
  actions?:  ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── MetricCard ─────────────────────────────────────────────────────────────────
// Unified metric card used on every list/data page.

export function MetricCard({
  icon,
  iconBg = 'bg-slate-50',
  label,
  value,
  valueClass = 'text-slate-800',
  sub,
}: {
  icon:        ReactNode;
  iconBg?:     string;
  label:       string;
  value:       string;
  valueClass?: string;
  sub?:        string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 sm:px-5 py-4 sm:py-5 flex items-start gap-3 sm:gap-4">
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className={`text-base sm:text-lg font-bold mt-1 break-words leading-tight tabular-nums ${valueClass}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── TableActionBtn ─────────────────────────────────────────────────────────────
// Small icon button used in table action columns.

export function TableActionBtn({
  title,
  onClick,
  danger,
  disabled,
  children,
}: {
  title:     string;
  onClick:   () => void;
  danger?:   boolean;
  disabled?: boolean;
  children:  ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none ${
        danger
          ? 'text-slate-300 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// ── LoadingSpinner ─────────────────────────────────────────────────────────────

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );
}

// ── ErrorState ─────────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-red-500 text-sm gap-2">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs underline text-slate-500">
          Réessayer
        </button>
      )}
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  message,
  hint,
}: {
  icon:    ReactNode;
  message: string;
  hint?:   string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <div className="mb-3 opacity-25">{icon}</div>
      <p className="text-sm font-medium">{message}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}

// ── InlineError ────────────────────────────────────────────────────────────────

export function InlineError({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
      {message}
    </div>
  );
}
