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
