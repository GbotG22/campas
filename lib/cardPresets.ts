// ── 主要クレジットカードの締め日・支払日プリセット（候補）────────────────
//
// ⚠️ あくまで一般的な初期値の「候補」。カード会員区分・契約・改定により
//    実際の締め日/支払日は異なる場合がある。選択後もユーザーが編集できる前提。
//    確定情報として表示しないこと（UI 側で「候補」と明示する）。
//
//   closingDay  : 締め日（31 = 月末）
//   paymentDay  : 支払日（31 = 月末）
//   paymentMonthOffset : 0 = 当月払い / 1 = 翌月払い

export interface CardPreset {
  name:               string;
  closingDay:         number;
  paymentDay:         number;
  paymentMonthOffset: 0 | 1;
}

export const CARD_PRESETS: CardPreset[] = [
  { name: '楽天カード',         closingDay: 31, paymentDay: 27, paymentMonthOffset: 1 },
  { name: '三井住友カード',     closingDay: 15, paymentDay: 10, paymentMonthOffset: 1 },
  { name: '三井住友（月末締め）', closingDay: 31, paymentDay: 26, paymentMonthOffset: 1 },
  { name: 'JCBカード',          closingDay: 15, paymentDay: 10, paymentMonthOffset: 1 },
  { name: 'エポスカード',       closingDay: 27, paymentDay: 27, paymentMonthOffset: 1 },
  { name: 'イオンカード',       closingDay: 10, paymentDay: 2,  paymentMonthOffset: 1 },
  { name: 'PayPayカード',       closingDay: 31, paymentDay: 27, paymentMonthOffset: 1 },
  { name: 'dカード',            closingDay: 15, paymentDay: 10, paymentMonthOffset: 1 },
  { name: 'au PAY カード',      closingDay: 15, paymentDay: 10, paymentMonthOffset: 1 },
  { name: 'ライフカード',       closingDay: 5,  paymentDay: 3,  paymentMonthOffset: 1 },
];
