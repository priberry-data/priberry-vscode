// Pure helpers with no VS Code dependency, so they can be unit-tested with plain Node.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// Split a command setting such as "npx -y tarelab@0.2.0" into [file, ...args].
function splitCommand(cmd) {
  const parts = String(cmd || "").match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return parts.map((p) => p.replace(/^(["'])(.*)\1$/, "$2"));
}

// Editors started from the Dock or Finder often get a bare PATH; add the usual Node locations.
function childEnv() {
  const extra = process.platform === "win32" ? [] : ["/usr/local/bin", "/opt/homebrew/bin", path.join(os.homedir(), ".volta/bin"), path.join(os.homedir(), ".local/bin")];
  const sep = process.platform === "win32" ? ";" : ":";
  const PATH = [process.env.PATH || "", ...extra].filter(Boolean).join(sep);
  return {
    ...process.env,
    PATH,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    NO_UPDATE_NOTIFIER: "1",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

// Run a CLI and resolve with { code, stdout, stderr }. Never rejects.
function run(command, args, { cwd, timeout = 5 * 60 * 1000 } = {}) {
  const [file, ...base] = splitCommand(command);
  return new Promise((resolve) => {
    execFile(
      file,
      [...base, ...args],
      { cwd: cwd || os.homedir(), env: childEnv(), timeout, maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32", windowsHide: true },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, error: err && typeof err.code !== "number" ? err.message : null, stdout: String(stdout || ""), stderr: String(stderr || "") })
    );
  });
}

// CLIs may print a banner or npm noise before the JSON; take the first top-level object.
function parseJson(stdout) {
  const s = String(stdout || "");
  try {
    return JSON.parse(s);
  } catch {}
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(s.slice(i, j + 1));
    } catch {}
  }
  return null;
}

function money(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return "$" + (v / 1000).toFixed(0) + "k";
  if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  if (v >= 100) return "$" + v.toFixed(0);
  return "$" + v.toFixed(2);
}

// The numbers the status bar shows. Matches how `tare` itself computes "avoidable".
function summarizeTare(r) {
  const usd = Number(r && r.usd) || 0;
  const fixes = Array.isArray(r && r.fixes) ? r.fixes : [];
  const avoidable = fixes.reduce((a, f) => a + (Number(f.saves) || 0), 0);
  const share = usd > 0 ? Math.round((avoidable / usd) * 100) : 0;
  return { usd, avoidable, share, days: (r && r.days) || 30, sessions: (r && r.sessions) || 0 };
}

// Where a Crumple scan finding belongs. `where` is "agent setup", a path relative to the
// project, a "~/" path, an absolute path, optionally followed by " → <server name>".
function findingLocation(finding, projectDir, home = os.homedir()) {
  const where = String(finding.where || "");
  const [rawPath, name] = where.split(/\s+→\s+/);
  let file = null;
  if (rawPath && rawPath !== "agent setup") {
    const p = rawPath.startsWith("~/") ? path.join(home, rawPath.slice(2)) : path.isAbsolute(rawPath) ? rawPath : path.join(projectDir, rawPath);
    try {
      if (fs.statSync(p).isFile()) file = p;
    } catch {}
  }
  if (!file) return { file: null, line: 0 };
  // Point at the line that mentions the server name, or the first package named in the title.
  const needles = [];
  if (name) needles.push(name);
  const paren = String(finding.title || "").match(/\(([^)]+)\)/);
  if (paren) needles.push(...paren[1].split(/,\s*/).map((s) => s.replace(/^.*?:\s*/, "").trim()).filter((s) => s.length > 1));
  let line = 0;
  if (needles.length) {
    try {
      const st = fs.statSync(file);
      if (st.size < 20 * 1024 * 1024) {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        outer: for (const n of needles) {
          for (let k = 0; k < lines.length; k++) {
            if (lines[k].includes(`"${n}"`) || lines[k].includes(`node_modules/${n}"`)) {
              line = k;
              break outer;
            }
          }
          for (let k = 0; k < lines.length; k++) {
            if (lines[k].includes(n)) {
              line = k;
              break outer;
            }
          }
        }
      }
    } catch {}
  }
  return { file, line };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// `code` spans in CLI text become <code>, everything else escaped.
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

const STYLE = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px 28px; max-width: 900px; line-height: 1.5; }
  h1 { font-size: 1.5em; margin: 0 0 4px; } h2 { font-size: 1.1em; margin: 28px 0 8px; }
  .muted { color: var(--vscode-descriptionForeground); }
  .big { font-size: 2.4em; font-weight: 700; margin: 12px 0 0; }
  .ok { color: var(--vscode-charts-green, #3fb950); } .warn { color: var(--vscode-charts-orange, #d29922); } .bad { color: var(--vscode-charts-red, #f85149); }
  .card { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 12px 14px; margin: 10px 0; }
  .card h3 { margin: 0 0 4px; font-size: 1em; }
  .sev { font-size: .75em; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-right: 6px; }
  pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; margin: 8px 0; font-family: var(--vscode-editor-font-family); font-size: .92em; }
  code { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 0 3px; border-radius: 3px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 6px 14px; border-radius: 3px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  table { border-collapse: collapse; } td { padding: 2px 16px 2px 0; } td.n { text-align: right; font-variant-numeric: tabular-nums; }
  ul { padding-left: 20px; } .grade { font-size: 3.2em; font-weight: 800; line-height: 1; margin-right: 14px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
`;

function page({ title, body, nonce, cspSource }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    vscode.postMessage({ action: b.dataset.action, index: b.dataset.index });
    if (b.dataset.action === "copy") { const t = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = t), 1500); }
  });
</script></body></html>`;
}

function sevClass(s) {
  return s === "critical" || s === "high" ? "bad" : s === "medium" ? "warn" : "muted";
}

function tareHtml(r, opts) {
  const s = summarizeTare(r);
  const fixes = (r.fixes || []).slice().sort((a, b) => (b.saves || 0) - (a.saves || 0));
  const top = (obj, n = 6) => Object.entries(obj || {}).map(([k, v]) => [k, typeof v === "number" ? v : v && v.usd]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
  const rows = (list) => `<table>${list.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(money(v))}</td></tr>`).join("")}</table>`;
  const autoFix = fixes.some((f) => f.auto);
  const body = `
  <h1>Your AI agents, last ${esc(s.days)} days</h1>
  <div class="muted">${esc(s.sessions)} sessions · ${esc((r.calls || 0).toLocaleString("en-US"))} API calls · read from logs on this machine</div>
  <div class="big warn">${esc(money(s.usd))}</div><div class="muted">API-equivalent spend (API list prices; on a subscription you did not pay this)</div>
  ${s.avoidable > 0 ? `<div class="big ok" style="font-size:1.8em">${esc(money(s.avoidable))} avoidable (${esc(s.share)}%)</div>` : `<p class="ok">Nothing obviously avoidable.</p>`}
  ${autoFix ? `<p class="row"><button data-action="fix">Apply the cache-safe fixes (tare fix)</button><span class="muted">Changes Claude Code settings on this machine. You will be asked first. Undo with <code>tare fix --undo</code>.</span></p>` : ""}
  <h2>Where the avoidable money went</h2>
  ${fixes.map((f) => `<div class="card"><h3>${esc(f.title)} <span class="ok">${esc(money(f.saves))}</span></h3><div>${inline(f.detail)}</div>${f.auto ? `<div class="muted" style="margin-top:4px">${inline(f.auto)}</div>` : ""}</div>`).join("") || `<p class="muted">No fixes suggested.</p>`}
  ${Array.isArray(r.lines) && r.lines.length ? `<h2>Highlights</h2><ul>${r.lines.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>` : ""}
  <div class="row" style="align-items:flex-start;gap:48px">
    <div><h2>By agent</h2>${rows(top(r.byAgent))}</div>
    <div><h2>By model</h2>${rows(top(r.byModel))}</div>
    <div><h2>By project</h2>${rows(top(r.projects))}</div>
  </div>
  <p class="row" style="margin-top:28px"><button class="secondary" data-action="refresh">Refresh</button><span class="muted">Updated ${esc(opts.updated || "")}. Nothing leaves this machine.</span></p>`;
  return page({ title: "Tare", body, ...opts });
}

function siteHtml(r, opts) {
  const g = String(r.grade || "?");
  const gc = g === "A" || g === "B" ? "ok" : g === "C" ? "warn" : "bad";
  const findings = Array.isArray(r.findings) ? r.findings : [];
  let n = 0;
  const body = `
  <div class="row"><span class="grade ${gc}">${esc(g)}</span><div><h1>${esc(r.url)}</h1><div>${esc(r.score)}/100 · ${esc(r.verdict || "")}</div>${r.builder ? `<div class="muted">Built with ${esc(r.builder)}</div>` : ""}</div></div>
  ${r.change ? `<p class="muted">Was ${esc(r.change.before.grade)} (${esc(r.change.before.score)}), now ${esc(r.change.after.grade)} (${esc(r.change.after.score)}).</p>` : ""}
  <p class="muted">Paste each prompt into ${esc(r.pasteInto || "your AI app builder")}, one at a time, then check again.</p>
  ${findings.map((f, i) => {
    const num = f.prompt ? ++n : null;
    return `<div class="card"><h3><span class="sev ${sevClass(f.severity)}">${esc(f.severity)}</span>${num ? esc(num) + ". " : ""}${esc(f.title)}</h3>
      <div>${inline(f.why)}</div>${f.where ? `<div class="muted">Where: ${esc(f.where)}</div>` : ""}
      ${f.first ? `<div style="margin-top:6px"><b>First:</b> ${inline(f.first)}</div>` : ""}
      ${f.prompt ? `<pre>${esc(f.prompt)}</pre><button data-action="copy" data-index="${i}">Copy prompt</button>` : f.fix ? `<div style="margin-top:6px"><b>Fix:</b> ${inline(f.fix)}</div>` : ""}</div>`;
  }).join("") || `<p class="ok">No findings.</p>`}
  <p class="row" style="margin-top:24px"><button class="secondary" data-action="recheck">Check again</button><span class="muted">Checked ${esc(opts.updated || "")}. Only ${esc(r.url)} was contacted.</span></p>`;
  return page({ title: "Crumple site check", body, ...opts });
}

function nonce() {
  return require("crypto").randomBytes(16).toString("base64").replace(/[^A-Za-z0-9]/g, "");
}

// Accept "example.com" or "https://example.com/path"; only http(s).
function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname || !u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

module.exports = { splitCommand, childEnv, run, parseJson, money, summarizeTare, findingLocation, esc, tareHtml, siteHtml, nonce, normalizeUrl };
