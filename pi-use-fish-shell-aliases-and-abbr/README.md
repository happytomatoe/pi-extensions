# Fish Shell Abbreviations & Aliases Extension

A Pi extension that reads fish shell abbreviations at session start and expands them in user input.

## Features

- **Automatic expansion**: Type `pr` in the editor → expands to `gh pr view --web`
- **Word-boundary matching**: `agc` stays as `agc` (no false expansion)
- **185+ abbreviations**: Reads all your fish abbreviations at startup
- **`/abbr` command**: List or filter abbreviations with `/abbr [filter]`

## Usage

### Interactive Mode
```bash
pi -e ./pi-use-fish-shell-aliases-and-abbr.ts
```

Then in the editor:
- Type `pr` → expands to `gh pr view --web`
- Type `gc fix bug` → expands to `git commit -v fix bug`
- Type `/abbr` → lists all abbreviations

### Non-Interactive Mode
```bash
pi -e ./pi-use-fish-shell-aliases-and-abbr.ts -p "pr"
```

## How It Works

1. **Session start**: Reads abbreviations from `fish -c 'abbr --show'`
2. **User input**: Intercepts the `input` event before sending to LLM
3. **Expansion**: Replaces abbreviations with their values (word-boundary matching)
4. **Notification**: Shows "Expanded: X → Y" notification

## Configuration

No configuration needed. The extension reads abbreviations directly from fish shell.

## Requirements

- Fish shell installed
- Fish abbreviations defined (use `abbr --add` to create them)

## License

MIT
