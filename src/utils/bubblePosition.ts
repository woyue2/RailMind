/**
 * K8 修复：浮动气泡便签位置持久化。
 *
 * 原实现把 `pos` 放在 FloatingBubblePin 组件本地 useState 中，
 * 任何重渲染/刷新都会回到默认位置 (12, 12)，用户每次打开都要重新拖动。
 *
 * 这里用独立 localStorage key 保存，而不是并入 store 的 `flow-01-storage-v3`：
 * 浮标位置是纯本机 UI 偏好，不应参与 R2 同步，也不该增加主 key 的体积
 * （主 key 已接近 localStorage 配额，见 quotaSafeStorage）。
 */

const BUBBLE_POS_KEY = 'flow.ui.bubble-pos.v1';

export interface BubblePos {
  x: number;
  y: number;
  /** 保存时的视口宽度，用于跨设备/横竖屏切换时按比例校正 */
  vw: number;
  /** 保存时的视口高度 */
  vh: number;
}

function isValidPos(value: unknown): value is BubblePos {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BubblePos>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}

export function loadBubblePos(): BubblePos | null {
  try {
    const raw = localStorage.getItem(BUBBLE_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidPos(parsed)) return null;
    return {
      x: parsed.x,
      y: parsed.y,
      vw: typeof parsed.vw === 'number' && parsed.vw > 0 ? parsed.vw : 0,
      vh: typeof parsed.vh === 'number' && parsed.vh > 0 ? parsed.vh : 0,
    };
  } catch {
    return null;
  }
}

export function saveBubblePos(pos: { x: number; y: number }): void {
  try {
    const payload: BubblePos = {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
    localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(payload));
  } catch {
    // 位置偏好丢失不影响功能，写失败静默忽略（配额问题另有 StorageQuotaNotice 兜底）
  }
}
