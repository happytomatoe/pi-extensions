import { tokenizeArgs } from 'args-tokenizer';
import type { CommandPattern } from './types';

/**
 * Parse a command string into structured CommandPattern
 */
export function parseCommandString(input: string): CommandPattern {
  try {
    const tokens = tokenizeArgs(input);
    
    if (tokens.length === 0) {
      return { command: '', flags: [], flagArgs: [], raw: input };
    }
    
    let command = tokens[0];
    let subcommand: string | undefined;
    const flags: string[] = [];
    const flagArgs: string[] = [];
    
    // Git-specific: extract subcommand
    if (command === 'git' && tokens.length > 1 && !tokens[1].startsWith('-')) {
      subcommand = tokens[1];
    }
    
    // Start from index 1 (skip command itself)
    // For git, skip subcommand too
    const startIndex = (command === 'git' && subcommand) ? 2 : 1;
    
    // Extract flags and their arguments
    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.startsWith('-')) {
        flags.push(token);
      } else {
        flagArgs.push(token);
      }
    }
    
    return { command, subcommand, flags, flagArgs, raw: input };
  } catch {
    // Fallback: simple split
    const parts = input.split(/\s+/);
    return {
      command: parts[0] || '',
      flags: parts.filter(p => p.startsWith('-')),
      flagArgs: parts.filter(p => !p.startsWith('-') && p !== parts[0]),
      raw: input,
    };
  }
}

/**
 * Check if a pattern matches an actual command.
 * Pattern is a subset of actual (all pattern flags must be present).
 */
export function patternMatches(pattern: CommandPattern, actual: CommandPattern): boolean {
  // Command must match exactly
  if (pattern.command !== actual.command) return false;
  
  // Subcommand must match if specified
  if (pattern.subcommand && pattern.subcommand !== actual.subcommand) return false;
  
  // All pattern flags must be present in actual
  if (pattern.flags.length > 0) {
    return pattern.flags.every(f => actual.flags.includes(f));
  }
  
  // If no flags specified, just command/subcommand match is enough
  return true;
}
