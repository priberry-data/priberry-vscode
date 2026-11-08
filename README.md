# Priberry: Tare and Crumple

Two free, open-source Priberry tools inside your editor. Works in VS Code, Cursor, Windsurf, VSCodium and Kiro.

- **Tare** reads your AI coding agents' logs on this machine and shows what they cost and how much was avoidable.
- **Crumple** checks your agent setup for security holes, and grades apps you shipped with an AI app builder (Lovable, Bolt, v0, Replit and others).

## What you get

**Spend in the status bar.** Bottom right, for example `$412 · 9% avoidable`: the last 30 days of API-equivalent spend across your coding agents, and the share Tare thinks you could have saved. It refreshes every hour. Click it for the full report: where the avoidable money went, highlights, and spend by agent, model and project. The **Apply the cache-safe fixes** button shows you what `tare fix` would change, asks you, and only then changes Claude Code's settings.

**A workspace check when you open a folder.** Crumple reads the folder's agent setup (rules files, MCP servers, hooks, permissions, install scripts) the way an attacker would. Each finding lands in the Problems panel, on the file it is about where there is one. Run it again with **Priberry: Check this workspace's agent setup (Crumple)**.

**Check a deployed app.** Run **Priberry: Check a deployed app (Crumple)**, type the address, and get a grade from A to F with a fix prompt for each problem. Copy a prompt, paste it into your app builder's chat, then press **Check again**.

**Add Tare and Crumple to my AI apps.** Run **Priberry: Add Tare and Crumple to my AI apps** to add both as MCP servers to every AI coding app on this machine, so your agent can ask them directly. It asks first. Undo with `npx tarelab setup --undo` and `npx crumplelab setup --undo`.

All commands are in the Command Palette under **Priberry**. Output from each run is in **Output → Priberry**.

## Privacy

Everything runs on your machine. The extension sends nothing anywhere. The one exception is **Check a deployed app**: Crumple loads the address you typed, like any visitor would, and contacts nothing else.

By default the extension runs the tools with `npx`, so the first run downloads `tarelab` and `crumplelab` from the npm registry, just like `npx` on the command line. To skip that, install them once and point the settings at them:

| Setting | Default |
| --- | --- |
| `priberry.tare.command` | `npx -y tarelab@0.2.0` |
| `priberry.crumple.command` | `npx -y crumplelab@0.3.1` |
| `priberry.tare.refreshMinutes` | `60` |
| `priberry.crumple.scanOnOpen` | `true` |

Needs Node.js 20 or newer on your machine.

Links like `vscode://priberry.priberry-vscode/check-site?url=myapp.lovable.app` open the site check; the extension asks before contacting the site.

## Develop

```bash
npm install
npm test
npx vsce package
code --install-extension priberry-vscode-0.1.0.vsix
```

`scripts/integration.sh` installs the packaged .vsix into a throwaway VS Code profile and drives all three features inside real VS Code against `test/fixture/demo-app` (a folder with a planted unpinned MCP server and a prompt injection in CLAUDE.md). Set `PRIBERRY_TEST_SITE` to change the site it checks (default https://priberry.com).

## Publishing (founder steps)

Nothing has been published yet. One-time setup, then two commands per release.

**VS Code Marketplace** (VS Code, plus anyone who installs from it)

1. Sign in at https://dev.azure.com with the Priberry Microsoft account and create an organization if there isn't one.
2. In Azure DevOps, User settings → Personal access tokens → New token: organization **All accessible organizations**, scope **Marketplace → Manage**. Copy it.
3. Go to https://marketplace.visualstudio.com/manage, sign in with the same account and create the publisher with ID **priberry** (it must match `publisher` in package.json). Verify the priberry.com domain there for the blue check.
4. `npx vsce login priberry` and paste the token, then `npx vsce publish`.

**Open VSX** (Cursor, Windsurf, VSCodium, Kiro, Gitpod)

1. Sign in at https://open-vsx.org with the priberry-data GitHub account and sign the Eclipse Foundation publisher agreement (Settings → Profile; needs an Eclipse account linked to that GitHub user).
2. Settings → Access Tokens → generate a token.
3. `npx ovsx create-namespace priberry -p <token>` (once), then `npx ovsx publish priberry-vscode-0.1.0.vsix -p <token>`.
4. Claim the namespace (open an issue at https://github.com/EclipseFdn/open-vsx.org with the "namespace claim" template) so it shows as verified.

Store both tokens as GitHub Actions secrets (`VSCE_PAT`, `OVSX_PAT`) if you want releases to publish from CI later.

## License

Apache-2.0. Tare: https://tare.priberry.com · Crumple: https://github.com/priberry-data/crumplelab
