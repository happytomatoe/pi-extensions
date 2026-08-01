import type Parser from "web-tree-sitter";

export type WrapperKind = "opaque-payload" | "indirection";
export type BashCommandContext = "command_substitution" | "process_substitution" | "subshell";

export interface BashCommand {
  text: string;
  context?: BashCommandContext;
  wrapperKind?: WrapperKind;
}

const DESCEND_TYPES = new Set(["program", "list", "pipeline", "redirected_statement"]);
const SKIP_TYPES = new Set([
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "comment",
  "heredoc_body",
  "heredoc_end",
]);

const NESTED_CONTEXTS = new Map<string, BashCommandContext>([
  ["command_substitution", "command_substitution"],
  ["process_substitution", "process_substitution"],
]);

const OPAQUE_SHELLS = new Set(["bash", "sh", "dash", "zsh", "ksh"]);

const INDIRECTION_WRAPPERS = new Set([
  "sudo",
  "env",
  "xargs",
  "time",
  "nohup",
  "timeout",
  "nice",
  "parallel",
  "doas",
  "setsid",
  "stdbuf",
  "watch",
  "flock",
]);

const EXEC_CONDITIONAL_WRAPPERS = new Map<string, ReadonlySet<string>>([
  ["find", new Set(["-exec", "-execdir", "-ok", "-okdir"])],
  ["fd", new Set(["-x", "--exec", "-X", "--exec-batch"])],
]);

export function enumerateCommands(node: Parser.SyntaxNode): BashCommand[] {
  const commands: BashCommand[] = [];
  enumerateRecursive(node, undefined, commands);
  return commands;
}

function enumerateRecursive(
  node: Parser.SyntaxNode,
  context: BashCommandContext | undefined,
  out: BashCommand[]
): void {
  if (!node.isNamed) return;
  if (SKIP_TYPES.has(node.type)) return;

  if (node.type === "command") {
    out.push({
      text: stripVariableAssignments(node.text),
      context,
      wrapperKind: classifyWrapper(node),
    });
    enumerateSubstitutions(node, out);
    return;
  }

  if (node.type === "subshell") {
    out.push({ text: node.text, context });
    enumerateChildren(node, "subshell", out);
    return;
  }

  if (DESCEND_TYPES.has(node.type)) {
    enumerateChildren(node, context, out);
    return;
  }

  out.push({ text: node.text, context });
}

function enumerateChildren(
  node: Parser.SyntaxNode,
  context: BashCommandContext | undefined,
  out: BashCommand[]
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) enumerateRecursive(child, context, out);
  }
}

function enumerateSubstitutions(node: Parser.SyntaxNode, out: BashCommand[]): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    const nestedContext = NESTED_CONTEXTS.get(child.type);
    if (nestedContext) {
      if (child.type === "command_substitution" || child.type === "process_substitution") {
        for (let j = 0; j < child.childCount; j++) {
          const inner = child.child(j);
          if (inner) enumerateRecursive(inner, nestedContext, out);
        }
      } else {
        enumerateChildren(child, nestedContext, out);
      }
    } else {
      enumerateSubstitutions(child, out);
    }
  }
}

function stripVariableAssignments(text: string): string {
  return text.replace(/^(\w+=\S+\s+)+/, "");
}

function classifyWrapper(node: Parser.SyntaxNode): WrapperKind | undefined {
  const { commandName, args } = readCommandInfo(node);
  if (!commandName) return undefined;

  if (commandName === "eval") return "opaque-payload";
  if (OPAQUE_SHELLS.has(commandName) && hasShortFlagC(args)) return "opaque-payload";
  if (INDIRECTION_WRAPPERS.has(commandName)) return "indirection";

  const execFlags = EXEC_CONDITIONAL_WRAPPERS.get(commandName);
  if (execFlags && args.some(arg => execFlags.has(arg))) return "indirection";

  return undefined;
}

function readCommandInfo(node: Parser.SyntaxNode): {
  commandName: string | undefined;
  args: string[];
} {
  let commandName: string | undefined;
  const args: string[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child?.isNamed) continue;
    if (child.type === "variable_assignment") continue;

    if (!commandName) {
      commandName = basename(child.text);
    } else {
      args.push(child.text);
    }
  }

  return { commandName, args };
}

function hasShortFlagC(args: string[]): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.includes("c")) {
      return true;
    }
  }
  return false;
}

function basename(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}
