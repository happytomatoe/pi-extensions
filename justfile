# Pi extensions manager
#
# Interactive install/remove of extensions via `pi install`.
#
# Usage:
#   just install           — gum multi-select → pi install each
#   just list             — show available extensions
#   just remove  <name>   — pi remove an extension
#   just install-all      — install every extension
#   just setup-allowlist  — configure DCG allowlist for project work
#   just status           — show what's installed

REPO_DIR := justfile_directory()

# Discover extension dirs (those with a package.json)
_extensions:
    #!/usr/bin/env bash
    for d in {{ REPO_DIR }}/*/; do
        [ -f "$d/package.json" ] || continue
        basename "$d"
    done

# Interactive multi-select picker (gum) → pi install each
install:
    #!/usr/bin/env bash
    set -euo pipefail

    # build list of extension dirs
    exts=()
    while IFS= read -r line; do
        exts+=("$line")
    done < <(
        for d in {{ REPO_DIR }}/*/; do
            [ -f "$d/package.json" ] || continue
            basename "$d"
        done
    )

    if [ ${#exts[@]} -eq 0 ]; then
        echo "No extensions found in {{ REPO_DIR }}" >&2
        exit 1
    fi

    labels=("${exts[@]}")

    echo "Select extensions to install:"
    chosen=$(printf '%s\n' "${labels[@]}" | gum choose --no-limit --header "Extensions" --selected "0" || true)

    if [ -z "$chosen" ]; then
        echo "Nothing selected."
        exit 0
    fi

    installed=0
    while IFS= read -r line; do
        name="$line"
        [ -z "$name" ] && continue
        echo ""
        echo "▸ Installing $name ..."
        if pi install "{{ REPO_DIR }}/$name" 2>&1; then
            installed=$((installed + 1))
        else
            echo "  ⚠️  Failed to install $name"
        fi
    done <<< "$chosen"

    echo ""
    echo "Done. Installed $installed extension(s)."
    echo "Run 'pi config' to enable/disable individual extensions."

    # offer to setup DCG allowlist if forbid-commands was installed
    if echo "$chosen" | grep -q "forbid-commands"; then
        echo ""
        if gum confirm "Set up DCG allowlist for project work? (allows rm/mv in ./ and /tmp/)"; then
            just setup-allowlist
        fi
    fi

# List available extensions
list:
    @echo "Available extensions:"
    @for d in {{ REPO_DIR }}/*/; do \
        name=$(basename "$d"); \
        [ -f "$d/package.json" ] || continue; \
        desc=""; \
        if [ -f "$d/README.md" ]; then \
            desc=$(sed -n '3p' "$d/README.md" | sed 's/^[# ]*//'); \
        fi; \
        printf "  %-30s %s\n" "$name" "$desc"; \
    done

# Remove an extension via pi remove
remove name:
    #!/usr/bin/env bash
    set -euo pipefail
    pi remove "{{ name }}"

# Install all extensions
install-all:
    #!/usr/bin/env bash
    set -euo pipefail
    count=0
    for d in {{ REPO_DIR }}/*/; do
        [ -f "$d/package.json" ] || continue
        name=$(basename "$d")
        echo "▸ Installing $name ..."
        pi install "$d" 2>&1 && count=$((count + 1))
    done
    echo "Done. Installed $count extension(s)."

# Configure DCG allowlist for project work
# Allows: rm/mv in current dir, rm -rf /tmp/*, git operations
setup-allowlist:
    #!/usr/bin/env bash
    set -euo pipefail

    if ! command -v dcg &>/dev/null; then
        echo "⚠️  dcg not found. Install it first:"
        echo "   curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/destructive_command_guard/main/install.sh | bash -s -- --easy-mode"
        exit 1
    fi

    echo "Configuring DCG allowlist for project work..."

    # Allow rm in current directory and subdirectories
    dcg allowlist add-command "rm " -r "Allow rm in project work" --user 2>/dev/null && \
        echo "  ✓ rm (project work)" || echo "  ⚠ rm rule may already exist"

    # Allow rm -rf /tmp/*
    dcg allowlist add-command "rm -rf /tmp/" -r "Allow cleaning /tmp" --user 2>/dev/null && \
        echo "  ✓ rm -rf /tmp/*" || echo "  ⚠ /tmp cleanup rule may already exist"

    # Allow mv in current directory
    dcg allowlist add-command "mv " -r "Allow mv in project work" --user 2>/dev/null && \
        echo "  ✓ mv (project work)" || echo "  ⚠ mv rule may already exist"

    # Allow cp in current directory
    dcg allowlist add-command "cp " -r "Allow cp in project work" --user 2>/dev/null && \
        echo "  ✓ cp (project work)" || echo "  ⚠ cp rule may already exist"

    # Allow mkdir
    dcg allowlist add-command "mkdir " -r "Allow mkdir" --user 2>/dev/null && \
        echo "  ✓ mkdir" || echo "  ⚠ mkdir rule may already exist"

    # Allow touch
    dcg allowlist add-command "touch " -r "Allow touch" --user 2>/dev/null && \
        echo "  ✓ touch" || echo "  ⚠ touch rule may already exist"

    # Allow sed -i for file editing
    dcg allowlist add-command "sed -i" -r "Allow sed -i for file editing" --user 2>/dev/null && \
        echo "  ✓ sed -i" || echo "  ⚠ sed -i rule may already exist"

    # Allow git push (user's own repos)
    dcg allowlist add-command "git push" -r "Allow git push" --user 2>/dev/null && \
        echo "  ✓ git push" || echo "  ⚠ git push rule may already exist"

    # Allow git force push on feature branches
    dcg allowlist add-command "git push --force origin " -r "Allow force push on feature branches" --user 2>/dev/null && \
        echo "  ✓ git push --force (feature branches)" || echo "  ⚠ git force push rule may already exist"

    echo ""
    echo "Done. Current allowlist:"
    dcg allowlist list --user 2>/dev/null || true
    echo ""
    echo "⚠️  Note: These are user-level rules. Some rules use command prefixes."
    echo "   Test with: dcg test 'rm ./foo.txt'"

# Show what's installed
status:
    #!/usr/bin/env bash
    echo "=== pi list ==="
    pi list 2>&1 || true
    echo ""
    echo "=== Available in repo ==="
    for d in {{ REPO_DIR }}/*/; do
        [ -f "$d/package.json" ] || continue
        name=$(basename "$d")
        printf "  %s\n" "$name"
    done
    echo ""
    echo "=== DCG allowlist ==="
    if command -v dcg &>/dev/null; then
        dcg allowlist list --user 2>/dev/null || echo "(empty)"
    else
        echo "(dcg not installed)"
    fi
