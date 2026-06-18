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

export function buildLargeReadError(filePath: string, bytes: number): SizeGuardrailError {
  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This file is too large to read safely:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}`);
}

export function buildRecordedDangerousFileError(filePath: string, bytes: number): SizeGuardrailError {
  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This file was previously generated as a dangerous large file:
${filePath}
Size: ${formatBytes(bytes)}
Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}
${saferWorkflow}`);
}

export function buildCommandBlockedError(command: string, reason: string, bytes?: number): SizeGuardrailError {
  const estimate = bytes === undefined
    ? "Estimated tokens: unknown until the command runs"
    : `Estimated tokens: ~${formatTokenCount(estimatedTokens(bytes))}`;

  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This command may read, print, or generate too much data:
${command}
Reason: ${reason}
${bytes === undefined ? "" : `Size: ${formatBytes(bytes)}\n`}${estimate}
${saferWorkflow}`);
}

export interface GeneratedFileForError {
  path: string;
  size: number;
}

export function buildGeneratedFilesError(files: GeneratedFileForError[]): SizeGuardrailError {
  const lines = files
    .map((file) => `- ${file.path}: ${formatBytes(file.size)}, ~${formatTokenCount(estimatedTokens(file.size))} tokens`)
    .join("\n");

  return new SizeGuardrailError(`Blocked by opencode-data-size-guardrail.
This command generated or modified large files:
${lines}
${saferWorkflow}`);
}
