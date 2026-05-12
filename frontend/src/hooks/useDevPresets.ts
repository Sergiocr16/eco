// Presets globales de comandos de dev server. Se guardan en localStorage
// para que estén disponibles desde cualquier agente.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'eco.dev.presets';
const CHANGE_EVENT = 'eco:dev-presets-change';

export type PresetRole = 'frontend' | 'backend' | 'any';

export type DevPreset = {
  id: string;
  name: string;
  command: string;
  role: PresetRole;
  builtin?: boolean;
};

// Presets que ship por default. El user puede borrarlos también — guardamos
// los borrados como un set de IDs en localStorage 'eco.dev.presets.hidden'.
const BUILTIN_PRESETS: DevPreset[] = [
  { id: 'builtin:vite',         name: 'Vite (frontend)',         command: 'npm run dev -- --port $PORT',          role: 'frontend', builtin: true },
  { id: 'builtin:next-dev',     name: 'Next.js dev',             command: 'npm run dev -- --port $PORT',          role: 'frontend', builtin: true },
  { id: 'builtin:cra',          name: 'Create React App',        command: 'PORT=$PORT npm start',                  role: 'frontend', builtin: true },
  { id: 'builtin:astro',        name: 'Astro dev',               command: 'npm run dev -- --port $PORT',          role: 'frontend', builtin: true },
  { id: 'builtin:node-express', name: 'Node / Express',          command: 'PORT=$PORT node server.js',             role: 'backend',  builtin: true },
  { id: 'builtin:nestjs',       name: 'NestJS',                  command: 'PORT=$PORT npm run start:dev',          role: 'backend',  builtin: true },
  { id: 'builtin:fastapi',      name: 'FastAPI (uvicorn)',       command: 'uvicorn app.main:app --reload --port $PORT', role: 'backend', builtin: true },
  { id: 'builtin:django',       name: 'Django runserver',        command: 'python manage.py runserver 0.0.0.0:$PORT', role: 'backend', builtin: true },
  { id: 'builtin:rails',        name: 'Rails server',            command: 'bundle exec rails s -p $PORT',          role: 'backend',  builtin: true },
  { id: 'builtin:spring',       name: 'Spring Boot (Maven)',     command: 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=$PORT', role: 'backend', builtin: true },
  { id: 'builtin:python-http',  name: 'Python http.server',      command: 'python3 -m http.server $PORT',          role: 'any',      builtin: true },
  { id: 'builtin:vite-preview', name: 'Vite preview',            command: 'npm run preview -- --port $PORT',       role: 'frontend', builtin: true },
];

const HIDDEN_KEY = 'eco.dev.presets.hidden';

function readUserPresets(): DevPreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown): p is DevPreset =>
      !!p && typeof (p as DevPreset).id === 'string'
        && typeof (p as DevPreset).name === 'string'
        && typeof (p as DevPreset).command === 'string',
    );
  } catch { return []; }
}

function readHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function writeUserPresets(list: DevPreset[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* noop */ }
}

function writeHidden(set: Set<string>) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* noop */ }
}

function compose(): DevPreset[] {
  const user = readUserPresets();
  const hidden = readHidden();
  const builtins = BUILTIN_PRESETS.filter((b) => !hidden.has(b.id));
  return [...user, ...builtins];
}

export function useDevPresets() {
  const [presets, setPresets] = useState<DevPreset[]>(compose);

  useEffect(() => {
    const sync = () => setPresets(compose());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const add = useCallback((preset: Omit<DevPreset, 'id'>) => {
    const id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const next = [...readUserPresets(), { ...preset, id }];
    writeUserPresets(next);
  }, []);

  const remove = useCallback((id: string) => {
    if (id.startsWith('builtin:')) {
      const h = readHidden();
      h.add(id);
      writeHidden(h);
    } else {
      writeUserPresets(readUserPresets().filter((p) => p.id !== id));
    }
  }, []);

  const forRole = useCallback((role: PresetRole | 'all'): DevPreset[] => {
    if (role === 'all') return presets;
    return presets.filter((p) => p.role === role || p.role === 'any');
  }, [presets]);

  return { presets, add, remove, forRole };
}
