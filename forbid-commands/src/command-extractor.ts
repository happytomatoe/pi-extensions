/**
 * Extract commands from different tool schemas
 */

// Known tools that can execute commands
const COMMAND_TOOLS = new Set([
  "bash",
  "shell_use",
  "shell-use",
  "herdr",
  "tmux_run",
  "tmux-run",
  "user_bash",
]);

/**
 * Extract command from different tool schemas
 */
export function extractCommandFromTool(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  switch (toolName) {
    case "bash":
    case "user_bash":
      return typeof input.command === "string" ? input.command : null;
    
    case "shell_use":
    case "shell-use":
      // shell-use submit/run commands
      return typeof input.command === "string" ? input.command : 
             typeof input.code === "string" ? input.code : null;
    
    case "herdr":
      // herdr agent send commands
      if (typeof input.command === "string") {
        return input.command;
      }
      // herdr pane run commands
      if (typeof input.text === "string") {
        return input.text;
      }
      return null;
    
    case "tmux_run":
    case "tmux-run":
      // tmux send-keys commands
      return typeof input.command === "string" ? input.command :
             typeof input.keys === "string" ? input.keys : null;
    
    default:
      return null;
  }
}

/**
 * Check if a tool name is a command execution tool
 */
export function isCommandTool(toolName: string): boolean {
  return COMMAND_TOOLS.has(toolName);
}
