"use client";

/**
 * Dependency-free SVG charts.
 *
 * Shared rules, applied consistently (see the data-viz method):
 *  - 2px lines, ≤24px bars with a 4px rounded data-end squared at the baseline,
 *    ≥8px end markers ringed in the surface colour, area fills at ~10%.
 *  - Solid hairline gridlines one step off the surface. Never dashed.
 *  - A legend whenever there are 2+ series; a single series has none, because
 *    the card title already names it.
 *  - A hover *and* keyboard layer on every plot, and a table-view twin so no
 *    value is reachable only by pointing at it.
 *  - Series colours come from the validated `.viz` slots in globals.css and are
 *    bound to the entity, so filtering never repaints the survivors.
 */

import { Table2, TrendingDown, TrendingUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Shared types & helpers                                                      */
/* -------------------------------------------------------------------------- */

export interface Series {
  /** Stable key into each row. Identity — never reassigned on filter. */
  key: string;
  label: string;
  /** A `--series-N` slot. Bound to the entity, not to its rank. */
  slot: 1 | 2 | 3 | 4 | 5;
}

export type Row = { x: string } & Record<string, number | string>;

const slotVar = (slot: Series["slot"]) => `var(--series-${slot})`;

/** Round an axis maximum up to a clean 1/2/5 × 10ⁿ step. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { max: 1, step: 1 / ticks };
  const rough = max / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  return { max: step * ticks, step };
}

/** Track the rendered width so the SVG draws at real pixels, never stretched. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/* -------------------------------------------------------------------------- */
/* Chart card — title, optional legend, chart/table toggle                     */
/* -------------------------------------------------------------------------- */

export function ChartCard({
  title,
  subtitle,
  series,
  rows,
  format,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** Supply both `series` and `rows` to get the table-view twin. */
  series?: Series[];
  rows?: Row[];
  format?: (value: number) => string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const canTable = Boolean(series?.length && rows?.length);
  const fmt = format ?? ((value: number) => value.toLocaleString("en-CA"));

  return (
    <section
      className={cn(
        "viz flex flex-col rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {canTable ? (
            <button
              type="button"
              onClick={() => setView(view === "chart" ? "table" : "chart")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-pressed={view === "table"}
            >
              <Table2 className="size-3.5" />
              {view === "chart" ? "Table" : "Chart"}
            </button>
          ) : null}
        </div>
      </header>

      {/* Legend lives above the plot and is always present for 2+ series. */}
      {series && series.length > 1 && view === "chart" ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-3">
          {series.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: slotVar(entry.slot) }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex-1 px-2 pb-4">
        {view === "chart" ? (
          children
        ) : (
          <DataTable series={series ?? []} rows={rows ?? []} format={fmt} />
        )}
      </div>
    </section>
  );
}

function DataTable({
  series,
  rows,
  format,
}: {
  series: Series[];
  rows: Row[];
  format: (value: number) => string;
}) {
  return (
    <div className="scroll-thin max-h-72 overflow-auto px-3">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="sticky top-0 bg-surface py-2 pr-3 text-left font-semibold text-muted">
              Period
            </th>
            {series.map((entry) => (
              <th
                key={entry.key}
                className="sticky top-0 bg-surface py-2 pl-3 text-right font-semibold text-muted"
              >
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.x} className="border-t border-line">
              <td className="py-2 pr-3 text-ink-soft">{row.x}</td>
              {series.map((entry) => (
                <td
                  key={entry.key}
                  className="py-2 pl-3 text-right tabular-nums text-ink"
                >
                  {format(Number(row[entry.key] ?? 0))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

function Tooltip({
  x,
  y,
  heading,
  items,
  width,
}: {
  x: number;
  y: number;
  heading: string;
  items: { label: string; value: string; slot: Series["slot"] }[];
  width: number;
}) {
  // Flip to the left of the cursor near the right edge so it never clips out.
  const flip = x > width - 150;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 shadow-[var(--shadow-lift)]"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(4, y - 16),
      }}
      role="tooltip"
    >
      <p className="mb-1.5 text-[11.5px] font-medium tracking-wide text-muted uppercase">
        {heading}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ background: slotVar(item.slot) }}
              />
              {/* Values lead; the series name is the secondary element. */}
              <span className="text-[12px] text-muted">{item.label}</span>
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-ink">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Line / area chart                                                           */
/* -------------------------------------------------------------------------- */

export function LineChart({
  rows,
  series,
  height = 240,
  format = (value: number) => value.toLocaleString("en-CA"),
  area = false,
  /** Direct-label the final point of each series. */
  labelEnd = true,
}: {
  rows: Row[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
  area?: boolean;
  labelEnd?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();

  const padding = { top: 14, right: labelEnd ? 62 : 18, bottom: 26, left: 50 };
  const plotWidth = Math.max(0, width - padding.left - padding.right);
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = useMemo(
    () =>
      Math.max(
        1,
        ...rows.flatMap((row) => series.map((entry) => Number(row[entry.key] ?? 0))),
      ),
    [rows, series],
  );
  const { max, step } = useMemo(() => niceScale(rawMax), [rawMax]);

  const xAt = useCallback(
    (index: number) =>
      padding.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth),
    [padding.left, plotWidth, rows.length],
  );
  const yAt = useCallback(
    (value: number) => padding.top + plotHeight - (value / max) * plotHeight,
    [padding.top, plotHeight, max],
  );

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!rows.length || plotWidth <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left - padding.left;
    const ratio = plotWidth === 0 ? 0 : offset / plotWidth;
    // Snap to the nearest data position so the reader aims at a date, not a line.
    const index = Math.round(ratio * (rows.length - 1));
    setActive(Math.max(0, Math.min(rows.length - 1, index)));
  };

  const onKey = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    setActive((current) => {
      const next = (current ?? -1) + delta;
      return Math.max(0, Math.min(rows.length - 1, next));
    });
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let value = 0; value <= max + 1e-6; value += step) out.push(value);
    return out;
  }, [max, step]);

  // Show at most 7 x labels so they never collide on a narrow card.
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));

  return (
    <div ref={ref} className="viz relative" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <defs>
            {series.map((entry) => (
              <linearGradient
                key={entry.key}
                id={`${gradientId}-${entry.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={slotVar(entry.slot)} stopOpacity="0.16" />
                <stop offset="100%" stopColor={slotVar(entry.slot)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Solid hairline gridlines, one step off the surface */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={padding.left + plotWidth}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--viz-grid)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={yAt(tick) + 4}
                textAnchor="end"
                className="fill-[var(--viz-muted)] text-[10.5px] tabular-nums"
              >
                {format(tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) =>
            index % labelEvery === 0 ? (
              <text
                key={row.x}
                x={xAt(index)}
                y={height - 7}
                textAnchor="middle"
                className="fill-[var(--viz-muted)] text-[10.5px]"
              >
                {row.x}
              </text>
            ) : null,
          )}

          {/* Crosshair — vertical hairline snapped to the nearest X */}
          {active !== null ? (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="var(--viz-axis)"
              strokeWidth="1"
            />
          ) : null}

          {series.map((entry) => {
            const points = rows.map((row, index) => ({
              x: xAt(index),
              y: yAt(Number(row[entry.key] ?? 0)),
            }));
            const line = points
              .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
              .join(" ");
            const last = points.at(-1);

            return (
              <g key={entry.key}>
                {area ? (
                  <path
                    d={`${line} L${points.at(-1)?.x ?? 0} ${padding.top + plotHeight} L${points[0]?.x ?? 0} ${padding.top + plotHeight} Z`}
                    fill={`url(#${gradientId}-${entry.key})`}
                  />
                ) : null}
                <path
                  d={line}
                  fill="none"
                  stroke={slotVar(entry.slot)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End marker: ≥8px, ringed in the surface colour */}
                {last ? (
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r="4"
                    fill={slotVar(entry.slot)}
                    stroke="var(--viz-surface)"
                    strokeWidth="2"
                  />
                ) : null}
                {/* Selective direct label: the endpoint only */}
                {labelEnd && last ? (
                  <text
                    x={last.x + 10}
                    y={last.y + 4}
                    className="fill-[var(--color-ink)] text-[11px] font-semibold tabular-nums"
                  >
                    {format(Number(rows.at(-1)?.[entry.key] ?? 0))}
                  </text>
                ) : null}
                {active !== null && points[active] ? (
                  <circle
                    cx={points[active].x}
                    cy={points[active].y}
                    r="4.5"
                    fill={slotVar(entry.slot)}
                    stroke="var(--viz-surface)"
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      {/* One tooltip listing every series at the active X */}
      {active !== null && rows[active] ? (
        <Tooltip
          x={xAt(active)}
          y={padding.top + 8}
          width={width}
          heading={String(rows[active].x)}
          items={series.map((entry) => ({
            label: entry.label,
            value: format(Number(rows[active][entry.key] ?? 0)),
            slot: entry.slot,
          }))}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Column chart — grouped, per-bar hit target                                  */
/* -------------------------------------------------------------------------- */

export function ColumnChart({
  rows,
  series,
  height = 240,
  format = (value: number) => value.toLocaleString("en-CA"),
}: {
  rows: Row[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<{ row: number; x: number; y: number } | null>(null);

  const padding = { top: 14, right: 12, bottom: 26, left: 50 };
  const plotWidth = Math.max(0, width - padding.left - padding.right);
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = Math.max(
    1,
    ...rows.flatMap((row) => series.map((entry) => Number(row[entry.key] ?? 0))),
  );
  const { max, step } = useMemo(() => niceScale(rawMax), [rawMax]);

  const band = rows.length ? plotWidth / rows.length : 0;
  const GAP = 2; // the surface gap that separates touching bars
  const barWidth = Math.min(
    24,
    Math.max(4, (band * 0.62 - GAP * (series.length - 1)) / series.length),
  );
  const groupWidth = barWidth * series.length + GAP * (series.length - 1);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let value = 0; value <= max + 1e-6; value += step) out.push(value);
    return out;
  }, [max, step]);

  const yAt = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <div ref={ref} className="viz relative" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Column chart: ${series.map((s) => s.label).join(", ")}`}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={padding.left + plotWidth}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--viz-grid)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={yAt(tick) + 4}
                textAnchor="end"
                className="fill-[var(--viz-muted)] text-[10.5px] tabular-nums"
              >
                {format(tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const centre = padding.left + band * index + band / 2;
            const groupLeft = centre - groupWidth / 2;
            const hovered = active?.row === index;

            return (
              <g key={row.x}>
                {/* Hit target spans the whole band, so nobody has to hit a 12px bar */}
                <rect
                  x={padding.left + band * index}
                  y={padding.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.x}: ${series
                    .map((s) => `${s.label} ${format(Number(row[s.key] ?? 0))}`)
                    .join(", ")}`}
                  onPointerEnter={() => setActive({ row: index, x: centre, y: padding.top })}
                  onFocus={() => setActive({ row: index, x: centre, y: padding.top })}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
                {series.map((entry, seriesIndex) => {
                  const value = Number(row[entry.key] ?? 0);
                  const barHeight = Math.max(2, (value / max) * plotHeight);
                  const x = groupLeft + seriesIndex * (barWidth + GAP);
                  const y = padding.top + plotHeight - barHeight;
                  const radius = Math.min(4, barWidth / 2);
                  return (
                    <path
                      key={entry.key}
                      // Rounded at the data end, square at the baseline.
                      d={`M${x} ${y + barHeight} L${x} ${y + radius} Q${x} ${y} ${x + radius} ${y} L${x + barWidth - radius} ${y} Q${x + barWidth} ${y} ${x + barWidth} ${y + radius} L${x + barWidth} ${y + barHeight} Z`}
                      fill={slotVar(entry.slot)}
                      opacity={active && !hovered ? 0.55 : 1}
                      className="transition-opacity"
                    />
                  );
                })}
              </g>
            );
          })}

          {rows.map((row, index) =>
            index % labelEvery === 0 ? (
              <text
                key={row.x}
                x={padding.left + band * index + band / 2}
                y={height - 7}
                textAnchor="middle"
                className="fill-[var(--viz-muted)] text-[10.5px]"
              >
                {row.x}
              </text>
            ) : null,
          )}
        </svg>
      ) : null}

      {active && rows[active.row] ? (
        <Tooltip
          x={active.x}
          y={active.y}
          width={width}
          heading={String(rows[active.row].x)}
          items={series.map((entry) => ({
            label: entry.label,
            value: format(Number(rows[active.row][entry.key] ?? 0)),
            slot: entry.slot,
          }))}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Part-to-whole — horizontal stacked bar + ranked list                        */
/* -------------------------------------------------------------------------- */

export interface Slice {
  label: string;
  value: number;
  slot: Series["slot"];
}

export function StackedShare({
  slices,
  format = (value: number) => value.toLocaleString("en-CA"),
}: {
  slices: Slice[];
  format?: (value: number) => string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="viz px-3">
      {/* 2px surface gaps do the separating — no borders on the segments */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {slices.map((slice) => (
          <div
            key={slice.label}
            className="h-full rounded-full transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(slice.value / total) * 100}%`,
              background: slotVar(slice.slot),
              opacity: active && active !== slice.label ? 0.45 : 1,
            }}
            title={`${slice.label}: ${format(slice.value)}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {slices.map((slice) => {
          const share = (slice.value / total) * 100;
          return (
            <li
              key={slice.label}
              className="flex items-center gap-3 rounded-lg px-1.5 py-1 transition hover:bg-surface-2"
              onPointerEnter={() => setActive(slice.label)}
              onPointerLeave={() => setActive(null)}
              tabIndex={0}
              onFocus={() => setActive(slice.label)}
              onBlur={() => setActive(null)}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: slotVar(slice.slot) }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                {slice.label}
              </span>
              <span className="text-[12px] tabular-nums text-muted">{share.toFixed(0)}%</span>
              <span className="w-20 text-right text-[13px] font-semibold tabular-nums text-ink">
                {format(slice.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline — the trend channel inside a stat tile                            */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  slot = 1,
  width = 88,
  height = 28,
  className,
}: {
  values: number[];
  slot?: Series["slot"];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * (width - 4) + 2,
    y: height - 3 - ((value - min) / span) * (height - 6),
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const last = points.at(-1)!;

  return (
    <svg
      width={width}
      height={height}
      className={cn("viz overflow-visible", className)}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={slotVar(slot)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle
        cx={last.x}
        cy={last.y}
        r="2.75"
        fill={slotVar(slot)}
        stroke="var(--viz-surface)"
        strokeWidth="2"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat tile — value + delta + optional sparkline                              */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  slot = 1,
  /** Set false where a rise is bad (expenses, overdue). */
  upIsGood = true,
  icon,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  trend?: number[];
  slot?: Series["slot"];
  upIsGood?: boolean;
  icon?: ReactNode;
}) {
  const positive = (delta ?? 0) >= 0;
  const good = positive === upIsGood;
  const Arrow = positive ? TrendingUp : TrendingDown;

  return (
    <div className="viz rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
      </div>
      {/* Proportional figures — tabular-nums would make this look loose */}
      <p className="mt-2 font-display text-2xl font-bold text-ink">{value}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        {delta !== undefined ? (
          <p
            className={cn(
              "flex items-center gap-1 text-[12.5px] font-medium",
              good ? "text-success" : "text-danger",
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            {positive ? "+" : ""}
            {delta.toFixed(1)}%
            {deltaLabel ? <span className="font-normal text-muted"> {deltaLabel}</span> : null}
          </p>
        ) : (
          <span />
        )}
        {trend?.length ? <Sparkline values={trend} slot={slot} /> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vivid KPI tile — matches the saturated tiles in the existing portal         */
/* -------------------------------------------------------------------------- */

const KPI_FILLS = {
  blue: "bg-[var(--kpi-blue)]",
  green: "bg-[var(--kpi-green)]",
  amber: "bg-[var(--kpi-amber)]",
  rose: "bg-[var(--kpi-rose)]",
  violet: "bg-[var(--kpi-violet)]",
} as const;

export function KpiTile({
  value,
  label,
  tone,
  icon,
  hint,
}: {
  value: string;
  label: string;
  tone: keyof typeof KPI_FILLS;
  icon: ReactNode;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-xl p-4 text-white shadow-[var(--shadow-card)]",
        KPI_FILLS[tone],
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/20">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold">{value}</p>
        <p className="truncate text-[12.5px] text-white/85">{label}</p>
        {hint ? <p className="truncate text-[11.5px] text-white/70">{hint}</p> : null}
      </div>
    </div>
  );
}
