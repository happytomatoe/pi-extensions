import { describe, it, expect } from 'vitest';
import { parseCommandString, patternMatches } from '../src/command-parser';

describe('parseCommandString', () => {
  it('parses simple command', () => {
    const result = parseCommandString('git push');
    expect(result).toEqual({
      command: 'git',
      subcommand: 'push',
      flags: [],
      flagArgs: [],
      raw: 'git push'
    });
  });

  it('parses command with flags', () => {
    const result = parseCommandString('git push --no-verify');
    expect(result).toEqual({
      command: 'git',
      subcommand: 'push',
      flags: ['--no-verify'],
      flagArgs: [],
      raw: 'git push --no-verify'
    });
  });

  it('parses command with arguments', () => {
    const result = parseCommandString('git push origin main --no-verify');
    expect(result).toEqual({
      command: 'git',
      subcommand: 'push',
      flags: ['--no-verify'],
      flagArgs: ['origin', 'main'],
      raw: 'git push origin main --no-verify'
    });
  });

  it('parses non-git command', () => {
    const result = parseCommandString('rm /tmp/file.txt');
    expect(result).toEqual({
      command: 'rm',
      subcommand: undefined,
      flags: [],
      flagArgs: ['/tmp/file.txt'],
      raw: 'rm /tmp/file.txt'
    });
  });

  it('parses command with short flags', () => {
    const result = parseCommandString('git commit -n');
    expect(result).toEqual({
      command: 'git',
      subcommand: 'commit',
      flags: ['-n'],
      flagArgs: [],
      raw: 'git commit -n'
    });
  });

  it('parses command with multiple flags', () => {
    const result = parseCommandString('git push -f --force-with-lease');
    expect(result).toEqual({
      command: 'git',
      subcommand: 'push',
      flags: ['-f', '--force-with-lease'],
      flagArgs: [],
      raw: 'git push -f --force-with-lease'
    });
  });
});

describe('patternMatches', () => {
  it('matches exact command', () => {
    const pattern = parseCommandString('git push');
    const actual = parseCommandString('git push');
    expect(patternMatches(pattern, actual)).toBe(true);
  });

  it('matches with additional flags', () => {
    const pattern = parseCommandString('git push --no-verify');
    const actual = parseCommandString('git push origin main --no-verify');
    expect(patternMatches(pattern, actual)).toBe(true);
  });

  it('does not match different command', () => {
    const pattern = parseCommandString('git push');
    const actual = parseCommandString('git commit');
    expect(patternMatches(pattern, actual)).toBe(false);
  });

  it('does not match different subcommand', () => {
    const pattern = parseCommandString('git push --no-verify');
    const actual = parseCommandString('git commit --no-verify');
    expect(patternMatches(pattern, actual)).toBe(false);
  });

  it('does not match missing flag', () => {
    const pattern = parseCommandString('git push --no-verify');
    const actual = parseCommandString('git push origin main');
    expect(patternMatches(pattern, actual)).toBe(false);
  });

  it('matches -n flag as alternative', () => {
    const pattern = parseCommandString('git commit -n');
    const actual = parseCommandString('git commit -n');
    expect(patternMatches(pattern, actual)).toBe(true);
  });

  it('matches --force flag', () => {
    const pattern = parseCommandString('git push --force');
    const actual = parseCommandString('git push origin main --force');
    expect(patternMatches(pattern, actual)).toBe(true);
  });
});
