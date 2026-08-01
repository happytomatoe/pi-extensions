import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let parser: Parser | null = null;
let initPromise: Promise<void> | null = null;

export async function initParser(): Promise<void> {
  if (parser) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await Parser.init();
    parser = new Parser();

    const wasmPath = join(__dirname, "../grammars/tree-sitter-bash.wasm");
    const wasm = readFileSync(wasmPath);
    const Bash = await Language.load(wasm);
    parser.setLanguage(Bash);

    console.log("[forbid-commands] Tree-sitter parser initialized");
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
