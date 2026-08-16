import { Parser, Language } from "web-tree-sitter";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveWasmPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const localPath = join(currentDir, "../grammars/tree-sitter-bash.wasm");
  if (existsSync(localPath)) {
    return localPath;
  }

  const nmPath = join(currentDir, "../node_modules/tree-sitter-bash/tree-sitter-bash.wasm");
  if (existsSync(nmPath)) {
    return nmPath;
  }

  throw new Error(
    `[forbid-commands] Could not find tree-sitter-bash.wasm. ` +
      `Run \`npm install\` (or copy the grammar WASM to ${localPath}).`
  );
}

let parser: Parser | null = null;
let initPromise: Promise<void> | null = null;

export async function initParser(): Promise<void> {
  if (parser) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Parser.init();
      const newParser = new Parser();

      const wasmPath = resolveWasmPath();
      const wasm = readFileSync(wasmPath);
      const Bash = await Language.load(wasm);
      newParser.setLanguage(Bash);

      // Only assign after successful initialization
      parser = newParser;
    } catch (err) {
      console.warn("[forbid-commands] Failed to initialize parser:", (err as Error).message);
      // Reset initPromise so subsequent calls can retry
      initPromise = null;
    }
  })();

  return initPromise;
}

export function parseBash(command: string): Parser.Tree | null {
  if (!parser) return null;
  return parser.parse(command);
}

export function isParserReady(): boolean {
  return parser !== null;
}
