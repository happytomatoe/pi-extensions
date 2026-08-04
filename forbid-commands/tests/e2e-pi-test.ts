#!/usr/bin/env node
/**
 * End-to-end tests for forbid-commands extension using Pi
 * Runs commands ONE BY ONE to identify exactly which command causes issues.
 * 
 * Usage: npx tsx tests/e2e-pi-test.ts
 */

import { execSync } from "child_process";

interface TestCase {
  command: string;
  expected: "allow" | "ask" | "deny";
  description: string;
  runThroughPi?: boolean; // If true, actually run through Pi. If false, only check with CLI.
}

const testCases: TestCase[] = [
  // Allowed commands (safe to run through Pi)
  { command: "echo hello", expected: "allow", description: "echo", runThroughPi: true },
  { command: "ls /tmp", expected: "allow", description: "ls", runThroughPi: true },
  { command: "git status", expected: "allow", description: "git status", runThroughPi: true },
  
  // Denied commands (run through Pi to verify extension blocks them)
  { command: "sudo ls /tmp", expected: "deny", description: "sudo", runThroughPi: true },
  { command: "kill 1234", expected: "deny", description: "kill", runThroughPi: true },
  { command: "shutdown -h now", expected: "deny", description: "shutdown", runThroughPi: true },
  { command: "reboot", expected: "deny", description: "reboot", runThroughPi: true },
  { command: "pkill brave", expected: "deny", description: "pkill", runThroughPi: true },
  { command: "ssh user@host", expected: "deny", description: "ssh", runThroughPi: true },

  // Path variations (run through Pi to verify normalization)
  { command: "/usr/bin/sudo ls", expected: "deny", description: "full path sudo", runThroughPi: true },
  { command: "/usr/bin/kill 1234", expected: "deny", description: "full path kill", runThroughPi: true },

  // Quote variations (run through Pi to verify normalization)
  { command: '"sudo" ls', expected: "deny", description: "quoted sudo", runThroughPi: true },
  { command: "'kill' 1234", expected: "deny", description: "quoted kill", runThroughPi: true },
];

function checkWithCLI(command: string): string {
  try {
    const result = execSync(
      `cd /var/home/l/git/pi-extensions/forbid-commands && npx tsx src/cli.ts "${command}" 2>&1`,
      { encoding: "utf-8", timeout: 10000 }
    );
    return result.trim();
  } catch (error: any) {
    return error.stdout?.trim() || "error";
  }
}

function runWithPi(command: string): { output: string; actual: string } {
  try {
    const prompt = `Run this exact command and tell me the result: ${command}`;
    const result = execSync(
      `timeout 30 pi -p '${prompt.replace(/'/g, "'\\''")}' 2>&1`,
      { encoding: "utf-8", timeout: 35000 }
    );
    
    // Check if blocked
    let actual: string;
    if (result.includes("Command blocked") || result.includes("blocked") || result.includes("denied") || result.includes("forbidden")) {
      actual = "deny";
    } else if (result.includes("ask") || result.includes("confirm")) {
      actual = "ask";
    } else {
      actual = "allow";
    }
    
    return { output: result, actual };
  } catch (error: any) {
    return { output: error.stdout?.trim() || "error", actual: "error" };
  }
}

function runTests() {
  console.log("=== forbid-commands E2E Tests (Sequential) ===\n");

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.description}`);
    console.log(`  Command: ${testCase.command}`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Method: ${testCase.runThroughPi ? "Pi" : "CLI"}`);

    let actual: string;
    let output: string;

    if (testCase.runThroughPi) {
      // Run through Pi
      console.log(`  Running through Pi...`);
      const result = runWithPi(testCase.command);
      actual = result.actual;
      output = result.output;
      
      // Show truncated output
      const truncated = output.length > 300 ? output.substring(0, 300) + "..." : output;
      console.log(`  Output: ${truncated}`);
    } else {
      // Only check with CLI (safer)
      console.log(`  Checking with CLI...`);
      actual = checkWithCLI(testCase.command);
      output = actual;
    }

    const status = actual === testCase.expected ? "✓ PASS" : "✗ FAIL";
    console.log(`  Result: ${actual}`);
    console.log(`  Status: ${status}`);

    if (actual === testCase.expected) {
      passed++;
    } else {
      failed++;
    }

    console.log("");
  }

  console.log("=== Results ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\n✓ All tests passed!");
    process.exit(0);
  } else {
    console.log("\n✗ Some tests failed");
    process.exit(1);
  }
}

runTests();
