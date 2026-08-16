import { expandCwd } from "./normalize";

export function regexMatch(regexStr: string, text: string, cwd?: string): boolean {
  const expandedRegex = expandCwd(regexStr, cwd);

  try {
    return new RegExp(expandedRegex, "i").test(text);
  } catch (e) {
    console.error("[forbid-commands] Invalid regex:", expandedRegex, e);
    return false;
  }
}
