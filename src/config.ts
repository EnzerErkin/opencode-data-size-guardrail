import { parseBytes } from "./size";

const MIB = 1024 * 1024;

export const DEFAULT_WARN_READ_BYTES = 5 * MIB;
export const DEFAULT_ASK_READ_BYTES = 20 * MIB;
export const DEFAULT_MAX_READ_BYTES = 100 * MIB;
export const DEFAULT_WARN_GENERATED_BYTES = 20 * MIB;
export const DEFAULT_MAX_GENERATED_FILE_BYTES = 100 * MIB;

export interface GuardrailConfig {
  warnReadBytes: number;
  askReadBytes: number;
  maxReadBytes: number;
  warnGeneratedBytes: number;
  maxGeneratedFileBytes: number;
  allowLargeFiles: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): GuardrailConfig {
  return {
    warnReadBytes: parseBytes(env.OPENCODE_DSG_WARN_READ_BYTES, DEFAULT_WARN_READ_BYTES),
    askReadBytes: parseBytes(env.OPENCODE_DSG_ASK_READ_BYTES, DEFAULT_ASK_READ_BYTES),
    maxReadBytes: parseBytes(env.OPENCODE_DSG_MAX_READ_BYTES, DEFAULT_MAX_READ_BYTES),
    warnGeneratedBytes: parseBytes(env.OPENCODE_DSG_WARN_GENERATED_BYTES, DEFAULT_WARN_GENERATED_BYTES),
    maxGeneratedFileBytes: parseBytes(
      env.OPENCODE_DSG_MAX_GENERATED_BYTES,
      DEFAULT_MAX_GENERATED_FILE_BYTES,
    ),
    allowLargeFiles: env.OPENCODE_DSG_ALLOW_LARGE_FILES?.toLowerCase() === "true",
  };
}
