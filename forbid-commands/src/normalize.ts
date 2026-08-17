import { tokenizeArgs } from 'args-tokenizer';
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
/** Escape string for use in RegExp */
export function escapeRegExp(s: string): string {
  return s.replace(ESCAPE_RE, "\\$&");
}

/** Expand $CWD placeholder in a pattern/regex string */
export function expandCwd(str: string, cwd?: string): string {
  if (!cwd || !str.includes("$CWD")) return str;
  return str.replace(/\$CWD/g, escapeRegExp(cwd));
}

/**
 * Parse command into tokens using args-tokenizer
 */
export function parseCommand(text: string): string[] {
  try {
    return tokenizeArgs(text);
  } catch {
    return text.split(/\s+/);
  }
}

/**
 * Detect --no-verify flag in git commands
 */
export function hasNoVerifyFlag(text: string): boolean {
  const args = parseCommand(text);
  return args.some(arg => arg === '--no-verify' || arg === '-n');
}

/**
 * Detect git-specific bypass flags
 */
export function detectGitBypassFlags(text: string): string[] {
  const args = parseCommand(text);
  const flags: string[] = [];
  
  for (const arg of args) {
    if (arg === '--no-verify' || arg === '-n') flags.push('--no-verify');
    if (arg === '--force' || arg === '-f') flags.push('--force');
    if (arg === '--force-with-lease') flags.push('--force-with-lease');
  }
  
  return [...new Set(flags)];
}
/**
 * Normalize command text to catch bypass variations
 */
export function normalizeCommand(text: string): string {
  let normalized = text;
  
  // 1. Strip quotes around paths and words: "/bin/rm" → /bin/rm, "rm" → rm
  // This handles quoted paths like "/bin/rm" and quoted backslash-escaped words like '\\sudo'
  normalized = normalized.replace(/(["'])[\w/.\\/-]+\1/g, (match) => {
    return match.slice(1, -1);
  });
  
  // Also handle quoted words with backslashes: '\\sudo' → \\sudo → sudo
  normalized = normalized.replace(/(["'])\\(\w+)\1/g, (match, quote, word) => {
    return word;
  });
  
  // 2. Normalize any full path to just the binary name (first token only)
  // /usr/bin/rm → rm, /usr/local/bin/git → git
  normalized = normalized.replace(/^(?:\/[\w.-]+)+\/(\w+)/, '$1');
  
  // 3. Remove backslashes: \rm → rm
  normalized = normalized.replace(/\\(\w)/g, '$1');
  
  // 4. Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Get both original and normalized versions for matching
 */
export function getMatchingTexts(text: string): string[] {
  const normalized = normalizeCommand(text);
  const texts = [text];
  
  if (normalized !== text) {
    texts.push(normalized);
  }
  
  return texts;
}
