# แผนวิเคราะห์หุ้น US ที่ตกหล่น — 124 ตัว (US Gap Backlog)

> **เป้าหมาย:** ปิดช่องว่างหุ้น US คุณภาพที่ยังไม่มีในรีโป **124 ตัว** (ก่อนเริ่ม: มี US แล้ว 433 ตัว · ครอบคลุม S&P 500 แค่ 316/503)
> **ที่มา:** diff S&P 500 ทั้งดัชนี (5 ก.ค. 2569) → ขาด 187 → ตัด dup/alias/spinoff ใหม่/คุณภาพต่ำ/เคยตัดสิน RICH ~63 ตัว → เหลือ 114 + หุ้นคุณภาพนอก S&P 500 อีก 10 (MKL·WCN·BN·SHOP·CNI·CP·TRI·LNG·UL·DEO·GGG)
> **จัดลำดับ:** Tier A = ย่อลึก/de-rate แรง ณ ก.ค. 2569 (ทำก่อน มีโอกาสเจอ MOS จริง) → Tier B = บลูชิพ/quality ที่ขาดเพื่อความครบ → Tier C = สายปันผล/defensive (utilities·REITs·midstream·materials)
> สร้าง 2026-07-05 · % ในตาราง = ผลตอบแทน 1 ปีจาก Yahoo ณ วันสร้างแผน (ตอนวิเคราะห์จริงต้องดึงใหม่ + ตรวจข้ามแหล่งเสมอ)
>
> **📊 ความคืบหน้า (อัปเดต 9 ก.ค. 2569): เสร็จ 74/124 — W25: UL+LNG ✅ · resume ที่ #75 DHI🔺 · #76 LEN🔺 · #77 PHM🔺** · เหลือ 50 ตัว (W26→~W42)

---

## วิธีรัน (ตาม CLAUDE.md §3–4)

- **โมเดล:** All-Sonnet (main + worker) → **escalate เป็น Opus subagent อัตโนมัติ** เฉพาะตัวยาก (ดูคอลัมน์ 🔺 + รายการท้ายไฟล์)
- **1 หุ้น/agent · ≤3 agent/เวฟ · push ทีละเวฟ** (verify → commit → pull --rebase → push HEAD:main)
- **ทุกตัวต้อง:** เริ่มจาก `_template/skeleton-us.html` ($/NYSE·NASDAQ) · ตรวจข้ามแหล่งราคา+EPS ≥2 · กราฟราคาจริง ~1 ปีรายเดือน (Yahoo `?range=1y&interval=1mo`) · สีแบรนด์เฉพาะตัว · `stock-meta` currency `"USD"` (ISO ไม่ใช่ `$`) · คำโปรยธุรกิจ `.sub` · meta ai-model · ผ่าน `npm run verify`
- **ลำดับ:** ไล่ **Tier A → B → C** · แต่ละเวฟ = 3 ตัวถัดไปตามลำดับ #
- **ก่อนเริ่มแต่ละตัว:** `git pull --rebase origin main` + เช็ค `reports.json` (ถ้ามีสด ≤7 วัน = ข้าม)

## ⚠️ ข้อควรระวังเฉพาะชุดนี้ (เช็คก่อนยิง agent)

- **ชื่อไฟล์ share class ใช้ขีดกลาง:** `BRK-B.html` · `BF-B.html` (Yahoo ก็ใช้ BRK-B/BF-B — ห้ามใช้จุด)
- **FISV = ticker ใหม่ของ Fiserv** (เดิม FI — Yahoo คืน "delisted" สำหรับ FI แล้ว) · **BNY = BK ที่มีรายงานแล้ว** (BNY Mellon เปลี่ยน ticker) ห้ามวิเคราะห์ซ้ำ
- **LH (Labcorp) และ BAM (Brookfield AM) ถูกตัดออก** — ชนชื่อไฟล์กับหุ้นไทย LH/BAM ที่มีอยู่แล้ว (1 ไฟล์/สัญลักษณ์) → ใช้ DGX แทน lab · BN แทน Brookfield
- **REITs (Tier C #92–103) → pe:null + วิธี P/AFFO หรือ P/FFO** (ห้ามใช้ P/E ตรง ๆ) · **CSGP/CBRE ไม่ใช่ REIT** (data company/services) ใช้ P/E ปกติ
- **Utilities (#78–91) → DDM เป็นวิธีหลักได้** (ปันผล 3-5%) · **BRK-B ไม่มีปันผล → dividendYield null + วิธี P/B + sum-of-parts**
- **ตัวที่วิ่งแรง/ใกล้ ATH (JNJ +49% · MRK +54% · GE +37% · WST +48% · CAH +61% · CRL +41% · BIIB +64% · STLD +68% · TRGP +54% · DD +45%)** — ทำเพื่อความครบ คาดว่า MOS ติดลบ/บาง = รายงานตามจริง ห้ามแต่ง MOS
- **Spinoff ใหม่เกิน ห้ามแตะรอบนี้ (defer):** HON · HONA · FDXF · Q (Qnity) · SNDK — รอประวัติ ≥1 ปี (ทบทวนปลายปี 2569–2570)
- **RICH watchlist (เคยตรวจ 3 ก.ค. — ยังไม่ย่อ):** FFIV · ACGL · MEDP · SCCO · VIRT — กลับไปดูเมื่อราคาย่อเท่านั้น

---

## Tier A — ย่อลึก/de-rate แรง ทำก่อน (21 ตัว · เวฟ 1–7)

| # | Wave | Symbol | กลุ่ม | ทำไม (1yr @ 5 ก.ค. 69) | 🔺 | สถานะ |
|---|---|---|---|---|---|---|
| 1 | W1 | FDS | ข้อมูลการเงิน | FactSet −33% — AI-fear de-rate แบบเดียวกับ RELX (ซึ่งได้ MOS +17.5%) | | ✅ $250/$278 MOS+10% |
| 2 | W1 | TRI | ข้อมูล/กฎหมาย | Thomson Reuters −50% — Westlaw/Clarivate AI-fear, moat หนา | 🔺 | ✅ $89/$74 MOS−20% (แพง) |
| 3 | W1 | IT | วิจัย/ที่ปรึกษา | Gartner −46% — AI-fear ถล่มกลุ่ม research/advisory | 🔺 | ✅ $136/$141 MOS+3% |
| 4 | W2 | CSGP | ข้อมูลอสังหาฯ | CoStar −66% ($30) — crash หนัก ต้องแยก structural vs overspend (ไม่ใช่ REIT — P/E ปกติ) | 🔺 | ✅ $30/$49 MOS+39% (Homes.com drag แต่ core ยังดี) |
| 5 | W2 | ADP | payroll | −20% — dividend aristocrat 50 ปี, duopoly payroll | | ✅ $242/$273 MOS+11% |
| 6 | W2 | PAYX | payroll | −24% — คู่ duopoly กับ ADP, มาร์จิ้นสูงกว่า | | ✅ $106/$119 MOS+11% |
| 7 | W3 | TMUS | โทรคมนาคม | T-Mobile −30% — ผู้ชนะ 5G ที่โตเร็วสุดใน 3 เจ้า | | ✅ $178/$205 MOS+13% |
| 8 | W3 | T | โทรคมนาคม | AT&T −30% ($20.58) — ปันผลสูง fiber โต หนี้ลดลง | | ✅ $21/$23 MOS+10% yield5.4% |
| 9 | W3 | CMCSA | สื่อ/บรอดแบนด์ | Comcast −25% ($23.79) — ถูกมากเทียบ FCF, broadband คงทน | | ✅ $24/$31 MOS+23% NBCU spinoff 2027 |
| 10 | W4 | AZO | ค้าปลีกอะไหล่ | AutoZone −25% — buyback cannibal ระดับตำนาน (นับหุ้นลดทุกปี) | | ✅ $3,159/$2,855 MOS−11% (ยังแพง) |
| 11 | W4 | TSCO | ค้าปลีก rural | Tractor Supply −49% ($31.76) — ต้องหาสาเหตุ crash ให้ชัดก่อนตัดสิน | 🔺 | ✅ $32/$35 MOS+9% cyclical de-rate ไม่ใช่ structural |
| 12 | W4 | DPZ | ร้านอาหาร | Domino's −32% — franchise royalty model, ปกติ premium multiple | | ✅ $312/$345 MOS+10% |
| 13 | W5 | DEO | เครื่องดื่มแอลกอฮอล์ | Diageo ADR −27% — จุดต่ำสุดหลายปี yield ~5%, spirits down-cycle (normalize) | 🔺 | ✅ $82/$88 MOS+7% ⚠️ปันผลถูกตัด51% ก.พ.69 yield=2.7% |
| 14 | W5 | DIS | สื่อ/สวนสนุก | Disney −16% กลับมาต่ำกว่า $100 — streaming เพิ่งทำกำไร | | ✅ $100/$105 MOS+5% streaming margin 10.6% |
| 15 | W5 | EFX | ข้อมูลเครดิต | Equifax −30% — bureau oligopoly, โดน housing ซบ + AI-fear | | ✅ $172/$175 MOS+2% (แทบไม่มี MOS) |
| 16 | W6 | ARES | asset manager | Ares −35% — alt-credit ผู้นำ, fee-related earnings โตต่อ | | ✅ $116.9/$120 MOS+3% |
| 17 | W6 | APO | asset manager | Apollo −13% — ถูกเทียบ FRE+SRE, Athene เป็นทั้งจุดแข็ง/จุดเสี่ยง | | ✅ $118.61/$148.25 MOS+20% |
| 18 | W6 | PYPL | payments | PayPal −35% ($45) — FCF ถูกมาก, คำถามคือ moat ยังอยู่ไหม | | ✅ $45.47/$75 MOS+39% |
| 19 | W7 | FISV | payments | Fiserv −62% ($52, ticker ใหม่ FISV) — crash จาก Clover; แยก one-time vs structural | 🔺 | ✅ $52.33/$67 MOS+22% |
| 20 | W7 | PFE | ยา | Pfizer $24 yield ~7% — patent cliff 2027-28 ต้อง normalize EPS ระวัง value trap | 🔺 | ✅ $24.32/$27 MOS+10% |
| 21 | W7 | TTD | ad-tech | Trade Desk −65% ($19) — โดน Amazon กดดัน เสี่ยงสุดในชุด ประเมินแบบอนุรักษ์นิยม | 🔺 | ✅ $19.1/$19.64 MOS+3% |

## Tier B — บลูชิพ/quality ที่ขาด (56 ตัว · เวฟ 8–26)

| # | Wave | Symbol | กลุ่ม | ทำไม | 🔺 | สถานะ |
|---|---|---|---|---|---|---|
| 22 | W8 | BRK-B | โฮลดิ้ง | Berkshire — ชื่อที่ขาดชัดสุดในรีโป · P/B + sum-of-parts · ไม่มีปันผล | 🔺 | ✅ $507.78/$527.8 MOS+4% |
| 23 | W8 | JNJ | ยา/อุปกรณ์แพทย์ | ใหญ่สุดในกลุ่ม healthcare ที่ยังไม่มี (+49% ใกล้ ATH — คาด MOS ติดลบ) | | ✅ $263.04/$218.39 MOS-20% |
| 24 | W8 | MRK | ยา | Merck/Keytruda (+54% ฟื้นแรง — ประเมิน cliff 2028 ตรง ๆ) | | ✅ $129.56/$121.32 MOS-7% |
| 25 | W9 | GE | aerospace | GE Aerospace — engine aftermarket moat (+37% ใกล้ ATH) | | ✅ $377.52/$280.39 MOS-35% |
| 26 | W9 | PM | ยาสูบ | Philip Morris — ZYN/IQOS โตแรง ปันผลดี | | ✅ $182.27/$188.09 MOS+3% |
| 27 | W9 | MO | ยาสูบ | Altria — yield ~7% แลกกับ volume ถดถอย (DDM หลัก) | | ✅ $72.71/$73.34 MOS+1% |
| 28 | W10 | VZ | โทรคมนาคม | Verizon — yield ~6.5% เสถียร (DDM หลัก) | | ✅ $42.56/$48.38 MOS+12% |
| 29 | W10 | ABNB | ท่องเที่ยว | Airbnb — asset-light network effect, FCF margin สูง | | ✅ $148.93/$154.09 MOS+3% |
| 30 | W10 | SHOP | อีคอมเมิร์ซ | Shopify — เบอร์ 2 ecommerce infra, ระวัง GAAP/SBC | | ✅ $119.46/$134.15 MOS+11% |
| 31 | W11 | DASH | delivery | DoorDash −22% — ผู้นำ delivery US เพิ่งทำกำไร | | ✅ $192.01/$210 MOS+9% |
| 32 | W11 | EXPE | ท่องเที่ยว | Expedia — OTA เบอร์ 2 ถูกกว่า BKNG มาก | | ✅ $268.69/$284.7 MOS+6% |
| 33 | W11 | EBAY | อีคอมเมิร์ซ | eBay — cash cow buyback สม่ำเสมอ | | ✅ $114.84/$102.28 MOS-12% |
| 34 | W12 | EA | เกม | Electronic Arts — sports franchise ผูกขาด (FC/Madden) | | ✅ $205.21/$210 MOS+2% |
| 35 | W12 | TTWO | เกม | Take-Two — GTA VI cycle | | ✅ $254.99/$265 MOS+4% |
| 36 | W12 | LYV | บันเทิงสด | Live Nation — ผูกขาด live events/Ticketmaster (จับตาคดี DOJ) | | ✅ $186.59/$180.95 MOS-3% |
| 37 | W13 | HLT | โรงแรม | Hilton — asset-light franchise (+23% — คาด MOS บาง) | | ✅ $338.5/$221.24 MOS-53% |
| 38 | W13 | DRI | ร้านอาหาร | Darden (Olive Garden/LongHorn) — ปันผลดี เสถียร | | ✅ $204.32/$213.74 MOS+4% |
| 39 | W13 | WSM | ค้าปลีกบ้าน | Williams-Sonoma — มาร์จิ้นสูงสุดในกลุ่ม home retail | | ✅ $227.53/$202.12 MOS-13% |
| 40 | W14 | RL | แฟชั่น | Ralph Lauren — luxury brand เดียวของ US ที่ execution ดี | | ✅ $398.22/$407.01 MOS+2% |
| 41 | W14 | COF | ธนาคาร/บัตร | Capital One — งบหลังควบ Discover 2025 บิดเบือน ต้อง normalize | 🔺 | ✅ $205.12/$212 MOS+3% |
| 42 | W14 | AIG | ประกัน | AIG — turnaround สำเร็จ P/B ยังต่ำกว่ากลุ่ม | | ✅ $79.39/$87 MOS+9% |
| 43 | W15 | NTRS | ธนาคาร trust | Northern Trust — custody + wealth, fee-based | | ✅ $176.5/$178 MOS+1% |
| 44 | W15 | WTW | โบรกเกอร์ประกัน | Willis Towers Watson −12% — ถูกกว่า AON/MRSH/AJG ที่มีแล้ว | | ✅ $286.22/$328 MOS+13% |
| 45 | W15 | MKL | ประกัน/โฮลดิ้ง | Markel "baby Berkshire" — P/B + insurance+investments | 🔺 | ✅ $1,979.65/$1,948.34 MOS-2% |
| 46 | W16 | BN | โฮลดิ้ง | Brookfield Corp — โครงสร้างซับซ้อน sum-of-parts (ใช้แทน BAM ที่ชนชื่อไทย) | 🔺 | ✅ $43.83/$56.35 MOS+22% |
| 47 | W16 | LHX | ป้องกันประเทศ | L3Harris — defense เบอร์ 6 ราคากลาง ๆ ต่างจากกลุ่มที่วิ่งแล้ว | | ✅ $295.35/$337 MOS+12% |
| 48 | W16 | PCAR | รถบรรทุก | Paccar (Kenworth/Peterbilt) — quality cyclical, งบแข็ง | 🔺 | ✅ $124.35/$92 MOS-35% |
| 49 | W17 | URI | เช่าเครื่องจักร | United Rentals — ผู้นำ equipment rental, scale moat | | ✅ $1,056.02/$829 MOS-27% |
| 50 | W17 | FTV | อุตสาหกรรม | Fortive +31% — เช็คหลัง spin Ralliant ว่างบ standalone สะอาดหรือยัง | 🔺 | ✅ $62.55/$63.44 MOS+1% |
| 51 | W17 | VLTO | น้ำ/คุณภาพ | Veralto −13% — spin จาก DHR (2023, ประวัติพอ) recurring สูง | | ✅ $93.1/$96.5 MOS+4% |
| 52 | W18 | HUBB | ไฟฟ้า | Hubbell — grid hardware ธีม electrification | | ✅ $478.89/$522.96 MOS+8% |
| 53 | W18 | XYL | น้ำ | Xylem −17% — water tech ผู้นำโลก | | ✅ $120.65/$107.79 MOS-12% |
| 54 | W18 | GGG | อุตสาหกรรม | Graco −12% ใกล้ 52w low — pump/spray compounder งบเนี้ยบ | | ✅ $75.2/$83.81 MOS+10% |
| 55 | W19 | WCN | ขยะ | Waste Connections — คู่ WM/RSG ที่มีแล้ว, secondary markets moat | $172.93/$150.70 MOS−14.8% | ✅ |
| 56 | W19 | CNI | รถไฟ | Canadian National — rail duopoly แคนาดา (US-listed USD) | $122.78/$109 MOS−12.6% | ✅ |
| 57 | W19 | CP | รถไฟ | CP-KC — เส้นทางเดียวที่เชื่อม แคนาดา-US-เม็กซิโก | $88.72/$85.44 MOS−3.8% | ✅ |
| 58 | W20 | TDY | เซนเซอร์/ป้องกัน | Teledyne — digital imaging/drone payload, serial acquirer | $641.70/$601.22 MOS−6.7% | ✅ |
| 59 | W20 | CDW | IT reseller | CDW −19% — IT VAR ใหญ่สุด, โดน AI-fear เกินเหตุ? | $139.23/$143 MOS+2.6% | ✅ |
| 60 | W20 | VRSN | อินเทอร์เน็ต | Verisign — ผูกขาด .com registry, Buffett ถือ | $266.78/$250 MOS−6.7% | ✅ |
| 61 | W21 | ZBRA | ฮาร์ดแวร์ | Zebra −16% — barcode/warehouse automation duopoly | | ✅ $264.65/FV$255 MOS−3.8% |
| 62 | W21 | AKAM | cybersecurity/CDN | Akamai +43% — เปลี่ยนผ่านสู่ security/compute สำเร็จ | | ✅ $114.37/FV$116 MOS+1.4% |
| 63 | W21 | MCHP | เซมิ | Microchip +30% — MCU cyclical กำลังฟื้นจาก trough (normalize EPS) | 🔺 | ✅ $84.15/FV$70 MOS−20.2% |
| 64 | W22 | NTAP | สตอเรจ | NetApp — enterprise storage + AI data infra, FCF ดี | | ✅ $163.44/FV$145 MOS−13.0% |
| 65 | W22 | WST | อุปกรณ์ยา | West Pharma +48% — ผูกขาด injectable components (GLP-1) | | ✅ $352.28/FV$300 MOS−17.4% |
| 66 | W22 | DGX | แล็บ | Quest Diagnostics — duopoly lab (ใช้แทน LH ที่ชนชื่อไทย) | | ✅ $208.21/FV$189 MOS−10.2% |
| 67 | W23 | GEHC | อุปกรณ์แพทย์ | GE HealthCare −11% — imaging เบอร์ 1, spin 2023 ประวัติพอ | | ✅ $64.68/FV$70 MOS+7.2% |
| 68 | W23 | CAH | ยา/กระจาย | Cardinal Health +61% — drug distribution oligopoly (คาด MOS บาง) | | ✅ $237.15/FV$198 MOS−19.6% |
| 69 | W23 | CRL | CRO | Charles River +41% — preclinical CRO ผู้นำ ฟื้นจาก biotech winter | | ✅ $223.96/FV$185 MOS−21.3% |
| 70 | W24 | BIIB | ไบโอเทค | Biogen +64% — ถูกเชิง P/E แต่ pipeline/Leqembi ต้องตัดสินเอง | 🔺 | ✅ $200.36/FV$193 MOS−3.8% |
| 71 | W24 | KVUE | consumer health | Kenvue $19.83 — Tylenol/Neutrogena, spin JNJ (2023), yield ดี | | ✅ $19.40/FV$20 MOS+3.0% |
| 72 | W24 | KDP | เครื่องดื่ม | Keurig Dr Pepper — เบอร์ 3 soft drinks ถูกกว่า KO/PEP ที่มีแล้ว | | ✅ $31.03/FV$30 MOS−4.4% |
| 73 | W25 | UL | consumer staples | Unilever ADR −12% — global staples yield ~3.5% turnaround | | ✅ $61.84/FV$63 MOS+1.1% |
| 74 | W25 | LNG | พลังงาน LNG | Cheniere — ผูกขาด LNG export US, take-or-pay contracts (DCF) | | ✅ $260.94/FV$265 MOS+1.5% |
| 75 | W25 | DHI | บ้าน | D.R. Horton — เบอร์ 1 US, housing cyclical → normalize EPS | 🔺 | ⬜ |
| 76 | W26 | LEN | บ้าน | Lennar −34% — เบอร์ 2, ย่อลึกกว่ากลุ่ม (normalize EPS) | 🔺 | ⬜ |
| 77 | W26 | PHM | บ้าน | PulteGroup — มาร์จิ้นดีสุดใน 3 เจ้า (normalize EPS) | 🔺 | ⬜ |

## Tier C — สายปันผล/defensive (47 ตัว · เวฟ 26–42)

| # | Wave | Symbol | กลุ่ม | ทำไม | 🔺 | สถานะ |
|---|---|---|---|---|---|---|
| 78 | W26 | SRE | utility | Sempra — gas/ไฟฟ้า + LNG infra, ใหญ่สุดที่ยังไม่มี | | ⬜ |
| 79 | W27 | ED | utility | Con Edison — NYC ผูกขาด, dividend aristocrat 50+ ปี | | ⬜ |
| 80 | W27 | XEL | utility | Xcel — renewables ผู้นำกลุ่ม utility | | ⬜ |
| 81 | W27 | PEG | utility | PSEG — NJ + nuclear (ธีม data center PPA) | | ⬜ |
| 82 | W28 | DTE | utility | DTE — Michigan ครบวงจร | | ⬜ |
| 83 | W28 | AEE | utility | Ameren — Missouri/Illinois โตสม่ำเสมอ | | ⬜ |
| 84 | W28 | ES | utility | Eversource — New England, ผ่านจุด offshore-wind write-off แล้ว | | ⬜ |
| 85 | W29 | LNT | utility | Alliant — Wisconsin/Iowa เล็กแต่เนี้ยบ | | ⬜ |
| 86 | W29 | EVRG | utility | Evergy — Kansas/Missouri | | ⬜ |
| 87 | W29 | NI | utility | NiSource — gas utility โตจาก grid modernization | | ⬜ |
| 88 | W30 | CNP | utility | CenterPoint — Texas โตตาม data center/ประชากร | | ⬜ |
| 89 | W30 | PNW | utility | Pinnacle West — Arizona (ธีม chip fab/data center) | | ⬜ |
| 90 | W30 | FE | utility | FirstEnergy — transmission-heavy, past scandal คลี่คลายแล้ว | | ⬜ |
| 91 | W31 | EIX | utility | Edison Int'l +35% — California wildfire risk ต้องกำกับชัด | 🔺 | ⬜ |
| 92 | W31 | AVB | REIT อพาร์ตเมนต์ | AvalonBay — apartment REIT ชายฝั่ง (P/AFFO · pe:null) | | ⬜ |
| 93 | W31 | EQR | REIT อพาร์ตเมนต์ | Equity Residential (P/AFFO · pe:null) | | ⬜ |
| 94 | W32 | IRM | REIT ข้อมูล | Iron Mountain — records + data center โต (P/AFFO) | | ⬜ |
| 95 | W32 | SBAC | REIT เสาสัญญาณ | SBA Communications −10% — tower REIT คู่ AMT/CCI (P/AFFO) | | ⬜ |
| 96 | W32 | VTR | REIT สุขภาพ | Ventas +36% — senior housing ฟื้น คู่ WELL (P/FFO) | | ⬜ |
| 97 | W33 | HST | REIT โรงแรม | Host Hotels — luxury hotel REIT ใหญ่สุด (P/AFFO) | | ⬜ |
| 98 | W33 | INVH | REIT บ้านเช่า | Invitation Homes — single-family rental (P/AFFO) | | ⬜ |
| 99 | W33 | WY | REIT ป่าไม้ | Weyerhaeuser — timber REIT, lumber cyclical (normalize) | 🔺 | ⬜ |
| 100 | W34 | BXP | REIT ออฟฟิศ | BXP — office premium, ประเมินแบบระวัง (P/FFO) | | ⬜ |
| 101 | W34 | REG | REIT ค้าปลีก | Regency — grocery-anchored คู่ KIM ที่มีแล้ว (P/AFFO) | | ⬜ |
| 102 | W34 | UDR | REIT อพาร์ตเมนต์ | UDR (P/AFFO · pe:null) | | ⬜ |
| 103 | W35 | DOC | REIT การแพทย์ | Healthpeak — medical office/lab (P/AFFO) | | ⬜ |
| 104 | W35 | CBRE | อสังหาฯ services | CBRE −13% — เบอร์ 1 RE services (ไม่ใช่ REIT — P/E ปกติ) | | ⬜ |
| 105 | W35 | WMB | midstream | Williams — gas pipeline ผูกขาดเส้นทาง (DCF/EV-EBITDA) | | ⬜ |
| 106 | W36 | KMI | midstream | Kinder Morgan — gas infra ใหญ่สุด yield ~5% | | ⬜ |
| 107 | W36 | TRGP | midstream | Targa +54% — NGL ผู้นำ Permian (คาด MOS บาง) | | ⬜ |
| 108 | W36 | BKR | บริการน้ำมัน | Baker Hughes — LNG equipment + services (normalize cycle) | 🔺 | ⬜ |
| 109 | W37 | FANG | E&P | Diamondback — Permian ต้นทุนต่ำสุด (mid-cycle EPS) | 🔺 | ⬜ |
| 110 | W37 | EXE | E&P gas | Expand Energy (Chesapeake+Southwestern) — gas เบอร์ 1 US (mid-cycle) | 🔺 | ⬜ |
| 111 | W37 | CRH | วัสดุก่อสร้าง | CRH — aggregates ผู้นำ US-listed, ธีม infra | | ⬜ |
| 112 | W38 | STLD | เหล็ก | Steel Dynamics +68% — เหล็ก mini-mill ดีสุด (mid-cycle EPS — ระวัง peak) | 🔺 | ⬜ |
| 113 | W38 | DD | เคมี | DuPont +45% — หลัง spin Qnity เช็คงบ standalone | 🔺 | ⬜ |
| 114 | W38 | IFF | เคมีอาหาร | IFF — flavors/fragrances oligopoly, deleveraging | | ⬜ |
| 115 | W39 | IP | บรรจุภัณฑ์ | International Paper −22% — containerboard + DS Smith (normalize) | 🔺 | ⬜ |
| 116 | W39 | SW | บรรจุภัณฑ์ | Smurfit Westrock — ควบรวม 2024 เบอร์ 1 โลก | | ⬜ |
| 117 | W39 | AVY | วัสดุ/ฉลาก | Avery Dennison — label ผูกขาดเงียบ ๆ RFID โต | | ⬜ |
| 118 | W40 | BALL | บรรจุภัณฑ์ | Ball — กระป๋องอลูมิเนียม เบอร์ 1 โลก | | ⬜ |
| 119 | W40 | LYB | ปิโตรเคมี | LyondellBasell — yield สูง cyclical ก้นวัฏจักร (mid-cycle) | 🔺 | ⬜ |
| 120 | W40 | AMCR | บรรจุภัณฑ์ | Amcor — flexible packaging + Berry merger, yield ~5% | | ⬜ |
| 121 | W41 | BF-B | เครื่องดื่มแอลกอฮอล์ | Brown-Forman −13% (Jack Daniel's) — multi-year low, spirits cycle (ไฟล์ BF-B.html) | 🔺 | ⬜ |
| 122 | W41 | TSN | อาหาร | Tyson — โปรตีนเบอร์ 1 US, protein cycle ฟื้น | | ⬜ |
| 123 | W41 | TAP | เครื่องดื่ม | Molson Coors −21% — ถูกมาก P/E หลักเดียว แลก volume ถดถอย | | ⬜ |
| 124 | W42 | BG | อาหารเกษตร | Bunge +26% — agribusiness + Viterra merger (mid-cycle) | 🔺 | ⬜ |

---

## รายการ escalate → Opus worker (🔺 รวม 27 ตัว)

- **Crash ต้องวินิจฉัยสาเหตุ:** TRI · IT · CSGP · TSCO · FISV · TTD
- **Valuation พิเศษ/โครงสร้างซับซ้อน:** BRK-B (P/B+SOTP) · MKL (P/B) · BN (SOTP) · COF (งบหลังควบ Discover) · FTV/DD (หลัง spin) · EIX (wildfire liability)
- **Cyclical ต้อง normalize EPS:** DEO · PFE (patent cliff) · BIIB (pipeline) · MCHP · PCAR · DHI · LEN · PHM · WY · BKR · FANG · EXE · STLD · IP · LYB · BF-B · BG

## ตัวที่ตัดออกจาก 187 (บันทึกไว้กันหยิบซ้ำ)

- **alias/share class:** BNY=BK · FOX/NWS (มี FOXA/NWSA... ไม่ทำทั้งคู่ — quality ไม่ถึง) · GOOG=GOOGL
- **spinoff ใหม่ <1 ปี (defer):** HON · HONA · FDXF · Q · SNDK
- **ชนชื่อไฟล์หุ้นไทย:** LH (Labcorp→ใช้ DGX) · BAM (→ใช้ BN)
- **เคยตรวจแล้ว RICH ยังไม่ย่อ:** FFIV · ACGL · MEDP · SCCO · VIRT
- **คุณภาพ/ความเสี่ยงไม่ผ่าน:** สายการบิน DAL·UAL·LUV · รถยนต์ F·GM·APTV · เรือสำราญ CCL·RCL·NCLH · กาสิโน MGM·WYNN · BA · MRNA · VTRS · WBD · PSKY · ECHO · PCG · AES · KHC · DLTR · ALB · MOS · APA · IVZ · BEN · SYF · AIZ · GL · HBAN · CVNA · COIN · HOOD · HAS · XYZ · GPN · FIS · CPAY · GEN · GDDY · HPE · HPQ · SWKS · CHTR · OMC · TKO · NWSA · SOLV · TECH · HSIC · UHS · RVTY · J · TXT · PNR · HII · HWM · BLDR · FIX · BBY · WYNN
- **จีน/EM ADR (นโยบายเดิมของ user):** PDD · NU · AU
