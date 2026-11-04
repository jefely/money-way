/**
 * 会员功能占位文案。正式混淆时用同一份明文重新密封。
 * 这些句子不是秘密，秘密是发行私钥。
 */

export const PREMIUM_PLAIN = {
  'report.advanced': {
    id: 'report.advanced',
    title: '高级报表',
    note: '会员功能占位：按区间汇总并导出文本。核心记账始终免费。',
  },
  'chart.ringExport': {
    id: 'chart.ringExport',
    title: '环图导出',
    note: '会员功能占位：导出资金环图副本。核心记账始终免费。',
  },
};

export function plainBytes(feature) {
  return new TextEncoder().encode(JSON.stringify(PREMIUM_PLAIN[feature]));
}
