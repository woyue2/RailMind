import { create } from 'zustand';

interface TagSectionState {
  /** 標籤視圖目前所在的標籤節；只存在本次會話，跨 RecordView 卸載保留，但不落盤。 */
  selectedTagKey: string | null;
  setSelectedTagKey: (key: string | null) => void;
}

export const useTagSectionState = create<TagSectionState>()((set) => ({
  selectedTagKey: null,
  setSelectedTagKey: (selectedTagKey) => set({ selectedTagKey }),
}));
