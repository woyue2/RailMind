// 引用/分支源记录的专属色库(与标签色板保持一致)
// 源记录在"首次被引用/跨天分支"时,从该色库随机分配一个颜色,之后固定不变,
// 所有指向它的引用都使用同一颜色(同源同色)。
export const QUOTE_COLOR_PALETTE = [
  '#F87171', // Red
  '#FB923C', // Orange
  '#FBBF24', // Amber
  '#34D399', // Emerald
  '#60A5FA', // Blue
  '#818CF8', // Indigo
  '#A78BFA', // Purple
  '#9CA3AF', // Gray
];

export const pickRandomQuoteColor = (): string =>
  QUOTE_COLOR_PALETTE[Math.floor(Math.random() * QUOTE_COLOR_PALETTE.length)];
