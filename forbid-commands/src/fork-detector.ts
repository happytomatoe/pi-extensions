import { execSync } from "node:child_process";

export interface ForkInfo {
  isFork: boolean;
  parentRepo?: string; // owner/repo format
  currentRepo?: string; // owner/repo format
  hasUpstreamRemote: boolean;
}

let cachedForkInfo: ForkInfo | null = null;

/**
 * Detect if current repository is a fork
 * Results are cached per session
 */
export function detectFork(): ForkInfo {
  if (cachedForkInfo) return cachedForkInfo;

  try {
    // Method 1: Use gh repo view (most reliable)
    const ghResult = execSync(
      "gh repo view --json isFork,parent,nameWithOwner 2>/dev/null",
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const ghData = JSON.parse(ghResult);

    if (ghData.isFork) {
      cachedForkInfo = {
        isFork: true,
        parentRepo: ghData.parent?.nameWithOwner,
        currentRepo: ghData.nameWithOwner,
        hasUpstreamRemote: checkUpstreamRemote(),
      };
      return cachedForkInfo;
    }
  } catch {
    // Fall through to git-based detection
  }

  // Method 2: Check git remotes (fallback)
  const hasUpstream = checkUpstreamRemote();

  cachedForkInfo = {
    isFork: hasUpstream,
    hasUpstreamRemote: hasUpstream,
  };

  return cachedForkInfo;
}

/**
 * Check if an upstream remote exists
 */
function checkUpstreamRemote(): boolean {
  try {
    const remotes = execSync("git remote -v 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return remotes.includes("upstream");
  } catch {
    return false;
  }
}

/**
 * Clear the cached fork info (for testing or session changes)
 */
export function clearForkCache(): void {
  cachedForkInfo = null;
}
