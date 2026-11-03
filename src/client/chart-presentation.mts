// Strict TypeScript source for stable chart palette and label spacing.
// Stable categorical colors: a dimension keeps the same color across time windows,
// chart types, rankings and cost-versus-token metrics.
const PREFERRED_PROVIDER_COLORS: Readonly<Record<string,string>> = Object.freeze({
  codex: "#53d6be",
  "claude-code": "#7ea7ff",
  claude: "#7ea7ff",
  antigravity: "#f3bd72",
  gemini: "#f3bd72"
});

export const CHART_PALETTE: readonly string[] = Object.freeze([
  "#6f7cff", "#45d7e8", "#a78bfa", "#f472b6",
  "#fb923c", "#34d399", "#60a5fa", "#facc15",
  "#2dd4bf", "#c084fc", "#e879f9", "#94a3b8"
]);

function stableHash(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function colorForDimension(name: string, kind: string = "provider"): string {
  const canonical = String(name).trim().toLowerCase();
  if (canonical === "total") return "#53d6be";
  if (kind === "provider") {
    if (Object.hasOwn(PREFERRED_PROVIDER_COLORS, canonical)) return PREFERRED_PROVIDER_COLORS[canonical];
    if (canonical.includes("codex")) return PREFERRED_PROVIDER_COLORS.codex;
    if (canonical.includes("claude")) return PREFERRED_PROVIDER_COLORS.claude;
    if (canonical.includes("antigravity") || canonical.includes("gemini")) return PREFERRED_PROVIDER_COLORS.gemini;
  }
  return CHART_PALETTE[stableHash(kind + ":" + canonical) % CHART_PALETTE.length];
}

export function labelPointIndices(length: number, maxLabels = 14): number[] {
  if (!Number.isInteger(length) || length < 1) return [];
  const step = Math.max(1, Math.ceil((length - 1) / Math.max(1, maxLabels - 1)));
  const values: number[] = [];
  for (let i = 0; i < length; i += step) values.push(i);
  if (values.at(-1) !== length - 1) values.push(length - 1);
  return values;
}
