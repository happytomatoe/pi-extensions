import { describe, it, expect } from "vitest";
import { checkCommand } from "../src/cli";

describe("Complex command variations (CLI with parser)", () => {
  // The CLI now uses tree-sitter parser to properly parse commands.
  // Pipes, command substitution, env vars, and command chains are all parsed.
  // Each individual command is checked against rules.
  // With "most-restrictive" strategy: if ANY command is denied, the whole thing is denied.

  const testCases: Array<[string, "allow" | "deny"]> = [
    // Pipe commands - each command in the pipe is checked
    // "echo *" matches, "sudo *" also matches → deny wins (most-restrictive)
    ["echo test | sudo ls", "deny"],
    ["echo test | kill 1234", "deny"],

    // Command substitution - the inner command is parsed
    ["$(sudo ls)", "deny"],  // sudo is denied
    ["`sudo ls`", "deny"],  // sudo is denied

    // Env vars - env vars are stripped, "sudo *" matches
    ["SUDO_ASKPASS=x sudo ls", "deny"],
    ["EDITOR=vim sudo -e /tmp/test", "deny"],

    // Multiple commands - "sudo *" in second command is denied
    ["rm /tmp/a; sudo ls", "deny"],
    ["rm /tmp/a && sudo ls", "deny"],
    ["rm /tmp/a || sudo ls", "deny"],

    // Allowed commands in pipes - all commands are allowed
    ["echo test | cat /tmp/file", "allow"],
    ["ls /tmp | cat /tmp/file", "allow"],

    // Allowed commands with pipes
    ["cat /tmp/file | head -5", "allow"],
  ];

  testCases.forEach(([command, expected]) => {
    it(`"${command}" → ${expected}`, async () => {
      const result = await checkCommand(command);
      expect(result.state).toBe(expected);
    });
  });
});
