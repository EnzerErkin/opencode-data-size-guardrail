export interface CommandRisk {
  blocked: boolean;
  action?: "allow" | "warn" | "soft-block" | "hard-block";
  reason?: string;
  kind?: "direct-read" | "large-grep" | "unbounded-export";
  filePath?: string;
  bytes?: number;
}

export interface AnalyzeCommandRiskOptions {
  warnReadBytes?: number;
  askReadBytes?: number;
  maxReadBytes?: number;
  getFileSize?: (filePath: string) => number | undefined;
}

const riskyDataExtension = /\.(json|jsonl|ndjson|log)(?:$|[?#])/i;
const scriptExportName = /(?:^|[\s/])(collect|dump|export|fetch)_[\w.-]+/i;

export function analyzeCommandRisk(command: string, options: AnalyzeCommandRiskOptions = {}): CommandRisk {
  const trimmed = command.trim();
  if (!trimmed) return { blocked: false };

  const directReadRisk = detectDirectRead(trimmed, options);
  if (directReadRisk.action) return directReadRisk;

  const grepRisk = detectLargeUnboundedGrep(trimmed, options);
  if (grepRisk.action) return grepRisk;

  const exportRisk = detectUnboundedExport(trimmed);
  if (exportRisk.blocked) return exportRisk;

  return { blocked: false };
}

function detectDirectRead(command: string, options: AnalyzeCommandRiskOptions): CommandRisk {
  if (hasOutputLimiter(command)) return { blocked: false };

  for (const segment of commandSegments(command)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;

    const executable = baseName(tokens[0]);
    if (executable === "cat") {
      const target = tokens.slice(1).find(isRiskyDataTarget);
      if (target) {
        return {
          ...actionForBytes(options.getFileSize?.(target), options, "soft-block"),
          kind: "direct-read",
          filePath: target,
          bytes: options.getFileSize?.(target),
          reason: `direct cat of data/log file (${target})`,
        };
      }
    }

    if (executable === "jq") {
      const filterIndex = firstNonOptionIndex(tokens, 1);
      const filter = filterIndex === -1 ? undefined : tokens[filterIndex];
      if (filter === ".") {
        const threshold = options.warnReadBytes ?? options.askReadBytes ?? options.maxReadBytes ?? 0;
        const target = tokens.slice(filterIndex + 1).find((token) => {
          const bytes = options.getFileSize?.(token);
          return isRiskyDataTarget(token) || (bytes !== undefined && bytes > threshold);
        });
        if (target) {
          return {
            ...actionForBytes(options.getFileSize?.(target), options, "soft-block"),
            kind: "direct-read",
            filePath: target,
            bytes: options.getFileSize?.(target),
            reason: `unbounded jq '.' read (${target})`,
          };
        }
      }
    }
  }

  return { blocked: false };
}

function detectLargeUnboundedGrep(command: string, options: AnalyzeCommandRiskOptions): CommandRisk {
  if (hasOutputLimiter(command) || /(?:^|\s)(?:-m\s*\d+|--max-count(?:=|\s+)\d+)/.test(command)) {
    return { blocked: false };
  }

  const warnReadBytes = options.warnReadBytes ?? options.maxReadBytes ?? Number.POSITIVE_INFINITY;

  for (const segment of commandSegments(command)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0 || baseName(tokens[0]) !== "grep") continue;

    const patternIndex = firstNonOptionIndex(tokens, 1);
    if (patternIndex === -1) continue;

    for (const token of tokens.slice(patternIndex + 1)) {
      if (token.startsWith("-")) continue;
      const bytes = options.getFileSize?.(token);
      if (bytes !== undefined && bytes > warnReadBytes) {
        return {
          ...actionForBytes(bytes, options, "soft-block"),
          kind: "large-grep",
          filePath: token,
          bytes,
          reason: `grep on large file without -m, --max-count, head, or tail (${token})`,
        };
      }
    }
  }

  return { blocked: false };
}

function detectUnboundedExport(command: string): CommandRisk {
  const looksLikeExport = /\baws\s+s3\s+(cp|sync)\b/i.test(command)
    || /\bcurl\b[\s\S]*>\s*\S+/i.test(command)
    || /\bwget\b[\s\S]*(?:\s-O\s+|\s--output-document(?:=|\s+)\S+)/i.test(command)
    || /(?:^|\s)mcp(?:\s|$)/i.test(command)
    || scriptExportName.test(command);

  if (!looksLikeExport || hasObviousBound(command)) return { blocked: false };

  return {
    blocked: true,
    action: "soft-block",
    kind: "unbounded-export",
    reason: "large export/download command has no obvious limit, date range, sample, filter, or aggregation",
  };
}

function actionForBytes(
  bytes: number | undefined,
  options: AnalyzeCommandRiskOptions,
  fallback: "soft-block" | "hard-block",
): Pick<CommandRisk, "action" | "blocked"> {
  if (bytes === undefined) return { action: fallback, blocked: true };

  const warnReadBytes = options.warnReadBytes ?? Number.POSITIVE_INFINITY;
  const askReadBytes = options.askReadBytes ?? options.maxReadBytes ?? Number.POSITIVE_INFINITY;
  const maxReadBytes = options.maxReadBytes ?? Number.POSITIVE_INFINITY;

  if (bytes > maxReadBytes) return { action: "hard-block", blocked: true };
  if (bytes > askReadBytes) return { action: "soft-block", blocked: true };
  if (bytes > warnReadBytes) return { action: "warn", blocked: false };
  return { action: fallback, blocked: true };
}

function hasOutputLimiter(command: string): boolean {
  return /(?:^|[|;&]\s*)(head|tail)\b/i.test(command) || /\|\s*(head|tail)\b/i.test(command);
}

function hasObviousBound(command: string): boolean {
  return hasOutputLimiter(command)
    || /\b(limit|sample|sampled|filter|where|select|count|stats|summary|aggregate|aggregation|group[-_]by)\b/i.test(command)
    || /--(?:limit|max-items|max-results|page-size|since|until|start-date|end-date|date|filter)\b/i.test(command)
    || /\b\d{4}-\d{2}-\d{2}\b/.test(command)
    || /\[:\s*\d+\]/.test(command);
}

function commandSegments(command: string): string[] {
  return command.split(/&&|\|\||;/g).map((part) => part.trim()).filter(Boolean);
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const tokenPattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(command)) !== null) {
    tokens.push(cleanToken(match[1] ?? match[2] ?? match[3]));
  }
  return tokens.filter(Boolean);
}

function cleanToken(token: string): string {
  return token.replace(/^[<>]+/, "").replace(/[),]+$/, "");
}

function firstNonOptionIndex(tokens: string[], start: number): number {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("-")) return index;
    if (token === "--") return index + 1 < tokens.length ? index + 1 : -1;
  }
  return -1;
}

function isRiskyDataTarget(token: string): boolean {
  return token.includes("*") && riskyDataExtension.test(token.replace("*", "x"))
    ? true
    : riskyDataExtension.test(token);
}

function baseName(command: string): string {
  return command.split(/[\\/]/).pop() ?? command;
}
