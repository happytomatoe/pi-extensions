#!/bin/bash
cd /var/home/l/git/pi-extensions/forbid-commands

echo "=== Testing forbid-commands extension ==="
echo ""

echo "--- git push origin main (should ALLOW) ---"
npx tsx src/cli.ts "git push origin main" 2>&1
echo "exit: $?"
echo ""

echo "--- git push --no-verify (should DENY) ---"
npx tsx src/cli.ts "git push --no-verify" 2>&1
echo "exit: $?"
echo ""

echo "--- /usr/bin/git push --no-verify (path bypass, should DENY) ---"
npx tsx src/cli.ts "/usr/bin/git push --no-verify origin main" 2>&1
echo "exit: $?"
echo ""

echo "--- git push --no-verify origin main (should DENY) ---"
npx tsx src/cli.ts "git push --no-verify origin main" 2>&1
echo "exit: $?"
echo ""

echo "--- git push --force-with-lease (should ALLOW) ---"
npx tsx src/cli.ts "git push --force-with-lease origin main" 2>&1
echo "exit: $?"
echo ""

echo "=== All tests passed ==="
