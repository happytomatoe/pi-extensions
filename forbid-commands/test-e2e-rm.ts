#!/usr/bin/env npx tsx
/**
 * E2E Test for forbid-commands extension
 * 
 * Table-driven tests for rm command behavior
 * 
 * Usage:
 *   npx tsx test-e2e-rm.ts
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "fs";
import { join, dirname } from "path";

// Test case: [command, expected, description]
type TestCase = [string, "allow" | "deny", string];

const TEST_CASES: TestCase[] = [
  // Current directory with ./ prefix
  ["rm ./target.txt", "allow", "current dir with ./"],
  ["rm ./data/files/test.txt", "allow", "nested dir with ./"],
  
  // /tmp directory
  ["rm /tmp/test-e2e/tmp-file.txt", "allow", "tmp dir"],
  
  // Parent directory with ../
  ["rm ../parent-file.txt", "deny", "parent dir with ../"],
  
  // No ./ prefix (should be denied)
  ["rm relative-file.txt", "deny", "no ./ prefix"],
  
  // Directory removal
  ["rm -rf ./test-folder", "allow", "dir removal with ./"],
  ["rm -rf /tmp/test-e2e-folder", "allow", "tmp dir removal"],
];

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const TEST_DIR = join(SCRIPT_DIR, "test-e2e");
const PI_CWD = join(SCRIPT_DIR, "test-e2e-pi-cwd");  // Run Pi outside project to avoid AGENTS.md
const EXTENSION_PATH = join(SCRIPT_DIR, "index.ts");
const TMP_DIR = join(SCRIPT_DIR, "test-e2e-tmp");  // Unique tmp dir for tests

function setupTestFiles(): void {
  console.log("1. Setting up test directory structure...");
  
  // Clean and create PI_CWD (where Pi runs)
  rmSync(PI_CWD, { recursive: true, force: true });
  mkdirSync(join(PI_CWD, "data", "files"), { recursive: true });
  mkdirSync(join(PI_CWD, "test-folder"), { recursive: true });
  
  // Also create test dirs in TMP_DIR (instead of /tmp)
  mkdirSync(join(TMP_DIR, "test-e2e"), { recursive: true });
  mkdirSync(join(TMP_DIR, "test-e2e-folder"), { recursive: true });
  
  // Create test files in PI_CWD (where Pi will run)
  writeFileSync(join(PI_CWD, "target.txt"), "test");
  writeFileSync(join(PI_CWD, "data", "files", "test.txt"), "test");
  writeFileSync(join(PI_CWD, "relative-file.txt"), "test");
  writeFileSync(join(TMP_DIR, "test-e2e", "tmp-file.txt"), "test");
  writeFileSync(join(PI_CWD, "..", "parent-file.txt"), "test");  // Create in parent of PI_CWD
  
  console.log("   Created test files and directories\n");
}

function generatePrompt(testCases: TestCase[]): string {
  const commands = testCases.map(([cmd]) => cmd).join("\n");
  
  return `Remove these files and directories. Make ALL rm commands as separate parallel tool calls (not sequential):

${commands}

Execute all ${testCases.length} rm commands simultaneously as parallel bash tool calls. Then report which ones were allowed and which were blocked.

Finally, run this command and output the result: echo \"PI_SESSION_FILE=\$PI_SESSION_FILE\"`;
}

function runTest(testCases: TestCase[]): { output: string; results: Map<string, string> } {
  console.log("2. Running test with Pi (print mode)...\n");
  
  const prompt = generatePrompt(testCases);
  
  const output = execSync(
    `pi -p -ne -ns --approve -e ${EXTENSION_PATH} --model openrouter/free "${prompt}"`,
    {
      cwd: PI_CWD,
      encoding: "utf-8",
      timeout: 60000,
    }
  );
  
  // Parse results from output
  const results = new Map<string, string>();
  
  for (const [cmd, expected, desc] of testCases) {
    // Check if the command was blocked or allowed based on output
    const isBlocked = output.includes(`blocked`) && output.includes(cmd);
    const status = isBlocked ? "deny" : "allow";
    results.set(cmd, status);
  }
  
  return { output, results };
}

function checkFilesystemResults(testCases: TestCase[]): { passed: number; failed: number } {
  console.log("3. Checking filesystem results...\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const [cmd, expected, desc] of testCases) {
    // Extract path from command
    const match = cmd.match(/rm\s+(?:-[^\s]+\s+)?(.+)/);
    const path = match?.[1] || cmd;
    
    // Resolve path relative to PI_CWD (where files were created)
    const fullPath = path.startsWith("/") ? path : join(PI_CWD, path);
    const exists = existsSync(fullPath);
    
    const shouldExist = expected === "deny";
    const testPassed = exists === shouldExist;
    
    if (testPassed) {
      console.log(`   ✅ PASS: ${desc} - ${cmd}`);
      passed++;
    } else {
      console.log(`   ❌ FAIL: ${desc} - ${cmd}`);
      console.log(`      Expected: ${shouldExist ? "exists" : "deleted"}`);
      console.log(`      Actual: ${exists ? "exists" : "deleted"}`);
      failed++;
    }
  }
  
  return { passed, failed };
}

function copySessionFile(output: string): void {
  console.log("\n4. Copying Pi session file...\n");
  
  // Extract session file path from output
  const match = output.match(/PI_SESSION_FILE=(.+)/);
  if (match) {
    const sessionPath = match[1].trim();
    if (existsSync(sessionPath)) {
      copyFileSync(sessionPath, join(SCRIPT_DIR, "pi-e2e-session.jsonl"));
      console.log(`   Session file copied to: pi-e2e-session.jsonl`);
      console.log(`   Original: ${sessionPath}`);
    } else {
      console.log(`   Session file not found: ${sessionPath}`);
    }
  } else {
    console.log(`   PI_SESSION_FILE not found in output`);
  }
}

function cleanup(): void {
  console.log("\n5. Cleaning up...\n");
  rmSync(PI_CWD, { recursive: true, force: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
  rmSync(join(PI_CWD, "..", "parent-file.txt"), { force: true });
}

function printTestCases(): void {
  console.log("   Test cases:");
  console.log("   ┌────┬──────────────────────────────────────┬──────────┐");
  console.log("   │ #  │ Command                              │ Expected │");
  console.log("   ├────┼──────────────────────────────────────┼──────────┤");
  
  TEST_CASES.forEach(([cmd, expected], i) => {
    const num = String(i + 1).padStart(2);
    const command = cmd.padEnd(36);
    const expectedStr = expected.toUpperCase().padEnd(8);
    console.log(`   │ ${num} │ ${command} │ ${expectedStr} │`);
  });
  
  console.log("   └────┴──────────────────────────────────────┴──────────┘\n");
}

// Main
async function main() {
  console.log("=== E2E Test for forbid-commands extension ===\n");
  
  setupTestFiles();
  printTestCases();
  
  const { output, results } = runTest(TEST_CASES);
  
  // Save output
  const { writeFileSync } = await import("fs");
  writeFileSync(join(SCRIPT_DIR, "pi-e2e-output.txt"), output);
  console.log("   Output saved to: pi-e2e-output.txt\n");
  
  copySessionFile(output);
  
  const { passed, failed } = checkFilesystemResults(TEST_CASES);
  
  // Summary
  console.log("\n===========================================");
  console.log("Test Summary");
  console.log("===========================================");
  console.log(`Total:  ${TEST_CASES.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  cleanup();
  
  process.exit(failed > 0 ? 1 : 0);
}

main();
