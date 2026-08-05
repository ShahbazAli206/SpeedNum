const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Parse a `YYYY-MM-DD` date without letting the timezone shift the day. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined, style: "short" | "long" = "short") {
  const date = parseDate(value);
  if (!date) return "—";
  return style === "long"
    ? `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    : `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${hour12}:${minutes}${suffix}`;
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatMoney(value: number | null | undefined, currency = "CAD") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-CA").format(Number(value ?? 0));
}

/** Axis-friendly money: $0 / $2.4k / $1.2M. Keeps tick labels short. */
export function compactMoney(value: number | null | undefined, currency = "CAD") {
  const amount = Number(value ?? 0);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const symbol = currency === "USD" ? "US$" : "$";
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

export function compactNumber(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}k`;
  return String(Math.round(amount));
}

export function formatPercent(value: number | null | undefined, decimals = 0) {
  return `${Number(value ?? 0).toFixed(decimals)}%`;
}

/** Human file size for the documents list. */
export function formatBytes(bytes: number | null | undefined) {
  const size = Number(bytes ?? 0);
  if (size <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const scaled = size / Math.pow(1024, index);
  return `${scaled.toFixed(index === 0 || scaled >= 100 ? 0 : 1)} ${units[index]}`;
}

/** "Due in 12 days" / "9 days overdue" */
export function dueLabel(days: number) {
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}

export function fiscalYearEnd(month: number, day: number) {
  return `${MONTHS_SHORT[Math.min(Math.max(month, 1), 12) - 1]} ${day}`;
}

export function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function pluralise(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
