import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { config, isAllowedWorkspace } from './config.js';

export type SkillInfo = {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  kind: 'skill' | 'command' | 'agent';
  plugin?: string;
  path: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

function parseFrontmatter(md: string): Record<string, string> {
  const m = FRONTMATTER_RE.exec(md);
  if (!m) return {};
  const result: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function scanSkillsDir(
  dir: string,
  source: 'user' | 'project' | 'plugin',
  plugin?: string,
): SkillInfo[] {
  if (!existsSync(dir)) return [];
  const out: SkillInfo[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return []; }

  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const skillFile = join(full, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    let content: string;
    try { content = readFileSync(skillFile, 'utf-8'); } catch { continue; }
    if (content.length > 200_000) continue;

    const fm = parseFrontmatter(content);
    const name = fm.name ?? entry;
    const description = (fm.description ?? '').slice(0, 400);

    out.push({
      name, description, source, kind: 'skill',
      ...(plugin ? { plugin } : {}),
      path: skillFile,
    });
  }
  return out;
}

function scanMarkdownDir(
  dir: string,
  source: 'user' | 'project' | 'plugin',
  kind: 'command' | 'agent',
  plugin?: string,
): SkillInfo[] {
  if (!existsSync(dir)) return [];
  const out: SkillInfo[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return []; }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const full = join(dir, entry);
    let content: string;
    try { content = readFileSync(full, 'utf-8'); } catch { continue; }
    if (content.length > 200_000) continue;

    const fm = parseFrontmatter(content);
    const name = fm.name ?? entry.replace(/\.md$/, '');
    const description = (fm.description ?? '').slice(0, 400);

    out.push({
      name, description, source, kind,
      ...(plugin ? { plugin } : {}),
      path: full,
    });
  }
  return out;
}

function scanPluginSkills(): SkillInfo[] {
  const marketplacesDir = join(homedir(), '.claude', 'plugins', 'marketplaces');
  if (!existsSync(marketplacesDir)) return [];
  const out: SkillInfo[] = [];

  let marketplaces: string[] = [];
  try { marketplaces = readdirSync(marketplacesDir); } catch { return out; }

  for (const market of marketplaces) {
    const pluginsDir = join(marketplacesDir, market, 'plugins');
    if (!existsSync(pluginsDir)) continue;
    let plugins: string[] = [];
    try { plugins = readdirSync(pluginsDir); } catch { continue; }

    for (const plugin of plugins) {
      const skillsDir = join(pluginsDir, plugin, 'skills');
      const commandsDir = join(pluginsDir, plugin, 'commands');
      const agentsDir = join(pluginsDir, plugin, 'agents');
      if (existsSync(skillsDir)) out.push(...scanSkillsDir(skillsDir, 'plugin', plugin));
      if (existsSync(commandsDir)) out.push(...scanMarkdownDir(commandsDir, 'plugin', 'command', plugin));
      if (existsSync(agentsDir)) out.push(...scanMarkdownDir(agentsDir, 'plugin', 'agent', plugin));
    }
  }
  return out;
}

export function listSkills(workspace?: string): SkillInfo[] {
  const sources = config.skillSources;
  const collected = new Map<string, SkillInfo>();

  if (sources.includes('user')) {
    for (const skill of scanSkillsDir(join(homedir(), '.claude', 'skills'), 'user')) {
      collected.set(skill.name, skill);
    }
    for (const skill of scanPluginSkills()) {
      // plugin como fallback si no hay user-direct con ese nombre
      if (!collected.has(skill.name)) collected.set(skill.name, skill);
    }
  }

  if (sources.includes('project') && workspace) {
    if (isAllowedWorkspace(workspace)) {
      for (const skill of scanSkillsDir(join(workspace, '.claude', 'skills'), 'project')) {
        // project overrides user/plugin con el mismo nombre
        collected.set(skill.name, skill);
      }
    }
  }

  return [...collected.values()].sort((a, b) => a.name.localeCompare(b.name));
}
