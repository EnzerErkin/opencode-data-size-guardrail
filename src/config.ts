import { DECIMAL_MB, parseBytes } from "./size";

export const DEFAULT_MAX_READ_BYTES = 5 * DECIMAL_MB;
export const DEFAULT_MAX_GENERATED_FILE_BYTES = 20 * DECIMAL_MB;

export interface GuardrailConfig {
  maxReadBytes: number;
  maxGeneratedFileBytes: number;
  allowLargeFiles: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): GuardrailConfig {
  return {
    maxReadBytes: parseBytes(env.OPENCODE_DSG_MAX_READ_BYTES, DEFAULT_MAX_READ_BYTES),
    maxGeneratedFileBytes: parseBytes(
      env.OPENCODE_DSG_MAX_GENERATED_BYTES,
      DEFAULT_MAX_GENERATED_FILE_BYTES,
    ),
    allowLargeFiles: env.OPENCODE_DSG_ALLOW_LARGE_FILES?.toLowerCase() === "true",
  };
}
