import { describe, it, expect } from "vitest";
import { checkCommand } from "../src/cli";

describe("checkCommand", () => {
  // Table-driven tests: [command, expected_state]
  // Based on patterns defined in ~/.pi/agent/forbid-commands.yaml
  const testCases: Array<[string, "allow" | "ask" | "deny"]> = [
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

    // Allowed commands - git read-only
    ["git status", "allow"],
    ["git log --oneline", "allow"],
    ["git diff main", "allow"],
    ["git show HEAD", "allow"],
    ["git branch -a", "allow"],
    ["git remote -v", "allow"],
    ["git stash list", "allow"],
    ["git tag", "allow"],

    // Allowed commands - file operations
    ["mkdir /tmp/test", "allow"],
    ["touch /tmp/file.txt", "allow"],
    ["cp /tmp/a.txt /tmp/b.txt", "allow"],
    ["mv /tmp/a.txt /tmp/b.txt", "allow"],
    ["ln -s /tmp/a /tmp/b", "allow"],

    // Ask commands - rm (in confirm block)
    ["rm /home/user/file.txt", "ask"],
    ["rm -rf /home/user/dir", "allow"],

    // Allowed rm commands (in allow block)
    ["rm /tmp/test.txt", "allow"],
    ["rm -rf /tmp/test", "allow"],
    ["rm -rf */*", "allow"],

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
  ];

  describe("table-driven tests", () => {
    testCases.forEach(([command, expected]) => {
      it(`"${command}" → ${expected}`, () => {
        const result = checkCommand(command);
        expect(result.state).toBe(expected);
      });
    });

  describe("Regex patterns", () => {
    const regexTestCases: Array<[string, "allow" | "ask" | "deny"]> = [
      // gh pr merge is deny
      ["gh pr merge 123", "deny"],
      // git push --force origin main matches both deny regex and confirm pattern
      // With last-match-wins, confirm pattern wins (allow rules override confirm)
      ["git push --force origin main", "ask"],
      ["git push --force  origin main", "ask"],
      ["git push --force origin main ", "ask"],
      // cargo install is deny
      ["cargo install ripgrep", "deny"],
      ["cargo install bat", "deny"],
      ["cargo install fd-find", "deny"],
    ];

    regexTestCases.forEach(([command, expected]) => {
      it(`regex: "${command}" → ${expected}`, () => {
        const result = checkCommand(command);
        expect(result.state).toBe(expected);
      });
    });
  });
  });
});
