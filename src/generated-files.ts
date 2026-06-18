import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { estimatedTokens } from "./size";

export const STATE_FILE_NAME = ".opencode-data-size-guardrail.json";

export interface FileSnapshotEntry {
  size: number;
  mtimeMs: number;
}

export interface FileSnapshot {
  rootDir: string;
  files: Record<string, FileSnapshotEntry>;
}

export interface DangerousGeneratedFile {
  path: string;
  absolutePath: string;
  size: number;
  estimatedTokens: number;
  detectedAt: string;
}

export interface GuardrailState {
  version: 1;
  dangerousFiles: DangerousGeneratedFile[];
}

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".cache",
  "tmp",
  "temp",
]);

export function createFileSnapshot(rootDir: string): FileSnapshot {
  const files: Record<string, FileSnapshotEntry> = {};
  walk(rootDir, rootDir, files);
  return { rootDir, files };
}

export function findLargeGeneratedFiles(
  before: FileSnapshot,
  after: FileSnapshot,
  maxGeneratedFileBytes: number,
): DangerousGeneratedFile[] {
  const now = new Date().toISOString();
  const dangerous: DangerousGeneratedFile[] = [];

  for (const [relativePath, entry] of Object.entries(after.files)) {
    if (entry.size <= maxGeneratedFileBytes) continue;

    const previous = before.files[relativePath];
    const createdOrModified = previous === undefined
      || previous.size !== entry.size
      || previous.mtimeMs !== entry.mtimeMs;

    if (!createdOrModified) continue;

    dangerous.push({
      path: relativePath,
      absolutePath: path.join(after.rootDir, relativePath),
      size: entry.size,
      estimatedTokens: estimatedTokens(entry.size),
      detectedAt: now,
    });
  }

  return dangerous;
}

export function readGuardrailState(rootDir: string): GuardrailState {
  const statePath = path.join(rootDir, STATE_FILE_NAME);
  if (!existsSync(statePath)) return { version: 1, dangerousFiles: [] };

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<GuardrailState>;
    return {
      version: 1,
      dangerousFiles: Array.isArray(parsed.dangerousFiles) ? parsed.dangerousFiles : [],
    };
  } catch {
    return { version: 1, dangerousFiles: [] };
  }
}

export function recordDangerousFiles(rootDir: string, files: DangerousGeneratedFile[]): void {
  if (files.length === 0) return;

  const state = readGuardrailState(rootDir);
  const byPath = new Map(state.dangerousFiles.map((file) => [file.path, file]));
  for (const file of files) byPath.set(file.path, file);

  const nextState: GuardrailState = {
    version: 1,
    dangerousFiles: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };

  writeFileSync(path.join(rootDir, STATE_FILE_NAME), `${JSON.stringify(nextState, null, 2)}\n`);
}

export function findRecordedDangerousFile(rootDir: string, filePath: string): DangerousGeneratedFile | undefined {
  const relativePath = normalizeRelativePath(rootDir, filePath);
  return readGuardrailState(rootDir).dangerousFiles.find((file) => file.path === relativePath);
}

function walk(rootDir: string, currentDir: string, files: Record<string, FileSnapshotEntry>): void {
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === STATE_FILE_NAME) continue;
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(rootDir, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const stat = statSync(absolutePath);
      files[normalizeRelativePath(rootDir, absolutePath)] = {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      // Ignore files that disappear during a snapshot.
    }
  }
}

function normalizeRelativePath(rootDir: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}
