import { useEffect, useState } from 'react';
import { Btn, IconBtn } from '@/design/primitives';
import { workspaceName } from '@/lib/workspace-name';
import { IconFolder, IconFolderOpen, IconX, IconCheck } from '@/design/icons';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useT } from '@/hooks/useI18n';

type Props = {
  open: boolean;
  bubbleTitle: string;
  onPick: (workspace: string) => void;
  onSkip: () => void;
  onClose: () => void;
  // Agregar carpetas al universo global es solo del admin. Los members solo
  // eligen entre las carpetas que el admin les concedió.
  canAddFolders?: boolean;
};

export function WorkspacePicker({ open, bubbleTitle, onPick, onSkip, onClose, canAddFolders = true }: Props) {
  const tr = useT();
  const ws = useWorkspaces();
  const [adding, setAdding] = useState(false);
  const [draftPath, setDraftPath] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) ws.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleAdd(pathOverride?: string) {
    const v = (pathOverride ?? draftPath).trim();
    if (!v) return;
    setBusy(true);
    setAddError(null);
    const result = await ws.add(v);
    setBusy(false);
    if (result.ok) {
      setDraftPath('');
      setAdding(false);
      // Auto-pick la carpeta recién agregada
      onPick(v);
    } else {
      setAddError(result.error);
    }
  }

  // Folder picker nativo de Electron — abre Finder en Mac. Si no estamos en
  // Electron (web puro), cae al modo de input manual.
  async function pickWithDialog() {
    const api = (window as unknown as { electronAPI?: { pickFolder?: (opts: { title: string }) => Promise<{ canceled: boolean; path: string }> } }).electronAPI;
    if (!api?.pickFolder) {
      setAdding(true);
      return;
    }
    try {
      const r = await api.pickFolder({ title: 'Elegir carpeta para el agente' });
      if (r.canceled || !r.path) return;
      await handleAdd(r.path);
    } catch {
      setAdding(true);
    }
  }

  const hasNativePicker = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;

  return (
    <div className="eco-scrim" style={{ zIndex: 170 }} onClick={onClose}>
      <div className="eco-dialog" role="dialog" aria-modal="true" aria-label={tr('wsp.title')}
        style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconFolderOpen size={20}/></span>
          <h2 className="eco-dialog__title">{tr('wsp.title')}</h2>
          <IconBtn icon={IconX} size={32} title={tr('common.close')} onClick={onClose}/>
        </div>
        <p className="eco-dialog__body">«{bubbleTitle}» — {tr('wsp.sub')}</p>

        <div className="eco-dialog__section">
          {ws.loading ? (
            <div className="eco-empty">{tr('common.loading')}</div>
          ) : ws.list.workspaces.length === 0 && !adding ? (
            <div className="eco-empty">
              {tr('wsp.no_workspaces')}
              {!canAddFolders && <div className="eco-sub" style={{ marginTop: 6 }}>{tr('wsp.ask_admin')}</div>}
            </div>
          ) : (
            <div className="eco-optlist">
              {/* La lista scrollea sola para no empujar las acciones fuera de la ventana. */}
              <div className="eco-optlist__scroll" style={{ maxHeight: 260 }}>
                {ws.list.workspaces.map((path) => (
                  <button key={path} type="button" title={path} onClick={() => onPick(path)} className="eco-option">
                    <span className="eco-option__tile"><IconFolder size={16}/></span>
                    <span className="eco-option__text">
                      <span className="eco-option__title">{workspaceName(path)}</span>
                      <span className="eco-option__sub">{path}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!canAddFolders ? null : adding ? (
          <div className="eco-dialog__section">
            <label className="eco-field-label" htmlFor="eco-wsp-path">{tr('wsp.add_hint')}</label>
            <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
              <input
                id="eco-wsp-path"
                autoFocus
                className="eco-field eco-field--mono"
                value={draftPath}
                onChange={(e) => { setDraftPath(e.target.value); setAddError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAdd();
                  if (e.key === 'Escape') { setAdding(false); setDraftPath(''); }
                }}
                placeholder="/Users/sergio/projects/aditum-jh"
                style={{ flex: '1 1 200px', width: 'auto' }}
              />
              <Btn kind="primary" size="lg" onClick={() => void handleAdd()} disabled={busy || !draftPath.trim()} icon={IconCheck}>
                {busy ? tr('wsp.add_loading') : tr('wsp.add_btn')}
              </Btn>
            </div>
            {addError && <div className="eco-banner eco-banner--err">{addError}</div>}
          </div>
        ) : (
          <div className="eco-dialog__section" style={{ alignItems: 'flex-start' }}>
            {/* Elegir carpeta con Finder/Explorer nativo (Electron) */}
            <button
              type="button"
              onClick={() => void pickWithDialog()}
              disabled={busy}
              className="eco-btn eco-btn--dashed eco-btn--lg eco-btn--block"
              style={{ justifyContent: 'flex-start' }}>
              <IconFolderOpen size={15}/>
              <span className="eco-grow eco-truncate" style={{ textAlign: 'left' }}>
                {busy ? tr('wsp.add_loading') : (hasNativePicker ? tr('wsp.pick_folder') : tr('wsp.add_other'))}
              </span>
              {hasNativePicker && <span className="eco-num">Finder</span>}
            </button>

            {/* Opción de escribir el path manual (avanzado) */}
            {hasNativePicker && (
              <Btn kind="ghost" size="sm" onClick={() => setAdding(true)}>{tr('wsp.type_path_instead')}</Btn>
            )}
          </div>
        )}

        <div className="eco-dialog__foot">
          <div className="eco-dialog__hint">{tr('wsp.change_later')}</div>
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onSkip}>
              {tr('wsp.skip')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
