"use strict";

const vscode = require("vscode");
const core = require("./core");

let output;
let statusItem;
let diagnostics;
let timer;
let tarePanel;
let lastTare = null;
let lastTareAt = null;
let tareRunning = null;
let sitePanel;
let lastSite = null;
let lastScan = null;

const cfg = () => vscode.workspace.getConfiguration("priberry");
const now = () => new Date().toLocaleString();

function log(line) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
}

// Run a Tare or Crumple command, logging what ran and any stderr to the output channel.
async function runTool(tool, args, cwd) {
  const command = cfg().get(`${tool}.command`);
  log(`${command} ${args.join(" ")}${cwd ? `   (in ${cwd})` : ""}`);
  const r = await core.run(command, args, { cwd });
  if (r.error) log(`  could not start: ${r.error}`);
  if (r.stderr.trim()) log(r.stderr.trim().split("\n").map((l) => "  " + l).join("\n"));
  log(`  exit ${r.code}`);
  return r;
}

// ---- Tare: status bar + report -------------------------------------------------------------

function refreshTare() {
  if (tareRunning) return tareRunning;
  statusItem.text = "$(sync~spin) Tare";
  statusItem.tooltip = "Tare is reading your AI agent logs on this machine…";
  tareRunning = (async () => {
    const r = await runTool("tare", ["--json"]);
    const data = r.code === 0 ? core.parseJson(r.stdout) : null;
    if (data && typeof data.usd === "number") {
      lastTare = data;
      lastTareAt = now();
      const s = core.summarizeTare(data);
      statusItem.text = `$(pulse) ${core.money(s.usd)} · ${s.share}% avoidable`;
      const md = new vscode.MarkdownString(
        `**Tare** · last ${s.days} days of AI agent use\n\n` +
          `${core.money(s.usd)} API-equivalent spend across ${s.sessions} sessions\n\n` +
          `${core.money(s.avoidable)} of it was avoidable (${s.share}%)\n\n` +
          `Read from logs on this machine. Click for the full report.`
      );
      statusItem.tooltip = md;
    } else {
      statusItem.text = "$(pulse) Tare: no data";
      statusItem.tooltip = "Tare could not read agent logs (see Output → Priberry). Click to retry.";
    }
    if (tarePanel) renderTare();
  })().finally(() => (tareRunning = null));
  return tareRunning;
}

function renderTare() {
  const opts = { nonce: core.nonce(), cspSource: tarePanel.webview.cspSource, updated: lastTareAt };
  tarePanel.webview.html = lastTare
    ? core.tareHtml(lastTare, opts)
    : `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:20px"><p>Reading your agent logs…</p></body></html>`;
}

async function showTareReport() {
  if (tarePanel) {
    tarePanel.reveal();
  } else {
    tarePanel = vscode.window.createWebviewPanel("priberry.tare", "Tare: AI agent spend", vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    tarePanel.onDidDispose(() => (tarePanel = undefined));
    tarePanel.webview.onDidReceiveMessage((m) => {
      if (m.action === "fix") tareFix();
      if (m.action === "refresh") refreshTare();
    });
  }
  renderTare();
  if (!lastTare) await refreshTare();
}

async function tareFix() {
  const preview = await runTool("tare", ["fix", "--dry-run"]);
  const detail = (preview.stdout || "").replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 1500);
  const ok = await vscode.window.showWarningMessage(
    "Apply Tare's cache-safe fixes to Claude Code on this machine?",
    { modal: true, detail: (detail ? detail + "\n\n" : "") + "This edits Claude Code's settings (output trim and a cache countdown in the status line). Undo any time with `npx tarelab fix --undo`." },
    "Apply fixes"
  );
  if (ok !== "Apply fixes") return;
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Tare: applying fixes…" }, () => runTool("tare", ["fix"]));
  if (r.code === 0) {
    output.appendLine(r.stdout.replace(/\x1b\[[0-9;]*m/g, ""));
    vscode.window.showInformationMessage("Tare fixes applied. Restart Claude Code sessions to pick them up.", "Show details").then((a) => a && output.show());
  } else {
    vscode.window.showErrorMessage("Tare fix did not finish. See Output → Priberry.", "Show output").then((a) => a && output.show());
  }
}

// ---- Crumple: workspace scan → Problems panel ---------------------------------------------

const SEVERITY = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
};

async function scanWorkspace({ quiet = false } = {}) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) {
    if (!quiet) vscode.window.showInformationMessage("Open a folder first, then run the Crumple check.");
    return;
  }
  if (!vscode.workspace.isTrusted) {
    if (!quiet) vscode.window.showInformationMessage("Crumple only checks trusted workspaces. Trust this folder first.");
    return;
  }
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Crumple: checking agent setup" }, async () => {
    diagnostics.clear();
    const byFile = new Map();
    let total = 0;
    let worst = null;
    for (const folder of folders) {
      if (folder.uri.scheme !== "file") continue;
      const dir = folder.uri.fsPath;
      const r = await runTool("crumple", ["scan", "--json"], dir);
      const data = core.parseJson(r.stdout);
      if (!data || !Array.isArray(data.findings)) {
        if (!quiet) vscode.window.showErrorMessage(`Crumple could not check ${folder.name}. See Output → Priberry.`);
        continue;
      }
      for (const f of data.findings) {
        const loc = core.findingLocation(f, dir);
        const uri = loc.file ? vscode.Uri.file(loc.file) : folder.uri;
        const range = new vscode.Range(loc.line, 0, loc.line, 1000);
        const where = loc.file ? "" : ` [${f.where}]`;
        const d = new vscode.Diagnostic(range, `${f.title}${where}. ${f.why} Fix: ${String(f.fix || "").replace(/`/g, "")}`, SEVERITY[f.severity] ?? vscode.DiagnosticSeverity.Warning);
        d.source = "Crumple";
        d.code = f.severity;
        const key = uri.toString();
        if (!byFile.has(key)) byFile.set(key, { uri, list: [] });
        byFile.get(key).list.push(d);
        log(`  ${f.severity}: ${f.title} → ${loc.file ? `${vscode.workspace.asRelativePath(uri)}:${loc.line + 1}` : `${folder.name} (${f.where})`}`);
        total++;
        if (!worst || d.severity < worst) worst = d.severity;
      }
      log(`  ${folder.name}: grade ${data.grade} (${data.score}/100), ${data.findings.length} findings`);
    }
    for (const { uri, list } of byFile.values()) diagnostics.set(uri, list);
    if (!quiet || (total && worst === vscode.DiagnosticSeverity.Error)) {
      const msg = total ? `Crumple found ${total} issue${total === 1 ? "" : "s"} in this workspace's agent setup.` : "Crumple: no issues in this workspace's agent setup.";
      vscode.window.showInformationMessage(msg, ...(total ? ["Show Problems"] : [])).then((pick) => pick && vscode.commands.executeCommand("workbench.actions.view.problems"));
    }
    lastScan = { total, files: [...byFile.values()].map((x) => x.uri.fsPath) };
  });
  return lastScan;
}

// ---- Crumple: deployed app check ----------------------------------------------------------

async function checkSite(urlArg) {
  let url = typeof urlArg === "string" ? core.normalizeUrl(urlArg) : null;
  if (!url) {
    const input = await vscode.window.showInputBox({
      title: "Check a deployed app",
      prompt: "The app's address. Crumple loads it like a stranger would and looks for leaked keys and open data. Only this site is contacted.",
      placeHolder: "myapp.lovable.app",
      ignoreFocusOut: true,
      validateInput: (v) => (!v || core.normalizeUrl(v) ? null : "Enter a web address, like myapp.lovable.app"),
    });
    if (!input) return;
    url = core.normalizeUrl(input);
  }
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Crumple: checking ${new URL(url).host}…` }, () => runTool("crumple", ["site", url, "--json"]));
  const data = core.parseJson(r.stdout);
  if (!data || !data.grade) {
    vscode.window.showErrorMessage(`Crumple could not check ${url}. See Output → Priberry.`, "Show output").then((a) => a && output.show());
    return;
  }
  lastSite = { data, url, at: now() };
  if (!sitePanel) {
    sitePanel = vscode.window.createWebviewPanel("priberry.site", "Crumple: site check", vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    sitePanel.onDidDispose(() => (sitePanel = undefined));
    sitePanel.webview.onDidReceiveMessage(async (m) => {
      if (m.action === "copy") {
        const f = lastSite && lastSite.data.findings[Number(m.index)];
        if (f && f.prompt) {
          await vscode.env.clipboard.writeText(f.prompt);
          vscode.window.setStatusBarMessage("Fix prompt copied", 2500);
        }
      }
      if (m.action === "recheck" && lastSite) checkSite(lastSite.url);
    });
  }
  sitePanel.title = `Crumple: ${data.grade} · ${new URL(url).host}`;
  sitePanel.webview.html = core.siteHtml(data, { nonce: core.nonce(), cspSource: sitePanel.webview.cspSource, updated: lastSite.at });
  sitePanel.reveal();
}

// ---- Setup in every AI app ----------------------------------------------------------------

async function setupApps() {
  const ok = await vscode.window.showWarningMessage(
    "Add Tare and Crumple to every AI coding app on this machine?",
    {
      modal: true,
      detail:
        "This runs `tarelab setup` and `crumplelab setup`, which add both as MCP servers to the AI apps they find here (Cursor, VS Code, Windsurf, Claude, Codex, Gemini CLI, Cline, Kiro and others), so your agent can ask them directly. Both run locally. Undo with `npx tarelab setup --undo` and `npx crumplelab setup --undo`.",
    },
    "Add them"
  );
  if (ok !== "Add them") return;
  const results = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Adding Tare and Crumple to your AI apps…" }, async () => {
    const t = await runTool("tare", ["setup"]);
    const c = await runTool("crumple", ["setup"]);
    return { t, c };
  });
  const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  output.appendLine("--- tare setup ---\n" + clean(results.t.stdout));
  output.appendLine("--- crumple setup ---\n" + clean(results.c.stdout));
  const failed = [results.t.code && "Tare", results.c.code && "Crumple"].filter(Boolean);
  const msg = failed.length ? `${failed.join(" and ")} setup did not finish. See Output → Priberry.` : "Tare and Crumple were added to your AI apps. Restart those apps to load them.";
  (failed.length ? vscode.window.showErrorMessage : vscode.window.showInformationMessage)(msg, "Show details").then((a) => a && output.show());
}

// ---- URI handler: vscode://priberry.priberry-vscode/check-site?url=… ----------------------

const uriHandler = {
  async handleUri(uri) {
    const params = new URLSearchParams(uri.query);
    if (uri.path === "/check-site") {
      const url = core.normalizeUrl(params.get("url"));
      if (!url) return checkSite();
      // A link opened this, so ask before contacting anything.
      const ok = await vscode.window.showInformationMessage(`Check ${url} with Crumple?`, { modal: true, detail: "Crumple loads the site like a stranger would. Only this address is contacted." }, "Check it");
      if (ok === "Check it") checkSite(url);
    } else if (uri.path === "/tare") {
      showTareReport();
    }
  },
};

// ---- activation ---------------------------------------------------------------------------

function activate(context) {
  output = vscode.window.createOutputChannel("Priberry");
  diagnostics = vscode.languages.createDiagnosticCollection("crumple");
  statusItem = vscode.window.createStatusBarItem("priberry.tare", vscode.StatusBarAlignment.Right, 100);
  statusItem.name = "Tare: AI agent spend";
  statusItem.command = "priberry.showTareReport";
  statusItem.show();

  context.subscriptions.push(
    output,
    diagnostics,
    statusItem,
    vscode.commands.registerCommand("priberry.showTareReport", showTareReport),
    vscode.commands.registerCommand("priberry.refreshTare", refreshTare),
    vscode.commands.registerCommand("priberry.scanWorkspace", () => scanWorkspace()),
    vscode.commands.registerCommand("priberry.checkSite", checkSite),
    vscode.commands.registerCommand("priberry.setupApps", setupApps),
    vscode.window.registerUriHandler(uriHandler),
    vscode.workspace.onDidChangeWorkspaceFolders(() => cfg().get("crumple.scanOnOpen") && scanWorkspace({ quiet: true })),
    vscode.workspace.onDidGrantWorkspaceTrust(() => cfg().get("crumple.scanOnOpen") && scanWorkspace({ quiet: true })),
    { dispose: () => clearInterval(timer) }
  );

  refreshTare();
  const minutes = Math.max(5, Number(cfg().get("tare.refreshMinutes")) || 60);
  timer = setInterval(refreshTare, minutes * 60 * 1000);
  if (cfg().get("crumple.scanOnOpen")) scanWorkspace({ quiet: true });

  // Read-only view of the extension's state, used by the integration test.
  return {
    statusText: () => statusItem.text,
    tareHtml: () => (tarePanel ? tarePanel.webview.html : null),
    siteHtml: () => (sitePanel ? sitePanel.webview.html : null),
    refreshTare,
    scanWorkspace,
    checkSite,
    showTareReport,
  };
}

function deactivate() {
  clearInterval(timer);
}

module.exports = { activate, deactivate };
