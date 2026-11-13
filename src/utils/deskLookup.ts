import type { DeskEdgeRow } from '../types';

export interface DrawerRef {
  id: string;
  title: string;
}

/** entry id → owning drawer (id + title), shared by record and review views. */
export function buildDrawerByEntryId(deskRows: DeskEdgeRow[]): Map<string, DrawerRef> {
  const map = new Map<string, DrawerRef>();
  for (const row of deskRows) {
    for (const drawer of row.drawers) {
      for (const entry of drawer.entries) {
        map.set(entry.id, { id: drawer.id, title: drawer.title });
      }
    }
  }
  return map;
}
