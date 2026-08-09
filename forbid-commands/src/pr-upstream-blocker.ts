import type { ForkInfo } from "./fork-detector";

export interface PrAnalysis {
  isPrCreate: boolean;
  targetsUpstream: boolean;
}

/**
 * Analyze a command to determine if it's a PR create targeting upstream
 */
export function analyzePrCommand(
  command: string,
  forkInfo: ForkInfo
): PrAnalysis {
  // Check if this is a gh pr create command
  if (!isGhPrCreateCommand(command)) {
    return { isPrCreate: false, targetsUpstream: false };
  }

  // If not a fork, nothing to block
  if (!forkInfo.isFork) {
    return { isPrCreate: true, targetsUpstream: false };
  }

  // Check if command targets upstream
  const targetsUpstream = checkTargetsUpstream(command, forkInfo);

  return {
    isPrCreate: true,
    targetsUpstream,
  };
}

function isGhPrCreateCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return /\bgh\s+pr\s+create\b/.test(normalized);
}

function checkTargetsUpstream(
  command: string,
  forkInfo: ForkInfo
): boolean {
  // If -R or --repo is explicitly set, check if it's upstream
  const repoMatch = command.match(/(?:-R|--repo)\s+([^\s]+)/);
  if (repoMatch) {
    const targetRepo = repoMatch[1];
    return targetRepo === forkInfo.parentRepo;
  }

  // If --head is set with upstream repo owner
  const headMatch = command.match(/--head\s+([^\s:]+):/);
  if (headMatch) {
    const headOwner = headMatch[1];
    const parentOwner = forkInfo.parentRepo?.split("/")[0];
    return headOwner === parentOwner;
  }

  // Default: if no explicit flags, gh targets upstream on forks
  return true;
}

export function formatBlockMessage(forkInfo: ForkInfo): string {
  return [
    `⛔ Forbidden: Pi coding agent is not allowed to create PRs to upstream repository`,
    ``,
    `Current repo (your fork): ${forkInfo.currentRepo}`,
    `Upstream repo (blocked): ${forkInfo.parentRepo}`,
    ``,
    `To create a PR, you must target your fork:`,
    `  gh pr create --repo ${forkInfo.currentRepo}`,
    ``,
    `Or push to your fork first, then create the PR:`,
    `  git push origin HEAD`,
    `  gh pr create`,
  ].join("\n");
}
