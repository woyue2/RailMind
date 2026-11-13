/**
 * 全部顯示與分日都固定用東八區（UTC+8）。
 * 持久化的時間仍是 UTC ISO；不再使用瀏覽器所在時區。
 */
export const APP_TIME_ZONE = 'Asia/Shanghai';
const APP_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/** 把某個瞬間位移成 UTC+8 的牆鐘時間；用 UTC getter 讀取。 */
export function toAppDate(value: string | Date): Date {
  const base = typeof value === 'string' ? new Date(value) : value;
  if (!base || Number.isNaN(base.getTime())) return new Date(Number.NaN);
  return new Date(base.getTime() + APP_UTC_OFFSET_MS);
}

/** 東八區的 YYYY-MM-DD。 */
export function appDateKey(value: string | Date = new Date()): string {
  const shifted = toAppDate(value);
  if (Number.isNaN(shifted.getTime())) return '';
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 東八區某一天的 00:00，回傳真正的瞬間（UTC Date）。 */
export function appStartOfDay(date: Date = new Date()): Date {
  const shifted = toAppDate(date);
  if (Number.isNaN(shifted.getTime())) return new Date(Number.NaN);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - APP_UTC_OFFSET_MS
  );
}

/** 今天往回推 N 天的東八區日期鍵。 */
export function appDateKeyOffset(days: number): string {
  return appDateKey(new Date(Date.now() - days * DAY_MS));
}

export function formatTime(isoString: string): string {
  const shifted = toAppDate(isoString);
  if (Number.isNaN(shifted.getTime())) return '00:00';
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 東八區的日期鍵；函式名稱保留給既有呼叫端。 */
export function getLocalDateKey(isoString: string): string {
  return appDateKey(isoString);
}

export function getRelativeDayMeta(isoStringOrDate: string | Date): {
  label: string;
  isToday: boolean;
  isYesterday: boolean;
  dateKey: string;
} {
  const shifted = toAppDate(isoStringOrDate);
  if (Number.isNaN(shifted.getTime())) {
    return {
      label: String(isoStringOrDate),
      isToday: false,
      isYesterday: false,
      dateKey: '',
    };
  }

  const dateKey = appDateKey(isoStringOrDate);
  const todayKey = appDateKey(new Date());
  const yesterdayKey = appDateKey(new Date(Date.now() - DAY_MS));
  const beforeYesterdayKey = appDateKey(new Date(Date.now() - 2 * DAY_MS));

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const todayYear = toAppDate(new Date()).getUTCFullYear();
  const fullLabel = year === todayYear ? `${month}月${day}日` : `${year}年${month}月${day}日`;

  if (dateKey === todayKey) {
    return { label: `今天 ${month}月${day}日`, isToday: true, isYesterday: false, dateKey };
  }
  if (dateKey === yesterdayKey) {
    return { label: `昨天 ${month}月${day}日`, isToday: false, isYesterday: true, dateKey };
  }
  if (dateKey === beforeYesterdayKey) {
    return { label: `前天 ${month}月${day}日`, isToday: false, isYesterday: false, dateKey };
  }
  return { label: fullLabel, isToday: false, isYesterday: false, dateKey };
}

export function formatSimpleDate(isoString: string): string {
  const shifted = toAppDate(isoString);
  if (Number.isNaN(shifted.getTime())) return isoString;
  return `${shifted.getUTCMonth() + 1}月${shifted.getUTCDate()}日`;
}

export function formatShortDateTime(isoString: string): string {
  const shifted = toAppDate(isoString);
  if (Number.isNaN(shifted.getTime())) return isoString;
  return `${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 東八區的日曆天數差。 */
export function calculateDaysBetween(earlierIso: string, laterIso: string): number {
  const earlier = getLocalDateKey(earlierIso);
  const later = getLocalDateKey(laterIso);
  if (!earlier || !later) return 0;
  const toUtc = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round(Math.abs(toUtc(later) - toUtc(earlier)) / DAY_MS);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
