import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeCommandRisk } from "./command-risk";
import { type GuardrailConfig, loadConfig } from "./config";
import {
  createFileSnapshot,
  findGeneratedFilesOverThreshold,
  findRecordedDangerousFile,
  type FileSnapshot,
  recordDangerousFiles,
} from "./generated-files";
import {
  buildCommandBlockedError,
  buildCommandWarningMessage,
  buildGeneratedFilesError,
  buildGeneratedFilesWarningMessage,
  buildHardReadBlockError,
  buildReadWarningMessage,
  buildRecordedDangerousFileError,
  buildSoftReadBlockError,
} from "./errors";

interface PluginInput {
  directory?: string;
  project?: {
    root?: string;
    directory?: string;
  };
}

type HookPayload = Record<string, unknown>;
type HookOutput = { args?: unknown } & Record<string, unknown>;

export default async function dataSizeGuardrailPlugin(input: PluginInput = {}) {
  const rootDir = resolveRootDir(input);
  const config = loadConfig();
  let lastBashSnapshot: FileSnapshot | undefined;

  return {
    "tool.execute.before": async (hookInput: HookPayload, hookOutput: HookOutput = {}) => {
      const toolName = getToolName(hookInput);
      const args = getToolArgs(hookInput, hookOutput);

      if (toolName === "read") {
        const filePath = getReadPath(args);
        if (filePath) checkRead(filePath, rootDir, config);
        return;
      }

      const command = toolName === "bash" ? getBashCommand(args) : undefined;
      if (!command) return;

      const risk = analyzeCommandRisk(command, {
        warnReadBytes: config.warnReadBytes,
        askReadBytes: config.askReadBytes,
        maxReadBytes: config.maxReadBytes,
        getFileSize: (filePath) => getFileSize(rootDir, filePath),
      });

      if (risk.action === "warn") {
        warn(buildCommandWarningMessage(command, risk.reason ?? "risky command", risk.bytes));
      } else if (risk.blocked) {
        const error = buildCommandBlockedError(
          command,
          risk.reason ?? "risky command",
          risk.bytes,
          risk.action !== "hard-block",
        );
        if (!config.allowLargeFiles) throw error;
        warn(error.message);
      }

      lastBashSnapshot = tryCreateSnapshot(rootDir);
    },
    "tool.execute.after": async (hookInput: HookPayload) => {
      if (getToolName(hookInput) !== "bash" || !lastBashSnapshot) return;

      const before = lastBashSnapshot;
      lastBashSnapshot = undefined;
      const after = tryCreateSnapshot(rootDir);
      if (!after) return;

      const generatedFiles = findGeneratedFilesOverThreshold(before, after, {
        warnGeneratedBytes: config.warnGeneratedBytes,
        maxGeneratedFileBytes: config.maxGeneratedFileBytes,
      });
      recordDangerousFiles(rootDir, generatedFiles);

      if (generatedFiles.length === 0) return;

      const dangerousFiles = generatedFiles.filter((file) => file.severity === "dangerous");
      if (dangerousFiles.length > 0) {
        const error = buildGeneratedFilesError(dangerousFiles);
        if (!config.allowLargeFiles) throw error;
        warn(error.message);
        return;
      }

      warn(buildGeneratedFilesWarningMessage(generatedFiles));
    },
  };
}

export function checkRead(filePath: string, rootDir: string, config: GuardrailConfig): void {
  const absolutePath = resolvePath(rootDir, filePath);
  const recorded = findRecordedDangerousFile(rootDir, absolutePath);
  if (recorded) {
    const error = buildRecordedDangerousFileError(filePath, recorded.size);
    if (!config.allowLargeFiles) throw error;
    warn(error.message);
  }

  if (!existsSync(absolutePath)) return;
  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size <= config.warnReadBytes) return;

  if (stat.size > config.maxReadBytes) {
    const error = buildHardReadBlockError(filePath, stat.size);
    if (!config.allowLargeFiles) throw error;
    warn(error.message);
    return;
  }

  if (stat.size > config.askReadBytes) {
    const error = buildSoftReadBlockError(filePath, stat.size);
    if (!config.allowLargeFiles) throw error;
    warn(error.message);
    return;
  }

  warn(buildReadWarningMessage(filePath, stat.size));
}

function resolveRootDir(input: PluginInput): string {
  return path.resolve(input.project?.root ?? input.project?.directory ?? input.directory ?? process.cwd());
}

function getToolName(input: HookPayload): string | undefined {
  const candidates = [
    input.tool,
    input.toolID,
    input.toolId,
    input.name,
    getNested(input, ["tool", "name"]),
    getNested(input, ["call", "tool"]),
    getNested(input, ["call", "toolID"]),
  ];

  const value = candidates.find((candidate): candidate is string => typeof candidate === "string");
  return value?.toLowerCase();
}

function getToolArgs(input: HookPayload, output: HookOutput): unknown {
  return output.args
    ?? input.args
    ?? input.parameters
    ?? getNested(input, ["call", "args"])
    ?? getNested(input, ["tool", "args"])
    ?? {};
}

function getReadPath(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  return firstString(args.filePath, args.path, args.filename, args.file);
}

function getBashCommand(args: unknown): string | undefined {
  if (typeof args === "string") return args;
  if (!isRecord(args)) return undefined;
  return firstString(args.command, args.cmd, args.script);
}

function getFileSize(rootDir: string, filePath: string): number | undefined {
  const absolutePath = resolvePath(rootDir, filePath);
  try {
    const stat = statSync(absolutePath);
    return stat.isFile() ? stat.size : undefined;
  } catch {
    return undefined;
  }
}

function resolvePath(rootDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

function tryCreateSnapshot(rootDir: string): FileSnapshot | undefined {
  try {
    return createFileSnapshot(rootDir);
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function getNested(input: HookPayload, keys: string[]): unknown {
  let current: unknown = input;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function warn(message: string): void {
  try {
    console.warn(message);
  } catch {
    // Console logging should never make the guardrail fail open or closed.
  }
}
