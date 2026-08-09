# Pi Extension Optimization

This folder contains guides and tools for optimizing Pi extension startup performance.

## Contents

- [STARTUP-PERF.md](./STARTUP-PERF.md) - Comprehensive guide to optimizing extension startup time

## Quick Start

1. Measure current performance:
   ```bash
   PI_TIMING=1 pi
   ```

2. Identify slow extensions (look for `module import` times > 50ms)

3. Apply optimization strategies from the guide

4. Re-measure to verify improvement

## Common Issues

| Issue | Typical Impact | Solution |
|-------|----------------|----------|
| Heavy npm dependencies | 100-500ms | Use lighter alternatives, lazy load |
| Top-level imports | 50-300ms | Move to dynamic imports |
| Synchronous I/O | 10-100ms | Defer to `session_start` |
| Large module trees | 200-800ms | Split into smaller modules |

## Contributing

If you've optimized an extension, add your findings to `STARTUP-PERF.md` or open a PR.
