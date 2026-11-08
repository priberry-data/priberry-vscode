"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const core = require("../src/core");

test("splitCommand keeps quoted paths together", () => {
  assert.deepStrictEqual(core.splitCommand('node "/a b/tare.mjs"'), ["node", "/a b/tare.mjs"]);
  assert.deepStrictEqual(core.splitCommand("npx -y tarelab@0.2.0"), ["npx", "-y", "tarelab@0.2.0"]);
});

test("summarizeTare matches tare's avoidable share", () => {
  const s = core.summarizeTare({ usd: 200, days: 30, sessions: 4, fixes: [{ saves: 30 }, { saves: 20 }] });
  assert.strictEqual(s.avoidable, 50);
  assert.strictEqual(s.share, 25);
  assert.strictEqual(core.money(6587.4), "$6.6k");
});

test("parseJson skips leading noise", () => {
  assert.deepStrictEqual(core.parseJson('npm warn x\n{"a":1}\n'), { a: 1 });
  assert.strictEqual(core.parseJson("nope"), null);
});

test("findingLocation resolves files and lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-"));
  fs.writeFileSync(path.join(dir, ".mcp.json"), '{\n  "mcpServers": {\n    "evil": {}\n  }\n}\n');
  fs.writeFileSync(path.join(dir, "package-lock.json"), '{\n "packages": {\n  "node_modules/esbuild": {}\n }\n}\n');
  assert.deepStrictEqual(core.findingLocation({ where: ".mcp.json → evil" }, dir), { file: path.join(dir, ".mcp.json"), line: 2 });
  assert.deepStrictEqual(core.findingLocation({ where: "package-lock.json", title: "3 dependencies run install scripts (esbuild, fsevents)" }, dir), { file: path.join(dir, "package-lock.json"), line: 2 });
  assert.deepStrictEqual(core.findingLocation({ where: "agent setup" }, dir), { file: null, line: 0 });
  assert.deepStrictEqual(core.findingLocation({ where: "~/nope/x.json" }, dir), { file: null, line: 0 });
});

test("normalizeUrl", () => {
  assert.strictEqual(core.normalizeUrl("myapp.lovable.app"), "https://myapp.lovable.app/");
  assert.strictEqual(core.normalizeUrl("file:///etc/passwd"), null);
  assert.strictEqual(core.normalizeUrl("javascript:alert(1)"), null);
  assert.strictEqual(core.normalizeUrl("nodots"), null);
});

test("html escapes CLI text", () => {
  const h = core.siteHtml({ url: "https://x.app", grade: "F", score: 10, findings: [{ severity: "high", title: "<img src=x>", why: "w", prompt: "p" }] }, { nonce: "n", cspSource: "c" });
  assert.ok(!h.includes("<img src=x>"));
  assert.ok(h.includes("Copy prompt"));
});
