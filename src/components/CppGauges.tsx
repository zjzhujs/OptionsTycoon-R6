import { useId, type ReactNode } from 'react';

export type CppGaugeTone = 'cyan' | 'amber' | 'red';

export const clampGaugeValue = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * Convert an absolute value into the 0–100 scale used by the SVG only.
 * The caller keeps the original value in displayValue so the graphic never
 * replaces the financially meaningful number shown to the player.
 */
export const normalizeGaugeAmount = (
  value: number | null | undefined,
  reference: number | null | undefined,
): number | null => {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || (reference as number) <= 0) return null;
  return clampGaugeValue(((value as number) / (reference as number)) * 100);
};

const stableLabelHash = (label: string): string => {
  let hash = 0;
  for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash.toString(36);
};

/** SVG ids must not inherit spaces, punctuation, or CJK characters from UI copy. */
export const slugifySvgId = (label: string): string => {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `metric-${stableLabelHash(label)}`;
};

interface VizValue {
  usable: boolean;
  value: number;
}

const resolveVizValue = (value: number | null | undefined, available = true): VizValue => {
  const usable = available && Number.isFinite(value);
  return { usable, value: usable ? clampGaugeValue(value as number) : 0 };
};

const vizText = ({ usable, value }: VizValue): string => (usable ? `${Math.round(value)}%` : 'DATA_UNAVAILABLE');

export interface EnergyGaugeProps {
  label: string;
  value?: number | null;
  tone?: CppGaugeTone;
  available?: boolean;
}

export function EnergyGauge({ label, value, tone = 'cyan', available = true }: EnergyGaugeProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'instance';
  const slug = slugifySvgId(label);
  const gradientId = `g-${slug}-${instanceId}`;
  const glowId = `glow-${slug}-${instanceId}`;
  const radians = Math.PI - (Math.PI * resolved.value) / 100;
  const sparkX = 80 + 56 * Math.cos(radians);
  const sparkY = 76 - 56 * Math.sin(radians);

  return (
    <div
      className={`viz-gauge tone-${tone} ${!resolved.usable ? 'is-na' : ''}`}
      data-viz-value={resolved.usable ? resolved.value : undefined}
      data-available={resolved.usable ? 'true' : 'false'}
      aria-label={`${label}: ${vizText(resolved)}`}
    >
      <svg viewBox="0 0 160 96" className="viz-svg energy-gauge-svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0%" stopColor="var(--viz-dim)" />
            <stop offset="55%" stopColor="var(--viz-main)" />
            <stop offset="100%" stopColor="var(--viz-hot)" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M24 76 A56 56 0 0 1 136 76" className="g-track" />
        <path
          d="M24 76 A56 56 0 0 1 136 76"
          className="g-fill"
          pathLength={100}
          strokeDasharray={resolved.usable ? `${resolved.value} 100` : '4 4'}
          stroke={resolved.usable ? `url(#${gradientId})` : undefined}
          filter={resolved.usable ? `url(#${glowId})` : undefined}
        />
        <path d="M36 76 A44 44 0 0 1 124 76" className="g-inner" />
        {resolved.usable && <circle cx={sparkX} cy={sparkY} r="2.5" className="g-spark" />}
        {resolved.usable && <rect x="32" y="26" width="96" height="1.5" className="g-scan" />}
      </svg>
      <div className="g-value">{resolved.usable ? Math.round(resolved.value) : 'DATA_UNAVAILABLE'}</div>
      <div className="g-label cpp-kpi-label cpp-kpi-k">{label}</div>
    </div>
  );
}

export interface CppGaugeCardProps {
  label: string;
  value: number | null;
  displayValue?: ReactNode;
  displayLabel?: string;
  delta?: ReactNode;
  source?: ReactNode;
  unit?: string;
  tone?: CppGaugeTone;
  available?: boolean;
}

export function CppGaugeCard({
  label,
  value,
  displayValue,
  displayLabel,
  delta,
  source,
  unit = '',
  tone = 'cyan',
  available = true,
}: CppGaugeCardProps): JSX.Element {
  const usable = available && value != null && Number.isFinite(value);
  const v = usable ? clampGaugeValue(value as number) : null;
  const mainValue = usable ? displayValue ?? `${value}${unit}` : 'DATA_UNAVAILABLE';
  const accessibleValue = usable ? displayLabel ?? (typeof displayValue === 'string' ? displayValue : `${value}${unit}`) : 'DATA_UNAVAILABLE';

  return (
    <div
      className={`cpp-kpi-gauge tone-${tone} ${!usable ? 'is-na' : ''}`}
      data-gauge-value={usable ? v : undefined}
      data-available={usable ? 'true' : 'false'}
      aria-label={`${label}: ${accessibleValue}`}
    >
      <EnergyGauge label={label} value={v} tone={tone} available={usable} />
      <div className="cpp-kpi-value cpp-kpi-v">{mainValue}</div>
      {delta && <div className="cpp-kpi-delta">{delta}</div>}
      {source && <div className="cpp-kpi-source">{source}</div>}
    </div>
  );
}

export interface InfoRingProps {
  label: string;
  value: number | null;
  tone?: CppGaugeTone;
  available?: boolean;
  sub?: ReactNode;
}

/** Kept as a compatibility primitive for older consumers; CPP now uses semantic viz cards. */
export function InfoRing({
  label,
  value,
  tone = 'cyan',
  available = true,
  sub,
}: InfoRingProps): JSX.Element {
  const usable = available && value != null && Number.isFinite(value);
  const v = usable ? clampGaugeValue(value as number) : 0;
  const circumference = 163.36;

  return (
    <div
      className={`info-ring tone-${tone} ${!usable ? 'is-na' : ''}`}
      data-ring-value={usable ? v : undefined}
      data-available={usable ? 'true' : 'false'}
      aria-label={`${label}: ${usable ? `${value}%` : 'DATA_UNAVAILABLE'}`}
    >
      <svg viewBox="0 0 64 64" className="ring-svg" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="26" className="r-track" />
        <circle
          cx="32"
          cy="32"
          r="26"
          className="r-fill"
          strokeDasharray={`${(circumference * v) / 100} ${circumference}`}
          strokeDashoffset="0"
        />
      </svg>
      <div className="ring-center">{usable ? `${value}%` : 'DATA_UNAVAILABLE'}</div>
      <div className="ring-label">{label}</div>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

export interface VizMetricCardProps {
  label: string;
  value?: number | null;
  tone?: CppGaugeTone;
  available?: boolean;
  sub?: ReactNode;
  children: ReactNode;
}

export function VizMetricCard({
  label,
  value,
  tone = 'cyan',
  available = true,
  sub,
  children,
}: VizMetricCardProps): JSX.Element {
  const resolved = resolveVizValue(value, available);

  return (
    <div
      className={`info-ring viz-card tone-${tone} ${!resolved.usable ? 'is-na' : ''}`}
      data-viz-value={resolved.usable ? resolved.value : undefined}
      data-available={resolved.usable ? 'true' : 'false'}
      aria-label={`${label}: ${vizText(resolved)}`}
    >
      <div className="viz-graphic">{children}</div>
      <div className="ring-label">{label}</div>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

export interface SemanticVizProps {
  value?: number | null;
  available?: boolean;
}

export function NetConstellation({ value, available = true }: SemanticVizProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  const dash = resolved.usable ? undefined : '3 3';

  return (
    <svg width="96" height="96" viewBox="0 0 80 80" className={`viz-svg net-constellation ${!resolved.usable ? 'is-na' : ''}`} data-available={resolved.usable ? 'true' : 'false'} aria-hidden="true" focusable="false">
      <line x1="16" y1="22" x2="40" y2="14" className="n-link" strokeDasharray={dash} />
      <line x1="40" y1="14" x2="62" y2="26" className="n-link" strokeDasharray={dash} />
      <line x1="16" y1="22" x2="24" y2="54" className="n-link" strokeDasharray={dash} />
      <line x1="24" y1="54" x2="58" y2="58" className="n-link" strokeDasharray={dash} />
      {resolved.usable && (
        <>
          <circle cx="16" cy="22" r="3" className="n-node" />
          <circle cx="40" cy="14" r="3" className="n-node hot" />
          <circle cx="62" cy="26" r="3" className="n-node" />
          <circle cx="24" cy="54" r="3" className="n-node" />
          <circle cx="58" cy="58" r="3" className="n-node" />
        </>
      )}
      <text x="40" y="74" textAnchor="middle" className="viz-num">{vizText(resolved)}</text>
    </svg>
  );
}

export function RiskFan({ value, available = true }: SemanticVizProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  return (
    <svg width="96" height="96" viewBox="0 0 80 80" className={`viz-svg risk-fan ${!resolved.usable ? 'is-na' : ''}`} data-available={resolved.usable ? 'true' : 'false'} aria-hidden="true" focusable="false">
      <path d="M40 68 L12 68 A28 28 0 0 1 68 68 Z" className="fan-track" strokeDasharray={resolved.usable ? undefined : '3 3'} />
      {resolved.usable && <path d="M40 68 L12 68 A28 28 0 0 1 68 68 Z" className="fan-fill" pathLength={100} strokeDasharray={`${resolved.value} 100`} />}
      <text x="40" y="58" textAnchor="middle" className="viz-num">{vizText(resolved)}</text>
    </svg>
  );
}

export function TankGauge({ value, available = true }: SemanticVizProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  const fillHeight = 0.48 * resolved.value;
  return (
    <svg width="72" height="96" viewBox="0 0 60 80" className={`viz-svg tank-gauge ${!resolved.usable ? 'is-na' : ''}`} data-available={resolved.usable ? 'true' : 'false'} aria-hidden="true" focusable="false">
      <rect x="18" y="10" width="24" height="52" rx="10" className="tank-shell" strokeDasharray={resolved.usable ? undefined : '3 3'} />
      {resolved.usable && <rect x="20" y={62 - fillHeight} width="20" height={fillHeight} rx="8" className="tank-fill" />}
      <text x="30" y="74" textAnchor="middle" className="viz-num">{vizText(resolved)}</text>
    </svg>
  );
}

export function TrustBars({ value, available = true }: SemanticVizProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  return (
    <svg width="96" height="72" viewBox="0 0 84 64" className={`viz-svg trust-bars ${!resolved.usable ? 'is-na' : ''}`} data-available={resolved.usable ? 'true' : 'false'} aria-hidden="true" focusable="false">
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={10 + index * 14}
          y={44 - index * 4}
          width="10"
          height={8 + index * 4}
          className={resolved.usable && index < resolved.value / 20 ? 'bar-on' : 'bar-off'}
          opacity={resolved.usable ? 1 : 0.45}
          strokeDasharray={resolved.usable ? undefined : '2 2'}
        />
      ))}
      <text x="42" y="60" textAnchor="middle" className="viz-num">{vizText(resolved)}</text>
    </svg>
  );
}

export function PulseWave({ value, available = true }: SemanticVizProps): JSX.Element {
  const resolved = resolveVizValue(value, available);
  return (
    <svg width="120" height="64" viewBox="0 0 90 48" className={`viz-svg pulse-wave ${!resolved.usable ? 'is-na' : ''}`} data-available={resolved.usable ? 'true' : 'false'} aria-hidden="true" focusable="false">
      <path d="M4 24 H18 L24 16 L31 32 L38 20 H50 L58 10 L66 30 L74 22 H86" className="pulse-line" strokeDasharray={resolved.usable ? undefined : '3 3'} />
      <text x="45" y="44" textAnchor="middle" className="viz-num">{vizText(resolved)}</text>
    </svg>
  );
}

export interface HexFactorCardProps {
  label: string;
  score: number | null;
  status: string;
  monthly: string;
  risk: string;
  tone?: CppGaugeTone;
  available?: boolean;
}

export function HexFactorCard({
  label,
  score,
  status,
  monthly,
  risk,
  tone = 'cyan',
  available = true,
}: HexFactorCardProps): JSX.Element {
  const usable = available && score != null && Number.isFinite(score);
  const v = usable ? clampGaugeValue(score as number) : 0;
  const points = '32,4 55,18 55,46 32,60 9,46 9,18';

  return (
    <div
      className={`hex-factor tone-${tone} ${!usable ? 'is-na' : ''}`}
      data-hex-score={usable ? v : undefined}
      data-available={usable ? 'true' : 'false'}
      aria-label={`${label}: ${usable ? v : 'DATA_UNAVAILABLE'}`}
    >
      <svg viewBox="0 0 64 64" className="hex-svg" aria-hidden="true" focusable="false">
        <polygon points={points} className="hx-track" />
        <polygon points={points} className="hx-fill" pathLength={100} strokeDasharray={`${v} 100`} />
      </svg>
      <div className="hx-score">{usable ? score : 'N/A'}</div>
      <div className="hx-label">{label}</div>
      <div className="hx-meta">{status} · {monthly}</div>
      <div className="hx-risk">{usable ? risk : 'DATA_UNAVAILABLE'}</div>
    </div>
  );
}
