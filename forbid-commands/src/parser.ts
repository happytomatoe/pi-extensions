import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let parser: Parser | null = null;
let initPromise: Promise<void> | null = null;

export async function initParser(): Promise<void> {
  if (parser) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Parser.init();
      parser = new Parser();

      const wasmPath = require.resolve("tree-sitter-bash/tree-sitter-bash.wasm");
      const wasm = readFileSync(wasmPath);
      const Bash = await Language.load(wasm);
      parser.setLanguage(Bash);

      // Parser initialized silently
    } catch (err) {
      console.warn("[forbid-commands] Failed to initialize parser:", (err as Error).message);
      parser = null;
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
