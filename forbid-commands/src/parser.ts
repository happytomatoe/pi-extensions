import { Parser, Language } from "web-tree-sitter";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveWasmPath(): string {
  const localPath = join(__dirname, "../grammars/tree-sitter-bash.wasm");
  if (existsSync(localPath)) {
    return localPath;
  }

  const nmPath = join(__dirname, "../node_modules/tree-sitter-bash/tree-sitter-bash.wasm");
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
    await Parser.init();
    parser = new Parser();

    const wasmPath = resolveWasmPath();
    const wasm = readFileSync(wasmPath);
    const Bash = await Language.load(wasm);
    parser.setLanguage(Bash);
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
