#!/usr/bin/env node
// Applies one moderation action to hidden.json / curated.json / bans.json.
// Invoked by the `moderate.yml` workflow, which supplies the action +
// target + reason via env vars. Writes a commit message to
// .moderate-commit-message.txt for the workflow's commit step to read.
//
// Actions:
//   hide        / unhide      — toggle plugins/{author}/{slug} in hidden.json
//   curate      / uncurate    — toggle plugins/{author}/{slug} in curated.json
//   ban         / unban       — toggle an author string in bans.json
//
// All writes are idempotent — re-running the same action twice is a no-op
// (apart from the updated timestamp on re-hiding / re-curating, which is
// fine — it's a moderation record, not a stable content field).

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const action   = (process.env.MOD_ACTION || "").trim();
const pluginId = (process.env.MOD_PLUGIN_ID || "").trim();
const author   = (process.env.MOD_AUTHOR || "").trim();
const reason   = (process.env.MOD_REASON || "").trim();
const actor    = (process.env.MOD_ACTOR || "").trim();

if (!action) {
  console.error("Missing MOD_ACTION");
  process.exit(1);
}

const now = new Date().toISOString();

function loadJson(filename, defaultShape) {
  const p = path.join(repoRoot, filename);
  if (!fs.existsSync(p)) return { path: p, data: defaultShape() };
  try { return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) }; }
  catch (e) { console.error(`Could not parse ${filename}: ${e.message}`); process.exit(1); }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function writeCommitMessage(subject, body = "") {
  const lines = [subject];
  if (body) lines.push("", body);
  fs.writeFileSync(path.join(repoRoot, ".moderate-commit-message.txt"), lines.join("\n") + "\n");
}

// ---- Actions ---------------------------------------------------------------

function requirePluginId() {
  if (!pluginId) {
    console.error(`Action '${action}' requires plugin_id input.`);
    process.exit(1);
  }
  if (!/^plugins\/[^/]+\/[^/]+$/.test(pluginId)) {
    console.error(`plugin_id '${pluginId}' is not shaped like plugins/{author}/{slug}.`);
    process.exit(1);
  }
}

function requireAuthor() {
  if (!author) {
    console.error(`Action '${action}' requires author input.`);
    process.exit(1);
  }
}

function actionHide() {
  requirePluginId();
  const { path: p, data } = loadJson("hidden.json", () => ({ schema_version: 1, hidden: [] }));
  data.hidden = data.hidden || [];
  const existing = data.hidden.findIndex((h) => h && h.id === pluginId);
  const entry = { id: pluginId, hidden_at: now, moderator: actor, reason: reason || "(no reason given)" };
  if (existing >= 0) {
    data.hidden[existing] = entry;
    writeJson(p, data);
    writeCommitMessage(`hide ${pluginId} (refresh)`, reason);
    console.log(`Refreshed hide entry for ${pluginId}`);
  } else {
    data.hidden.push(entry);
    writeJson(p, data);
    writeCommitMessage(`hide ${pluginId}`, reason);
    console.log(`Added hide entry for ${pluginId}`);
  }
}

function actionUnhide() {
  requirePluginId();
  const { path: p, data } = loadJson("hidden.json", () => ({ schema_version: 1, hidden: [] }));
  data.hidden = (data.hidden || []).filter((h) => !(h && h.id === pluginId));
  writeJson(p, data);
  writeCommitMessage(`unhide ${pluginId}`, reason);
  console.log(`Removed hide entry for ${pluginId}`);
}

function actionCurate() {
  requirePluginId();
  const { path: p, data } = loadJson("curated.json", () => ({ schema_version: 1, curated: [] }));
  data.curated = data.curated || [];
  const existing = data.curated.findIndex((c) => {
    if (typeof c === "string") return c === pluginId;
    return c && c.id === pluginId;
  });
  const entry = { id: pluginId, curated_at: now, curator: actor, note: reason || "" };
  if (existing >= 0) {
    data.curated[existing] = entry;
    writeJson(p, data);
    writeCommitMessage(`curate ${pluginId} (refresh)`, reason);
    console.log(`Refreshed curated entry for ${pluginId}`);
  } else {
    data.curated.push(entry);
    writeJson(p, data);
    writeCommitMessage(`curate ${pluginId}`, reason);
    console.log(`Added curated entry for ${pluginId}`);
  }
}

function actionUncurate() {
  requirePluginId();
  const { path: p, data } = loadJson("curated.json", () => ({ schema_version: 1, curated: [] }));
  data.curated = (data.curated || []).filter((c) => {
    if (typeof c === "string") return c !== pluginId;
    return !(c && c.id === pluginId);
  });
  writeJson(p, data);
  writeCommitMessage(`uncurate ${pluginId}`, reason);
  console.log(`Removed curated entry for ${pluginId}`);
}

function actionBan() {
  requireAuthor();
  const { path: p, data } = loadJson("bans.json", () => ({ schema_version: 1, bans: [] }));
  data.bans = data.bans || [];
  const existing = data.bans.findIndex((b) => b && b.author === author);
  const entry = { author, banned_at: now, moderator: actor, reason: reason || "(no reason given)", expires_at: null };
  if (existing >= 0) {
    data.bans[existing] = entry;
    writeJson(p, data);
    writeCommitMessage(`ban ${author} (refresh)`, reason);
    console.log(`Refreshed ban entry for ${author}`);
  } else {
    data.bans.push(entry);
    writeJson(p, data);
    writeCommitMessage(`ban ${author}`, reason);
    console.log(`Added ban entry for ${author}`);
  }
}

function actionUnban() {
  requireAuthor();
  const { path: p, data } = loadJson("bans.json", () => ({ schema_version: 1, bans: [] }));
  data.bans = (data.bans || []).filter((b) => !(b && b.author === author));
  writeJson(p, data);
  writeCommitMessage(`unban ${author}`, reason);
  console.log(`Removed ban entry for ${author}`);
}

// ---- Dispatch --------------------------------------------------------------

switch (action) {
  case "hide":     actionHide();     break;
  case "unhide":   actionUnhide();   break;
  case "curate":   actionCurate();   break;
  case "uncurate": actionUncurate(); break;
  case "ban":      actionBan();      break;
  case "unban":    actionUnban();    break;
  default:
    console.error(`Unknown action: ${action}`);
    process.exit(1);
}
