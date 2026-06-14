import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, Glass } from '@/design/primitives';
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
  const t = useTokens();
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 170,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(540px, 100%)', maxHeight: '80vh',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconFolderOpen size={18}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text0, letterSpacing: -0.2 }}>
              {tr('wsp.title')}
            </div>
            <div style={{ fontSize: 12, color: t.text2, marginTop: 1 }}>
              «{bubbleTitle}» — {tr('wsp.sub')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconX size={14}/>
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          {ws.loading ? (
            <div style={{ fontSize: 13, color: t.text2, padding: '20px 4px' }}>{tr('common.loading')}</div>
          ) : ws.list.workspaces.length === 0 && !adding ? (
            <div style={{
              padding: '20px 4px', fontSize: 13, color: t.text2, textAlign: 'center',
            }}>
              {tr('wsp.no_workspaces')}
              {!canAddFolders && (
                <div style={{ marginTop: 6, fontSize: 12, color: t.text3 }}>
                  {tr('wsp.ask_admin')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {ws.list.workspaces.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => onPick(path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.glassBorder}`,
                    background: t.bg2, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 140ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = t.bg3;
                    e.currentTarget.style.borderColor = t.accentDim;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = t.bg2;
                    e.currentTarget.style.borderColor = t.glassBorder;
                  }}
                >
                  <div style={{ color: t.accent }}>
                    <IconFolder size={16}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{path}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!canAddFolders ? null : adding ? (
            <Glass radius={12} style={{ padding: 10, marginTop: 8 }}>
              <div style={{ fontSize: 11.5, color: t.text2, marginBottom: 8 }}>
                {tr('wsp.add_hint')}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={draftPath}
                  onChange={(e) => { setDraftPath(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAdd();
                    if (e.key === 'Escape') { setAdding(false); setDraftPath(''); }
                  }}
                  placeholder="/Users/sergio/projects/aditum-jh"
                  style={{
                    flex: 1, background: t.bg2, border: `1px solid ${t.glassBorder}`,
                    borderRadius: 8, padding: '8px 10px', outline: 'none',
                    fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
                  }}
                />
                <Btn kind="primary" size="sm" onClick={() => void handleAdd()} disabled={busy || !draftPath.trim()} icon={IconCheck}>
                  {busy ? tr('wsp.add_loading') : tr('wsp.add_btn')}
                </Btn>
              </div>
              {addError && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: t.err }}>{addError}</div>
              )}
            </Glass>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {/* Botón primario: Elegir carpeta con Finder/Explorer nativo (Electron) */}
              <button
                type="button"
                onClick={() => void pickWithDialog()}
                disabled={busy}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'transparent', border: `1px dashed ${t.glassBorderHi}`,
                  color: t.text1, cursor: busy ? 'wait' : 'pointer', textAlign: 'left',
                  transition: 'all 140ms',
                }}
                onMouseEnter={(e) => {
                  if (busy) return;
                  e.currentTarget.style.borderColor = t.accentDim;
                  e.currentTarget.style.background = t.accentFaint;
                  e.currentTarget.style.color = t.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = t.glassBorderHi;
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = t.text1;
                }}>
                <IconFolderOpen size={14}/>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                  {busy ? tr('wsp.add_loading') : (hasNativePicker ? tr('wsp.pick_folder') : tr('wsp.add_other'))}
                </span>
                {hasNativePicker && (
                  <span style={{ fontSize: 10, color: t.text3, fontFamily: t.fontMono }}>Finder</span>
                )}
              </button>

              {/* Link discreto: opción de escribir el path manual (avanzado) */}
              {hasNativePicker && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  style={{
                    background: 'transparent', border: 0, color: t.text3,
                    cursor: 'pointer', fontSize: 11, padding: '4px 0',
                    fontFamily: t.fontSans, textAlign: 'left',
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}>
                  {tr('wsp.type_path_instead')}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 8,
          padding: '12px 18px', borderTop: `1px solid ${t.glassBorder}`,
        }}>
          <Btn kind="ghost" size="sm" onClick={onSkip}>
            {tr('wsp.skip')}
          </Btn>
          <span style={{ fontSize: 10.5, color: t.text3 }}>
            {tr('wsp.change_later')}
          </span>
        </div>
      </div>
    </div>
  );
}
