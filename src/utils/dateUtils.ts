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

export function getRelativeDayMeta(isoStringOrDate: string | Date): {
  label: string;
  isToday: boolean;
  isYesterday: boolean;
  dateKey: string;
} {
  try {
    const target = typeof isoStringOrDate === 'string' ? parseISO(isoStringOrDate) : isoStringOrDate;
    const now = new Date();
    const dateKey = format(target, 'yyyy-MM-dd');

    // Check Today
    if (isSameDay(target, now)) {
      return {
        label: `今天 ${format(target, 'M月d日', { locale: zhCN })}`,
        isToday: true,
        isYesterday: false,
        dateKey,
      };
    }

    // Check Yesterday
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (isSameDay(target, yesterday)) {
      return {
        label: `昨天 ${format(target, 'M月d日', { locale: zhCN })}`,
        isToday: false,
        isYesterday: true,
        dateKey,
      };
    }

    // Check Before Yesterday
    const beforeYesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    if (isSameDay(target, beforeYesterday)) {
      return {
        label: `前天 ${format(target, 'M月d日', { locale: zhCN })}`,
        isToday: false,
        isYesterday: false,
        dateKey,
      };
    }

    // Standard date label
    const isCurrentYear = target.getFullYear() === now.getFullYear();
    const pattern = isCurrentYear ? 'M月d日' : 'yyyy年M月d日';
    return {
      label: format(target, pattern, { locale: zhCN }),
      isToday: false,
      isYesterday: false,
      dateKey,
    };
  } catch {
    return {
      label: String(isoStringOrDate),
      isToday: false,
      isYesterday: false,
      dateKey: '',
    };
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
