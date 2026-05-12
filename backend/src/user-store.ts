import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { generateMnemonic, validateMnemonic } from 'bip39';
import { AppError } from './app-error.js';

const USER_PATH = `${homedir()}/.eco/user.json`;

type UserRecord = {
  version: 1;
  username: string;
  pinHash: string;
  recoveryHash: string;
  createdAt: number;
  updatedAt: number;
};

const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB — equilibrio entre seguridad y velocidad en hardware modesto
  timeCost: 2,
  parallelism: 1,
};

export function hasUser(): boolean {
  return existsSync(USER_PATH);
}

function ensureDir() {
  const dir = dirname(USER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readUser(): UserRecord | null {
  if (!existsSync(USER_PATH)) return null;
  try {
    if ((statSync(USER_PATH).mode & 0o777) !== 0o600) chmodSync(USER_PATH, 0o600);
    const raw = readFileSync(USER_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && typeof parsed.pinHash === 'string') return parsed as UserRecord;
    return null;
  } catch { return null; }
}

function writeUser(user: UserRecord) {
  ensureDir();
  writeFileSync(USER_PATH, JSON.stringify(user, null, 2), { mode: 0o600 });
  try { chmodSync(USER_PATH, 0o600); } catch { /* noop */ }
}

export function deleteUser() {
  try { unlinkSync(USER_PATH); } catch { /* noop */ }
}

export type StatusInfo = {
  hasUser: boolean;
  username: string | null;
};

export function statusInfo(): StatusInfo {
  const u = readUser();
  return { hasUser: !!u, username: u?.username ?? null };
}

export type RegisterResult = {
  ok: true;
  username: string;
  recoveryPhrase: string;
};

export async function registerUser(username: string, pin: string): Promise<RegisterResult> {
  if (hasUser()) throw new AppError('auth.user_exists', 'Ya existe un usuario registrado', 409);
  if (!/^\d{4,8}$/.test(pin)) throw new AppError('auth.pin_format', 'El PIN debe tener entre 4 y 8 dígitos');
  const cleanName = username.trim().slice(0, 80);
  if (cleanName.length < 1) throw new AppError('auth.name_empty', 'Nombre de usuario vacío');

  const recoveryPhrase = generateMnemonic(128); // 12 palabras
  const [pinHash, recoveryHash] = await Promise.all([
    argonHash(pin, ARGON_OPTS),
    argonHash(recoveryPhrase, ARGON_OPTS),
  ]);

  const now = Date.now();
  writeUser({
    version: 1,
    username: cleanName,
    pinHash, recoveryHash,
    createdAt: now, updatedAt: now,
  });

  return { ok: true, username: cleanName, recoveryPhrase };
}

export async function verifyPin(pin: string): Promise<boolean> {
  const u = readUser();
  if (!u) return false;
  try { return await argonVerify(u.pinHash, pin); } catch { return false; }
}

export async function recoverWithPhrase(recoveryPhrase: string, newPin: string): Promise<{ ok: true; username: string }> {
  const u = readUser();
  if (!u) throw new AppError('auth.no_user', 'No hay usuario registrado', 404);
  const phrase = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase)) throw new AppError('auth.phrase_invalid', 'Frase de recuperación inválida (debe tener 12 palabras BIP39)');
  if (!/^\d{4,8}$/.test(newPin)) throw new AppError('auth.pin_format', 'El PIN debe tener entre 4 y 8 dígitos');

  const phraseMatch = await argonVerify(u.recoveryHash, phrase).catch(() => false);
  if (!phraseMatch) throw new AppError('auth.phrase_mismatch', 'Frase de recuperación incorrecta', 401);

  // Generar nueva frase de recuperación al resetear (la anterior queda invalidada)
  const newRecovery = generateMnemonic(128);
  const [newPinHash, newRecoveryHash] = await Promise.all([
    argonHash(newPin, ARGON_OPTS),
    argonHash(newRecovery, ARGON_OPTS),
  ]);

  writeUser({ ...u, pinHash: newPinHash, recoveryHash: newRecoveryHash, updatedAt: Date.now() });
  // Devolvemos también la nueva frase para que el user la guarde (la anterior ya no sirve)
  return { ok: true, username: u.username };
}

export async function recoverGetNewPhrase(recoveryPhrase: string, newPin: string): Promise<{ username: string; newRecoveryPhrase: string }> {
  const u = readUser();
  if (!u) throw new AppError('auth.no_user', 'No hay usuario registrado', 404);
  const phrase = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase)) throw new AppError('auth.phrase_invalid', 'Frase de recuperación inválida');
  if (!/^\d{4,8}$/.test(newPin)) throw new AppError('auth.pin_format', 'El PIN debe tener entre 4 y 8 dígitos');

  const phraseMatch = await argonVerify(u.recoveryHash, phrase).catch(() => false);
  if (!phraseMatch) throw new AppError('auth.phrase_mismatch', 'Frase de recuperación incorrecta', 401);

  const newRecovery = generateMnemonic(128);
  const [newPinHash, newRecoveryHash] = await Promise.all([
    argonHash(newPin, ARGON_OPTS),
    argonHash(newRecovery, ARGON_OPTS),
  ]);

  writeUser({ ...u, pinHash: newPinHash, recoveryHash: newRecoveryHash, updatedAt: Date.now() });
  return { username: u.username, newRecoveryPhrase: newRecovery };
}
