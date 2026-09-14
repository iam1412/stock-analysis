# census การย้าย v1 → v2 (ระยะ 2 ส่วน C)

อัปเดต: 14/9/2569 18:18:12 (Asia/Bangkok)

| ผล | ใบ |
|---|---|
| ย้ายได้ | 482 |
| ยังไม่ได้ (residue) | 18 |
| รวม | 500 |

## เหตุผล residue (นับต่อชนิด)

| เหตุผล | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| legend แสดง N แต่ FV = N | 8 | COHU CTAS DTM DXCM FORM GNTX HMPRO LPLA |
| จำนวนช่อง %/ปี ไม่เท่าเดิม | 2 | ACN JMT |
| site vcellFv match ≠ N | 2 | AEM BTG |
| ค่าไม่ตรงชั้น N | 2 | AMKR LWLG |
| กรอบ FV สองที่ไม่ตรงกัน | 1 | ALLE |
| site vcellTgt match ≠ N | 1 | BABA |
| cron-diff v1-unstable meta:dividendYield,visible | 1 | BNY |
| site legend match ≠ N | 1 | FANG |

## site ที่คง literal (นับต่อชนิด)

| site | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| psCard — ไม่มีการ์ดที่ตัดสินได้ | 479 | A AAI AAON AAPL ABBNY ABBV ABNB ABT ACE ACMR … |
| yieldCard — รูปตัวเลขต่าง ("N%" ≠ "N%") | 290 | A AAON AAPL ABBNY ABBV ABT ACN ADI ADM ADP … |
| peCard — ไม่มีการ์ดที่ตัดสินได้ | 242 | A AAOI ABNB ABT ACE ADP ADVANC ADVICE AEE AEHR … |
| pbvCard — ไม่มีการ์ดที่ตัดสินได้ | 213 | AAOI AAPL ABBNY ABBV ACE ACMR ACN ADBE ADI ADP … |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NB") | 135 | AAON ABBNY ABBV ABNB ACMR ACN ADBE ADP AEE AIT … |
| yieldCard — ไม่มีการ์ดที่ตัดสินได้ | 131 | AAOI ABNB ACE ACMR ADBE ADSK AEHR AEVA AIG AKAM … |
| scnNote — ไม่พบ | 126 | AAOI AAPL ABNB ACMR ACN ADBE ADI ADSK AEHR AEVA … |
| pbvCard — รูปตัวเลขต่าง ("N" ≠ "N") | 86 | A AAON ABNB ABT AEP AME AMGN AON AOS APD … |
| scn | 74 | AAI ADM ADVICE AEE AEONTS AFL AIG AMATAV AME AON … |
| peCard — รูปตัวเลขต่าง ("N" ≠ "N") | 70 | AAPL ABBNY ACMR ACN ADI ADSK AMAT AMD ANET AOT … |
| tgtCard — ไม่พบรูป "เป้า (+%)" | 58 | AAOI AAPL ABBNY ACMR ACN ADBE ADI ADSK AEHR ALAB … |
| zone — ราคาโซนสะสม N ≠ FV N (ผู้เขียนตั้งเอง) | 52 | AAOI ACMR ACN ADBE ADI ADSK ALAB AMKR ANET APH … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N พันล้าน") | 35 | AAI AHC ANI APURE ASIAN ASK ASW BAFS BBIK BE8 … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N หมื่นล้าน") | 19 | ACE AURA AWC AYUD BAM BCH BKI BLA CHG CK … |
| mcapCard — ไม่มีการ์ดที่ตัดสินได้ | 19 | ARM ASML AVGO BIDU BNS BRK-B CB DB DEO EPD … |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N หมื่นล้าน") | 15 | AP BCP BCPG BEM BGRIM CBG CENTEL EGCO EPG GLOBAL … |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N หมื่นล้าน") | 7 | AMATA BJC BTS DOHOME JMT KTC M |
| mcapCard — รูปตัวเลขต่าง ("$N" ≠ "$NB") | 7 | B DTE EIX ES EVRG FE LNT |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N แสนล้าน") | 6 | BAY CPALL CPAXT GULF IVL MINT |
| psCard — รูปตัวเลขต่าง ("N" ≠ "N") | 5 | AEHR CPW DRS EXPE IVL |
| fvBoxRange — กรอบใน fv-box ไม่ตรง values/ไม่มีสัญลักษณ์สกุลเงินครบ | 4 | AAOI BGC CAT LWLG |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NT") | 4 | AAPL AMZN GOOGL META |
| mcapCard — รูปตัวเลขต่าง ("$N B" ≠ "$NB") | 4 | ADM AIG BG C |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N พันล้าน") | 4 | ADVICE AMATAV AU INSET |
| disc | 4 | AMATAV CKP DOHOME FNF |
| mcapCard — รูปตัวเลขต่าง ("$N พันล้าน" ≠ "$NB") | 4 | BMO FTS IMO KGC |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N หมื่นล้าน") | 3 | AEONTS COM7 DCC |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N พันล้าน") | 3 | BGC DITTO ILM |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NM") | 2 | AEVA LWLG |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N แสนล้าน") | 2 | BDMS BH |
| hintEps — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CCET CHG |
| scn3div — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CKP DOHOME |
| scn2div — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CKP DOHOME |
| scn1div — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CKP DOHOME |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N แสนล้าน") | 2 | CRC KKP |
| hintEps — รูปเงินต่าง ("$N" ≠ "$N") | 2 | CRWD ES |
| hintEps — ไม่พบ | 1 | AER |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้านล้าน" ≠ "฿N แสนล้าน") | 1 | AOT |
| mcapCard — รูปตัวเลขต่าง ("฿NM" ≠ "฿N หมื่นล้าน") | 1 | CCET |
| restate — ในวงเล็บมีคำขยาย ("N ก.ย. N ตลาดปิด") | 1 | DPZ |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N พันล้าน") | 1 | DRT |
| mcapCard — รูปตัวเลขต่าง ("N" ≠ "฿N หมื่นล้าน") | 1 | FPT |
| restate — ในวงเล็บมีคำขยาย ("N ก.ย. N เวลาไทย") | 1 | HIG |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NB") | 1 | LLY |

## ใบที่ศักราชของ .disc ต่างจากหัวรายงาน (note `dateEra normalize`)

- APH
- BRO
- CGNX
- CLS
- EGCO

## ผลตอบแทนฉาก %/ปี ที่ข้อความเปลี่ยนหลังย้าย (หมวด 6 · เปิดเผยเท่านั้น ไม่ใช่เกณฑ์ผ่าน/ตกใหม่ — ดู TOLERANCE.f34/f35)

| ชนิด | จุด (คอลัมน์) | ใบ |
|---|---|---|
| รูปเลขเปลี่ยนแต่ค่าเท่าเดิม (form) | 216 | — |
| ค่าจริงขยับ (value) | 49 | 33 |

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
- CPN: bear −3.5%/ปี → −3%/ปี
- CRDO: base +18.5%/ปี → +18%/ปี
- DELL: base −6.5%/ปี → −6%/ปี
- ES: bear null → +2.0%/ปี · base null → +12%/ปี · bull null → +17%/ปี
- ETN: bull +14.5%/ปี → +14%/ปี
- FN: bear +1.5%/ปี → +1.6%/ปี
- FSMART: bear −10.5%/ปี → −10%/ปี · base null → +10%/ปี · bull null → +28%/ปี
- FTS: base +4.5%/ปี → +4%/ปี
- GFPT: base null → +16%/ปี · bull null → +24%/ปี
- IBM: bear −12.5%/ปี → −12%/ปี
- ICHI: base +26.5%/ปี → +26%/ปี
- ICLR: base +1.5%/ปี → +1.6%/ปี
- III: bear -1.3%/ปี → −1.4%/ปี · base null → +26%/ปี · bull null → +38%/ปี
- INTC: bull +23.5%/ปี → +23%/ปี
- JBL: bear -1%/ปี → −1.4%/ปี
- KKP: base −1.3%/ปี → −1.4%/ปี
- KLINIQ: bear +1.4%/ปี → +1.3%/ปี
- KTB: base +1.4%/ปี → +1.3%/ปี
- M: base null → +3%/ปี · bull null → +19%/ปี
- MCK: bear -1.3%/ปี → −1.4%/ปี
- MKSI: bear +1%/ปี → +1.3%/ปี

## cron differential v1 ↔ v2 (`--cron-diff` · grid ราคา ×0.85–×1.15 ทีละ 0.005 · 61 จุด)

เทียบผล `patchReport` ของ v1 ต้นฉบับกับ v2 ที่ราคา/วันที่เดียวกัน: stock-meta (price/mos/upside/fairValue/pe/dividendYield) ·
ตัวเลขที่มองเห็น · error/warning ของ gate — ใบที่ต่างนอกเหนือ "รูป" = residue (ไม่เขียน)

| ผล | ใบ |
|---|---|
| ตรวจ | 483 |
| ผ่าน | 482 |
| ตก (ไม่เขียน) | 1 |
| ผ่านแต่ต่างแค่รูป | 397 |

### ตกตามชนิด

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| meta:dividendYield | 1 | BNY |
| visible | 1 | BNY |

### ต่างแค่รูป (เขียนได้ · เปิดเผยให้เจ้าของตัดสิน)

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | 388 | A AAOI AAON AAPL ABBNY ABBV ABNB ABT ACE ADBE ADI ADP ADVANC AEHR AEP AER AEVA AHC AIT AJG AKAM ALAB ALC ALGN ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APG APH APP APURE AR ARE ARES AS ASIAN ASW ATO ATS AUR AURA AVAV AVGO AVY AWK AWR AXON AXP AYUD AZN AZO BAC BALL BAX BAY BBIK BBL BCH BCP BDX BG BGC BGRIM BH BIDU BIIB BIZ BJC BKI BKNG BKR BLK BMO BMY BN BNS BOL BR BRK-B BSX BWXT BX BXP C CACI CAH CAMT CARR CART CASY CAT CBG CBOE CBRE CBRS CCEP CCET CCI CCJ CDNS CDW CEG CENTEL CF CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CLS CM CMCSA CME CMG CMI CMS CNC CNI CNQ COCOCO COF COHR COM7 COO COP COST CP CPALL CPAXT CPF CPN CPNG CPRT CPT CPW CRC CRDO CREDIT CRH CRL CRM CRWD CRWV CSCO CSGP CSL CSX CTSH CTVA CVX CW D DASH DB DCI DD DDOG DE DECK DELL DELTA DEO DGX DHI DHR DIS DITTO DLR DMT DOC DOHOME DOW DPZ DRI DRS DUK DUSIT DVA DY EASTW EBAY ECL ED EFX EG EGCO EGP EHC EL ELV EMA EME EMR ENB ENTG EQIX ERW ES ESLT ESNT ESS ETN ETR EVR EW EWBC EXC EXE EXEL EXPD EXPE EXPO EXR FANUY FAST FCX FDS FDX FE FER FICO FISV FIVE FLEX FN FNV FORTH FPT FR FSMART FTNT FTS FTV GD GE GEHC GEV GFPT GFS GGG GILD GIS GLOBAL GLW GMED GNRC GOOGL GPSC GRAB GRMN GS GWRE GWW HAL HANA HARN HCA HD HEI HIG HON HRL HST HSY HTC HUBB HUM HUMAN IBM ICE ICHI ICLR IDXX IESC IEX IFF IIG III ILMN IMO INCY INSM INTC INTU INVH IP IPGP IQV IR IRM ISRG IT ITC ITEL ITT ITW IVL JAZZ JBHT JBL JCI JD JNJ KAMART KCG KDP KEY KEYS KGC KIM KKP KKR KLAC KLINIQ KMB KMI KNSL KO KR KTB KTC KTOS KVUE KYCCF L LANC LDOS LECO LEN LEO LH LHFG LHX LII LIN LITE LMT LNG LOW LPH LRCX LSCC LULU LYV M MA MAA MANH MAR MBK MBLY MC MCD MCK MCO MDLN MDT MEB MEDEZE MEGA MELI MET META MFC MFEC MICRO MINT MKL MKSI |
| รูปตัวเลขอื่น (เช่น ราคา 278→277.58 · หน่วย ล้านล้าน→แสนล้าน · ศักราช) | 88 | AAOI AAPL ACMR ADBE ADI ADSK ADVANC AEONTS ALAB ALGN AMAT AMD AMZN ANET APH APP ARE ARM ASML AVGO AYUD BBL BKI BRO CAMT CAT CCJ CDNS CEG CGNX CHE CIEN CLH CLS CLX CMCSA CME CMG COHR COO CPF CPT CRDO CRM CRWD CSX DDOG DELL DELTA DRS DVA DY EGCO ELV ENTG ETN EVR FDS FLEX FN FRT FTNT GD GEV GOOGL HRL IBM ICE INTU IPGP ISRG JBL JCI KBANK KEYS KKR KLAC KYCCF LII LITE LOW LRCX LSCC MAR MBK MELI META MKSI |
| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | 280 | A AAOI AAPL ABBNY ABBV ABNB ABT ADBE ADI ADVANC AEP AEVA AHC AIT AJG ALAB ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APURE AR ARE ARES ASW ATO AVY AWK AWR AXP AYUD AZO BAC BALL BAY BBIK BBL BCH BCP BDX BG BGRIM BH BIDU BIIB BIZ BKI BKNG BKR BLK BMY BN BNS BNY BR BRK-B BX BXP CACI CARR CART CASY CBG CBOE CBRS CCET CCI CDNS CEG CENTEL CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CM CMCSA CME CMG CMI CMS CNC CNI COF COHR COM7 COO COP COST CPALL CPAXT CPN CPRT CPT CRC CREDIT CRH CRL CSGP CSX CTSH CTVA CVX CW D DB DCI DD DECK DELL DGX DHI DITTO DMT DOC DPZ DRI DRS DVA ECL ED EG EGCO EGP EHC EMA EME EMR ENB ENTG EQIX ERW ES ESLT ESNT ESS ETN ETR EW EXC EXE EXEL EXPD EXPO EXR FANUY FAST FCX FE FER FICO FIVE FMC FN FNV FPT FR FTNT FTS FTV GD GE GFPT GFS GILD GLOBAL GLW GMED GPSC GRMN GS GWW HAL HANA HARN HCA HD HEI HON HRL HST HTC HUBB IBM ICE ICHI ICLR IDXX IEX III IMO INCY INSM INTU INVH IP IPGP IR IRM ISRG IT ITC ITT ITW IVL JAZZ JBHT JBL JCI JD JNJ KDP KEY KEYS KIM KKP KKR KLAC KLINIQ KMB KNSL KO KR KTB KTC KTOS KVUE KYCCF LANC LDOS LEN LH LHFG LHX LIN LITE LMT LOW M MA MAA MANH MAR MBK MC MCD MCK MCO MDT MEB MEDEZE MEGA MELI MET META MFC MFEC MICRO MINT MKC MKL MKSI |

### ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ)

เกณฑ์: ห่างไม่เกิน GAP_REL 1.2% (ชั้น 1 ของ migrator) · cron ไม่แตะทั้งสองฝั่ง · มากสุดที่พบ 0.99%

| ชนิด | ใบ | มากสุด | รายชื่อ |
|---|---|---|---|
| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | 21 | 0.99% | AEE ANI BF-B BWXT CBOE CHAYO CMS DD DUK EPG EQIX EXE FDS GLOBAL HSY IIG IVL JAZZ LDOS LPH MFC |

- AEE: «เหมาะสม $106.55 $ ▯ MOS 30% $85.24 MOS 20% $» 74.59 → 74.58 (0.01%)
- ANI: «เหมาะสม ฿3.65 ฿ ▯ MOS 30% ฿2.92 MOS 20% ฿3» 2.56 → 2.55 (0.39%)
- BF-B: « Value) กรอบ $24 - $35 $ ▯ วิธี P/E และ EV/EBITDA ใ» 30.91 → 31.00 (0.29%)
- BWXT: «เหมาะสม $153.95 $ ▯ MOS 30% $123.16 MOS 20% » 107.77 → 107.76 (0.01%)
- CBOE: «.14 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV ราคาปัจจุบัน» 319.30 → 319.00 (0.09%)
- CHAYO: «.10 เป้า Analyst (KSS) ฿ ▯ MOS 30% ฿2.28 MOS 20% ฿2» 1.99 → 2.00 (0.5%)
- CMS: «lyst $80.00 Fair Value $ ▯ กรอบบน FV ราคาปัจจุบัน» 84.97 → 85.00 (0.04%)
- DD: «เหมาะสม $126.2 $ ▯ MOS 30% $100.98 MOS 20% » 88.36 → 88.34 (0.02%) · «$88.36 MOS 30% $ ▯ MOS 20% $126.2 Fair Valu» 100.98 → 100.96 (0.02%)
- DUK: «.94 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV ราคาปัจจุบัน» 139.86 → 140.00 (0.1%)
- EPG: «เหมาะสม ฿7.35 ฿ ▯ MOS 30% ฿5.88 MOS 20% ฿7» 5.14 → 5.15 (0.19%)
- EQIX: «เหมาะสม $1,059 $ ▯ MOS 30% $847.28 MOS 20% » 741.37 → 741.30 (0.01%) · «$741.37 MOS 30% $ ▯ MOS 20% $1,059 Fair Valu» 847.28 → 847.20 (0.01%)
- EXE: «เหมาะสม $71.85 $ ▯ MOS 30% $57.48 MOS 20% $» 50.30 → 50.29 (0.02%)
- FDS: «$194.65 MOS 30% $ ▯ MOS 20% $261.19 เป้าเฉลี» 222.45 → 222.46 (0%)
- GLOBAL: «เหมาะสม ฿6.15 ฿ ▯ MOS 30% ฿4.92 MOS 20% ฿6» 4.30 → 4.31 (0.23%)
- HSY: «OS 20% $146 Fair Value $ ▯ กรอบบน FV $205.81 เป้าเฉ» 168.36 → 168.00 (0.21%)
- IIG: « value จุดซื้อ MOS 30% ฿ ▯ โซนถูกมาก (deep value) โ» 1.02 → 1.01 (0.99%)
- IVL: «เหมาะสม ฿23.8 ฿ ▯ MOS 30% ฿19.00 MOS 20% ฿» 16.70 → 16.66 (0.24%) · «฿16.70 MOS 30% ฿ ▯ MOS 20% ฿23.80 Fair Valu» 19.00 → 19.04 (0.21%)
- JAZZ: «เหมาะสม $232.75 $ ▯ MOS 30% $186.20 MOS 20% » 162.93 → 162.92 (0.01%)
- LDOS: «.27 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV ราคาปัจจุบัน» 197.05 → 197.00 (0.03%)
- LPH: «เหมาะสม ฿4.05 ฿ ▯ MOS 30% ฿3.24 MOS 20% ฿4» 2.84 → 2.83 (0.35%)
- MFC: «เหมาะสม $34.55 $ ▯ MOS 30% $27.64 MOS 20% $» 24.19 → 24.18 (0.04%)

### ใบที่ผ่านโดยใช้ข้อยกเว้นของตัวเทียบ (ไม่เปลี่ยนผลตัดสิน — เปิดเผยให้ตรวจ)

| ข้อยกเว้น | ใบ | รายชื่อ |
|---|---|---|
| ผลต่างที่มีก่อน patch — รูปหรือค่า (≤ GAP_REL · ค่าต่างรายใบอยู่ในหมวดด้านบน) | 117 | AAOI AAPL ACMR ADBE ADI ADSK AEE AEONTS AFL ALAB ALL AMAT AMD AMZN ANET ANI APH APP ARM ASML AVGO AVY AXP BBL BDX BF-B BIIB BJC BKI BLK BMI BWXT CAMT CASY CAT CBOE CCJ CDNS CEG CHAYO CHE CIEN CLH CLS CMS COF COHR COST CRDO CRM CRWD CSCO CVS DD DDOG DE DELL DGX DUK DVA ECL EL EME ENTG EOG EPG EQIX ERIE ESS ETN EVR EXE FCX FDS FDX FLEX FN FTNT GEV GLOBAL GNRC GOOGL GULF HD HSY IBM IIG INTC INTU IPGP IQV ISRG IVL JAZZ JBL KBANK KEYS KLAC KMB KTB KYCCF LDOS LHX LII LITE LMT LOW LPH LRCX LSCC LULU MCK MCO MELI META MFC MKSI |
| %/ปี ต่างตามรูปของ "รวม" (ทั้งสองฝั่ง = f(รวมที่โชว์)) | 82 | AAOI ABT ADBE AEHR ALC ALNY AMATA AMRZ AMZN ASW AUR AVAV AVGO AZN BALL BAY BBIK BBL BJC BKI BMO BNS BWXT CBRS CCEP CDNS CEG CKP CM CNQ COCOCO COHR CPF CPN CRDO CREDIT CRM CRWV CSL DELL DITTO DMT DOHOME EMA ENB ERW ES ETN FER FICO FN FNV FORTH FSMART FTS GFPT GLW GOOGL GRMN HON HUMAN IBM ICHI ICLR IIG III IMO INSM INTC IP KKP KLAC KLINIQ KTB KTOS LEO LITE M MCK MELI META MFEC |
| วงเล็บทวนวันที่ล้วน (migrator ลบ · f11) | 2 | AZN CSGP |
| หน่วยใหญ่ของเงินต่างกัน ค่าเดียวกัน | 1 | ADVANC |
| ปีคนละศักราช (2569 ↔ 2026) | 5 | APH BRO CGNX CLS EGCO |

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
- CPN: +16.7%→+17% (×0.855)
- CPNG: -68.9%→-69% (×0.85)
- CPRT: +20.9%→+21% (×0.85)
- CPT: +25.6%→+26% (×0.85)
- CPW: -17.5%→-18% (×0.85)
- CRC: +1%→+1.5% (×0.945)
- CRDO: +95.7%→+96% (×0.85)
- CREDIT: +4.7%→+5% (×0.85)
- CRH: +19.6%→+20% (×0.85)
- CRL: -43.6%→-44% (×0.85)
- CRM: -13.6%→-14% (×0.85)
- CRWD: -19.1%→-19% (×0.85)
- CRWV: -48.4%→-48% (×0.85)
- CSCO: -2.4%→-2% (×0.85)
- CSGP: +177.3%→+177% (×0.85)
- CSL: -11.7%→-12% (×0.85)
- CSX: +1%→+1.5% (×0.995)
- CTSH: +2%→+1.8% (×0.9)
- CTVA: +2.4%→+2% (×0.85)
- CVX: -24.7%→-25% (×0.85)
- CW: +50.6%→+51% (×0.85)
- D: +2%→+1.5% (×0.995)
- DASH: +38.2%→+38% (×0.85)
- DB: +1%→+1.4% (×0.87)
- DCI: +35.5%→+36% (×0.85)
- DD: +11.2%→+11% (×0.85)
- DDOG: -1%→-0.5% (×0.85)
- DE: -32.4%→-32% (×0.85)
- DECK: +24.5%→+24% (×0.85)
- DELL: -38.2%→-38% (×0.85)
- DELTA: -53.3%→-53% (×0.85)
- DEO: -3.4%→-3% (×0.85)
- DGX: -26.5%→-27% (×0.85)
- DHI: -31.4%→-31% (×0.85)
- DHR: -25.4%→-25% (×0.85)
- DIS: +44.5%→+45% (×0.85)
- DITTO: +37.3%→+37% (×0.85)
- DLR: +2%→+1.8% (×1.13)
- DMT: -10.6%→-11% (×0.85)
- DOC: +25.5%→+25% (×0.85)
- DOHOME: -26.8%→-27% (×0.85)
- DOW: -28.3%→-28% (×0.85)
- DPZ: +20.5%→+20% (×0.85)
- DRI: +12.8%→+13% (×0.85)
- DRS: +9.5%→+10% (×0.85)
- DUK: +38.2%→+38% (×0.85)
- DUSIT: -5.7%→-6% (×0.85)
- DVA: +2%→+1.6% (×0.905)
- DY: -26.5%→-26% (×0.85)
- EASTW: -75.2%→-75% (×0.85)
- EBAY: -12.4%→-12% (×0.85)
- ECL: +5.5%→+6% (×0.85)
- ED: +24.3%→+24% (×0.85)
- EFX: -27.5%→-28% (×0.85)
- EG: +15.2%→+15% (×0.85)
- EGCO: -6.9%→-7% (×0.85)
- EGP: +29.5%→+29% (×0.85)
- EHC: +12.6%→+13% (×0.85)
- EL: -2.8%→-3% (×0.85)
- ELV: -22.7%→-23% (×0.85)
- EMA: +3.9%→+4% (×0.85)
- EME: +6.5%→+7% (×0.85)
- EMR: +1%→+1.4% (×0.88)
- ENB: +15.3%→+15% (×0.85)
- ENTG: +2%→+1.6% (×1.085)
- EQIX: +2%→+1.8% (×1.005)
- ERW: -12.1%→-12% (×0.85)
- ES: +25.1%→+25% (×0.85)
- ESLT: -38.5%→-39% (×0.85)
- ESNT: +12.2%→+12% (×0.85)
- ESS: +27.3%→+27% (×0.85)
- ETN: +11.6%→+12% (×0.85)
- ETR: -5.2%→-5% (×0.85)
- EVR: +111.7%→+112% (×0.85)
- EW: +2%→+1.8% (×0.975)
- EWBC: -6.5%→-7% (×0.85)
- EXC: +24.4%→+24% (×0.85)
- EXE: -44.2%→-44% (×0.85)
- EXEL: +11.7%→+12% (×0.85)
- EXPD: +2%→+1.9% (×0.85)
- EXPE: -29.3%→-29% (×0.85)
- EXPO: +2.3%→+2% (×0.85)
- EXR: +23.1%→+23% (×0.85)
- FANUY: -30.9%→-31% (×0.85)
- FAST: +11.5%→+11% (×0.85)
- FCX: -30.8%→-31% (×0.85)
- FDS: -15.8%→-16% (×0.85)
- FDX: +78.4%→+78% (×0.85)
- FE: +11.3%→+11% (×0.85)
- FER: -2.1%→-2% (×0.85)
- FICO: +20.6%→+21% (×0.85)
- FISV: +68.2%→+68% (×0.85)
- FIVE: -47.6%→-48% (×0.85)
- FLEX: -2%→-1.7% (×0.85)
- FN: +23.2%→+23% (×0.85)
- FNV: -14.3%→-14% (×0.85)
- FORTH: -27.9%→-28% (×0.85)
- FPT: +33.8%→+34% (×0.85)
- FR: +50.1%→+50% (×0.85)
- FSMART: -15.6%→-16% (×0.85)
- FTNT: +2%→+1.6% (×0.92)
- FTS: +7.3%→+7% (×0.85)
- FTV: +6.9%→+7% (×0.85)
- GD: +2%→+1.9% (×0.915)
- GE: -18.4%→-18% (×0.85)
- GEHC: -14.7%→-15% (×0.85)
- GEV: -3.5%→-3% (×0.85)
- GFPT: +2.9%→+3% (×0.85)
- GFS: +14.5%→+14% (×0.85)
- GGG: +39.5%→+40% (×0.85)
- GILD: -21.4%→-21% (×0.85)
- GIS: -3.9%→-4% (×0.85)
- GLOBAL: +2%→+1.8% (×0.86)
- GLW: -4.5%→-5% (×0.85)
- GMED: +23.5%→+23% (×0.85)
- GNRC: -25.1%→-25% (×0.85)
- GOOGL: -2%→-1.7% (×0.85)
- GPSC: +29.2%→+29% (×0.85)
- GRAB: -13.1%→-13% (×0.85)
- GRMN: +11.7%→+12% (×0.85)
- GS: -46.4%→-46% (×0.85)
- GWRE: -7.2%→-7% (×0.85)
- GWW: +59.6%→+60% (×0.85)
- HAL: -26.7%→-27% (×0.85)
- HANA: +2%→+1.6% (×0.96)
- HARN: +2%→+1.6% (×0.94)
- HCA: +11.7%→+12% (×0.85)
- HD: +11.6%→+12% (×0.85)
- HEI: +2%→+1.6% (×1.03)
- HIG: -12.4%→-12% (×0.85)
- HON: -22.1%→-22% (×0.85)
- HRL: +36.8%→+37% (×0.85)
- HST: +2%→+1.7% (×0.88)
- HSY: +37.4%→+37% (×0.85)
- HTC: +16.1%→+16% (×0.85)
- HUBB: +5.9%→+6% (×0.85)
- HUM: -76.7%→-77% (×0.85)
- HUMAN: +43.6%→+44% (×0.85)
- IBM: -21.2%→-21% (×0.85)
- ICE: +1%→+1.4% (×0.885)
- ICHI: +29.8%→+30% (×0.85)
- ICLR: -20.1%→-20% (×0.85)
- IDXX: +27.7%→+28% (×0.85)
- IESC: -50.7%→-51% (×0.85)
- IEX: +32.1%→+32% (×0.85)
- IFF: -6.5%→-7% (×0.85)
- IIG: -26.7%→-27% (×0.85)
- III: +13.2%→+13% (×0.85)
- ILMN: -52.9%→-53% (×0.85)
- IMO: -60.2%→-60% (×0.85)
- INCY: +21.1%→+21% (×0.85)
- INSM: -75.5%→-75% (×0.85)
- INTC: -24.6%→-25% (×0.85)
- INTU: +2%→+1.6% (×0.88)
- INVH: +17.3%→+17% (×0.85)
- IP: -8.7%→-9% (×0.85)
- IPGP: +1%→+0.7% (×0.855)
- IQV: -8.3%→-8% (×0.85)
- IR: 2%→+1.9% (×1.1)
- IRM: +2%→+1.7% (×0.93)
- ISRG: +20.5%→+21% (×0.85)
- IT: -31.3%→-31% (×0.85)
- ITC: +1%→+1.4% (×1.045)
- ITEL: +19.8%→+20% (×0.85)
- ITT: +2%→+1.8% (×1.095)
- ITW: +1%→+1.5% (×0.865)
- IVL: +2%→+1.6% (×1.015)
- JAZZ: -51.4%→-51% (×0.85)
- JBHT: -10.8%→-11% (×0.85)
- JBL: +2%→+1.6% (×0.91)
- JCI: +2%→+1.9% (×0.86)
- JD: +1%→+1.3% (×0.85)
- JNJ: -3.7%→-4% (×0.85)
- KAMART: -7.8%→-8% (×0.85)
- KCG: +81.5%→+81% (×0.85)
- KDP: +24.3%→+24% (×0.85)
- KEY: +11.3%→+11% (×0.85)
- KEYS: +1%→+0.8% (×0.85)
- KGC: -75.7%→-76% (×0.85)
- KIM: +35.9%→+36% (×0.85)
- KKP: -9.5%→-9% (×0.85)
- KKR: +2%→+1.8% (×1.07)
- KLAC: +10.2%→+10% (×0.85)
- KLINIQ: +22.8%→+23% (×0.85)
- KMB: +25.9%→+26% (×0.85)
- KMI: -3.9%→-4% (×0.85)
- KNSL: +21.2%→+21% (×0.85)
- KO: +2%→+1.8% (×0.89)
- KR: +1%→+1.5% (×0.89)
- KTB: -9.6%→-10% (×0.85)
- KTC: +2%→+1.9% (×0.885)
- KTOS: -46.3%→-46% (×0.85)
- KVUE: +3.3%→+3% (×0.85)
- KYCCF: -13.2%→-13% (×0.85)
- L: -12.4%→-12% (×0.85)
- LANC: +2%→+1.9% (×1.075)
- LDOS: +24.6%→+25% (×0.85)
- LECO: -5.6%→-6% (×0.85)
- LEN: -35.4%→-35% (×0.85)
- LEO: -5.6%→-6% (×0.85)
- LH: +1%→+0.6% (×0.85)
- LHFG: +4.9%→+5% (×0.85)
- LHX: +12.6%→+13% (×0.85)
- LII: +42.8%→+43% (×0.85)
- LIN: +2%→+1.6% (×1.04)
- LITE: -44.2%→-44% (×0.85)
- LMT: +14.2%→+14% (×0.85)
- LNG: -19.2%→-19% (×0.85)
- LOW: 2%→+1.7% (×1.1)
- LPH: -5.2%→-5% (×0.85)
- LRCX: -6.4%→-6% (×0.85)
- LSCC: -1%→-1.4% (×0.85)
- LULU: -15.6%→-16% (×0.85)
- LYV: -22.4%→-22% (×0.85)
- M: -15.1%→-15% (×0.85)
- MA: +5.8%→+6% (×0.85)
- MAA: +30.1%→+30% (×0.85)
- MANH: -22.1%→-22% (×0.85)
- MAR: +1%→+1.4% (×0.875)
- MBK: +129.3%→+129% (×0.85)
- MBLY: -50.1%→-50% (×0.85)
- MC: +6.1%→+6% (×0.85)
- MCD: +2%→+1.5% (×1.15)
- MCK: +13.2%→+13% (×0.85)
- MCO: +19.3%→+19% (×0.855)
- MDLN: -17.8%→-18% (×0.85)
- MDT: +2%→+1.9% (×1)
- MEB: +129.6%→+130% (×0.85)
- MEDEZE: -77.6%→-78% (×0.85)
- MEGA: +60.3%→+60% (×0.85)
- MELI: +7.1%→+7% (×0.85)
- MET: +5.4%→+5% (×0.85)
- META: -26.3%→-26% (×0.85)
- MFC: +78.5%→+79% (×0.85)
- MFEC: +22.2%→+22% (×0.85)
- MICRO: -51.3%→-51% (×0.85)
- MINT: +45.3%→+45% (×0.85)
- MKL: +21.5%→+21% (×0.85)
- MKSI: +2%→+1.7% (×0.99)

</details>
