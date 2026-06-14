// Datos para el grafo de equipo del admin: combina las bubbles REALES del
// admin (interactivas, con todos sus datos) con las de los demás usuarios
// SINTETIZADAS desde GET /admin/overview (poll 5 s). El grafo en sí es el
// GraphView normal del Dashboard en modo groupMode="owner" — así hereda todas
// las animaciones, satélites y controles sin forkear nada.

import { useEffect, useMemo } from 'react';
import { useTokens } from '@/design/theme';
import { useAdmin } from '@/hooks/useAdmin';
import type { Bubble } from '@/lib/types';

export function useTeamBubbles(ownBubbles: Bubble[], myUserId: string | null, enabled: boolean): {
  teamBubbles: Bubble[];
  ownerNames: Record<string, string>;
} {
  const t = useTokens();
  const admin = useAdmin();

  useEffect(() => {
    if (!enabled) return;
    void admin.refreshOverview();
    const iv = setInterval(() => { void admin.refreshOverview(); }, 5000);
    return () => clearInterval(iv);
  }, [enabled, admin.refreshOverview]);

  return useMemo(() => {
    const ownerNames: Record<string, string> = {};
    const out: Bubble[] = [];

    // Bubbles propias del admin: reales (interactivas), tag de ownerId.
    if (myUserId) {
      for (const b of ownBubbles) {
        if (b.archived) continue;
        out.push({ ...b, ownerId: myUserId });
      }
    }

    for (const u of admin.overview) {
      ownerNames[u.id] = u.username;
      if (u.id === myUserId) continue; // las propias ya van reales
      for (const b of u.bubbles) {
        if (b.archived) continue;
        out.push({
          id: b.id,
          title: b.title,
          workspace: b.workspace,
          sessionId: null,
          messages: [],
          status: b.status as Bubble['status'],
          unread: 0,
          accent: t.accent,
          pinned: false,
          createdAt: 0,
          updatedAt: b.updatedAt,
          ptyOpen: b.ptyRunning,
          ownerId: u.id,
          ...(b.categoryIds && b.categoryIds.length > 0 ? { categoryIds: b.categoryIds } : {}),
          ...(b.lastMsgPreview ? { lastMsgPreview: b.lastMsgPreview } : {}),
        });
      }
    }
    // Aseguramos que el nombre del admin esté presente aunque no tenga overview.
    if (myUserId && !ownerNames[myUserId]) {
      const me = admin.overview.find((u) => u.id === myUserId);
      ownerNames[myUserId] = me?.username ?? '—';
    }
    return { teamBubbles: out, ownerNames };
  }, [admin.overview, ownBubbles, myUserId, t.accent]);
}
