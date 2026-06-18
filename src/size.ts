export const BYTES_PER_TOKEN = 4;
export const DECIMAL_KB = 1_000;
export const DECIMAL_MB = 1_000_000;
export const DECIMAL_GB = 1_000_000_000;

export function estimatedTokens(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

export function formatTokenCount(tokens: number): string {
  return Math.max(0, Math.ceil(tokens)).toLocaleString("en-US");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < DECIMAL_KB) return `${Math.round(bytes)} B`;

  const units = [
    { label: "GB", value: DECIMAL_GB },
    { label: "MB", value: DECIMAL_MB },
    { label: "KB", value: DECIMAL_KB },
  ];

  const unit = units.find((candidate) => bytes >= candidate.value) ?? units[2];
  return `${(bytes / unit.value).toFixed(1)} ${unit.label}`;
}

export function parseBytes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) return fallback;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return fallback;

  const suffix = match[2]?.toLowerCase();
  if (suffix === "gb") return Math.floor(amount * DECIMAL_GB);
  if (suffix === "mb") return Math.floor(amount * DECIMAL_MB);
  if (suffix === "kb") return Math.floor(amount * DECIMAL_KB);
  return Math.floor(amount);
}
