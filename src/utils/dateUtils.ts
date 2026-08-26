import { format, parseISO, differenceInDays, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function formatTime(isoString: string): string {
  try {
    return format(parseISO(isoString), 'HH:mm');
  } catch {
    return '00:00';
  }
}

export function formatDateLabel(isoString: string): string {
  try {
    const date = parseISO(isoString);
    const now = new Date();
    const isToday = isSameDay(date, now);
    const dateStr = format(date, 'M月d日', { locale: zhCN });
    return isToday ? `今天 ${dateStr}` : dateStr;
  } catch {
    return isoString;
  }
}

export function formatSimpleDate(isoString: string): string {
  try {
    return format(parseISO(isoString), 'M月d日', { locale: zhCN });
  } catch {
    return isoString;
  }
}

export function formatShortDateTime(isoString: string): string {
  try {
    return format(parseISO(isoString), 'M/d HH:mm');
  } catch {
    return isoString;
  }
}

export function calculateDaysBetween(earlierIso: string, laterIso: string): number {
  try {
    const d1 = parseISO(earlierIso);
    const d2 = parseISO(laterIso);
    return Math.abs(differenceInDays(d2, d1));
  } catch {
    return 0;
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
