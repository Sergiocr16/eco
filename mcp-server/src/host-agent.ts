// ¿Bajo qué CLI de agente corre este MCP server? Determina con qué agente
// nacen las bubbles creadas desde acá, para que una tarea lanzada desde Codex
// siga en Codex.
//
// Detectar el host por env NO es simétrico:
//   - Claude Code exporta `CLAUDECODE=1` + `CLAUDE_CODE_*` a sus hijos.
//   - Codex les pasa un env MÍNIMO (HOME/PATH/SHELL/TERM/USER/LOGNAME/LANG/
//     TMPDIR) y CERO marcadores `CODEX_*` — verificado empíricamente contra
//     codex-cli 0.144.0. La ausencia de marcadores no alcanza para afirmar
//     "es Codex": un `node dist/index.js` suelto también los tiene ausentes.
//
// Por eso el camino confiable para Codex es declarar el marcador al registrar:
//   codex mcp add eco --env ECO_MCP_AGENT=codex -- node <path>/dist/index.js
// (Codex sí propaga el bloque `env` de su config.toml, ver mcp_servers.<name>.)

export type AgentCli = 'claude' | 'codex';

function isClaudeHost(env: NodeJS.ProcessEnv): boolean {
  if (env.CLAUDECODE) return true;
  return Object.keys(env).some((k) => k.startsWith('CLAUDE_CODE_'));
}

/** Agente por defecto de las bubbles creadas desde este MCP server.
 *  Prioridad: $ECO_MCP_AGENT → marcadores de Claude Code → 'claude'. */
export function detectHostAgent(env: NodeJS.ProcessEnv = process.env): AgentCli {
  const override = env.ECO_MCP_AGENT?.trim().toLowerCase();
  if (override === 'codex' || override === 'claude') return override;
  if (isClaudeHost(env)) return 'claude';
  // Default retrocompatible: sin señal, todo nace en Claude como siempre.
  return 'claude';
}
