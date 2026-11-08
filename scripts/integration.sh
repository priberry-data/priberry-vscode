#!/bin/sh
# Installs the packaged .vsix into a throwaway VS Code profile and runs test/integration/suite.js
# inside real VS Code against test/fixture/demo-app. Workspace trust is switched off in that
# throwaway profile only, so the scan runs without a click.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CODE_APP="${CODE_APP:-/Applications/Visual Studio Code.app}"
TMP=$(mktemp -d)
mkdir -p "$TMP/user/User"
echo '{ "security.workspace.trust.enabled": false, "extensions.autoUpdate": false }' > "$TMP/user/User/settings.json"
"$CODE_APP/Contents/Resources/app/bin/code" --user-data-dir "$TMP/user" --extensions-dir "$TMP/ext" --install-extension "$ROOT"/priberry-vscode-*.vsix >/dev/null 2>&1
EXT=$(ls -d "$TMP"/ext/priberry.priberry-vscode-*)
export PRIBERRY_TEST_OUT="$TMP/result.json"
"$CODE_APP/Contents/MacOS/$(ls "$CODE_APP/Contents/MacOS" | head -1)" --user-data-dir "$TMP/user" --extensions-dir "$TMP/ext" \
  --extensionDevelopmentPath="$EXT" --extensionTestsPath="$ROOT/test/integration/suite.js" \
  --disable-workspace-trust --skip-welcome --skip-release-notes --new-window "$ROOT/test/fixture/demo-app" >"$TMP/vscode.log" 2>&1 || true
cat "$PRIBERRY_TEST_OUT"
cp "$TMP"/user/logs/*/window1/exthost/output_logging_*/*Priberry*.log "$TMP/priberry-output.log" 2>/dev/null && echo "Output channel: $TMP/priberry-output.log"
node -e 'process.exit(require(process.argv[1]).checks.every(c=>c.ok)?0:1)' "$PRIBERRY_TEST_OUT"
