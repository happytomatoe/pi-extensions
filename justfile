# Pi extensions manager
#
# Interactive install/remove of extensions via `pi install`.
#
# Usage:
#   just pick             — gum multi-select → pi install each
#   just list             — show available extensions
#   just install <name>   — pi install a single extension
#   just remove  <name>   — pi remove an extension
#   just install-all      — install every extension
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
pick:
    #!/usr/bin/env bash
    set -euo pipefail

    # build list of extension dirs
    mapfile -t exts < <(
        for d in {{ REPO_DIR }}/*/; do
            [ -f "$d/package.json" ] || continue
            basename "$d"
        done
    )

    if [ ${#exts[@]} -eq 0 ]; then
        echo "No extensions found in {{ REPO_DIR }}" >&2
        exit 1
    fi

    # build label list: "name — description"
    labels=()
    for name in "${exts[@]}"; do
        desc=""
        if [ -f "{{ REPO_DIR }}/$name/README.md" ]; then
            desc=$(sed -n '3p' "{{ REPO_DIR }}/$name/README.md" | sed 's/^[# ]*//')
        fi
        labels+=("$name — $desc")
    done

    echo "Select extensions to install:"
    chosen=$(printf '%s\n' "${labels[@]}" | gum choose --no-limit --header "Extensions" --selected "0" 2>/dev/null || true)

    if [ -z "$chosen" ]; then
        echo "Nothing selected."
        exit 0
    fi

    installed=0
    skipped=0
    while IFS= read -r line; do
        name=$(echo "$line" | cut -d' —' -f1)
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

# Install a single extension via pi install
install name:
    #!/usr/bin/env bash
    set -euo pipefail
    src="{{ REPO_DIR }}/{{ name }}"
    if [ ! -d "$src" ] || [ ! -f "$src/package.json" ]; then
        echo "Extension '{{ name }}' not found in {{ REPO_DIR }}" >&2
        echo "Run 'just list' to see available extensions" >&2
        exit 1
    fi
    pi install "$src"

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
