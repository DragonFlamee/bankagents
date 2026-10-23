/** Display names mirrored from banking_agent/catalog.py. The server stays authoritative. */
export const items: Record<string, { name: string; merchant: string; price_cents: number; category: string }> = {
  "flower-rose19": { name: "19 枝红玫瑰花束", merchant: "花间集", price_cents: 29_900, category: "鲜花" },
  "flower-sun": { name: "向日葵混搭花束", merchant: "花间集", price_cents: 23_900, category: "鲜花" },
  "cake-berry6": { name: "6 寸草莓慕斯", merchant: "麦香记", price_cents: 26_800, category: "蛋糕" },
  "cake-fruit8": { name: "8 寸鲜奶水果蛋糕", merchant: "麦香记", price_cents: 35_800, category: "蛋糕" },
};
export const products: Record<string, { name: string; risk: number }> = {
  "wm-cash": { name: "天天盈现金管理", risk: 1 },
  "wm-bond90": { name: "稳享 90 天持有", risk: 2 },
  "wm-shortbond": { name: "中短债 A", risk: 2 },
  "wm-plus180": { name: "安盈固收+ 6 个月", risk: 3 },
  "wm-hs300": { name: "沪深300 指数增强", risk: 4 },
  "wm-tech": { name: "科创成长混合", risk: 5 },
};
export const controlNames: Record<string, string> = {
  online: "网上支付",
  overseas: "境外交易",
  atm: "ATM 取现",
  contactless: "小额免密",
};
export const subscriptionNames: Record<string, string> = {
  "sub-music": "云端音乐",
  "sub-cloud": "云盘空间",
  "sub-video": "星河视频",
};
