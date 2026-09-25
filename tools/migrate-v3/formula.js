'use strict';
/**
 * formula.js — คลังคำ "สูตร" ของ .mdesc ขา computed (Plan 4b final-review fix round · I-1)
 *  ขา computed: v3 พิมพ์ mdesc ที่ generate จาก inputs (render.js mdesc) แทนคำอธิบายสูตรของผู้เขียน (plan D2 · spec §10.2 b)
 *  ⇒ คำในสูตรของ v2 ทิ้งได้ **เฉพาะ** (i) คำที่ mdesc ที่ generate ของขาเดียวกันพิมพ์ (equiv.js) และ (ii) FORMULA_VOCAB ข้างล่าง
 *  คำอื่นทุกคำ = ข้อความผู้เขียน → assemble.qualifierOf ต้องพกไปเป็น leg.note · ไม่งั้น gate (equiv.js) นับ TEXT LOST (HUMAN)
 *  ★ ปิด — เพิ่มได้ผ่าน review เท่านั้น · ทุกคำต้องเป็น "ชื่อส่วนของการคำนวณ" (ไม่ใช่เหตุผล/ความเห็น) + มีคอมเมนต์ fixture ที่ต้องใช้
 *  GEN_VOCAB = คำที่ render.js mdesc พิมพ์ได้ (ทุก method) — ใช้เฉพาะใน qualifierOf (assemble ยังไม่มี view ให้ generate จริง)
 *    gate ไม่ใช้ GEN_VOCAB: gate ทิ้งเฉพาะคำของ mdesc ที่ generate จริงของขานั้น
 */

const FORMULA_VOCAB = new Set([
  // (1) ชิ้นของสูตร DCF / EV → equity (XYL FDX KLAC MCD OTIS ADI AMGN ACE BWXT DECK AKAM THCOM WCC FTNT PANW FNV TW TRUE RACE GEV DD AEVA HANA)
  'PV', 'TV', 'EV', 'FCF', 'PVFCF', 'PVTV', 'ΣPVFCF', 'FCF0', 'WACC', 'terminal', 'Terminal', 'growth', 'discount', 'rate',
  'equity', 'Equity', 'net', 'Net', 'debt', 'Debt', 'cash', 'Cash', 'SBC',
  'ปลายทาง', 'ปลาย', 'ปลายปี', 'หนี้', 'เงินสด', 'หนี้สุทธิ', 'หนี้สินสุทธิ', 'เงินสดสุทธิ', 'หัก', 'หลังหัก', 'หักหนี้สุทธิ', 'หักหนี้สินสุทธิ',
  'หักหนี้สินสุทธิต่อหุ้น', 'บวกเงินสดสุทธิ', 'แล้วบวกเงินสดสุทธิ', 'แล้วปรับด้วยเงินสดสุทธิ', 'บวกกลับ', 'หาร', 'ไม่คิดลดกลับ',
  'มูลค่าส่วนผู้ถือหุ้น', 'มูลค่าตลาด',
  // (2) จำนวนหุ้น / ต่อหุ้น (XYL ADI AIT CRWD ANET KGC EOG EXPE CACI A AJG BKR TT DEO)
  'หุ้น', 'ต่อหุ้น', 'ล้านหุ้น', 'พันล้านหุ้น', 'หุ้นคงเหลือ', 'ล้านหุ้นคงเหลือ', 'หุ้นเฉลี่ย', 'หุ้นถัวเฉลี่ยปรับลด', 'หุ้นฐาน',
  'share', 'Share', 'shares', 'sh', 'ADS',
  // (3) ฐาน/งวดของตัวตั้ง — v3 พิมพ์ฐานเป็นป้ายของตัวเอง ("EPS (TTM)" · "EPS ปรับ") (CMCSA AAON AJG TLN AMZN BBL BKR COCOCO ALC AZN ALAB CP ADI AMKR DEO AFL WFC VRSN
  //     RMD V EMA ENB AIT CAMT A ADI AXTI DY MC NXPI BBL EXE EL SNX FMC TXRH WCC MBK DDOG FNV AMAT TEL DTM · ปีงบ FY#### ทุกรูป = คีย์ FY# · FY#E · FY#e · FY#FY#)
  'diluted', 'GAAP', 'NonGAAP', 'TTM', 'EPSTTM', 'adj', 'Adj', 'Adjusted', 'adjusted', 'normalized', 'Normalized', 'norm', 'ปกติ', 'core', 'Core',
  'forward', 'Forward', 'est', 'preexceptional', 'exAOCI', 'Tangible', 'CAD', 'CADUSD',
  'FY', 'FY2026', 'FY26E', 'FY2026e', 'FY2021–FY2025', 'ปีงบ', 'ปีงบนี้', 'ปีงบปัจจุบัน', 'ปีล่าสุด', 'คาดการณ์', 'ประมาณการ', 'ล่วงหน้า',
  // (4) ชื่อตัวตั้ง/ตัวคูณในสูตร (AEVA AKAM CTSH AMKR AVAV CEG AMP BDMS COCOCO JNJ PB SRE BNS KEY PR9 BAX A BGC CHD COST BLK CRM MFC PNW CL · Fair Value = HUMAN)
  'รายได้', 'Revenue', 'Rev', 'Sales', 'รายได้ต่อหุ้น', 'ยอดขายต่อหุ้น', 'กำไรสุทธิ', 'DPS', 'EPS', 'ปันผลปัจจุบัน', 'ปันผลล่าสุด', 'ปันผลประกาศ',
  'payout', 'Payout', 'ratio', 'ratioROE', 'margin', 'ราคาต่อมูลค่าทางบัญชี', 'multiple', 'ตัวคูณ', 'เป้าหมาย', 'เป้า', 'target', 'fair', 'Fair', 'Value',
  'DDM', 'DCF', 'justified', 'ฐาน', 'ตั้งต้น', 'เริ่มต้น', 'D₀1g', 'rg30', 'FV', 'r−g', 'เท่า',   // FV · (r−g) = PSP WSO AMGN · เท่า (หน่วยตัวคูณ) = BNS CM FNV HANA
  // (5) ตาราง g ของ DCF/DDM หลายช่วง — v3 พิมพ์ "g%/ปี N ปี → …" ใหม่ (ANET FTNT GGG IQV ALAB PATH MKTX CRM AJG REGN TDY CW WCN DD V)
  'ต่อปี', 'ปีแรก', 'แล้ว', 'แล้วชะลอ', 'แล้วลดเชิงเส้นเหลือ', 'โตปีที่', 'ปีที่', 'ในปีที่', 'จากนั้น', 'เติบโต', 'คาดโต', 'โต',
  // (6) CAPM / r (LEN WHA ddm/pbv)
  'rf', 'ERP', 'beta', 'CAPM',
  // (7) คำเชื่อมในสูตร ("PV FCF และ TV" · "61% ของ EV" · "รวม") — คำเดี่ยวที่ไม่มีเนื้อหา (ALAB BKNG KMI TRUE BTG TPL CRDO DDOG PANW WCN SN DEO CAMT KR HUMAN)
  'และ', 'ของ', 'ใน', 'กับ', 'จาก', 'โดย', 'ต่อ', 'รวม',
]);

// คำที่ render.js mdesc (Plan 4b) พิมพ์ได้ — ป้ายของ method/ฐาน/แหล่งตัวคูณ (METHOD_NAME · SRC_NAME · EPS_BASIS_LABEL · ddm/ddm2/dcf/ri/fcfyield)
const GEN_VOCAB = new Set([
  'EPS', 'adj', 'FY', 'IFRS', 'ปรับ', 'เป้าหมาย', 'ปัจจุบัน', 'มัธยฐาน', 'ค่ากลางกลุ่มเทียบ', 'justified', 'ค่ากลางเซกเตอร์', 'ตัวคูณปัจจุบัน', 'ผู้วิเคราะห์กำหนด',
  'กรอบ', 'BVPS', 'ROE', 'เหมาะสม', 'ปันผล', 'โต', 'แล้ว', 'มูลค่าปลายงวดแบบ', 'Gordon', 'งวด', 'ไม่มีมูลค่าปลายงวด', 'โตถาวร', 'vs', 'payout', 'yield',
  'FCFหุ้น', 'Sales', 'EBITDA', 'FFO', 'AFFO', 'DDM', 'Growth', 'DCF', 'Residual', 'Income', 'Yield',
]);

const keyOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}]/gu, '').replace(/\p{N}+/gu, '#');
const FORMULA_KEYS = new Set([...FORMULA_VOCAB].map(keyOf));
const GEN_KEYS = new Set([...GEN_VOCAB].map(keyOf));

module.exports = { FORMULA_VOCAB, FORMULA_KEYS, GEN_VOCAB, GEN_KEYS, keyOf };
