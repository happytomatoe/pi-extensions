import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkCommand } from "../src/cli";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("checkCommand", () => {
  const testHome = mkdtempSync(join(tmpdir(), "forbid-commands-test-"));
  const configDir = join(testHome, ".pi", "agent");
  const configFile = join(configDir, "forbid-commands.yaml");

  beforeAll(() => {
    // Create temporary HOME with test config
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configFile, `
deny:
  - pattern: "shutdown *"
    message: "Shutdown is forbidden"
  - pattern: "reboot"
    message: "Reboot is forbidden"
  - pattern: "halt"
    message: "Halt is forbidden"
  - pattern: "poweroff"
    message: "Power off is forbidden"
  - pattern: "kill *"
    message: "Killing processes is forbidden"
  - pattern: "pkill *"
    message: "Killing processes by name is forbidden"
  - pattern: "sudo *"
    message: "Sudo is forbidden"
  - pattern: "su -"
    message: "Switching user is forbidden"
  - pattern: "su root"
    message: "Switching to root is forbidden"
  - pattern: "ssh *"
    message: "SSH is forbidden"
  - pattern: "scp *"
    message: "SCP is forbidden"
  - pattern: "sftp *"
    message: "SFTP is forbidden"
  - pattern: "rm -rf /*"
    message: "Dangerous: rm -rf / is forbidden"
  - regex: "gh\\s+pr\\s+merge"
    message: "Merging PRs is forbidden"
  - regex: "cargo\\s+install"
    message: "Installing cargo packages is forbidden"
  - pattern: "rm *"
    message: "rm is forbidden outside the current directory or /tmp"
  - pattern: "git push --force *"
    message: "Force push is forbidden"
  - pattern: "git reset --hard *"
    message: "Hard reset is forbidden"
  - regex: 'literal\\\\dot'
    message: "Single-quoted regex must keep literal backslashes"

allow:
  - regex: "^rm(?: -[rf]+)?\\s+(?!/)(?:(?!\\.\\.)[^\\s])*$"
  - pattern: "rm /tmp/*"
  - pattern: "echo *"
  - pattern: "ls *"
  - pattern: "cat *"
  - pattern: "head *"
  - pattern: "tail *"
  - pattern: "grep *"
  - pattern: "find *"
  - pattern: "wc *"
  - pattern: "file *"
  - pattern: "stat *"
  - pattern: "du *"
  - pattern: "df *"
  - pattern: "git status"
  - pattern: "git log *"
  - pattern: "git diff *"
  - pattern: "git show *"
  - pattern: "git branch *"
  - pattern: "git remote *"
  - pattern: "git stash *"
  - pattern: "git tag"
  - pattern: "mkdir *"
  - pattern: "touch *"
  - pattern: "cp *"
  - pattern: "mv *"
  - pattern: "ln *"
  # Allow rm in /tmp only
  - pattern: "rm /tmp/*"
  - pattern: "rm -rf /tmp/*"
`);
    // Set HOME to test directory
    process.env.HOME = testHome;
  });

  afterAll(() => {
    // Restore original HOME and clean up
    rmSync(testHome, { recursive: true, force: true });
  });
  // Table-driven tests: [command, expected_state]
  // Based on patterns defined in ~/.pi/agent/forbid-commands.yaml
  const testCases: Array<[string, "allow" | "deny"]> = [
    // Allowed commands - read-only
    ["echo hello", "allow"],
    ["ls /tmp", "allow"],
    ["cat /etc/hostname", "allow"],
    ["head /etc/passwd", "allow"],
    ["tail /var/log/syslog", "allow"],
    ["grep pattern file.txt", "allow"],
    ["find /tmp -name '*.txt'", "allow"],
    ["wc -l file.txt", "allow"],
    ["file /tmp/test", "allow"],
    ["stat /tmp/test", "allow"],
    ["du -sh /tmp", "allow"],
    ["df -h", "allow"],
    ["git status", "allow"],
    ["git log --oneline", "allow"],
    ["git diff main", "allow"],

    // Single-quoted YAML regex must keep backslashes literal (a naive
    // "unescape as if double-quoted" parser would collapse \\ to \,
    // turning \\d into a digit-class escape and changing what matches).
    ["run literal\\dot", "deny"], // contains one literal backslash before "dot"
    ["run literal9dot", "allow"], // would match only under the buggy unescape
    ["git show HEAD", "allow"],
    ["git branch -a", "allow"],
    ["git remote -v", "allow"],
    ["git stash list", "allow"],
    ["git tag", "allow"],
    ["mkdir /tmp/test", "allow"],
    ["touch /tmp/file.txt", "allow"],
    ["cp /tmp/a.txt /tmp/b.txt", "allow"],
    ["mv /tmp/a.txt /tmp/b.txt", "allow"],
    ["ln -s /tmp/a /tmp/b", "allow"],

    // Ask commands - rm (in confirm block)
    ["rm /home/user/file.txt", "deny"],
    ["rm ../file.txt", "deny"],        // parent dir - use rm /absolute/path

    // Allowed rm commands (in allow block)
    ["rm ./file.txt", "allow"],        // dotted filename must not be excluded by the exception
    ["rm ./subdir/file.txt", "allow"], // matches rm ./... exception
    ["rm -rf ./file.txt", "allow"],    // flag + dotted filename
    ["rm ./../etc/passwd", "deny"],    // traversal right after ./
    ["rm ./foo/../bar", "deny"],       // traversal later in the path
    ["rm ./..", "deny"],               // bare traversal
    ["rm file.txt", "allow"],          // relative path in cwd, no ./ required
    ["rm subdir/file.txt", "allow"],   // relative path in cwd, no ./ required
    ["rm -rf file.txt", "allow"],      // flag + bare relative path
    ["rm /tmp/test.txt", "allow"],
    ["rm -rf /tmp/test", "allow"],

    // Denied commands - system
    ["sudo ls /tmp", "deny"],
    ["kill 1234", "deny"],
    ["kill -9 1234", "deny"],
    ["pkill brave", "deny"],
    ["shutdown -h now", "deny"],
    ["reboot", "deny"],
    ["halt", "deny"],
    ["poweroff", "deny"],
    ["su -", "deny"],
    ["su root", "deny"],
    ["ssh user@host", "deny"],
    ["scp file.txt user@host:/tmp", "deny"],
    ["sftp user@host", "deny"],

    // Path variations
    ["/usr/bin/sudo ls", "deny"],
    ["/usr/bin/kill 1234", "deny"],
    ["/usr/bin/pkill brave", "deny"],

    // Quote variations
    ['"sudo" ls', "deny"],
    ["'kill' 1234", "deny"],
    ['"pkill" brave', "deny"],
    ["'shutdown' -h now", "deny"],
    ["'ssh' user@host", "deny"],

    // Regex patterns
    ["gh pr merge 123", "deny"],
    ["git push --force origin main", "deny"],
    ["git push --force  origin main", "deny"],
    ["git push --force origin main ", "deny"],
    ["cargo install ripgrep", "deny"],
    ["cargo install bat", "deny"],
    ["cargo install fd-find", "deny"],
  ];

  describe("table-driven tests", () => {
    testCases.forEach(([command, expected]) => {
      it(`"${command}" → ${expected}`, () => {
        const result = checkCommand(command);
        expect(result.state).toBe(expected);
      });
    });
  });
});
