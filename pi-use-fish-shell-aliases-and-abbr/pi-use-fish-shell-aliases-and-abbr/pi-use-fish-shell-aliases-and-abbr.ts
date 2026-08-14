/**
 * Fish Shell Abbreviations & Aliases Extension
 *
 * Reads fish abbreviations at session start and expands them in user input.
 *
 * Usage:
 *   pi -e ./pi-use-fish-shell-aliases-and-abbr.ts
 *
 * Or place in ~/.pi/agent/extensions/ for auto-discovery.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Regex to parse `abbr -a -- key value` or `abbr -a -- key 'value'`
const ABBR_LINE_RE = /^abbr -a -- (\S+)\s+(.+)$/;

// Match word boundaries: start of string or space before the abbreviation,
// and end of string or space/punctuation after it
function makeAbbrPattern(abbr: string): RegExp {
  // Escape special regex characters in the abbreviation
  const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)(${escaped})(?=\\s|$|[;|&])`, "g");
}

export default function (pi: ExtensionAPI) {
  let abbreviations: Record<string, string> = {};

  // Parse abbreviations from fish output
  function parseAbbrOutput(output: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const match = ABBR_LINE_RE.exec(line.trim());
      if (match) {
        const [, key, value] = match;
        // Remove surrounding quotes if present
        result[key] = value.replace(/^['"]|['"]$/g, "");
      }
    }
    return result;
  }

  // Read abbreviations from fish
  async function loadAbbreviations(): Promise<Record<string, string>> {
    try {
      const result = await pi.exec("bash", [
        "-c",
        "fish -c 'abbr --show'",
      ]);
      if (result.code === 0 && result.stdout) {
        return parseAbbrOutput(result.stdout);
      }
    } catch {
      // fish not available or abbr command failed
    }
    return {};
  }

  // Expand abbreviations in text (word-boundary matching)
  function expandText(text: string): string {
    if (Object.keys(abbreviations).length === 0) return text;

    let result = text;
    // Sort by length descending so longer abbreviations match first
    // (e.g., "gaa" before "ga" before "g")
    const sorted = Object.keys(abbreviations).sort(
      (a, b) => b.length - a.length,
    );

    for (const abbr of sorted) {
      const pattern = makeAbbrPattern(abbr);
      result = result.replace(pattern, (match, captured, offset) => {
        const prefix = match.slice(0, match.indexOf(captured));
        return `${prefix}${abbreviations[abbr]}`;
      });
    }

    return result;
  }

  // Load abbreviations at session start
  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "reload") {
      abbreviations = await loadAbbreviations();
      const count = Object.keys(abbreviations).length;
      if (count > 0) {
        ctx.ui.notify(`Loaded ${count} fish abbreviations`, "info");
      }
    }
  });

  // Expand user input
  pi.on("input", async (event, ctx) => {
    // Skip extension-injected messages
    if (event.source === "extension") {
      return { action: "continue" };
    }

    // Skip if no abbreviations loaded
    if (Object.keys(abbreviations).length === 0) {
      return { action: "continue" };
    }

    // Skip whole-line bash commands (! prefix)
    if (event.text.trimStart().startsWith("!")) {
      return { action: "continue" };
    }

    const expanded = expandText(event.text);

    if (expanded !== event.text) {
      // Show what was expanded
      ctx.ui.notify(
        `Expanded: ${event.text.slice(0, 40)}${event.text.length > 40 ? "..." : ""} → ${expanded.slice(0, 40)}${expanded.length > 40 ? "..." : ""}`,
        "info",
      );
      return { action: "transform", text: expanded, images: event.images };
    }

    return { action: "continue" };
  });

  // /abbr command to list abbreviations
  pi.registerCommand("abbr", {
    description: "List fish shell abbreviations",
    handler: async (args, ctx) => {
      const entries = Object.entries(abbreviations);

      if (entries.length === 0) {
        ctx.ui.notify("No abbreviations loaded", "warning");
        return;
      }

      // Filter by prefix if argument provided
      const filter = args.trim().toLowerCase();
      const filtered = filter
        ? entries.filter(
            ([key, value]) =>
              key.toLowerCase().includes(filter) ||
              value.toLowerCase().includes(filter),
          )
        : entries;

      if (filtered.length === 0) {
        ctx.ui.notify(
          `No abbreviations matching "${filter}" (${entries.length} total)`,
          "warning",
        );
        return;
      }

      // Print to output
      const lines = filtered.map(([key, value]) => `  ${key} → ${value}`);
      const header = `Fish abbreviations${filter ? ` matching "${filter}"` : ""} (${filtered.length}/${entries.length}):\n`;
      console.log(header + lines.join("\n"));
    },
  });
}
