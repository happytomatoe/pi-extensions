# Pi Extension Startup Performance Guide

## Goal

Each extension should load in **<200ms** (module import time only).

## Measuring Startup Time

```bash
PI_TIMING=1 pi
```

Output shows:
```
--- Startup Timings: extensions ---
  pi-readseek/dist/index.ts module import: 37ms
  pi-goal-list-loop-audit/extensions/loops/goal.ts module import: 306ms
  pi-dynamic-workflows/extensions/workflow.ts module import: 804ms
```

**Target**: `module import` time < 200ms per extension.

---

## Why Extensions Are Slow

| Cause | Example | Impact |
|-------|---------|--------|
| **Multiple files** | pi-goal-list-loop-audit (16 files) | 306ms |
| **Many JS modules** | pi-dynamic-workflows (90+ files) | 804ms |
| **jiti transpilation** | Any unbundled TypeScript | 50-200ms overhead (cold start) |

---

## Optimization Strategy 1: Bundle with Bun

**The primary optimization from past sessions.**

Compile all TypeScript/JavaScript files into a **single bundled file** using Bun.

### Before (Slow)
```
my-extension/
├── extensions/
│   ├── index.ts
│   ├── loops/
│   │   ├── goal.ts
│   │   ├── list.ts
│   │   └── audit.ts
│   └── utils.ts
└── package.json
```

Each file is loaded and transpiled separately by jiti → **slow**.

### After (Fast)
```
my-extension/
├── dist/
│   └── index.ts    ← Single bundled file (all code compiled)
└── package.json
```

One file to load → **fast**.

### How to Bundle

Add to `package.json`:

```json
{
  "scripts": {
    "build": "bun build index.ts --outfile dist/index.ts --target=node --packages=external",
    "prepack": "npm run build"
  }
}
```

Run:
```bash
npm run build
```

### Example: pi-readseek

```json
"scripts": {
  "build": "bun build index.ts --outfile dist/index.ts --target=node --packages=external"
}
```

Result:
- **Before**: Multiple TypeScript files loaded by jiti
- **After**: Single 282KB `dist/index.ts`
- **Import time**: 37ms ✅

---

## Optimization Strategy 2: Bundle into Pi Binary

For extensions bundled with Pi itself (not npm packages).

### How It Works

1. Extension is copied to a staging area
2. `bun install` resolves peer deps locally
3. `bun build --compile` embeds everything into the Pi binary

### Result

From handoff documents:
- **Jiti baseline** (extensions loaded at runtime): ~4.0s
- **Bundled binary** (6 extensions embedded): ~1.86s
- **~2x faster** startup

> **Note**: These measurements are anecdotal and may vary based on system load, Pi version, and extension set. For reproducible results, measure with `PI_TIMING=1 pi` and report the exact versions used.

### Key Files

- `packages/coding-agent/scripts/gen-bundled-extensions.mjs` - Staging + generation
- `packages/coding-agent/scripts/build-bundled-binary.mjs` - Compilation
- `packages/coding-agent/src/core/extensions/loader.ts` - Short-circuit loader

---

## Optimization Strategy 3: npm install for Extensions

For extensions with dependencies, use `npm install` to pre-resolve them.

### Problem

Extensions that rely on peer deps (e.g., `@sinclair/typebox`) must resolve them at runtime.

### Solution

```bash
# In extension directory
npm install

# Or for Pi-managed extensions
pi install npm:my-extension
```

This ensures dependencies are available without runtime resolution.

---

## Extension-Specific Optimization Plans

### pi-goal-list-loop-audit (306ms → <200ms)

**Current state**: 16 TypeScript files in `extensions/` folder, no bundling.

**Optimization**:
1. Add `bun build` script to `package.json`
2. Bundle all files into single `dist/index.ts`
3. Update `pi.extensions` to point to bundled file

```json
{
  "scripts": {
    "build": "bun build extensions/loops/goal.ts --outfile dist/index.ts --target=node --packages=external"
  },
  "pi": {
    "extensions": ["./dist/index.ts"]
  }
}
```

### pi-dynamic-workflows (804ms → <200ms)

**Current state**: 90+ JavaScript files in `dist/`, not bundled.

**Optimization**:
1. Create a single entry point that imports all needed modules
2. Bundle with `bun build`
3. Replace `dist/` folder with single bundled file

```json
{
  "scripts": {
    "build": "bun build extensions/workflow.ts --outfile dist/workflow-bundled.ts --target=node --packages=external"
  }
}
```

### pi-user-message-border (155ms → <100ms)

**Current state**: Check if already bundled or needs optimization.

---

## Checklist for Extension Authors

- [ ] Bundle all TypeScript files into single output
- [ ] Use `bun build --target=node --packages=external`
- [ ] Set `pi.extensions` to point to bundled file
- [ ] Add `prepack` script to auto-build before publish
- [ ] Test with `PI_TIMING=1 pi` to verify <200ms

---

## References

- [Pi Extensions Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- Handoff: `bundle-pi-extensions-staging-area.md` - Binary bundling implementation
- Handoff: `fit-bundle-bundling-extensions.md` - Staging area approach
- pi-readseek `package.json` - Example of bundled extension
