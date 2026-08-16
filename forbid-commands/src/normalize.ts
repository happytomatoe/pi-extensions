/**
 * Normalize command text to catch bypass variations
 */

// Known binaries that should be normalized from full paths
const KNOWN_BINARIES = [
  'rm', 'cat', 'ls', 'grep', 'find', 'kill', 'pkill', 'sudo', 'env',
  'chmod', 'chown', 'cp', 'mv', 'mkdir', 'rmdir', 'touch', 'ln',
  'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
  'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync',
  'docker', 'kubectl', 'terraform', 'ansible',
  'node', 'npm', 'yarn', 'pnpm', 'bun',
  'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'go',
  'git',
  'java', 'javac',
];

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
  
  // 2. Normalize paths: /bin/rm → rm, /usr/bin/rm → rm
  for (const binary of KNOWN_BINARIES) {
    const pathRegex = new RegExp(`(?:/[\\w.-]+)+/${binary}\\b`, 'g');
    normalized = normalized.replace(pathRegex, binary);
  }
  
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
