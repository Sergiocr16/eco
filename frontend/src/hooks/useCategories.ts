// Categorías configurables para etiquetar agentes (burbujas). Cada categoría
// tiene un nombre + color. El color se usa para teñir el nodo en la vista de
// grafo del Dashboard y como chip en las cards.
//
// Persistido en localStorage `eco.categories`. Patrón store + subscribers:
// cualquier componente que use el hook se re-renderiza cuando la lista cambia,
// sin importar quién hizo el cambio (Settings, menú de la burbuja, etc.).

import { useEffect, useState } from 'react';

export type Category = {
  id: string;
  name: string;
  color: string;  // hex o token CSS
};

const STORAGE_KEY = 'eco.categories';

// Paleta sugerida para el color picker — colores distinguibles entre sí.
export const CATEGORY_PALETTE = [
  // Saturados — espectro completo
  '#ef4444', // rojo
  '#f97316', // naranja
  '#f59e0b', // ámbar
  '#eab308', // amarillo
  '#84cc16', // lima
  '#22c55e', // verde
  '#10b981', // esmeralda
  '#14b8a6', // teal
  '#06b6d4', // cian
  '#0ea5e9', // celeste
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#8b5cf6', // violeta
  '#a855f7', // púrpura
  '#d946ef', // fucsia
  '#ec4899', // rosa
  '#f43f5e', // rosado
  // Tonos suaves
  '#fca5a5', // rojo claro
  '#fdba74', // naranja claro
  '#fde047', // amarillo claro
  '#86efac', // verde claro
  '#5eead4', // teal claro
  '#7dd3fc', // celeste claro
  '#93c5fd', // azul claro
  '#c4b5fd', // violeta claro
  '#f9a8d4', // rosa claro
  // Neutros
  '#78716c', // piedra
  '#a3a3a3', // gris
  '#64748b', // pizarra
  '#475569', // pizarra oscuro
];

function load(): Category[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Category =>
        !!c && typeof c === 'object'
        && typeof (c as Category).id === 'string'
        && typeof (c as Category).name === 'string'
        && typeof (c as Category).color === 'string')
      .map((c) => ({ id: c.id, name: c.name, color: c.color }));
  } catch { return []; }
}

function persist(cats: Category[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cats)); }
  catch { /* noop */ }
}

// Store en memoria + subscribers — una sola fuente de verdad para toda la app.
let categories: Category[] = load();
const subs = new Set<() => void>();
function notify() { for (const fn of subs) { try { fn(); } catch { /* noop */ } } }

function setCategories(next: Category[]): void {
  categories = next;
  persist(next);
  notify();
}

function newId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type UseCategoriesResult = {
  categories: Category[];
  add: (name: string, color: string) => Category;
  update: (id: string, patch: Partial<Omit<Category, 'id'>>) => void;
  remove: (id: string) => void;
  byId: (id: string | undefined) => Category | null;
};

export function useCategories(): UseCategoriesResult {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);

  return {
    categories,
    add: (name: string, color: string) => {
      const cat: Category = { id: newId(), name: name.trim() || 'Categoría', color };
      setCategories([...categories, cat]);
      return cat;
    },
    update: (id: string, patch: Partial<Omit<Category, 'id'>>) => {
      setCategories(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    remove: (id: string) => {
      setCategories(categories.filter((c) => c.id !== id));
    },
    byId: (id: string | undefined) => {
      if (!id) return null;
      return categories.find((c) => c.id === id) ?? null;
    },
  };
}

/** Lectura sincrónica fuera de React (ej. para colorear nodos en un map). */
export function getCategoryById(id: string | undefined): Category | null {
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}
