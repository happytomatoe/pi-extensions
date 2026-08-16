import { escapeRegExp, expandCwd } from "./normalize";

export function wildcardMatch(pattern: string, text: string, cwd?: string): boolean {
  const expanded = expandCwd(pattern, cwd);

  let regexStr = expanded
    .split("*")
    .map(part => escapeRegExp(part).replaceAll("\\?", "."))
    .join(".*");

  if (regexStr.endsWith(" .*")) {
    regexStr = `${regexStr.slice(0, -3)}( .*)?`;
  }

  return new RegExp(`^${regexStr}$`, "i").test(text);
}
