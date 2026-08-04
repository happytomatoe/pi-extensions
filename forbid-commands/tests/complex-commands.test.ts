import { describe, it, expect } from "vitest";
import { checkCommand } from "../src/cli";

describe("Complex command variations (CLI simple check)", () => {
  // The CLI tool does simple pattern matching on the raw command string.
  // It does NOT parse pipes, command substitution, env vars, etc.
  // The extension uses tree-sitter for proper parsing.
  // 
  // With "last matching rule wins":
  // - deny rules come first in allRules
  // - confirm rules come second
  // - allow rules come last
  // So if a command matches both deny and allow, allow wins.
  const testCases: Array<[string, "allow" | "ask" | "deny"]> = [
    // Pipe commands - CLI matches against full string
    // "echo *" matches, so allow wins
    ["echo test | sudo ls", "allow"],
    ["echo test | kill 1234", "allow"],
    
    // Command substitution - no pattern matches
    ["$(sudo ls)", "ask"],  // No pattern matches, defaults to ask
    ["`sudo ls`", "ask"],  // No pattern matches, defaults to ask
    
    // Env vars - pattern "sudo *" doesn't match "SUDO_ASKPASS=x sudo ls"
    ["SUDO_ASKPASS=x sudo ls", "ask"],  // No pattern matches, defaults to ask
    ["EDITOR=vim sudo -e /tmp/test", "ask"],  // No pattern matches, defaults to ask
    
    // Multiple commands - "rm /tmp/*" matches, so allow wins
    ["rm /tmp/a; sudo ls", "allow"],
    ["rm /tmp/a && sudo ls", "allow"],
    ["rm /tmp/a || sudo ls", "allow"],
    
    // Allowed commands in pipes
    ["echo test | grep foo", "allow"],
    ["ls /tmp | grep foo", "allow"],
    
    // Allowed commands with pipes
    ["cat /tmp/file | head -5", "allow"],
  ];

  testCases.forEach(([command, expected]) => {
    it(`"${command}" → ${expected}`, () => {
      const result = checkCommand(command);
      expect(result.state).toBe(expected);
    });
  });
});
