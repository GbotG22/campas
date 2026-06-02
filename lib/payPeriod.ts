// ── 給与期間計算ユーティリティ ──────────────────────────────────────────────
//
// 設計方針:
//   - 日付計算は全て new Date(year, month-1, day) （ローカル時刻コンストラクタ）を使用し
//     UTC 解析による時刻ズレを回避する
//   - closing_day = 31 → その月の末日（実際の月末日に丸める）
//   - payday_day   = 31 → その月の末日
//

export interface PayPeriod {
  periodStart: string;  // YYYY-MM-DD（期間開始日）
  periodEnd:   string;  // YYYY-MM-DD（締め日）
  payday:      string;  // YYYY-MM-DD（給料日）
}

// ── プライベートユーティリティ ──────────────────────────────────────────────

/** 月の末日を取得（month は 1-based） */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * day=31 は「月末」として解決し、実際の月末日に丸める
 * 例: resolveDay(2026, 2, 31) → 28 / resolveDay(2026, 6, 31) → 30
 */
function resolveDay(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

/** YYYY-MM-DD 文字列を生成 */
function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 年月に n ヶ月加算（負数対応） */
function addMonths(year: number, month: number, delta: number): [number, number] {
  const total    = (month - 1) + delta;
  const newMonth = ((total % 12) + 12) % 12 + 1;
  const newYear  = year + Math.floor(total / 12);
  return [newYear, newMonth];
}

/** YYYY-MM-DD の 1 日前を返す（UTC 安全・ローカル時刻演算） */
function subtractOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1); // ローカル時刻で d-1 日を指定
  return toYMD(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
}

// ── 公開 API ───────────────────────────────────────────────────────────────

/**
 * シフト日がどの給与期間に属するかを返す
 *
 * @param shiftDate         シフト日 "YYYY-MM-DD"
 * @param closingDay        締め日（31=月末）
 * @param paydayMonthOffset 翌月払い=1 / 当月払い=0
 * @param paydayDay         給料日（31=月末）
 *
 * 計算例（closingDay=15, offset=1, paydayDay=25）:
 *   "2026-06-01" → { "2026-05-16", "2026-06-15", "2026-07-25" }
 *   "2026-06-20" → { "2026-06-16", "2026-07-15", "2026-08-25" }
 *
 * 計算例（closingDay=31, offset=1, paydayDay=25）:
 *   "2026-06-01" → { "2026-06-01", "2026-06-30", "2026-07-25" }
 *   "2026-06-30" → { "2026-06-01", "2026-06-30", "2026-07-25" }
 */
export function getPayPeriodForShift(
  shiftDate: string,
  closingDay: number,
  paydayMonthOffset: number,
  paydayDay: number,
): PayPeriod {
  const [Y, M, D] = shiftDate.split('-').map(Number);
  const effClosing = resolveDay(Y, M, closingDay);

  let periodEndYear: number, periodEndMonth: number, periodEndDay: number;
  let periodStartYear: number, periodStartMonth: number, periodStartDay: number;

  if (D <= effClosing) {
    // 今月が締め月
    periodEndYear  = Y;
    periodEndMonth = M;
    periodEndDay   = effClosing;

    if (closingDay === 31) {
      // 月末締め → 当月 1 日〜末日が 1 期間
      periodStartYear  = Y;
      periodStartMonth = M;
      periodStartDay   = 1;
    } else {
      // 前月の (締め日 + 1) 日が期間開始
      const [py, pm] = addMonths(Y, M, -1);
      periodStartYear  = py;
      periodStartMonth = pm;
      periodStartDay   = resolveDay(py, pm, closingDay) + 1;
    }
  } else {
    // D > effClosing → 翌月が締め月
    // ※ closingDay=31 の場合 effClosing = 月末日 なので D > effClosing は常に false
    const [ny, nm] = addMonths(Y, M, 1);
    periodEndYear   = ny;
    periodEndMonth  = nm;
    periodEndDay    = resolveDay(ny, nm, closingDay);

    // 当月の (締め日 + 1) 日が期間開始
    periodStartYear  = Y;
    periodStartMonth = M;
    periodStartDay   = effClosing + 1;
  }

  // 給料日: 締め月 + paydayMonthOffset ヶ月後の paydayDay 日
  const [pdY, pdM] = addMonths(periodEndYear, periodEndMonth, paydayMonthOffset);
  const pdDay      = resolveDay(pdY, pdM, paydayDay);

  return {
    periodStart: toYMD(periodStartYear, periodStartMonth, periodStartDay),
    periodEnd:   toYMD(periodEndYear,   periodEndMonth,   periodEndDay),
    payday:      toYMD(pdY, pdM, pdDay),
  };
}

/**
 * 今日以降で最も近い給料日を返す
 *
 * ロジック:
 *   1. today が属する給与期間（currentPeriod）を取得
 *   2. その 1 期間前（prevPeriod）の payday を確認
 *   3. prevPeriod.payday >= today なら prevPeriod を返す（前期間の支払いがまだ）
 *   4. すでに過ぎていれば currentPeriod を返す
 *
 * 例（closingDay=15, offset=1, paydayDay=25）:
 *   today="2026-07-01" → prev期間(5/16-6/15)の payday=7/25 → "2026-07-25" を返す
 *   today="2026-07-26" → prev期間(6/16-7/15)の payday=8/25 → "2026-08-25" を返す
 */
export function getNextPayday(
  today: string,
  closingDay: number,
  paydayMonthOffset: number,
  paydayDay: number,
): PayPeriod {
  const currentPeriod = getPayPeriodForShift(today, closingDay, paydayMonthOffset, paydayDay);

  // 1 期間前の最終日から prevPeriod を導出
  const prevPeriodDate = subtractOneDay(currentPeriod.periodStart);
  const prevPeriod     = getPayPeriodForShift(prevPeriodDate, closingDay, paydayMonthOffset, paydayDay);

  return prevPeriod.payday >= today ? prevPeriod : currentPeriod;
}

// ── デバッグ用テスト関数 ────────────────────────────────────────────────────
// 開発時に runPayPeriodTests() をコンソールから呼び出して動作確認できます

export function runPayPeriodTests(): void {
  const cases: Array<{
    label: string;
    shiftDate: string;
    closingDay: number;
    offset: number;
    paydayDay: number;
    expectedStart: string;
    expectedEnd: string;
    expectedPayday: string;
  }> = [
    // 15日締め・翌月25日払い
    { label: '15日締め 月初', shiftDate: '2026-06-01', closingDay: 15, offset: 1, paydayDay: 25,
      expectedStart: '2026-05-16', expectedEnd: '2026-06-15', expectedPayday: '2026-07-25' },
    { label: '15日締め 締め日当日', shiftDate: '2026-06-15', closingDay: 15, offset: 1, paydayDay: 25,
      expectedStart: '2026-05-16', expectedEnd: '2026-06-15', expectedPayday: '2026-07-25' },
    { label: '15日締め 締め翌日', shiftDate: '2026-06-16', closingDay: 15, offset: 1, paydayDay: 25,
      expectedStart: '2026-06-16', expectedEnd: '2026-07-15', expectedPayday: '2026-08-25' },
    { label: '15日締め 月末', shiftDate: '2026-06-30', closingDay: 15, offset: 1, paydayDay: 25,
      expectedStart: '2026-06-16', expectedEnd: '2026-07-15', expectedPayday: '2026-08-25' },

    // 月末締め・翌月25日払い
    { label: '月末締め 月初', shiftDate: '2026-06-01', closingDay: 31, offset: 1, paydayDay: 25,
      expectedStart: '2026-06-01', expectedEnd: '2026-06-30', expectedPayday: '2026-07-25' },
    { label: '月末締め 月末', shiftDate: '2026-06-30', closingDay: 31, offset: 1, paydayDay: 25,
      expectedStart: '2026-06-01', expectedEnd: '2026-06-30', expectedPayday: '2026-07-25' },
    { label: '月末締め 2月（非閏年）', shiftDate: '2026-02-28', closingDay: 31, offset: 1, paydayDay: 25,
      expectedStart: '2026-02-01', expectedEnd: '2026-02-28', expectedPayday: '2026-03-25' },

    // 当月払い
    { label: '月末締め 当月末払い', shiftDate: '2026-06-15', closingDay: 31, offset: 0, paydayDay: 31,
      expectedStart: '2026-06-01', expectedEnd: '2026-06-30', expectedPayday: '2026-06-30' },

    // 年またぎ
    { label: '12月末に翌月1月払い', shiftDate: '2026-12-20', closingDay: 31, offset: 1, paydayDay: 25,
      expectedStart: '2026-12-01', expectedEnd: '2026-12-31', expectedPayday: '2027-01-25' },
    { label: '1月初旬・前月末締め', shiftDate: '2027-01-05', closingDay: 31, offset: 1, paydayDay: 25,
      expectedStart: '2027-01-01', expectedEnd: '2027-01-31', expectedPayday: '2027-02-25' },
  ];

  let pass = 0;
  let fail = 0;
  cases.forEach(c => {
    const result = getPayPeriodForShift(c.shiftDate, c.closingDay, c.offset, c.paydayDay);
    const ok =
      result.periodStart === c.expectedStart &&
      result.periodEnd   === c.expectedEnd   &&
      result.payday      === c.expectedPayday;
    if (ok) {
      console.log(`✅ ${c.label}`);
      pass++;
    } else {
      console.error(`❌ ${c.label}`);
      console.error(`   期待: ${c.expectedStart} 〜 ${c.expectedEnd}  給料日: ${c.expectedPayday}`);
      console.error(`   実際: ${result.periodStart} 〜 ${result.periodEnd}  給料日: ${result.payday}`);
      fail++;
    }
  });

  // getNextPayday のスモークテスト
  const nextCases: Array<{ label: string; today: string; closingDay: number; offset: number; paydayDay: number; expectedPayday: string }> = [
    { label: 'nextPayday: 7/1→次は7/25', today: '2026-07-01', closingDay: 15, offset: 1, paydayDay: 25, expectedPayday: '2026-07-25' },
    { label: 'nextPayday: 7/26→次は8/25', today: '2026-07-26', closingDay: 15, offset: 1, paydayDay: 25, expectedPayday: '2026-08-25' },
    { label: 'nextPayday: 月末締め 6/15→次は6/25', today: '2026-06-15', closingDay: 31, offset: 1, paydayDay: 25, expectedPayday: '2026-06-25' },
  ];
  nextCases.forEach(c => {
    const result = getNextPayday(c.today, c.closingDay, c.offset, c.paydayDay);
    const ok = result.payday === c.expectedPayday;
    if (ok) {
      console.log(`✅ ${c.label}`);
      pass++;
    } else {
      console.error(`❌ ${c.label}`);
      console.error(`   期待 payday: ${c.expectedPayday}`);
      console.error(`   実際 payday: ${result.payday}`);
      fail++;
    }
  });

  console.log(`\n結果: ${pass} passed / ${fail} failed`);
}
