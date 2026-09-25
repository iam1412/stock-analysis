'use strict';
const t = require('./_t.js')('card-census');
const CC = require('../../tools/v3/card-census.js');
t(Array.isArray(CC.RULES) && typeof CC.cardKey === 'function', 'card-census exports RULES + cardKey (module, no sweep at require time)');
// Task 0 Q3 — three rule-order bugs
t.eq(CC.cardKey('อัตรากำไรสุทธิ'), 'netMargin', 'margin label → netMargin (was netIncome ×45)');
t.eq(CC.cardKey('Net margin'), 'netMargin', 'Net margin → netMargin');
t.eq(CC.cardKey('P/E มัธยฐาน 5 ปี'), 'peAvg5y', 'median P/E → peAvg5y (was pe ×57)');
t.eq(CC.cardKey('P/E ย้อนหลัง 10 ปี'), 'peAvg5y', 'historical P/E → peAvg5y');
t.eq(CC.cardKey('GAAP EPS (TTM)'), 'eps', 'GAAP EPS → eps (was unmatched ×20)');
t.eq(CC.cardKey('Adj. EPS'), 'eps', 'Adj. EPS → eps');
t.eq(CC.cardKey('EPS FY2026E (consensus)'), null, 'forward EPS label stays unmapped (no card key)');
// six new keys — specific before broad
t.eq(CC.cardKey('Net Debt / EBITDA'), 'netDebtEbitda', 'Net Debt/EBITDA → netDebtEbitda (not netDebt)');
t.eq(CC.cardKey('หนี้สินสุทธิ (Net Debt)'), 'netDebt', 'Net Debt alone → netDebt');
t.eq(CC.cardKey('Occupancy'), 'occupancy', 'Occupancy → occupancy');
t.eq(CC.cardKey('อัตราการเช่า'), 'occupancy', 'อัตราการเช่า → occupancy');
t.eq(CC.cardKey('Backlog'), 'backlog', 'Backlog → backlog');
t.eq(CC.cardKey('Payout Ratio'), 'payout', 'Payout → payout (before yield rule)');
t.eq(CC.cardKey('เงินปันผล'), 'yield', 'ปันผล → yield still');
t.eq(CC.cardKey('AUM'), 'aum', 'AUM → aum');
t.eq(CC.cardKey('P/TBV'), 'ptbv', 'P/TBV → ptbv (before pbv rule)');
t.eq(CC.cardKey('P/BV'), 'pbv', 'P/BV → pbv still');
t.eq(CC.cardKey('P/E (TTM)'), 'pe', 'plain P/E → pe still');
// fix round 1 (review I-3 · corpus re-diff) — combined labels keep their FIRST metric · FFO payout ≠ EPS payout · % growth ≠ stock
t.eq(CC.cardKey('P/BV / P/TBV'), 'pbv', 'P/BV / P/TBV → pbv (first number is P/BV)');
t.eq(CC.cardKey('ROE / Net Margin'), 'roe', 'ROE / Net Margin → roe');
t.eq(CC.cardKey('ROE / Payout'), 'roe', 'ROE / Payout → roe');
t.eq(CC.cardKey('FFO Payout Ratio'), 'ffoPayout', 'FFO Payout Ratio → ffoPayout (DPS ÷ FFO)');
t.eq(CC.cardKey('Payout (AFFO basis)'), 'ffoPayout', 'Payout (AFFO basis) → ffoPayout');
t.eq(CC.cardKey('Payout (ฐาน FFO)'), 'ffoPayout', 'Payout (ฐาน FFO) → ffoPayout');
t.eq(CC.cardKey('Dividend Payout Ratio'), 'payout', 'Dividend Payout Ratio → payout');
t.eq(CC.cardKey('AUM Growth YoY'), null, 'AUM Growth YoY → null (a % change, not AUM)');
t.eq(CC.cardKey('Backlog รวม (YoY)'), null, 'Backlog รวม (YoY) → null');
t.eq(CC.cardKey('Revenue Backlog'), 'backlog', 'Revenue Backlog → backlog (not revenue)');
// M-3 — Thai "คาด" + "guidance" are forward estimates, not the TTM eps card
t.eq(CC.cardKey('Adj EPS FY2026 (คาด)'), null, 'Adj EPS FY2026 (คาด) → null');
t.eq(CC.cardKey('Adj. EPS 2026 (guidance)'), null, 'Adj. EPS 2026 (guidance) → null');
t.done();
