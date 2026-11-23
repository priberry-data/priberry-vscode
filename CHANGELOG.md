# Changelog

## 0.2.0

- All four Priberry tools. New: **Launch Blockers** checks the open folder for what would leak users' data before you deploy; blocking findings land in the Problems panel on their line, each linked to the leak simulator.
- **Check a deployed app** now runs Greenlit (`greenlitlab`), the tool that grades live apps since it split from Crumple.
- Tools updated: tarelab 0.2.2, crumplelab 0.4.0, greenlitlab 0.5.0, launch-blockers 0.2.0.

## 0.1.0

- Status bar shows Tare's 30-day API-equivalent spend and avoidable share, refreshed hourly. Click for the report and a confirmed `tare fix`.
- Crumple checks the workspace's agent setup when a folder opens and puts each finding in the Problems panel, on the file it is about.
- "Check a deployed app" grades a URL with `crumple site` and shows each fix prompt with a copy button.
- "Add Tare and Crumple to my AI apps" runs both `setup` commands after asking.
