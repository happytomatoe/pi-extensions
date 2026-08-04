import { describe, it, expect } from "vitest";
import { normalizeCommand, getMatchingTexts } from "../src/normalize";

describe("normalizeCommand", () => {
  // Table-driven tests: [input, expected_output]
  const testCases: Array<[string, string]> = [
    // Path variations
    ["/bin/rm -rf /", "rm -rf /"],
    ["/usr/bin/rm -rf /", "rm -rf /"],
    ["/usr/local/bin/rm -rf /", "rm -rf /"],
    ["/bin/cat /etc/passwd", "cat /etc/passwd"],
    ["/usr/bin/ls /tmp", "ls /tmp"],
    ["/usr/bin/kill 1234", "kill 1234"],
    ["/usr/bin/pkill brave", "pkill brave"],
    ["/usr/bin/sudo ls", "sudo ls"],

    // Quote variations
    ['"rm" -rf /', "rm -rf /"],
    ["'rm' -rf /", "rm -rf /"],
    ['"cat" /etc/passwd', "cat /etc/passwd"],
    ["'ls' /tmp", "ls /tmp"],
    ['"kill" 1234', "kill 1234"],
    ["'pkill' brave", "pkill brave"],
    ['"sudo" ls', "sudo ls"],

    // Backslash variations
    ["\\rm -rf /", "rm -rf /"],
    ["\\cat /etc/passwd", "cat /etc/passwd"],
    ["\\ls /tmp", "ls /tmp"],
    ["\\kill 1234", "kill 1234"],
    ["\\sudo ls", "sudo ls"],

    // Combined techniques
    ['"/bin/rm" -rf /', "rm -rf /"],
    ["'/bin/cat' /etc/passwd", "cat /etc/passwd"],
    ['"/usr/bin/kill" 1234', "kill 1234"],
    ["'\\sudo' ls", "sudo ls"],

    // Normal commands (no change)
    ["rm -rf /", "rm -rf /"],
    ["cat /etc/passwd", "cat /etc/passwd"],
    ["ls /tmp", "ls /tmp"],
    ["kill 1234", "kill 1234"],
    ["sudo ls", "sudo ls"],

    // Env vars (no change - we don't normalize env vars)
    ["ENV_VAR=secret rm -rf /", "ENV_VAR=secret rm -rf /"],
    ["A=1 B=2 rm -rf /", "A=1 B=2 rm -rf /"],

    // Whitespace normalization
    ["rm  -rf  /", "rm -rf /"],
    ["cat  /etc/passwd", "cat /etc/passwd"],
    ["ls   /tmp", "ls /tmp"],
  ];

  describe("table-driven tests", () => {
    testCases.forEach(([input, expected]) => {
      it(`"${input}" → "${expected}"`, () => {
        expect(normalizeCommand(input)).toBe(expected);
      });
    });
  });
});

describe("getMatchingTexts", () => {
  // Table-driven tests: [input, expected_count]
  const testCases: Array<[string, number]> = [
    // Should return 2 texts (original + normalized)
    ["/bin/rm -rf /", 2],
    ['"rm" -rf /', 2],
    ["\\rm -rf /", 2],
    ['"/bin/rm" -rf /', 2],

    // Should return 1 text (no normalization needed)
    ["rm -rf /", 1],
    ["cat /etc/passwd", 1],
    ["ls /tmp", 1],
    ["kill 1234", 1],
    ["sudo ls", 1],
    ["ENV_VAR=secret rm -rf /", 1],
  ];

  describe("table-driven tests", () => {
    testCases.forEach(([input, expectedCount]) => {
      it(`"${input}" should return ${expectedCount} text(s)`, () => {
        expect(getMatchingTexts(input).length).toBe(expectedCount);
      });
    });
  });

  it("should include original text", () => {
    const texts = getMatchingTexts("/bin/rm -rf /");
    expect(texts).toContain("/bin/rm -rf /");
  });

  it("should include normalized text", () => {
    const texts = getMatchingTexts("/bin/rm -rf /");
    expect(texts).toContain("rm -rf /");
  });
});
