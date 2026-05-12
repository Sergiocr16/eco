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

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((entry) => {
      try { return statSync(join(dir, entry)).isDirectory(); } catch { return false; }
    });
  } catch { return []; }
}

function scanPluginRoot(pluginRoot: string, pluginName: string): SkillInfo[] {
  const out: SkillInfo[] = [];
  const skillsDir = join(pluginRoot, 'skills');
  const commandsDir = join(pluginRoot, 'commands');
  const agentsDir = join(pluginRoot, 'agents');
  if (existsSync(skillsDir)) out.push(...scanSkillsDir(skillsDir, 'plugin', pluginName));
  if (existsSync(commandsDir)) out.push(...scanMarkdownDir(commandsDir, 'plugin', 'command', pluginName));
  if (existsSync(agentsDir)) out.push(...scanMarkdownDir(agentsDir, 'plugin', 'agent', pluginName));
  return out;
}

function scanPluginSkills(): SkillInfo[] {
  const out: SkillInfo[] = [];
  const pluginsDir = join(homedir(), '.claude', 'plugins');

  // Marketplaces: <market>/plugins/<plugin>/{skills,commands,agents}
  const marketplacesDir = join(pluginsDir, 'marketplaces');
  for (const market of listDirs(marketplacesDir)) {
    const marketPlugins = join(marketplacesDir, market, 'plugins');
    for (const plugin of listDirs(marketPlugins)) {
      out.push(...scanPluginRoot(join(marketPlugins, plugin), plugin));
    }
  }

  // Cache de plugins instalados: <market>/<plugin>/<version>/{skills,commands,agents}
  // (esto es donde Claude Code expande los plugins activos; los marketplaces son
  // metadata, el cache son los archivos reales.)
  const cacheDir = join(pluginsDir, 'cache');
  for (const market of listDirs(cacheDir)) {
    for (const plugin of listDirs(join(cacheDir, market))) {
      const versionsDir = join(cacheDir, market, plugin);
      for (const version of listDirs(versionsDir)) {
        // Algunos plugins anidan otra carpeta con el nombre del plugin antes de las dirs reales.
        const versionDir = join(versionsDir, version);
        out.push(...scanPluginRoot(versionDir, plugin));
        // Fallback: nested layout <version>/<plugin>/{skills,...}
        const nested = join(versionDir, plugin);
        if (existsSync(nested)) out.push(...scanPluginRoot(nested, plugin));
      }
    }
  }
  return out;
}

export function listSkills(workspace?: string): SkillInfo[] {
  const sources = config.skillSources;
  // Key compuesta: name + kind para no colisionar entre, p.ej.,
  // un command "frontend-design" y un skill "frontend-design".
  const collected = new Map<string, SkillInfo>();
  const keyOf = (s: SkillInfo) => `${s.kind}:${s.name}`;

  if (sources.includes('user')) {
    const userRoot = join(homedir(), '.claude');
    for (const skill of scanSkillsDir(join(userRoot, 'skills'), 'user')) {
      collected.set(keyOf(skill), skill);
    }
    for (const cmd of scanMarkdownDir(join(userRoot, 'commands'), 'user', 'command')) {
      collected.set(keyOf(cmd), cmd);
    }
    for (const agent of scanMarkdownDir(join(userRoot, 'agents'), 'user', 'agent')) {
      collected.set(keyOf(agent), agent);
    }
    for (const skill of scanPluginSkills()) {
      // plugin como fallback si no hay user-direct con ese nombre+kind
      const k = keyOf(skill);
      if (!collected.has(k)) collected.set(k, skill);
    }
  }

  if (sources.includes('project') && workspace) {
    if (isAllowedWorkspace(workspace)) {
      const projRoot = join(workspace, '.claude');
      for (const skill of scanSkillsDir(join(projRoot, 'skills'), 'project')) {
        collected.set(keyOf(skill), skill);
      }
      for (const cmd of scanMarkdownDir(join(projRoot, 'commands'), 'project', 'command')) {
        collected.set(keyOf(cmd), cmd);
      }
      for (const agent of scanMarkdownDir(join(projRoot, 'agents'), 'project', 'agent')) {
        collected.set(keyOf(agent), agent);
      }
    }
  }

  return [...collected.values()].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind),
  );
}
