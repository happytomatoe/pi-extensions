# Pi extensions manager
#
# Install/remove extensions from this repo into ~/.pi/agent/extensions/
#
# Usage:
#   just list                  — show available extensions
#   just install <name>        — copy extension to ~/.pi/agent/extensions/
#   just remove  <name>        — remove extension from ~/.pi/agent/extensions/
#   just install-all           — install all extensions
#   just status                — show what's installed

PI_EXT_DIR := home_directory() / ".pi/agent/extensions"
REPO_DIR := justfile_directory()

# List available extensions
list:
    @echo "Available extensions:"
    @for d in {{ REPO_DIR }}/*/; do \
        name=$(basename "$d"); \
        if [ -f "$d/package.json" ] || [ -f "$d"/*.ts ] 2>/dev/null; then \
            desc=""; \
            if [ -f "$d/README.md" ]; then \
                desc=$(head -3 "$d/README.md" | grep -v "^#" | grep -v "^$" | head -1); \
            fi; \
            printf "  %-30s %s\n" "$name" "$desc"; \
        fi; \
    done

# Install an extension (copies to ~/.pi/agent/extensions/)
install name:
    #!/usr/bin/env bash
    set -euo pipefail
    src="{{ REPO_DIR }}/{{ name }}"
    dst="{{ PI_EXT_DIR }}/{{ name }}"
    if [ ! -d "$src" ]; then
        echo "Extension '{{ name }}' not found in {{ REPO_DIR }}" >&2
        echo "Run 'just list' to see available extensions" >&2
        exit 1
    fi
    if [ -e "$dst" ]; then
        echo "'$dst' already exists. Use 'just remove {{ name }}' first, or 'just update {{ name }}'." >&2
        exit 1
    fi
    cp -r "$src" "$dst"
    echo "✅ Installed {{ name }} -> $dst"
    echo "   Add to ~/.pi/settings.json extensions to enable."

# Update an extension (re-copy, overwriting)
update name:
    #!/usr/bin/env bash
    set -euo pipefail
    src="{{ REPO_DIR }}/{{ name }}"
    dst="{{ PI_EXT_DIR }}/{{ name }}"
    if [ ! -d "$src" ]; then
        echo "Extension '{{ name }}' not found in {{ REPO_DIR }}" >&2
        exit 1
    fi
    if [ ! -e "$dst" ]; then
        echo "'$dst' does not exist. Use 'just install {{ name }}' first." >&2
        exit 1
    fi
    rm -r "$dst"
    cp -r "$src" "$dst"
    echo "✅ Updated {{ name }}"

# Remove an extension
remove name:
    #!/usr/bin/env bash
    set -euo pipefail
    dst="{{ PI_EXT_DIR }}/{{ name }}"
    if [ ! -e "$dst" ]; then
        echo "'{{ name }}' is not installed at $dst" >&2
        exit 1
    fi
    rm -r "$dst"
    echo "🗑️  Removed {{ name }} from $dst"
    echo "   Remember to remove it from ~/.pi/settings.json if listed."

# Install all extensions
install-all:
    #!/usr/bin/env bash
    set -euo pipefail
    count=0
    for d in {{ REPO_DIR }}/*/; do
        name=$(basename "$d")
        # skip the repo root files (README, justfile, etc.)
        [ -f "$d/package.json" ] || continue
        dst="{{ PI_EXT_DIR }}/$name"
        if [ -e "$dst" ]; then
            echo "⏭️  $name — already installed, skipping"
            continue
        fi
        cp -r "$d" "$dst"
        echo "✅ Installed $name"
        count=$((count + 1))
    done
    echo "Done. Installed $count extension(s)."

# Show what's installed
status:
    #!/usr/bin/env bash
    echo "=== Installed in ~/.pi/agent/extensions/ ==="
    if [ ! -d "{{ PI_EXT_DIR }}" ]; then
        echo "(directory does not exist)"
        exit 0
    fi
    for d in {{ PI_EXT_DIR }}/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        in_repo="no"
        [ -d "{{ REPO_DIR }}/$name" ] && in_repo="yes"
        printf "  %-30s repo=%s\n" "$name" "$in_repo"
    done
    echo ""
    echo "=== In ~/.pi/settings.json ==="
    python3 -c "import json; d=json.load(open('$HOME/.pi/settings.json')); [print(f'  {e}') for e in d.get('extensions',[])]" 2>/dev/null || echo "  (no extensions configured)"
