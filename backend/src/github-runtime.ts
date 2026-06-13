// Helpers para inyectar la identidad de GitHub de Eco en operaciones
// runtime (spawn de `gh`, `git commit`, `git push`). Cuando hay
// credenciales configuradas en `~/.eco/github.json`, devolvemos los env
// vars y args necesarios. Sin credenciales, devolvemos objetos vacíos
// para que el caller use el flow normal (CLI / git config global).

import { readGithubCredentials } from './github-credentials-store.js';
import { currentUserId } from './request-context.js';
import { firstAdminId } from './users-store.js';

// Resuelve a qué usuario pertenece la identidad de git de esta operación:
// el userId explícito, o el del request HTTP en curso (ALS), o el primer admin.
function resolveGitUserId(userId?: string): string | undefined {
  return userId ?? currentUserId() ?? firstAdminId() ?? undefined;
}

// Env vars que respeta `gh` CLI y `git`:
//   - GH_TOKEN / GITHUB_TOKEN: gh los usa con prioridad sobre hosts.yml.
//   - GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL: identidad del autor del commit.
//   - GIT_COMMITTER_NAME / GIT_COMMITTER_EMAIL: identidad del committer
//     (puede diferir del author en rebases; los unificamos por simplicidad).
//
// Estos overrides no tocan ningún archivo de configuración — el flag local
// `git config user.name` queda intacto. Solo afectan al proceso spawneado.
export function githubEnvOverrides(userId?: string): Record<string, string> {
  const c = readGithubCredentials(resolveGitUserId(userId));
  if (!c) return {};
  return {
    GH_TOKEN: c.pat,
    GITHUB_TOKEN: c.pat,
    GIT_AUTHOR_NAME: c.username,
    GIT_AUTHOR_EMAIL: c.email,
    GIT_COMMITTER_NAME: c.username,
    GIT_COMMITTER_EMAIL: c.email,
  };
}

// Args para inyectar al inicio de `git commit ...` cuando hay identidad.
// Usar -c user.name=X además de GIT_AUTHOR_NAME asegura compatibilidad con
// versiones viejas de git que ignoran ciertas env vars en algunos flows.
export function gitIdentityArgs(userId?: string): string[] {
  const c = readGithubCredentials(resolveGitUserId(userId));
  if (!c) return [];
  return ['-c', `user.name=${c.username}`, '-c', `user.email=${c.email}`];
}
