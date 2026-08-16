import { escapeRegExp, expandCwd } from "./normalize";

/** Collapse whitespace to single spaces for consistent matching */
const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();

export function wildcardMatch(pattern: string, text: string, cwd?: string): boolean {
  const expanded = normalizeWs(expandCwd(pattern, cwd));
  const normalizedText = normalizeWs(text);

  let regexStr = expanded
    .split("*")
    .map(part => escapeRegExp(part).replaceAll("\\?", "."))
    .join(".*");

  if (regexStr.endsWith(" .*")) {
    regexStr = `${regexStr.slice(0, -3)}( .*)?`;
  }

  return new RegExp(`^${regexStr}$`, "i").test(normalizedText);
}
