import { ValuePriorityProfile, ValueQuadrant } from '../types';

export const VALUE_QUADRANTS: Array<{
  id: ValueQuadrant;
  number: string;
  title: string;
  axes: string;
  action: string;
  tone: string;
}> = [
  { id: 'action', number: '①', title: '行動區', axes: '高價值 × 高晚做損失', action: '現在做', tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  { id: 'investment', number: '②', title: '投資區', axes: '高價值 × 低晚做損失', action: '安排時間做', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { id: 'firefighting', number: '③', title: '救火區', axes: '低價值 × 高晚做損失', action: '快速處理／委派', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'eliminate', number: '④', title: '淘汰區', axes: '低價值 × 低晚做損失', action: '刪除／暫緩', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
];

export function getValueQuadrant(highValue: boolean, highDelayLoss: boolean): ValueQuadrant {
  if (highValue && highDelayLoss) return 'action';
  if (highValue) return 'investment';
  if (highDelayLoss) return 'firefighting';
  return 'eliminate';
}

export function buildValueProfile(input: Omit<ValuePriorityProfile, 'quadrant' | 'reason' | 'is_container'>): ValuePriorityProfile {
  const quadrant = getValueQuadrant(Boolean(input.high_value), Boolean(input.high_delay_loss));
  const reason = input.is_routine
    ? `${input.high_value ? '長期累積有價值' : '長期累積價值有限'}，${input.high_delay_loss ? '中斷或延後會造成明顯損失' : '延後損失較低'}`
    : `${input.high_value ? '這次完成有直接價值' : '這次完成價值有限'}，${input.high_delay_loss ? '晚做會造成明顯損失' : '晚做損失較低'}`;
  return { ...input, quadrant, reason };
}
