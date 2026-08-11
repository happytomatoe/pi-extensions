# TODO

## Future Features

### cd + rm support
When LLM uses `cd` to change into a subfolder and then removes a file, the extension should handle this case.

**Example:**
```bash
cd src && rm file.txt
```

**Current behavior:** `rm file.txt` is evaluated separately and may be denied.

**Desired behavior:** Track directory changes and evaluate `rm` in the context of the new directory.

**Complexity:** High - requires tracking cwd changes across chained commands.

---

### Allow removing files in current directory
Add patterns to allow common current-directory removal operations:

- `rm file.txt` - remove file in current dir
- `rm ./file.txt` - same with explicit ./
- `rm subdir/` - remove directory in current dir
- `rm -rf subdir/` - recursive remove in current dir

**⚠️ WARNING:** Do NOT add broad patterns like `rm */*` or `rm *.*` to the allow block. These patterns:
- Can match path traversal attempts (e.g., `rm ../file.txt`)
- Override deny rules due to last-match-wins behavior
- Create security vulnerabilities

**Safe approach:** Use explicit `./` prefix patterns like `rm ./*` which are already implemented.

**Note:** The current implementation already handles this correctly with `rm ./*` patterns.
