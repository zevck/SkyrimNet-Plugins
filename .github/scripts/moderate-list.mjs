#!/usr/bin/env node
// Renders a markdown table of every plugin on main for moderator reference.
// Run by the `list-plugins.yml` workflow on workflow_dispatch. Writes to
// $GITHUB_STEP_SUMMARY so the table appears in the workflow run's summary
// tab — click "Copy" next to a row's id, paste into Moderate.

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const read = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, name), "utf8")); }
  catch { return null; }
};

const index = read("index.json") || { plugins: [] };
const hidden = read("hidden.json") || { hidden: [] };
const curated = read("curated.json") || { curated: [] };
const bans = read("bans.json") || { bans: [] };

const hiddenSet = new Set((hidden.hidden || []).map((h) => (typeof h === "string" ? h : h?.id)).filter(Boolean));
const curatedSet = new Set(
  (curated.curated || []).map((c) => (typeof c === "string" ? c : c?.id)).filter(Boolean),
);
const bannedSet = new Set((bans.bans || []).map((b) => b?.author).filter(Boolean));

const plugins = Array.isArray(index.plugins) ? [...index.plugins] : [];
plugins.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const flag = (b, label) => (b ? ` **${label}** ` : "");

const lines = [];
lines.push(`# Hub plugins (${plugins.length})`);
lines.push("");
lines.push(`Banned authors: ${bannedSet.size > 0 ? [...bannedSet].map((a) => "`" + a + "`").join(", ") : "_none_"}`);
lines.push("");
lines.push("Copy an `id` into the **Moderate** workflow's `plugin_id` input.");
lines.push("");
lines.push("| id | title | author | type | nsfw | status |");
lines.push("|---|---|---|---|---|---|");

for (const p of plugins) {
  const id = p.id || "";
  const title = esc(p.title);
  const author = esc(p.author);
  const type = esc(p.type);
  const nsfw = p.nsfw ? "yes" : "";
  const status = [
    hiddenSet.has(id) ? "hidden" : "",
    curatedSet.has(id) ? "curated" : "",
    bannedSet.has(p.author) ? "author banned" : "",
  ].filter(Boolean).join(" + ") || "—";
  lines.push(`| \`${id}\` | ${title} | ${author} | ${type} | ${nsfw} | ${status} |`);
}

lines.push("");
lines.push(`## Hidden (${hiddenSet.size})`);
if (hiddenSet.size === 0) {
  lines.push("_none_");
} else {
  lines.push("| id | reason | moderator | when |");
  lines.push("|---|---|---|---|");
  for (const h of hidden.hidden || []) {
    if (!h || typeof h !== "object") continue;
    lines.push(`| \`${esc(h.id)}\` | ${esc(h.reason)} | ${esc(h.moderator)} | ${esc(h.hidden_at)} |`);
  }
}

lines.push("");
lines.push(`## Curated (${curatedSet.size})`);
if (curatedSet.size === 0) {
  lines.push("_none_");
} else {
  lines.push("| id | note | curator | when |");
  lines.push("|---|---|---|---|");
  for (const c of curated.curated || []) {
    if (typeof c === "string") { lines.push(`| \`${esc(c)}\` | | | |`); continue; }
    if (!c || typeof c !== "object") continue;
    lines.push(`| \`${esc(c.id)}\` | ${esc(c.note)} | ${esc(c.curator)} | ${esc(c.curated_at)} |`);
  }
}

lines.push("");
lines.push(`## Bans (${bannedSet.size})`);
if (bannedSet.size === 0) {
  lines.push("_none_");
} else {
  lines.push("| author | reason | moderator | banned at | expires |");
  lines.push("|---|---|---|---|---|");
  for (const b of bans.bans || []) {
    if (!b || typeof b !== "object") continue;
    lines.push(
      `| \`${esc(b.author)}\` | ${esc(b.reason)} | ${esc(b.moderator)} | ${esc(b.banned_at)} | ${esc(b.expires_at || "permanent")} |`,
    );
  }
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  fs.writeFileSync(summaryPath, lines.join("\n"));
  console.log(`Wrote plugin list to ${summaryPath}`);
} else {
  console.log(lines.join("\n"));
}
