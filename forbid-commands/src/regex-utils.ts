export function regexMatch(regexStr: string, text: string, cwd?: string): boolean {
  let expandedRegex = regexStr;
  if (cwd && regexStr.includes("$CWD")) {
    const escapedCwd = cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expandedRegex = regexStr.replace(/\$CWD/g, escapedCwd);
  }

  try {
    return new RegExp(expandedRegex, "i").test(text);
  } catch (e) {
    console.error("[forbid-commands] Invalid regex:", expandedRegex, e);
    return false;
  }
}
