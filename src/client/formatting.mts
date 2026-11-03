const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});
const percentageFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatCompact(value: unknown): string {
  return compactFormatter.format(finite(value));
}

export function formatCurrency(value: unknown): string {
  return currencyFormatter.format(finite(value));
}

export function formatMetric(value: unknown, metric = "totalTokens"): string {
  return metric === "totalCost" ? formatCurrency(value) : formatCompact(value);
}

export function formatPercentage(value: unknown): string {
  return percentageFormatter.format(finite(value));
}

export function formatDuration(milliseconds: unknown): string {
  const ms = Math.max(0, finite(milliseconds));
  if (ms < 60_000) return Math.round(ms / 1_000) + "s";
  if (ms < 3_600_000) return Math.round(ms / 60_000) + "m";
  const hours = ms / 3_600_000;
  if (hours < 24) return (hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10) + "h";
  const days = hours / 24;
  return (days >= 10 ? Math.round(days) : Math.round(days * 10) / 10) + "d";
}
