# census การย้าย v1 → v2 (ระยะ 2 ส่วน C)

อัปเดต: 14/9/2569 18:13:46 (Asia/Bangkok)

| ผล | ใบ |
|---|---|
| ย้ายได้ | 192 |
| ยังไม่ได้ (residue) | 8 |
| รวม | 200 |

## เหตุผล residue (นับต่อชนิด)

| เหตุผล | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| site vcellFv match ≠ N | 2 | AEM BTG |
| จำนวนช่อง %/ปี ไม่เท่าเดิม | 1 | ACN |
| กรอบ FV สองที่ไม่ตรงกัน | 1 | ALLE |
| ค่าไม่ตรงชั้น N | 1 | AMKR |
| site vcellTgt match ≠ N | 1 | BABA |
| cron-diff v1-unstable meta:dividendYield,visible | 1 | BNY |
| legend แสดง N แต่ FV = N | 1 | COHU |

## site ที่คง literal (นับต่อชนิด)

| site | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| psCard — ไม่มีการ์ดที่ตัดสินได้ | 193 | A AAI AAON AAPL ABBNY ABBV ABNB ABT ACE ACMR … |
| yieldCard — รูปตัวเลขต่าง ("N%" ≠ "N%") | 106 | A AAON AAPL ABBNY ABBV ABT ACN ADI ADM ADP … |
| peCard — ไม่มีการ์ดที่ตัดสินได้ | 90 | A AAOI ABNB ABT ACE ADP ADVANC ADVICE AEE AEHR … |
| pbvCard — ไม่มีการ์ดที่ตัดสินได้ | 88 | AAOI AAPL ABBNY ABBV ACE ACMR ACN ADBE ADI ADP … |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NB") | 60 | AAON ABBNY ABBV ABNB ACMR ACN ADBE ADP AEE AIT … |
| yieldCard — ไม่มีการ์ดที่ตัดสินได้ | 59 | AAOI ABNB ACE ACMR ADBE ADSK AEHR AEVA AIG AKAM … |
| scnNote — ไม่พบ | 55 | AAOI AAPL ABNB ACMR ACN ADBE ADI ADSK AEHR AEVA … |
| pbvCard — รูปตัวเลขต่าง ("N" ≠ "N") | 38 | A AAON ABNB ABT AEP AME AMGN AON AOS APD … |
| scn | 35 | AAI ADM ADVICE AEE AEONTS AFL AIG AMATAV AME AON … |
| peCard — รูปตัวเลขต่าง ("N" ≠ "N") | 28 | AAPL ABBNY ACMR ACN ADI ADSK AMAT AMD ANET AOT … |
| tgtCard — ไม่พบรูป "เป้า (+%)" | 26 | AAOI AAPL ABBNY ACMR ACN ADBE ADI ADSK AEHR ALAB … |
| zone — ราคาโซนสะสม N ≠ FV N (ผู้เขียนตั้งเอง) | 23 | AAOI ACMR ACN ADBE ADI ADSK ALAB AMKR ANET APH … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N พันล้าน") | 14 | AAI AHC ANI APURE ASIAN ASK ASW BAFS BBIK BE8 … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N หมื่นล้าน") | 11 | ACE AURA AWC AYUD BAM BCH BKI BLA CHG CK … |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N หมื่นล้าน") | 7 | AP BCP BCPG BEM BGRIM CBG CENTEL |
| mcapCard — ไม่มีการ์ดที่ตัดสินได้ | 7 | ARM ASML AVGO BIDU BNS BRK-B CB |
| mcapCard — รูปตัวเลขต่าง ("$N B" ≠ "$NB") | 4 | ADM AIG BG C |
| fvBoxRange — กรอบใน fv-box ไม่ตรง values/ไม่มีสัญลักษณ์สกุลเงินครบ | 3 | AAOI BGC CAT |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N พันล้าน") | 3 | ADVICE AMATAV AU |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N หมื่นล้าน") | 3 | AMATA BJC BTS |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N แสนล้าน") | 3 | BAY CPALL CPAXT |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NT") | 2 | AAPL AMZN |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N หมื่นล้าน") | 2 | AEONTS COM7 |
| disc | 2 | AMATAV CKP |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N แสนล้าน") | 2 | BDMS BH |
| hintEps — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CCET CHG |
| psCard — รูปตัวเลขต่าง ("N" ≠ "N") | 1 | AEHR |
| hintEps — ไม่พบ | 1 | AER |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NM") | 1 | AEVA |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้านล้าน" ≠ "฿N แสนล้าน") | 1 | AOT |
| mcapCard — รูปตัวเลขต่าง ("$N" ≠ "$NB") | 1 | B |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N พันล้าน") | 1 | BGC |
| mcapCard — รูปตัวเลขต่าง ("$N พันล้าน" ≠ "$NB") | 1 | BMO |
| mcapCard — รูปตัวเลขต่าง ("฿NM" ≠ "฿N หมื่นล้าน") | 1 | CCET |
| scn3div — รูปเงินต่าง ("฿N" ≠ "฿N") | 1 | CKP |
| scn2div — รูปเงินต่าง ("฿N" ≠ "฿N") | 1 | CKP |
| scn1div — รูปเงินต่าง ("฿N" ≠ "฿N") | 1 | CKP |

## ใบที่ศักราชของ .disc ต่างจากหัวรายงาน (note `dateEra normalize`)

- APH
- BRO
- CGNX
- CLS

## ผลตอบแทนฉาก %/ปี ที่ข้อความเปลี่ยนหลังย้าย (หมวด 6 · เปิดเผยเท่านั้น ไม่ใช่เกณฑ์ผ่าน/ตกใหม่ — ดู TOLERANCE.f34/f35)

| ชนิด | จุด (คอลัมน์) | ใบ |
|---|---|---|
| รูปเลขเปลี่ยนแต่ค่าเท่าเดิม (form) | 86 | — |
| ค่าจริงขยับ (value) | 20 | 12 |

### ใบที่ %/ปี ขยับค่าจริง (ก่อน → หลัง ต่อคอลัมน์)

- AEHR: bull +16.6%/ปี → +16%/ปี
- AMATA: base null → +11%/ปี · bull null → +25%/ปี
- AMZN: bear −12.5%/ปี → −12%/ปี · bull +14.5%/ปี → +14%/ปี
- ANET: base −1%/ปี → −1.4%/ปี
- ASW: bear null → +1.6%/ปี · base null → +17%/ปี · bull null → +33%/ปี
- AZN: bull +21.5%/ปี → +21%/ปี
- CCEP: bull +15.5%/ปี → +15%/ปี
- CHG: bear null → +7%/ปี · base null → +23%/ปี · bull null → +32%/ปี
- CIEN: bear -1%/ปี → −1.4%/ปี
- CKP: bear null → +5%/ปี · base null → +23%/ปี · bull null → +37%/ปี
- COCOCO: base +10.4%/ปี → +11%/ปี
- COHR: bull +15.5%/ปี → +15%/ปี

## cron differential v1 ↔ v2 (`--cron-diff` · grid ราคา ×0.85–×1.15 ทีละ 0.005 · 61 จุด)

เทียบผล `patchReport` ของ v1 ต้นฉบับกับ v2 ที่ราคา/วันที่เดียวกัน: stock-meta (price/mos/upside/fairValue/pe/dividendYield) ·
ตัวเลขที่มองเห็น · error/warning ของ gate — ใบที่ต่างนอกเหนือ "รูป" = residue (ไม่เขียน)

| ผล | ใบ |
|---|---|
| ตรวจ | 193 |
| ผ่าน | 192 |
| ตก (ไม่เขียน) | 1 |
| ผ่านแต่ต่างแค่รูป | 156 |

### ตกตามชนิด

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| meta:dividendYield | 1 | BNY |
| visible | 1 | BNY |

### ต่างแค่รูป (เขียนได้ · เปิดเผยให้เจ้าของตัดสิน)

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | 149 | A AAOI AAON AAPL ABBNY ABBV ABNB ABT ACE ADBE ADI ADP ADVANC AEHR AEP AER AEVA AHC AIT AJG AKAM ALAB ALC ALGN ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APG APH APP APURE AR ARE ARES AS ASIAN ASW ATO ATS AUR AURA AVAV AVGO AVY AWK AWR AXON AXP AYUD AZN AZO BAC BALL BAX BAY BBIK BBL BCH BCP BDX BG BGC BGRIM BH BIDU BIIB BIZ BJC BKI BKNG BKR BLK BMO BMY BN BNS BOL BR BRK-B BSX BWXT BX BXP C CACI CAH CAMT CARR CART CASY CAT CBG CBOE CBRE CBRS CCEP CCET CCI CCJ CDNS CDW CEG CENTEL CF CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CLS CM CMCSA CME CMG CMI CMS CNC CNI CNQ COCOCO COF COHR COM7 COO COP COST CP CPALL CPAXT CPF |
| รูปตัวเลขอื่น (เช่น ราคา 278→277.58 · หน่วย ล้านล้าน→แสนล้าน · ศักราช) | 41 | AAOI AAPL ACMR ADBE ADI ADSK ADVANC AEONTS ALAB ALGN AMAT AMD AMZN ANET APH APP ARE ARM ASML AVGO AYUD BBL BKI BRO CAMT CAT CCJ CDNS CEG CGNX CHE CIEN CLH CLS CLX CMCSA CME CMG COHR COO CPF |
| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | 109 | A AAOI AAPL ABBNY ABBV ABNB ABT ADBE ADI ADVANC AEP AEVA AHC AIT AJG ALAB ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APURE AR ARE ARES ASW ATO AVY AWK AWR AXP AYUD AZO BAC BALL BAY BBIK BBL BCH BCP BDX BG BGRIM BH BIDU BIIB BIZ BKI BKNG BKR BLK BMY BN BNS BNY BR BRK-B BX BXP CACI CARR CART CASY CBG CBOE CBRS CCET CCI CDNS CEG CENTEL CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CM CMCSA CME CMG CMI CMS CNC CNI COF COHR COM7 COO COP COST CPALL CPAXT |

### ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ)

เกณฑ์: ห่างไม่เกิน GAP_REL 1.2% (ชั้น 1 ของ migrator) · cron ไม่แตะทั้งสองฝั่ง · มากสุดที่พบ 0.50%

| ชนิด | ใบ | มากสุด | รายชื่อ |
|---|---|---|---|
| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | 7 | 0.50% | AEE ANI BF-B BWXT CBOE CHAYO CMS |

- AEE: «เหมาะสม $106.55 $ ▯ MOS 30% $85.24 MOS 20% $» 74.59 → 74.58 (0.01%)
- ANI: «เหมาะสม ฿3.65 ฿ ▯ MOS 30% ฿2.92 MOS 20% ฿3» 2.56 → 2.55 (0.39%)
- BF-B: « Value) กรอบ $24 - $35 $ ▯ วิธี P/E และ EV/EBITDA ใ» 30.91 → 31.00 (0.29%)
- BWXT: «เหมาะสม $153.95 $ ▯ MOS 30% $123.16 MOS 20% » 107.77 → 107.76 (0.01%)
- CBOE: «.14 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV ราคาปัจจุบัน» 319.30 → 319.00 (0.09%)
- CHAYO: «.10 เป้า Analyst (KSS) ฿ ▯ MOS 30% ฿2.28 MOS 20% ฿2» 1.99 → 2.00 (0.5%)
- CMS: «lyst $80.00 Fair Value $ ▯ กรอบบน FV ราคาปัจจุบัน» 84.97 → 85.00 (0.04%)

### ใบที่ผ่านโดยใช้ข้อยกเว้นของตัวเทียบ (ไม่เปลี่ยนผลตัดสิน — เปิดเผยให้ตรวจ)

| ข้อยกเว้น | ใบ | รายชื่อ |
|---|---|---|
| ผลต่างที่มีก่อน patch — รูปหรือค่า (≤ GAP_REL · ค่าต่างรายใบอยู่ในหมวดด้านบน) | 48 | AAOI AAPL ACMR ADBE ADI ADSK AEE AEONTS AFL ALAB ALL AMAT AMD AMZN ANET ANI APH APP ARM ASML AVGO AVY AXP BBL BDX BF-B BIIB BJC BKI BLK BMI BWXT CAMT CASY CAT CBOE CCJ CDNS CEG CHAYO CHE CIEN CLH CLS CMS COF COHR COST |
| %/ปี ต่างตามรูปของ "รวม" (ทั้งสองฝั่ง = f(รวมที่โชว์)) | 33 | AAOI ABT ADBE AEHR ALC ALNY AMATA AMRZ AMZN ASW AUR AVAV AVGO AZN BALL BAY BBIK BBL BJC BKI BMO BNS BWXT CBRS CCEP CDNS CEG CKP CM CNQ COCOCO COHR CPF |
| วงเล็บทวนวันที่ล้วน (migrator ลบ · f11) | 1 | AZN |
| หน่วยใหญ่ของเงินต่างกัน ค่าเดียวกัน | 1 | ADVANC |
| ปีคนละศักราช (2569 ↔ 2026) | 4 | APH BRO CGNX CLS |

### รายละเอียดใบที่ตก (ตัวคูณแรกที่ต่าง · ฝั่งที่ไม่นิ่ง)

v1-unstable = ผลของ v1 เปลี่ยนชนิด/ฐานระหว่างจุด grid ติดกันขณะ v2 นิ่ง — ไม่ใช่คำตัดสินว่าฝั่งไหนถูก

- BNY — `cron-diff v1-unstable meta:dividendYield,visible` · side v1 (×1.09→×1.095: meta:dividendYield=v1 visible=v1) · ×1.095 ราคา 178.11: stock-meta.dividendYield v1 1.4 ≠ v2 1.2 || ×1.095 ราคา 178.11: ตัวเลข (page) «…t asset custodian เงินปันผล ~ 1.4» v1 1.4 ≠ v2 1.2

<details><summary>ตัวอย่างรูปทศนิยมหมวด 6 ต่อใบ (v1 → v2 ที่ตัวคูณแรกที่พบ)</summary>

- A: +8.8%→+9% (×0.85)
- AAOI: +16.1%→+16% (×0.85)
- AAON: +221.8%→+222% (×0.85)
- AAPL: +2%→+1.6% (×0.895)
- ABBNY: -23.6%→-24% (×0.85)
- ABBV: +23.2%→+23% (×0.85)
- ABNB: +35.2%→+35% (×0.85)
- ABT: +8.3%→+8% (×0.85)
- ACE: -14.4%→-14% (×0.85)
- ADBE: +12.1%→+12% (×0.85)
- ADI: -1%→-1.4% (×0.85)
- ADP: +40.4%→+40% (×0.85)
- ADVANC: +50.5%→+51% (×0.85)
- AEHR: -67.7%→-68% (×0.85)
- AEP: +2%→+1.7% (×1.02)
- AER: -14.7%→-15% (×0.85)
- AEVA: -84.1%→-84% (×0.85)
- AHC: -19.1%→-19% (×0.85)
- AIT: -25.1%→-25% (×0.85)
- AJG: +2%→+1.7% (×1.09)
- AKAM: -16.9%→-17% (×0.85)
- ALAB: +2%→+1.6% (×1.07)
- ALC: +53.7%→+54% (×0.85)
- ALGN: +68.5%→+68% (×0.85)
- ALL: +2%→+1.9% (×0.855)
- ALNY: -35.9%→-36% (×0.85)
- AMAT: +12.7%→+13% (×0.85)
- AMATA: +11.9%→+12% (×0.85)
- AMCR: +12.2%→+12% (×0.85)
- AMD: +2%→+1.6% (×0.895)
- AMGN: +7.9%→+8% (×0.85)
- AMP: +2%→+1.5% (×0.945)
- AMRZ: +8.6%→+9% (×0.85)
- AMT: +2%→+1.7% (×1.07)
- AMZN: -7.9%→-8% (×0.85)
- ANET: +2%→+1.6% (×0.915)
- ANI: -7.8%→-8% (×0.85)
- AOS: +17.2%→+17% (×0.85)
- AP: +2%→+1.7% (×1.105)
- APD: +2%→+1.5% (×0.92)
- APG: -31.4%→-31% (×0.85)
- APH: +2%→+1.6% (×1.11)
- APP: -3.7%→-4% (×0.85)
- APURE: -23.9%→-24% (×0.85)
- AR: -32.4%→-32% (×0.85)
- ARE: 2%→+1.9% (×1.055)
- ARES: +2.8%→+3% (×0.85)
- AS: -49.5%→-49% (×0.85)
- ASIAN: -20.8%→-21% (×0.85)
- ASW: 7.4%→+7% (×0.85)
- ATO: +39.2%→+39% (×0.85)
- ATS: -17.8%→-18% (×0.85)
- AUR: -95.2%→-95% (×0.85)
- AURA: +73.8%→+74% (×0.85)
- AVAV: -29.2%→-29% (×0.85)
- AVGO: +11.3%→+11% (×0.85)
- AVY: +53.4%→+53% (×0.85)
- AWK: +2%→+1.7% (×1.1)
- AWR: +2.8%→+3% (×0.85)
- AXON: +43.9%→+44% (×0.85)
- AXP: +25.6%→+26% (×0.85)
- AYUD: +1%→+1.4% (×0.855)
- AZN: -12.8%→-13% (×0.85)
- AZO: +17.1%→+17% (×0.85)
- BAC: +4.1%→+4% (×0.85)
- BALL: +6.7%→+7% (×0.85)
- BAX: -30.5%→-30% (×0.85)
- BAY: +24.3%→+24% (×0.85)
- BBIK: +15.4%→+15% (×0.85)
- BBL: +2.6%→+3% (×0.85)
- BCH: +2%→+1.7% (×0.865)
- BCP: +2%→+1.8% (×0.855)
- BDX: +2%→+1.6% (×0.985)
- BG: -26.9%→-27% (×0.85)
- BGC: -84.9%→-85% (×0.85)
- BGRIM: +2%→+1.9% (×1.05)
- BH: +3.8%→+4% (×0.85)
- BIDU: +2%→+1.6% (×0.925)
- BIIB: -34.4%→-34% (×0.85)
- BIZ: +2%→+1.5% (×0.99)
- BJC: -3.2%→-3% (×0.85)
- BKI: -4.8%→-5% (×0.85)
- BKNG: +20.3%→+20% (×0.85)
- BKR: -38.1%→-38% (×0.85)
- BLK: +16.2%→+16% (×0.85)
- BMO: -31.6%→-32% (×0.85)
- BMY: -29.2%→-29% (×0.85)
- BN: +9.9%→+10% (×0.85)
- BNS: -35.7%→-36% (×0.85)
- BOL: -2.5%→-3% (×0.85)
- BR: +1%→+1.5% (×1.085)
- BRK-B: +7.7%→+8% (×0.85)
- BSX: +89.7%→+90% (×0.85)
- BWXT: -31.7%→-32% (×0.85)
- BX: +2%→+1.9% (×0.965)
- BXP: +2%→+1.7% (×0.975)
- C: +66.9%→+67% (×0.85)
- CACI: -7.3%→-7% (×0.85)
- CAH: -8.4%→-8% (×0.85)
- CAMT: -1%→-1.4% (×0.85)
- CARR: +16.6%→+17% (×0.85)
- CART: +8.6%→+9% (×0.85)
- CASY: +62.3%→+62% (×0.85)
- CAT: -43.9%→-44% (×0.85)
- CBG: -18.5%→-18% (×0.85)
- CBOE: +2.6%→+3% (×0.85)
- CBRE: -7.6%→-8% (×0.85)
- CBRS: -51.1%→-51% (×0.85)
- CCEP: +41.7%→+42% (×0.85)
- CCET: -64.4%→-64% (×0.85)
- CCI: +44.9%→+45% (×0.85)
- CCJ: +16.7%→+17% (×0.85)
- CDNS: +9.4%→+9% (×0.85)
- CDW: -19.3%→-19% (×0.85)
- CEG: -5.6%→-6% (×0.85)
- CENTEL: +2%→+1.7% (×1.065)
- CF: -43.4%→-43% (×0.85)
- CFG: -25.4%→-25% (×0.85)
- CG: +5.3%→+5% (×0.85)
- CGNX: -16.3%→-16% (×0.85)
- CHD: +2%→+1.6% (×1.035)
- CHE: +27.6%→+28% (×0.85)
- CHG: 13.4%→+13% (×0.85)
- CI: +29.5%→+29% (×0.85)
- CIEN: +2%→+1.6% (×0.915)
- CKP: +37.8%→+38% (×0.85)
- CL: +16.6%→+17% (×0.85)
- CLH: +15.5%→+16% (×0.85)
- CLS: -2.4%→-2% (×0.88)
- CM: -29.5%→-30% (×0.85)
- CMCSA: +13.4%→+13% (×0.85)
- CME: +2.9%→+3% (×0.85)
- CMG: +2%→+1.6% (×1.035)
- CMI: +47.1%→+47% (×0.85)
- CMS: +30.4%→+30% (×0.85)
- CNC: -18.5%→-19% (×0.85)
- CNI: +2.1%→+2% (×0.85)
- CNQ: -38.7%→-39% (×0.85)
- COCOCO: -24.4%→-24% (×0.85)
- COF: +3.2%→+3% (×0.85)
- COHR: -3.1%→-3% (×0.85)
- COM7: +25.7%→+26% (×0.85)
- COO: +39.3%→+39% (×0.85)
- COP: -36.3%→-36% (×0.85)
- COST: +54.3%→+54% (×0.85)
- CP: -9.2%→-9% (×0.85)
- CPALL: +2%→+1.6% (×1.04)
- CPAXT: +19.8%→+20% (×0.85)
- CPF: -3.5%→-3% (×0.85)

</details>
