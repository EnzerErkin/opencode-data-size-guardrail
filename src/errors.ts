import { estimatedTokens, formatBytes, formatTokenCount } from "./size";

export class SizeGuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SizeGuardrailError";
  }
}

const saferWorkflow = `Use a safer workflow:
- sample the file
- aggregate locally
- extract only required fields
- generate a small summary JSON/Markdown file`;

const overrideInstructions = `To continue anyway for this session:
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode

Or raise the read limit for this session:
OPENCODE_DSG_MAX_READ_BYTES=<bytes> opencode`;

export function buildReadWarningMessage(filePath: string, bytes: number): string {
  return `Warning from opencode-data-size-guardrail.
This file may be expensive to read in LLM context:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}`;
}

export function buildSoftReadBlockError(filePath: string, bytes: number): SizeGuardrailError {
  return new SizeGuardrailError(`Soft-blocked by opencode-data-size-guardrail.
This file is large enough to pollute LLM context:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}

${overrideInstructions.replace("<bytes>", String(bytes))}`);
}

export function buildHardReadBlockError(filePath: string, bytes: number): SizeGuardrailError {
  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This file is too large to read safely:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}`);
}

export const buildLargeReadError = buildHardReadBlockError;

export function buildRecordedDangerousFileError(filePath: string, bytes: number): SizeGuardrailError {
  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This file was previously generated as a dangerous large file:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}`);
}

export function buildCommandWarningMessage(command: string, reason: string, bytes?: number): string {
  const estimate = bytes === undefined
    ? "Estimated tokens: unknown until the command runs"
    : `Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}`;

  return `Warning from opencode-data-size-guardrail.
This command may read, print, or generate too much data:
${command}
Reason: ${reason}
${bytes === undefined ? "" : `Size: ${formatBytes(bytes)}\n`}${estimate}
${saferWorkflow}`;
}

export function buildCommandBlockedError(command: string, reason: string, bytes?: number, soft = true): SizeGuardrailError {
  const estimate = bytes === undefined
    ? "Estimated tokens: unknown until the command runs"
    : `Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}`;

  return new SizeGuardrailError(`${soft ? "Soft-blocked" : "Blocked"} by opencode-data-size-guardrail.
This command may read, print, or generate too much data:
${command}
Reason: ${reason}
${bytes === undefined ? "" : `Size: ${formatBytes(bytes)}\n`}${estimate}
${saferWorkflow}

${overrideInstructions}`);
}

export interface GeneratedFileForError {
  path: string;
  size: number;
  severity?: "warning" | "dangerous";
}

export function buildGeneratedFilesWarningMessage(files: GeneratedFileForError[]): string {
  const lines = files
    .map((file) => `- ${file.path}: ${formatBytes(file.size)}, ~${formatTokenCount(estimatedTokens(file.size))} tokens`)
    .join("\n");

  return `Warning from opencode-data-size-guardrail.
This command generated or modified large files:
${lines}
Large raw data can exist on disk, but it should not enter LLM context.
${saferWorkflow}`;
}

export function buildGeneratedFilesError(files: GeneratedFileForError[]): SizeGuardrailError {
  const lines = files
    .map((file) => `- ${file.path}: ${formatBytes(file.size)}, ~${formatTokenCount(estimatedTokens(file.size))} tokens`)
    .join("\n");

  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This command generated or modified large files:
${lines}
Large raw data can exist on disk, but it should not enter LLM context.
${saferWorkflow}

${overrideInstructions}`);
}
