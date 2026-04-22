#!/usr/bin/env node
// SkyrimNet Plugins — index builder
//
// Walks every plugins/{author}/{slug}/manifest.json, extracts the fields
// the dashboard needs for the browse page, counts content files, derives
// first_published and last_updated from git history, filters out hidden
// plugins, and writes index.json.
//
// Zero external dependencies — only Node built-ins.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const PLUGINS_DIR = path.join(REPO_ROOT, "plugins");
const INDEX_PATH = path.join(REPO_ROOT, "index.json");
const HIDDEN_PATH = path.join(REPO_ROOT, "hidden.json");
const CONTENT_DIRS = ["triggers", "actions", "prompts", "knowledge"];

// ----- Helpers ---------------------------------------------------------------

function gitDate(args) {
  // Returns an ISO 8601 date string from git log, or null if no history.
  try {
    const out = execSync(`git log ${args}`, { encoding: "utf8", cwd: REPO_ROOT }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(d, entry.name));
      else if (entry.isFile()) count++;
    }
  }
  return count;
}

// ----- Load hidden list ------------------------------------------------------

let hiddenIds = new Set();
if (fs.existsSync(HIDDEN_PATH)) {
  try {
    const hidden = JSON.parse(fs.readFileSync(HIDDEN_PATH, "utf8"));
    if (Array.isArray(hidden.hidden)) {
      hiddenIds = new Set(hidden.hidden.map(h => h.id).filter(Boolean));
    }
  } catch (e) {
    console.warn(`Warning: could not parse hidden.json: ${e.message}`);
  }
}

// ----- Walk plugins ----------------------------------------------------------

const plugins = [];

if (!fs.existsSync(PLUGINS_DIR)) {
  console.log("No plugins/ directory — writing empty index.");
} else {
  for (const authorEntry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!authorEntry.isDirectory()) continue;
    const authorDir = path.join(PLUGINS_DIR, authorEntry.name);

    for (const slugEntry of fs.readdirSync(authorDir, { withFileTypes: true })) {
      if (!slugEntry.isDirectory()) continue;
      const pluginDir = path.join(authorDir, slugEntry.name);
      const pluginId = `plugins/${authorEntry.name}/${slugEntry.name}`;

      // Skip hidden plugins
      if (hiddenIds.has(pluginId)) {
        console.log(`  [hidden] ${pluginId}`);
        continue;
      }

      // Read manifest
      const manifestPath = path.join(pluginDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        console.warn(`  [skip] ${pluginId} — no manifest.json`);
        continue;
      }

      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch (e) {
        console.warn(`  [skip] ${pluginId} — manifest parse error: ${e.message}`);
        continue;
      }

      // Derive git dates from the plugin directory's history
      const relPath = path.relative(REPO_ROOT, pluginDir).replace(/\\/g, "/");
      const firstPublished = gitDate(`--reverse --format=%aI --diff-filter=A -- "${relPath}"`) ||
                             gitDate(`--reverse --format=%aI -- "${relPath}"`);
      const lastUpdated = gitDate(`-1 --format=%aI -- "${relPath}"`);

      // Count content files
      const contents = manifest.type === "bundle" ? {
        triggers: countFiles(path.join(pluginDir, "triggers")),
        actions: countFiles(path.join(pluginDir, "actions")),
        prompts: countFiles(path.join(pluginDir, "prompts")),
        knowledge: countFiles(path.join(pluginDir, "knowledge")),
      } : undefined;

      // Build mods array (name + file + required)
      const mods = Array.isArray(manifest.mods)
        ? manifest.mods.map(m => ({
            name: m.name || m.file || "",
            file: (m.file || "").toLowerCase(),
            required: !!m.required,
          })).filter(m => m.file)
        : [];

      // Build index entry. version / skyrimnet_version only apply to bundles
      // — listings point at external content whose version is the upstream's
      // concern, not ours.
      const entry = {
        id: pluginId,
        type: manifest.type,
        title: manifest.title,
        tagline: manifest.tagline,
        author: manifest.author,
        tags: Array.isArray(manifest.tags) ? manifest.tags : [],
        nsfw: !!manifest.nsfw,
        mods,
        first_published: firstPublished || new Date().toISOString(),
        last_updated: lastUpdated || new Date().toISOString(),
      };

      if (manifest.type === 'bundle') {
        entry.version = manifest.version;
        entry.skyrimnet_version = manifest.skyrimnet_version;
      }
      if (manifest.type === 'listing' && typeof manifest.external_url === 'string') {
        entry.external_url = manifest.external_url;
      }

      if (contents !== undefined) {
        entry.contents = contents;
      }

      plugins.push(entry);
      console.log(`  [ok] ${pluginId} (${manifest.type}, ${manifest.title})`);
    }
  }
}

// Sort by last_updated descending (newest first)
plugins.sort((a, b) => b.last_updated.localeCompare(a.last_updated));

// ----- Write index -----------------------------------------------------------

const index = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  plugins,
};

fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
console.log(`\nWrote index.json: ${plugins.length} plugins`);
