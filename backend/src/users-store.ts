// Multi-tenant user store. Reemplaza al single-user `user-store.ts`: una
// colección de usuarios con rol (admin|member), grants de workspaces, frase de
// recuperación BIP39 y refresh token por usuario. Cada usuario vive en
// `~/.eco/users/<userId>/user.json` (chmod 600) + un índice liviano en
// `~/.eco/users/index.json` para listar/login por username sin escanear dirs.
//
// Invariante multi-tenant: la identidad SIEMPRE sale de la sesión (que lleva
// userId+role), nunca de algo que mande el cliente.

import {
  existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, statSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { generateMnemonic, validateMnemonic } from 'bip39';
import { AppError } from './app-error.js';

export type Role = 'admin' | 'member';

export type UserRecord = {
  version: 1;
  id: string;
  username: string;
  role: Role;
  pinHash: string;
  recoveryHash: string;
  refreshHash: string | null;
  workspaceGrants: string[];
  createdAt: number;
  updatedAt: number;
};

export type UserSummary = { id: string; username: string; role: Role };

const ECO_DIR = join(homedir(), '.eco');
const USERS_DIR = join(ECO_DIR, 'users');
const INDEX_PATH = join(USERS_DIR, 'index.json');

const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB — equilibrio seguridad/velocidad en hardware modesto
  timeCost: 2,
  parallelism: 1,
};

const PIN_RE = /^\d{4,8}$/;

function ensureUsersDir() {
  if (!existsSync(USERS_DIR)) mkdirSync(USERS_DIR, { recursive: true, mode: 0o700 });
}

function userDir(id: string): string { return join(USERS_DIR, id); }
function userPath(id: string): string { return join(userDir(id), 'user.json'); }

function newUserId(): string { return randomBytes(8).toString('hex'); }

function readUserAt(path: string): UserRecord | null {
  if (!existsSync(path)) return null;
  try {
    if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (parsed?.version === 1 && typeof parsed.id === 'string' && typeof parsed.pinHash === 'string') {
      // Defaults defensivos para registros viejos / migrados.
      parsed.role = parsed.role === 'admin' ? 'admin' : (parsed.role === 'member' ? 'member' : 'member');
      parsed.refreshHash = typeof parsed.refreshHash === 'string' ? parsed.refreshHash : null;
      parsed.workspaceGrants = Array.isArray(parsed.workspaceGrants) ? parsed.workspaceGrants : [];
      return parsed as UserRecord;
    }
    return null;
  } catch { return null; }
}

function writeUserRecord(user: UserRecord) {
  ensureUsersDir();
  const dir = userDir(user.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(userPath(user.id), JSON.stringify(user, null, 2), { mode: 0o600 });
  try { chmodSync(userPath(user.id), 0o600); } catch { /* noop */ }
  rebuildIndex();
}

// ─── Índice ────────────────────────────────────────────────────────────────

function scanUsers(): UserRecord[] {
  if (!existsSync(USERS_DIR)) return [];
  const out: UserRecord[] = [];
  for (const entry of readdirSync(USERS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const u = readUserAt(userPath(entry.name));
    if (u) out.push(u);
  }
  return out;
}

function rebuildIndex() {
  ensureUsersDir();
  const summaries: UserSummary[] = scanUsers().map((u) => ({ id: u.id, username: u.username, role: u.role }));
  writeFileSync(INDEX_PATH, JSON.stringify(summaries, null, 2), { mode: 0o600 });
}

export function listUsers(): UserSummary[] {
  if (existsSync(INDEX_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
      if (Array.isArray(parsed)) return parsed as UserSummary[];
    } catch { /* cae al scan */ }
  }
  return scanUsers().map((u) => ({ id: u.id, username: u.username, role: u.role }));
}

export function hasAnyUser(): boolean {
  return listUsers().length > 0;
}

export function getUser(id: string | null | undefined): UserRecord | null {
  if (!id || !/^[a-f0-9]{1,32}$/.test(id)) return null;
  return readUserAt(userPath(id));
}

export function getUserByUsername(name: string): UserRecord | null {
  const target = name.trim().toLowerCase();
  for (const s of listUsers()) {
    if (s.username.toLowerCase() === target) return getUser(s.id);
  }
  return null;
}

export type StatusInfo = { hasUser: boolean };
export function statusInfo(): StatusInfo {
  return { hasUser: hasAnyUser() };
}

// ─── Validación ──────────────────────────────────────────────────────────

function validateUsername(username: string): string {
  const clean = username.trim().slice(0, 80);
  if (clean.length < 1) throw new AppError('auth.name_empty', 'Nombre de usuario vacío');
  return clean;
}

function assertPin(pin: string) {
  if (!PIN_RE.test(pin)) throw new AppError('auth.pin_format', 'El PIN debe tener entre 4 y 8 dígitos');
}

function assertUsernameFree(username: string) {
  if (getUserByUsername(username)) {
    throw new AppError('auth.username_taken', 'Ese nombre de usuario ya existe', 409);
  }
}

// ─── Refresh tokens ────────────────────────────────────────────────────────
// Raw = "<userId>.<secret>" — el userId embebido evita escanear/argon-verify
// todos los usuarios en cada renovación. Guardamos argon(secret) en el user.

export async function mintRefresh(userId: string): Promise<string> {
  const user = getUser(userId);
  if (!user) throw new AppError('auth.no_user', 'Usuario no encontrado', 404);
  const secret = randomBytes(32).toString('base64url');
  const refreshHash = await argonHash(secret, ARGON_OPTS);
  writeUserRecord({ ...user, refreshHash, updatedAt: Date.now() });
  return `${userId}.${secret}`;
}

export async function verifyRefresh(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const userId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  const user = getUser(userId);
  if (!user || !user.refreshHash || !secret) return null;
  try { return (await argonVerify(user.refreshHash, secret)) ? userId : null; }
  catch { return null; }
}

// ─── Creación / administración ───────────────────────────────────────────

async function createUser(username: string, pin: string, role: Role): Promise<{ user: UserRecord; recoveryPhrase: string }> {
  const cleanName = validateUsername(username);
  assertPin(pin);
  assertUsernameFree(cleanName);
  const recoveryPhrase = generateMnemonic(128); // 12 palabras
  const [pinHash, recoveryHash] = await Promise.all([
    argonHash(pin, ARGON_OPTS),
    argonHash(recoveryPhrase, ARGON_OPTS),
  ]);
  const now = Date.now();
  const user: UserRecord = {
    version: 1, id: newUserId(), username: cleanName, role,
    pinHash, recoveryHash, refreshHash: null, workspaceGrants: [],
    createdAt: now, updatedAt: now,
  };
  writeUserRecord(user);
  return { user, recoveryPhrase };
}

/** Primer usuario del sistema = admin. Solo permitido si no hay ninguno. */
export async function registerFirstUser(username: string, pin: string): Promise<{ user: UserRecord; recoveryPhrase: string }> {
  if (hasAnyUser()) throw new AppError('auth.registration_closed', 'El registro está cerrado; pedile al admin que cree tu cuenta', 403);
  return createUser(username, pin, 'admin');
}

/** Admin da de alta un miembro (rol member por defecto). */
export async function createMember(username: string, pin: string, role: Role = 'member'): Promise<{ user: UserRecord; recoveryPhrase: string }> {
  return createUser(username, pin, role);
}

export function setRole(id: string, role: Role): void {
  const user = getUser(id);
  if (!user) throw new AppError('auth.no_user', 'Usuario no encontrado', 404);
  writeUserRecord({ ...user, role, updatedAt: Date.now() });
}

export function setWorkspaceGrants(id: string, grants: string[]): void {
  const user = getUser(id);
  if (!user) throw new AppError('auth.no_user', 'Usuario no encontrado', 404);
  const clean = Array.from(new Set(grants.filter((g) => typeof g === 'string' && g.length > 0)));
  writeUserRecord({ ...user, workspaceGrants: clean, updatedAt: Date.now() });
}

export function workspaceGrantsFor(id: string): string[] {
  return getUser(id)?.workspaceGrants ?? [];
}

export async function resetPin(id: string, newPin: string): Promise<{ recoveryPhrase: string }> {
  const user = getUser(id);
  if (!user) throw new AppError('auth.no_user', 'Usuario no encontrado', 404);
  assertPin(newPin);
  const recoveryPhrase = generateMnemonic(128);
  const [pinHash, recoveryHash] = await Promise.all([
    argonHash(newPin, ARGON_OPTS),
    argonHash(recoveryPhrase, ARGON_OPTS),
  ]);
  // Invalidamos el refresh al resetear el PIN (fuerza re-login).
  writeUserRecord({ ...user, pinHash, recoveryHash, refreshHash: null, updatedAt: Date.now() });
  return { recoveryPhrase };
}

export function deleteUser(id: string): void {
  const dir = userDir(id);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  rebuildIndex();
}

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const user = getUser(userId);
  if (!user) return false;
  try { return await argonVerify(user.pinHash, pin); } catch { return false; }
}

/** Recuperación por frase BIP39 (busca por username). Devuelve nueva frase. */
export async function recover(username: string, recoveryPhrase: string, newPin: string): Promise<{ user: UserRecord; newRecoveryPhrase: string }> {
  const user = getUserByUsername(username);
  if (!user) throw new AppError('auth.no_user', 'No hay usuario con ese nombre', 404);
  const phrase = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase)) throw new AppError('auth.phrase_invalid', 'Frase de recuperación inválida (12 palabras BIP39)');
  assertPin(newPin);
  const phraseMatch = await argonVerify(user.recoveryHash, phrase).catch(() => false);
  if (!phraseMatch) throw new AppError('auth.phrase_mismatch', 'Frase de recuperación incorrecta', 401);

  const newRecovery = generateMnemonic(128);
  const [pinHash, recoveryHash] = await Promise.all([
    argonHash(newPin, ARGON_OPTS),
    argonHash(newRecovery, ARGON_OPTS),
  ]);
  writeUserRecord({ ...user, pinHash, recoveryHash, refreshHash: null, updatedAt: Date.now() });
  return { user, newRecoveryPhrase: newRecovery };
}

// ─── Migración one-time del modelo single-user ──────────────────────────────
// Si existe el viejo `~/.eco/user.json` y todavía NO hay colección de usuarios,
// creamos el primer admin a partir de él (reusando los hashes existentes, sin
// re-hashear), y movemos `~/.eco/github.json` a su carpeta. Idempotente.

export function migrateLegacyUserIfNeeded(): { migrated: boolean; adminId?: string; username?: string } {
  if (hasAnyUser()) return { migrated: false };
  const legacyPath = join(ECO_DIR, 'user.json');
  if (!existsSync(legacyPath)) return { migrated: false };
  let legacy: { username?: string; pinHash?: string; recoveryHash?: string } | null = null;
  try { legacy = JSON.parse(readFileSync(legacyPath, 'utf-8')); } catch { return { migrated: false }; }
  if (!legacy?.pinHash || !legacy?.recoveryHash) return { migrated: false };

  const now = Date.now();
  const user: UserRecord = {
    version: 1, id: newUserId(),
    username: (legacy.username || 'admin').trim().slice(0, 80) || 'admin',
    role: 'admin',
    pinHash: legacy.pinHash, recoveryHash: legacy.recoveryHash, refreshHash: null,
    workspaceGrants: [], createdAt: now, updatedAt: now,
  };
  writeUserRecord(user);

  // Mover credenciales de GitHub legacy a la carpeta del admin.
  const legacyGithub = join(ECO_DIR, 'github.json');
  const adminGithub = join(userDir(user.id), 'github.json');
  if (existsSync(legacyGithub) && !existsSync(adminGithub)) {
    try {
      writeFileSync(adminGithub, readFileSync(legacyGithub), { mode: 0o600 });
      rmSync(legacyGithub, { force: true });
    } catch { /* noop */ }
  }
  // El user.json viejo lo dejamos como respaldo; el sistema ya usa la colección.
  return { migrated: true, adminId: user.id, username: user.username };
}
