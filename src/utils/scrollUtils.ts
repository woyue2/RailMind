import { useFlowStore } from '../store/useFlowStore';

/**
 * Scrolls a target into view without any smooth scrolling animation,
 * while keeping the existing block/inline positioning behavior.
 */
export function revealElement(element: HTMLElement | null, block: ScrollLogicalPosition = 'center') {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const visibleTop = 0;
  const visibleBottom = viewportHeight;

  if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;

  const distance = rect.bottom < visibleTop ? -rect.bottom : rect.top - visibleBottom;
  const nearby = Math.abs(distance) <= viewportHeight * 0.6;
  element.scrollIntoView({
    behavior: 'auto',
    block: nearby ? 'nearest' : block,
    inline: 'nearest',
  });
}

/**
 * 高亮一筆記錄並滾動到它，1.6s 後自動取消高亮。
 * 跳轉類互動（搜尋、回顧、矩陣）共用同一套節奏。
 * resolveElement 可覆寫要滾動的目標（例如歷史頁的預覽卡片）。
 */
export function flashRecord(
  id: string,
  delayMs = 300,
  resolveElement: () => HTMLElement | null = () => document.getElementById(`record-${id}`)
): void {
  const store = useFlowStore.getState();
  store.setHighlightRecordId(id);
  window.setTimeout(() => {
    revealElement(resolveElement());
    window.setTimeout(() => {
      if (useFlowStore.getState().highlightRecordId === id) {
        useFlowStore.getState().setHighlightRecordId(null);
      }
    }, 1600);
  }, delayMs);
}
