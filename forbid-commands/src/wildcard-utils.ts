function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wildcardMatch(pattern: string, text: string, cwd?: string): boolean {
  let expanded = pattern;
  if (cwd && pattern.includes("$CWD")) {
    const escapedCwd = cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expanded = pattern.replace(/\$CWD/g, escapedCwd);
  }

  let regexStr = expanded
    .split("*")
    .map(part => escapeRegExp(part).replaceAll("\\?", "."))
    .join(".*");

  if (regexStr.endsWith(" .*")) {
    regexStr = `${regexStr.slice(0, -3)}( .*)?`;
  }

  return new RegExp(`^${regexStr}$`, "i").test(text);
}
