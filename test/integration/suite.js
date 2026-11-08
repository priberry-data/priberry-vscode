// Runs inside VS Code (via --extensionTestsPath) against the installed extension and
// exercises the three features. Writes a JSON result to PRIBERRY_TEST_OUT.
"use strict";
const vscode = require("vscode");
const fs = require("fs");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 180000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await wait(500);
  }
  return null;
}

exports.run = async function () {
  const out = { checks: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail });
  try {
    const ext = vscode.extensions.getExtension("priberry.priberry-vscode");
    check("extension found", !!ext, ext && ext.extensionPath);
    const api = await ext.activate();

    // 1. Status bar fills in from `tare --json`.
    const status = await until(() => /avoidable|no data/.test(api.statusText()) && api.statusText());
    check("status bar shows spend and avoidable share", status && /avoidable/.test(status), status);
    await api.showTareReport();
    const tare = await until(() => /avoidable/.test(api.tareHtml() || "") && api.tareHtml(), 30000);
    check("Tare report webview renders with the fix button", tare && tare.includes('data-action="fix"'), tare && tare.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400));

    // 2. Workspace scan lands in the Problems panel on the right files.
    await api.scanWorkspace({ quiet: true });
    const diags = vscode.languages.getDiagnostics().filter(([, d]) => d.some((x) => x.source === "Crumple"));
    const list = diags.flatMap(([uri, d]) => d.map((x) => `${vscode.workspace.asRelativePath(uri)}:${x.range.start.line + 1} [${x.code}] ${x.message.slice(0, 70)}`));
    check("scan findings in Problems panel", list.length > 0, list);
    check("finding mapped to .mcp.json line of the server", list.some((l) => /^\.mcp\.json:3 /.test(l)));
    check("finding mapped to CLAUDE.md", list.some((l) => /^CLAUDE\.md:/.test(l)));

    // 3. Deployed app check.
    await api.checkSite(process.env.PRIBERRY_TEST_SITE || "https://priberry.com");
    const site = api.siteHtml();
    const grade = site && (site.match(/class="grade[^"]*">([A-F])</) || [])[1];
    check("site check webview shows a grade", !!grade, grade);
    check("site findings have copy buttons when there are prompts", site && (site.includes('data-action="copy"') || !/<pre>/.test(site)), (site || "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script[\s\S]*?<\/script>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600));

    // 4. Commands are registered.
    const cmds = await vscode.commands.getCommands(true);
    const ours = ["priberry.showTareReport", "priberry.refreshTare", "priberry.scanWorkspace", "priberry.checkSite", "priberry.setupApps"];
    check("all commands registered", ours.every((c) => cmds.includes(c)), ours.filter((c) => !cmds.includes(c)));
  } catch (e) {
    check("no exception", false, String(e && e.stack));
  }
  fs.writeFileSync(process.env.PRIBERRY_TEST_OUT, JSON.stringify(out, null, 2));
  if (out.checks.some((c) => !c.ok)) throw new Error("integration checks failed");
};
