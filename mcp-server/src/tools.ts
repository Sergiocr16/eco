// Definición + handlers de las tools MCP que el server expone a Claude Code.
//
// Cada handler retorna `{ content: [{ type: 'text', text }] }` — el texto es lo
// que el modelo "lee" tras invocar la tool. Los ids de bubble salen de
// list_bubbles / create_bubble; el backend valida id + dueño en cada llamada.

import { z } from 'zod';
import {
  createBubble,
  listBubbles,
  sendToBubble,
  getBubbleStatus,
  waitForBubble,
  sendKeys,
  requestCloseBubble,
  renameBubble,
  focusBubble,
  setBubbleCategories,
  listCategories,
  devServerAction,
  getBubbleDiff,
  readBubbleConversation,
  type EcoApiError,
  type BubbleStatus,
  type BubbleState,
  type BubbleSummary,
} from './client.js';
import { resolveWorkspace, getStartupCwd } from './workspace.js';
import { detectHostAgent, type AgentCli } from './host-agent.js';

export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (rawArgs: unknown) => Promise<ToolResult>;
};

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function defineTool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  schema: S,
  handler: (args: z.output<S>) => Promise<ToolResult>,
): ToolDef {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>,
    run: async (rawArgs: unknown) => {
      const parsed = schema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return errorResult(`Argumentos inválidos: ${parsed.error.issues.map((e) => `${e.path.join('.') || '?'}: ${e.message}`).join('; ')}`);
      }
      try {
        return await handler(parsed.data);
      } catch (e) {
        return errorResult(friendlyError(e));
      }
    },
  };
}

function isApiError(e: unknown): e is EcoApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

function friendlyError(e: unknown): string {
  if (isApiError(e)) {
    switch (e.code) {
      case 'eco.no_clients':
        return 'Eco no está abierto (o el dueño de la bubble no tiene la UI abierta). Abrí la app y volvé a intentar.';
      case 'workspace.not_allowed':
        return 'Workspace no está en la whitelist de Eco. Agregalo desde Ajustes → Carpetas.';
      case 'bubble.not_found':
        // El backend agrega al mensaje si el snapshot está congelado (sync rechazado).
        return `${e.message} Usá list_bubbles para ver las activas.`;
      case 'bubble.invalid_id':
        return 'El bubble_id no tiene el formato esperado (b_xxx). Usá list_bubbles para copiar uno válido.';
      case 'bubble.not_owner':
        return 'Esa bubble pertenece a otro usuario de Eco; no se puede operar desde acá.';
      case 'bubble.archived':
        return 'Esa bubble está archivada. Desarchivala en Eco antes de mandarle input.';
      case 'eco.not_synced':
        return 'Eco no sincronizó bubbles todavía. Abrí la app al menos una vez.';
      case 'pty.not_running':
        return 'El terminal del agente de esa bubble no está corriendo. Mandale un prompt con send_to_bubble (lo arranca) o abrí la bubble en Eco.';
      case 'dev.not_configured':
        return 'El workspace no tiene comando de dev server configurado. Lo define el admin en Ajustes → Carpetas.';
      case 'dev.no_workspace':
        return 'La bubble no tiene workspace, así que no tiene dev server ni git.';
      case 'category.not_found':
      case 'category.ambiguous':
        return e.message;
      default:
        return `Error de Eco (${e.code}): ${e.message}`;
    }
  }
  return `Error: ${e instanceof Error ? e.message : String(e)}`;
}

// ─── Formato ────────────────────────────────────────────────────────────────

const STATE_LABEL: Record<BubbleState, string> = {
  archived: 'archivada',
  offline: 'offline (sin terminal abierto)',
  working: 'trabajando',
  waiting_permission: 'esperando respuesta tuya (permiso/pregunta)',
  waiting_input: 'terminó su turno, espera instrucciones',
  idle: 'quieta',
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

function relMs(ts: number | null | undefined): string {
  if (!ts) return '';
  return relTime(new Date(ts).toISOString());
}

function summaryLine(b: BubbleSummary): string {
  const state = b.archived ? 'archivada' : b.busy ? 'trabajando' : b.running ? 'quieta' : 'offline';
  const cats = b.categories && b.categories.length > 0 ? ` · cats: ${b.categories.join(', ')}` : '';
  const ws = b.workspace ? ` · ws: ${b.workspace}` : ' · (sin workspace)';
  const branch = b.baseBranch ? ` · base: ${b.baseBranch}` : '';
  return `  • [${b.id}] ${b.title} — ${state}${cats}${ws}${branch}`;
}

function formatStatus(s: BubbleStatus, opts: { showOutput: boolean; showGit: boolean }): string {
  const out: string[] = [];
  out.push(`${s.bubble.title} [${s.bubble.id}]`);
  out.push(`Estado: ${STATE_LABEL[s.state]} — ${s.reason}`);
  out.push(`Workspace: ${s.bubble.workspace ?? '(sin workspace)'}${s.bubble.worktree ? `\nWorktree: ${s.bubble.worktree}` : ''}`);
  if (s.bubble.categories.length > 0) out.push(`Categorías: ${s.bubble.categories.map((c) => c.name).join(', ')}`);
  if (s.terminals.length > 0) {
    out.push('Terminales: ' + s.terminals.map((t) => `${t.ptyId} (${t.agent}${t.busy ? ', con output ahora' : `, quieto ${relMs(Date.now() - t.idleForMs) || 'recién'}`})`).join('; '));
  }
  if (s.devServers.length > 0) {
    out.push('Dev servers: ' + s.devServers.map((d) => `${d.role}=${d.status}${d.url ? ` ${d.url}` : ''}`).join('; '));
  }
  if (s.transcript) {
    const tr = s.transcript;
    const pend = tr.pendingToolNames.length > 0 ? ` · tools pendientes: ${tr.pendingToolNames.join(', ')}` : '';
    out.push(`Transcript: turno=${tr.turnState}${pend}${tr.lastUserAt ? ` · último prompt ${relTime(tr.lastUserAt)}` : ''}`);
    if (tr.lastAssistantText) {
      out.push(`\nÚltimo mensaje del agente (${relTime(tr.lastAssistantAt) || 'sin hora'}):\n${tr.lastAssistantText}`);
    }
  }
  if (opts.showGit && s.git) {
    const g = s.git;
    const ab = g.aheadBehind ? ` (↑${g.aheadBehind.ahead} ↓${g.aheadBehind.behind} vs upstream)` : ' (sin upstream)';
    const files = g.changedFiles.count > 0
      ? `${g.changedFiles.count} archivo(s) con cambios: ${g.changedFiles.sample.map((f) => f.path).join(', ')}${g.changedFiles.count > g.changedFiles.sample.length ? ', …' : ''}`
      : 'sin cambios en el worktree';
    const pr = g.pr ? `PR #${g.pr.number} ${g.pr.state}${g.pr.isDraft ? ' (draft)' : ''}: ${g.pr.title} ${g.pr.url}` : 'sin PR abierto';
    out.push(`\nGit: rama ${g.branch ?? '?'}${ab}\n  último commit: ${g.lastCommit ? `${g.lastCommit.sha} ${g.lastCommit.subject}` : '(ninguno)'}\n  ${files}\n  ${pr}`);
  }
  if (opts.showOutput && s.lastOutput) {
    out.push(`\nCola del terminal:\n${s.lastOutput}`);
  }
  return out.join('\n');
}

// ─── Tools ──────────────────────────────────────────────────────────────────

const BubbleId = z.string().min(1).max(128).describe('Id de la bubble (sale de list_bubbles o de create_bubble).');
const AgentArg = z.enum(['claude', 'codex']).optional()
  .describe('A qué terminal de agente apunta. Si se omite, hereda el CLI del caller (Claude o Codex).');

const CreateBubbleSchema = z.object({
  title: z.string().min(1).max(120).describe('Título corto y descriptivo del agente (3-6 palabras).'),
  workspace: z.string().optional().describe(
    'Path absoluto del workspace donde el agente trabajará. Si se omite, se autodetecta usando el cwd ' +
    'actual de Claude Code y se busca un workspace permitido de Eco que lo contenga.',
  ),
  base_branch: z.string().optional().describe('Rama git base desde la cual crear el worktree del agente. Si se omite, parte de HEAD del workspace.'),
  initial_prompt: z.string().max(16_000).optional().describe(
    'Mensaje inicial que el agente de la nueva bubble procesará apenas se crea. Acepta varias líneas.',
  ),
  agent: AgentArg,
});

const createBubbleTool = defineTool(
  'create_bubble',
  'Crea una bubble (agente) nueva en Eco con su worktree git aislado. Opcionalmente acepta un ' +
  'initial_prompt que el agente procesa apenas arranca. Si no se pasa workspace, se autodetecta usando el cwd actual. ' +
  'Devuelve el bubble_id para usar con el resto de las tools.',
  CreateBubbleSchema,
  async (args) => {
    const wsResolution = await resolveWorkspace(args.workspace);
    if (!wsResolution.ok) {
      const list = wsResolution.available.length > 0
        ? wsResolution.available.map((w) => `  • ${w}`).join('\n')
        : '  (ninguno configurado)';
      return errorResult(
        `No se pudo autodetectar workspace.\n` +
        `cwd actual: ${getStartupCwd()}\n\n` +
        `Workspaces permitidos en Eco:\n${list}\n\n` +
        `Solución: pasá \`workspace\` explícito o agregá el directorio padre desde Ajustes → Carpetas en Eco.`,
      );
    }
    // Sin `agent` explícito, la bubble hereda el CLI del caller: una tarea
    // lanzada desde Codex sigue en Codex.
    const agent: AgentCli = args.agent ?? detectHostAgent();
    const r = await createBubble({
      title: args.title,
      workspace: wsResolution.workspace || undefined,
      baseBranch: args.base_branch,
      initialPrompt: args.initial_prompt,
      agent,
    });
    const sourceNote = wsResolution.source === 'cwd_match'
      ? ' (workspace autodetectado desde cwd)'
      : wsResolution.source === 'explicit' ? ' (workspace explícito)' : '';
    const promptNote = args.initial_prompt
      ? `\n\nPrompt inicial enviado al agente ${agent} de la bubble. Usá wait_for_bubble o get_bubble para ver cómo va.`
      : '';
    return textResult(
      `Bubble "${args.title}" creada en Eco.\n` +
      `  id: ${r.bubbleId}\n` +
      `  workspace: ${r.workspace ?? '(sin workspace)'}${sourceNote}\n` +
      `  worktree: ${r.worktreePath ?? '(sin worktree)'}` +
      promptNote,
    );
  },
);

const listBubblesTool = defineTool(
  'list_bubbles',
  'Lista las bubbles (agentes) de Eco con su estado resumido (trabajando / quieta / offline / archivada), ' +
  'categorías y workspace. Filtrable por workspace o categoría. Las archivadas se ocultan salvo include_archived.',
  z.object({
    workspace: z.string().optional().describe('Filtrar por workspace: ruta completa, nombre de la carpeta o un fragmento (sin distinguir mayúsculas).'),
    include_archived: z.boolean().optional().describe('Incluir las bubbles archivadas (default false).'),
    category: z.string().optional().describe('Filtrar por nombre de categoría (sin distinguir mayúsculas).'),
  }),
  async (args) => {
    const r = await listBubbles();
    if (r.bubbles.length === 0 && r.lastSync === 0) {
      return textResult('Eco no ha sincronizado bubbles todavía. Abrí la app al menos una vez con bubbles activas.');
    }
    let list = r.bubbles;
    if (!args.include_archived) list = list.filter((b) => !b.archived);
    if (args.workspace) {
      // Ruta completa (o padre), nombre de carpeta o fragmento, sin distinguir mayúsculas.
      const ws = args.workspace.replace(/\/$/, '');
      const needle = ws.toLowerCase();
      list = list.filter((b) => {
        const w = b.workspace;
        if (w === ws || w.startsWith(ws + '/')) return true;
        const lower = w.toLowerCase();
        return lower.split('/').pop() === needle || lower.includes(needle);
      });
    }
    if (args.category) {
      const wanted = args.category.trim().toLowerCase();
      list = list.filter((b) => (b.categories ?? []).some((c) => c.toLowerCase() === wanted));
    }
    // Un sync rechazado congela el snapshot: avisar siempre, aunque haya lista.
    const warning = r.syncError ? `${r.syncError.hint}\n\n` : '';
    const synced = r.lastSync ? ` · último sync ${relMs(r.lastSync)}` : '';
    if (list.length === 0) return textResult(`${warning}No hay bubbles que coincidan.${synced}`);
    const order = (b: BubbleSummary) => (b.archived ? 3 : b.busy ? 0 : b.running ? 1 : 2);
    list = [...list].sort((a, b) => order(a) - order(b) || b.updatedAt - a.updatedAt);
    return textResult(`${warning}Bubbles en Eco (${list.length}${synced}):\n${list.map(summaryLine).join('\n')}`);
  },
);

const getBubbleTool = defineTool(
  'get_bubble',
  'Estado exacto de una bubble: si el agente está trabajando, terminó su turno, espera un permiso o está offline; ' +
  'último mensaje del agente (del transcript de Claude Code), terminales, dev servers, git (rama, cambios, PR) y la cola del terminal.',
  z.object({
    bubble_id: BubbleId,
    output_lines: z.number().int().min(1).max(400).optional().describe('Líneas de la cola del terminal a incluir (default 40).'),
    include_transcript: z.boolean().optional().describe('Leer el transcript de Claude Code para precisar el estado (default true).'),
    include_git: z.boolean().optional().describe('Incluir rama, cambios, último commit y PR (default true).'),
    agent: AgentArg,
  }),
  async (args) => {
    const s = await getBubbleStatus(args.bubble_id, {
      lines: args.output_lines,
      transcript: args.include_transcript !== false,
      git: args.include_git !== false,
      agent: args.agent ?? detectHostAgent(),
    });
    return textResult(formatStatus(s, { showOutput: true, showGit: args.include_git !== false }));
  },
);

function formatWait(w: Awaited<ReturnType<typeof waitForBubble>>): string {
  const head = w.timedOut
    ? `Se venció la espera (${Math.round(w.waitedMs / 1000)} s) y el agente sigue activo. Volvé a llamar wait_for_bubble para seguir esperando.`
    : `El agente quedó quieto tras ${Math.round(w.waitedMs / 1000)} s.`;
  return `${head}\n\n${formatStatus(w, { showOutput: true, showGit: false })}`;
}

const sendToBubbleTool = defineTool(
  'send_to_bubble',
  'Envía un prompt (puede ser multilínea) al agente de una bubble EXISTENTE. Se tipea en su terminal como un ' +
  'único mensaje; si el terminal no estaba corriendo, lo arranca y espera a que el CLI esté listo. Confirma la entrega. ' +
  'Con wait_s > 0 además espera a que el agente termine (o hasta wait_s) y devuelve su estado y último mensaje.',
  z.object({
    bubble_id: BubbleId,
    text: z.string().min(1).max(16_000).describe('Prompt a enviar. Acepta varias líneas.'),
    agent: AgentArg,
    wait_s: z.number().int().min(0).max(600).optional().describe('Segundos a esperar a que el agente termine tras enviar (0 = no esperar, default).'),
  }),
  async (args) => {
    const agent = args.agent ?? detectHostAgent();
    const r = await sendToBubble(args.bubble_id, args.text, agent);
    const lines = [
      `Prompt enviado a la bubble ${r.bubbleId} (terminal "${r.ptyId}", agente ${agent}).`,
      r.spawned
        ? `  El terminal no estaba corriendo: se arrancó y ${r.ready ? `el CLI quedó listo en ${(r.readyAfterMs / 1000).toFixed(1)} s` : 'se escribió tras el tope de espera sin confirmar que el CLI estuviera listo'}.`
        : r.agentWasBusy
          ? '  El agente estaba trabajando: el prompt quedó encolado y lo procesa cuando termine el turno actual.'
          : '  El agente estaba quieto; debería empezar a procesarlo ya.',
    ];
    if (r.delivered === false) {
      lines.push(
        '  ATENCIÓN: el agente NO registró el prompt. Casi siempre es un diálogo de Claude Code que interceptó el texto ' +
        '(nuevo MCP server del proyecto, confianza en la carpeta, etc.). Mirá el terminal, resolvelo con answer_bubble ' +
        '(por ejemplo "enter" para aceptar o "esc" para cancelar) y volvé a enviar el prompt.',
        '',
        'Terminal:',
        r.terminal ?? '(sin output)',
      );
      return textResult(lines.join('\n'));
    }
    if (r.delivered === true) lines.push('  Entrega confirmada: el transcript del agente registró el prompt.');
    if (!args.wait_s) {
      lines.push('  Para ver la respuesta: wait_for_bubble o get_bubble.');
      return textResult(lines.join('\n'));
    }
    const w = await waitForBubble(args.bubble_id, { timeoutMs: args.wait_s * 1000, agent, requireActivity: true });
    return textResult(`${lines.join('\n')}\n\n${formatWait(w)}`);
  },
);

const waitForBubbleTool = defineTool(
  'wait_for_bubble',
  'Espera a que el agente de la bubble deje de trabajar (terminal quieto) o hasta timeout_s, y devuelve su estado ' +
  'y último mensaje. Si devuelve que se venció la espera, volvé a llamarla. Default 55 s (bajo el timeout de tools de Codex); hasta 600 s.',
  z.object({
    bubble_id: BubbleId,
    timeout_s: z.number().int().min(1).max(600).optional().describe('Segundos máximos a esperar (default 55).'),
    agent: AgentArg,
  }),
  async (args) => {
    const w = await waitForBubble(args.bubble_id, { timeoutMs: (args.timeout_s ?? 55) * 1000, agent: args.agent ?? detectHostAgent() });
    return textResult(formatWait(w));
  },
);

const interruptBubbleTool = defineTool(
  'interrupt_bubble',
  'Interrumpe lo que está haciendo el agente de la bubble: manda Esc (cancela el turno en Claude Code / Codex) o Ctrl+C.',
  z.object({
    bubble_id: BubbleId,
    signal: z.enum(['esc', 'ctrl_c']).optional().describe('esc (default) cancela el turno del agente; ctrl_c interrumpe el proceso en primer plano.'),
    agent: AgentArg,
  }),
  async (args) => {
    const key = args.signal ?? 'esc';
    const r = await sendKeys(args.bubble_id, [key], args.agent ?? detectHostAgent());
    return textResult(`Enviado ${key === 'esc' ? 'Esc' : 'Ctrl+C'} al terminal "${r.ptyId}" de la bubble ${args.bubble_id}. Usá get_bubble para confirmar que se detuvo.`);
  },
);

const answerBubbleTool = defineTool(
  'answer_bubble',
  'Responde un prompt interactivo del agente (permiso de tool, pregunta con opciones) sin armar un prompt completo. ' +
  'Teclas con nombre: enter, esc, up, down, left, right, tab, ctrl_c, backspace. Un dígito o texto corto se tipea literal seguido de Enter ' +
  '(en los permisos de Claude Code: "1" = sí, "2" = sí y no volver a preguntar, "3"/esc = no).',
  z.object({
    bubble_id: BubbleId,
    answer: z.string().min(1).max(200).describe('Tecla con nombre (enter/esc/up/down/tab/ctrl_c) o texto corto a tipear + Enter.'),
    agent: AgentArg,
  }),
  async (args) => {
    const r = await sendKeys(args.bubble_id, [args.answer], args.agent ?? detectHostAgent());
    return textResult(`Enviado ${r.sent.join(', ')} al terminal "${r.ptyId}" de la bubble ${args.bubble_id}. Verificá con get_bubble o wait_for_bubble.`);
  },
);

const closeBubbleTool = defineTool(
  'close_bubble',
  'Cierra una bubble como el botón cerrar de Eco: la ARCHIVA (mata terminal y dev servers, conserva worktree y rama; ' +
  'recuperable desde Archivados). Con permanent=true la elimina del todo (borrado lógico + worktree removido). Requiere Eco abierto.',
  z.object({
    bubble_id: BubbleId,
    permanent: z.boolean().optional().describe('true = eliminar definitivamente en vez de archivar (default false).'),
  }),
  async (args) => {
    const permanent = !!args.permanent;
    const r = await requestCloseBubble(args.bubble_id, permanent);
    if (r.alreadyArchived) return textResult(`La bubble ${args.bubble_id} ya estaba archivada.`);
    const verb = permanent ? 'eliminada' : 'archivada';
    return textResult(r.confirmed
      ? `Bubble ${args.bubble_id} ${verb} (confirmado por la UI de Eco).`
      : `Pedido de ${permanent ? 'eliminación' : 'archivado'} enviado a Eco, pero la UI no lo confirmó en 4 s. Verificá con list_bubbles en unos segundos.`);
  },
);

const renameBubbleTool = defineTool(
  'rename_bubble',
  'Cambia el título de una bubble en Eco. Requiere Eco abierto.',
  z.object({
    bubble_id: BubbleId,
    title: z.string().trim().min(1).max(120).describe('Nuevo título (3-6 palabras).'),
  }),
  async (args) => {
    const r = await renameBubble(args.bubble_id, args.title);
    return textResult(r.confirmed
      ? `Bubble ${args.bubble_id} renombrada a "${r.title}".`
      : `Pedido de renombrado enviado, sin confirmación de la UI en 4 s. Verificá con list_bubbles.`);
  },
);

const focusBubbleTool = defineTool(
  'focus_bubble',
  'Abre/enfoca la bubble en la ventana de Eco (como clickearla en el Dashboard). Requiere Eco abierto.',
  z.object({ bubble_id: BubbleId }),
  async (args) => {
    await focusBubble(args.bubble_id);
    return textResult(`Eco abrió la bubble ${args.bubble_id}.`);
  },
);

const setBubbleCategoryTool = defineTool(
  'set_bubble_category',
  'Cambia las categorías de una bubble por nombre (o id). mode: set (reemplaza, default), add, remove, clear. ' +
  'Si la categoría no existe, falla listando las disponibles (las categorías se crean desde la UI de Eco). Requiere Eco abierto.',
  z.object({
    bubble_id: BubbleId,
    category: z.string().trim().min(1).max(80).optional().describe('Nombre (sin distinguir mayúsculas/acentos) o id de la categoría. No aplica con mode=clear.'),
    mode: z.enum(['set', 'add', 'remove', 'clear']).optional().describe('set = única categoría (default); add/remove = agregar/quitar; clear = sin categorías.'),
  }),
  async (args) => {
    const mode = args.mode ?? 'set';
    if (mode !== 'clear' && !args.category) return errorResult('Falta `category` (salvo con mode=clear). Usá list_categories para ver las disponibles.');
    const r = await setBubbleCategories(args.bubble_id, mode, args.category);
    const now = r.categories.length > 0 ? r.categories.join(', ') : '(ninguna)';
    if (r.unchanged) return textResult(`Sin cambios: la bubble ya tenía esas categorías (${now}).`);
    return textResult(r.confirmed
      ? `Categorías de la bubble ${args.bubble_id}: ${now} (confirmado por la UI).`
      : `Cambio enviado a Eco (${now}), sin confirmación de la UI en 4 s. Verificá con get_bubble.`);
  },
);

const listCategoriesTool = defineTool(
  'list_categories',
  'Lista las categorías definidas en Eco (nombre, id, color) para usar con set_bubble_category o filtrar list_bubbles.',
  z.object({}),
  async () => {
    const cats = await listCategories();
    if (cats.length === 0) return textResult('No hay categorías definidas en Eco (se crean desde la UI, en el menú de una bubble o Ajustes).');
    return textResult(`Categorías (${cats.length}):\n${cats.map((c) => `  • ${c.name} — id ${c.id}, color ${c.color}`).join('\n')}`);
  },
);

const devServerTool = defineTool(
  'dev_server',
  'Arranca, detiene, reinicia o consulta el dev server de la bubble usando el comando que el admin configuró para el ' +
  'workspace (single o dual frontend+backend). Devuelve estado, URL y últimas líneas de log de cada server.',
  z.object({
    bubble_id: BubbleId,
    action: z.enum(['start', 'stop', 'restart', 'status']).describe('Acción sobre el/los server(s).'),
    role: z.enum(['main', 'frontend', 'backend']).optional().describe('Solo ese slot. Si se omite: main en single, backend+frontend (en ese orden) en dual.'),
  }),
  async (args) => {
    const r = await devServerAction(args.bubble_id, args.action, args.role);
    const out: string[] = [`dev_server ${args.action} en la bubble ${args.bubble_id} (${r.dual ? 'dual' : 'single'}).`];
    for (const x of r.results) out.push(`  ${x.role}: ${x.ok ? 'ok' : `falló (${x.error ?? 'error'})`}`);
    out.push('Servers:');
    for (const s of r.servers) {
      out.push(`  ${s.role}: ${s.status}${s.url ? ` → ${s.url}` : ''}${s.exitCode !== null ? ` (exit ${s.exitCode})` : ''}${s.command ? `\n    cmd: ${s.command}` : ''}`);
    }
    for (const [role, log] of Object.entries(r.logs)) {
      if (log.trim()) out.push(`\nLog ${role} (últimas líneas):\n${log}`);
    }
    return textResult(out.join('\n'));
  },
);

const getBubbleDiffTool = defineTool(
  'get_bubble_diff',
  'Diff del worktree de la bubble contra HEAD (lo que el agente cambió y aún no commiteó). Sin path devuelve el stat + diff ' +
  'completo + archivos nuevos; con path solo ese archivo.',
  z.object({
    bubble_id: BubbleId,
    path: z.string().min(1).max(4096).optional().describe('Archivo (relativo al worktree) para ver solo su diff.'),
    max_bytes: z.number().int().min(1000).max(512_000).optional().describe('Tope de bytes del diff (default 200000).'),
  }),
  async (args) => {
    const r = await getBubbleDiff(args.bubble_id, args.path, args.max_bytes);
    if (r.scope === 'file') {
      if (!r.hasChanges) return textResult(`Sin cambios en ${r.path}${r.message ? ` (${r.message})` : ''}.`);
      return textResult(`Diff de ${r.path} (${r.mode}):\n\n${r.diff}${r.truncated ? '\n\n[diff truncado]' : ''}`);
    }
    if (!r.git) return textResult(`El directorio ${r.dir} no es un repositorio git.`);
    if (!r.hasChanges) return textResult(`Sin cambios en el worktree ${r.dir}.`);
    const out = [`Worktree: ${r.dir}`];
    if (r.stat) out.push(`\n${r.stat}`);
    if (r.untracked.length > 0) out.push(`\nArchivos nuevos sin trackear (${r.untracked.length}): ${r.untracked.join(', ')}`);
    if (r.diff) out.push(`\n${r.diff}${r.truncated ? '\n\n[diff truncado — pedí un archivo con `path`]' : ''}`);
    return textResult(out.join('\n'));
  },
);

const readConversationTool = defineTool(
  'read_bubble_conversation',
  'Lee la conversación de la bubble (prompts del usuario y respuestas del agente) desde el transcript de Claude Code, ' +
  'aunque el agente esté offline. Devuelve los últimos N turnos en orden cronológico; con include_tools agrega las tools usadas. ' +
  'Para Codex no hay transcript: devuelve la cola del terminal.',
  z.object({
    bubble_id: BubbleId,
    last_turns: z.number().int().min(1).max(100).optional().describe('Cuántos turnos (prompt + respuesta) incluir, de los más recientes (default 10).'),
    include_tools: z.boolean().optional().describe('Incluir una línea por tool usada (nombre, input, resultado resumido). Default false.'),
    max_chars: z.number().int().min(1000).max(200_000).optional().describe('Tope de caracteres (default 20000).'),
    agent: AgentArg,
  }),
  async (args) => {
    const r = await readBubbleConversation(args.bubble_id, {
      lastTurns: args.last_turns,
      includeTools: args.include_tools,
      maxChars: args.max_chars,
      agent: args.agent ?? detectHostAgent(),
    });
    if (r.source === 'pty') {
      return textResult(`${r.note}\n\nCola del terminal:\n${r.text || '(vacía)'}`);
    }
    if (r.turns.length === 0) return textResult('El transcript existe pero no tiene turnos legibles todavía.');
    const out: string[] = [`Conversación de la bubble ${r.bubbleId} (${r.turns.length} turno(s)${r.truncated ? ', recortada' : ''}; sesión ${r.sessionId ?? '?'}):`];
    r.turns.forEach((t, i) => {
      out.push(`\n── Turno ${i + 1}${t.userAt ? ` (${relTime(t.userAt)})` : ''} ──`);
      out.push(`Usuario: ${t.userText || '(prompt fuera del rango leído)'}`);
      for (const tool of t.tools) {
        const res = tool.resultPreview ? ` → ${tool.isError ? 'ERROR: ' : ''}${tool.resultPreview}` : '';
        out.push(`  [tool ${tool.name}] ${tool.inputSummary}${res}`);
      }
      if (t.assistantTexts.length > 0) out.push(`Agente: ${t.assistantTexts.join('\n\n')}`);
      else out.push('Agente: (sin texto en este turno)');
    });
    return textResult(out.join('\n'));
  },
);

export const TOOLS: ToolDef[] = [
  createBubbleTool,
  listBubblesTool,
  getBubbleTool,
  readConversationTool,
  sendToBubbleTool,
  waitForBubbleTool,
  answerBubbleTool,
  interruptBubbleTool,
  closeBubbleTool,
  renameBubbleTool,
  focusBubbleTool,
  setBubbleCategoryTool,
  listCategoriesTool,
  devServerTool,
  getBubbleDiffTool,
];
