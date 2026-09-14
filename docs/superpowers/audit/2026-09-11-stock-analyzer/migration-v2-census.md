# census การย้าย v1 → v2 (ระยะ 2 ส่วน C)

อัปเดต: 14/9/2569 18:26:19 (Asia/Bangkok)

| ผล | ใบ |
|---|---|
| ย้ายได้ | 865 |
| ยังไม่ได้ (residue) | 43 |
| รวม | 908 |

## เหตุผล residue (นับต่อชนิด)

| เหตุผล | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| legend แสดง N แต่ FV = N | 16 | COHU CTAS DTM DXCM FORM GNTX HMPRO LPLA RELX SHANG … |
| จำนวนช่อง %/ปี ไม่เท่าเดิม | 5 | ACN JMT RS SCGD SNNP |
| ค่าไม่ตรงชั้น N | 4 | AMKR LWLG MTI TMAN |
| site vcellTgt match ≠ N | 3 | BABA STX VRT |
| site legend match ≠ N | 3 | FANG MPC MU |
| site vcellFv match ≠ N | 2 | AEM BTG |
| กรอบ FV สองที่ไม่ตรงกัน | 2 | ALLE POET |
| FV ไม่ตรงกันเอง | 2 | PNC TEAM |
| cron-diff v1-unstable gate-warn:W22 | 2 | PTG THCOM |
| cron-diff v1-unstable meta:dividendYield,visible | 1 | BNY |
| site summary match ≠ N | 1 | MXL |
| mFair แสดง N แต่ FV = N | 1 | SAPPE |
| cron-diff v1-unstable visible | 1 | WWD |

## site ที่คง literal (นับต่อชนิด)

| site | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| psCard — ไม่มีการ์ดที่ตัดสินได้ | 866 | A AAI AAON AAPL ABBNY ABBV ABNB ABT ACE ACMR … |
| yieldCard — รูปตัวเลขต่าง ("N%" ≠ "N%") | 515 | A AAON AAPL ABBNY ABBV ABT ACN ADI ADM ADP … |
| peCard — ไม่มีการ์ดที่ตัดสินได้ | 428 | A AAOI ABNB ABT ACE ADP ADVANC ADVICE AEE AEHR … |
| pbvCard — ไม่มีการ์ดที่ตัดสินได้ | 368 | AAOI AAPL ABBNY ABBV ACE ACMR ACN ADBE ADI ADP … |
| yieldCard — ไม่มีการ์ดที่ตัดสินได้ | 254 | AAOI ABNB ACE ACMR ADBE ADSK AEHR AEVA AIG AKAM … |
| scnNote — ไม่พบ | 227 | AAOI AAPL ABNB ACMR ACN ADBE ADI ADSK AEHR AEVA … |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NB") | 224 | AAON ABBNY ABBV ABNB ACMR ACN ADBE ADP AEE AIT … |
| pbvCard — รูปตัวเลขต่าง ("N" ≠ "N") | 148 | A AAON ABNB ABT AEP AME AMGN AON AOS APD … |
| scn | 141 | AAI ADM ADVICE AEE AEONTS AFL AIG AMATAV AME AON … |
| peCard — รูปตัวเลขต่าง ("N" ≠ "N") | 138 | AAPL ABBNY ACMR ACN ADI ADSK AMAT AMD ANET AOT … |
| tgtCard — ไม่พบรูป "เป้า (+%)" | 102 | AAOI AAPL ABBNY ACMR ACN ADBE ADI ADSK AEHR ALAB … |
| zone — ราคาโซนสะสม N ≠ FV N (ผู้เขียนตั้งเอง) | 95 | AAOI ACMR ACN ADBE ADI ADSK ALAB AMKR ANET APH … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N พันล้าน") | 66 | AAI AHC ANI APURE ASIAN ASK ASW BAFS BBIK BE8 … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N หมื่นล้าน") | 48 | ACE AURA AWC AYUD BAM BCH BKI BLA CHG CK … |
| mcapCard — ไม่มีการ์ดที่ตัดสินได้ | 31 | ARM ASML AVGO BIDU BNS BRK-B CB DB DEO EPD … |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N หมื่นล้าน") | 25 | AP BCP BCPG BEM BGRIM CBG CENTEL EGCO EPG GLOBAL … |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N พันล้าน") | 11 | ADVICE AMATAV AU INSET RJH RPH S SCGD SICT SMPC … |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N หมื่นล้าน") | 11 | AMATA BJC BTS DOHOME JMT KTC M PLANB ROJNA SAUCE … |
| mcapCard — รูปตัวเลขต่าง ("$N" ≠ "$NB") | 10 | B DTE EIX ES EVRG FE LNT NI WEC XEL |
| disc | 9 | AMATAV CKP DOHOME FNF PRINC RAM RLI TOST UTHR |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N แสนล้าน") | 9 | BAY CPALL CPAXT GULF IVL MINT SCB SCGP TTB |
| mcapCard — รูปตัวเลขต่าง ("$N พันล้าน" ≠ "$NB") | 9 | BMO FTS IMO KGC RL RY TD TTE WSM |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N พันล้าน") | 8 | BGC DITTO ILM PRINC SECURE SNC TK TQM |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N แสนล้าน") | 8 | CRC KKP PTTEP SCC THAI TLI TOP TRUE |
| fvBoxRange — กรอบใน fv-box ไม่ตรง values/ไม่มีสัญลักษณ์สกุลเงินครบ | 7 | AAOI BGC CAT LWLG MXL OKJ TSEM |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NT") | 7 | AAPL AMZN GOOGL META MSFT NVDA TSLA |
| psCard — รูปตัวเลขต่าง ("N" ≠ "N") | 7 | AEHR CPW DRS EXPE IVL SNOW THREL |
| mcapCard — รูปตัวเลขต่าง ("$N B" ≠ "$NB") | 5 | ADM AIG BG C VEEV |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N หมื่นล้าน") | 5 | AEONTS COM7 DCC SJWD TCAP |
| hintEps — รูปเงินต่าง ("฿N" ≠ "฿N") | 3 | CCET CHG SONIC |
| scn3div — รูปเงินต่าง ("฿N" ≠ "฿N") | 3 | CKP DOHOME VIBHA |
| scn2div — รูปเงินต่าง ("฿N" ≠ "฿N") | 3 | CKP DOHOME VIBHA |
| mcapCard — รูปตัวเลขต่าง ("฿NM" ≠ "฿N พันล้าน") | 3 | NCAP SUN TPBI |
| hintEps — ไม่พบ | 2 | AER MPC |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NM") | 2 | AEVA LWLG |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N แสนล้าน") | 2 | BDMS BH |
| mcapCard — รูปตัวเลขต่าง ("฿NM" ≠ "฿N หมื่นล้าน") | 2 | CCET WHAUP |
| scn1div — รูปเงินต่าง ("฿N" ≠ "฿N") | 2 | CKP DOHOME |
| hintEps — รูปเงินต่าง ("$N" ≠ "$N") | 2 | CRWD ES |
| mcapCard — รูปตัวเลขต่าง ("N ล้าน" ≠ "฿N พันล้าน") | 2 | NETBAY NTV |
| mcapCard — รูปตัวเลขต่าง ("$NM" ≠ "$NM") | 2 | PDYN RR |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้านล้าน" ≠ "฿N แสนล้าน") | 1 | AOT |
| restate — ในวงเล็บมีคำขยาย ("N ก.ย. N ตลาดปิด") | 1 | DPZ |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N พันล้าน") | 1 | DRT |
| mcapCard — รูปตัวเลขต่าง ("N" ≠ "฿N หมื่นล้าน") | 1 | FPT |
| restate — ในวงเล็บมีคำขยาย ("N ก.ย. N เวลาไทย") | 1 | HIG |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NB") | 1 | LLY |
| mcapCard — รูปตัวเลขต่าง ("N" ≠ "฿N แสนล้าน") | 1 | TISCO |
| hint — ไม่พบ | 1 | WDAY |

## ใบที่ศักราชของ .disc ต่างจากหัวรายงาน (note `dateEra normalize`)

- APH
- BRO
- CGNX
- CLS
- EGCO
- SANM
- SMTC

## ผลตอบแทนฉาก %/ปี ที่ข้อความเปลี่ยนหลังย้าย (หมวด 6 · เปิดเผยเท่านั้น ไม่ใช่เกณฑ์ผ่าน/ตกใหม่ — ดู TOLERANCE.f34/f35)

| ชนิด | จุด (คอลัมน์) | ใบ |
|---|---|---|
| รูปเลขเปลี่ยนแต่ค่าเท่าเดิม (form) | 372 | — |
| ค่าจริงขยับ (value) | 93 | 62 |

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
- MPWR: base +14.5%/ปี → +14%/ปี
- MTSI: bear +1%/ปี → +0.6%/ปี
- NSL: bear null → +6%/ปี · base null → +21%/ปี · bull null → +33%/ปี
- ONTO: base null → +4%/ปี
- OR: base +14.5%/ปี → +14%/ปี
- OWL: bear null → +8%/ปี · base null → +22%/ปี · bull null → +34%/ปี
- PNW: base null → +11%/ปี · bull null → +14%/ปี
- RY: base −1.2%/ปี → −1.4%/ปี
- SAP: base +0.7%/ปี → +0.6%/ปี
- SCAP: bear −4.4%/ปี → −5%/ปี
- SE: base +16.5%/ปี → +16%/ปี
- SHR: bear null → +7%/ปี · base null → +22%/ปี · bull null → +35%/ปี
- SIRI: bear null → +5%/ปี · base null → +18%/ปี · bull null → +29%/ปี
- SMPC: bear +1.4%/ปี → +1.3%/ปี · base null → +12%/ปี · bull null → +21%/ปี
- SPCX: bull +18.5%/ปี → +18%/ปี
- STRL: base +1.4%/ปี → +1.3%/ปี
- SYNEX: bear +1.7%/ปี → +1.6%/ปี
- TD: bear −20.4%/ปี → −21%/ปี
- TDY: bear −3.5%/ปี → −3%/ปี
- THREL: base −0.8%/ปี → −0.7%/ปี
- TOA: bear null → +5%/ปี · base null → +20%/ปี · bull null → +31%/ปี
- TPG: bear −11.4%/ปี → −12%/ปี
- TSEM: base +2%/ปี → +1.6%/ปี
- TSN: bear −2.6%/ปี → −2%/ปี · bull +26.5%/ปี → +26%/ปี
- TU: bear -1%/ปี → −1.4%/ปี
- TXN: bear −3.5%/ปี → −3%/ปี
- VST: bear +1%/ปี → +0.7%/ปี
- WAT: base null → +9%/ปี · bull null → +21%/ปี
- WPM: base −9.3%/ปี → −10%/ปี

## cron differential v1 ↔ v2 (`--cron-diff` · grid ราคา ×0.85–×1.15 ทีละ 0.005 · 61 จุด)

เทียบผล `patchReport` ของ v1 ต้นฉบับกับ v2 ที่ราคา/วันที่เดียวกัน: stock-meta (price/mos/upside/fairValue/pe/dividendYield) ·
ตัวเลขที่มองเห็น · error/warning ของ gate — ใบที่ต่างนอกเหนือ "รูป" = residue (ไม่เขียน)

| ผล | ใบ |
|---|---|
| ตรวจ | 869 |
| ผ่าน | 865 |
| ตก (ไม่เขียน) | 4 |
| ผ่านแต่ต่างแค่รูป | 711 |

### ตกตามชนิด

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| visible | 2 | BNY WWD |
| gate-warn:W22 | 2 | PTG THCOM |
| meta:dividendYield | 1 | BNY |

### ต่างแค่รูป (เขียนได้ · เปิดเผยให้เจ้าของตัดสิน)

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | 692 | A AAOI AAON AAPL ABBNY ABBV ABNB ABT ACE ADBE ADI ADP ADVANC AEHR AEP AER AEVA AHC AIT AJG AKAM ALAB ALC ALGN ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APG APH APP APURE AR ARE ARES AS ASIAN ASW ATO ATS AUR AURA AVAV AVGO AVY AWK AWR AXON AXP AYUD AZN AZO BAC BALL BAX BAY BBIK BBL BCH BCP BDX BG BGC BGRIM BH BIDU BIIB BIZ BJC BKI BKNG BKR BLK BMO BMY BN BNS BOL BR BRK-B BSX BWXT BX BXP C CACI CAH CAMT CARR CART CASY CAT CBG CBOE CBRE CBRS CCEP CCET CCI CCJ CDNS CDW CEG CENTEL CF CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CLS CM CMCSA CME CMG CMI CMS CNC CNI CNQ COCOCO COF COHR COM7 COO COP COST CP CPALL CPAXT CPF CPN CPNG CPRT CPT CPW CRC CRDO CREDIT CRH CRL CRM CRWD CRWV CSCO CSGP CSL CSX CTSH CTVA CVX CW D DASH DB DCI DD DDOG DE DECK DELL DELTA DEO DGX DHI DHR DIS DITTO DLR DMT DOC DOHOME DOW DPZ DRI DRS DUK DUSIT DVA DY EASTW EBAY ECL ED EFX EG EGCO EGP EHC EL ELV EMA EME EMR ENB ENTG EQIX ERW ES ESLT ESNT ESS ETN ETR EVR EW EWBC EXC EXE EXEL EXPD EXPE EXPO EXR FANUY FAST FCX FDS FDX FE FER FICO FISV FIVE FLEX FN FNV FORTH FPT FR FSMART FTNT FTS FTV GD GE GEHC GEV GFPT GFS GGG GILD GIS GLOBAL GLW GMED GNRC GOOGL GPSC GRAB GRMN GS GWRE GWW HAL HANA HARN HCA HD HEI HIG HON HRL HST HSY HTC HUBB HUM HUMAN IBM ICE ICHI ICLR IDXX IESC IEX IFF IIG III ILMN IMO INCY INSM INTC INTU INVH IP IPGP IQV IR IRM ISRG IT ITC ITEL ITT ITW IVL JAZZ JBHT JBL JCI JD JNJ KAMART KCG KDP KEY KEYS KGC KIM KKP KKR KLAC KLINIQ KMB KMI KNSL KO KR KTB KTC KTOS KVUE KYCCF L LANC LDOS LECO LEN LEO LH LHFG LHX LII LIN LITE LMT LNG LOW LPH LRCX LSCC LULU LYV M MA MAA MANH MAR MBK MBLY MC MCD MCK MCO MDLN MDT MEB MEDEZE MEGA MELI MET META MFC MFEC MICRO MINT MKL MKSI MLI MO MOG-A MOH MPLX MPWR MRDIYT MRNA MRSH MRVL MS MSA MSCI MSFT MSI MTB MTC MTSI MTZ NBIS NBIX NCAP NDAQ NEE NEM NEO NET NETBAY NFG NNN NOC NOK NOVT NOW NRF NRG NSC NSL NTAP NTES NTRA NTRS NTV NUE NVDA NVMI NVO NVR NXPI NYT O ODFL OHTL OKE OKJ OMCL ON ONEE ONTO OR ORCL ORLY OSP OUST OWL OXY PAAS PANW PATH PAYX PB PBA PCAR PDYN PEG PEN PFE PFG PFGC PG PGR PH PHM PKG PLANB PLD PLUS PLXS PM PNFP PNW PONY PPG PR9 PRCT PRG PRU PSA PSP PSX PWR PYPL Q-CON QCOM RACE RAM RATCH RBC RBF RCAT RDDT REG REGN RF RGA RGLD RJF RL RMD RNR ROJNA ROK ROL ROP ROST RPH RPRX RR RSG RTX RY RYAN SAIA SAP SAV SAWAD SBAC SBUX SCAP SCCC SCGP SCHW SCI SE SECURE SERV SFM SFT SGC SHOP SHR SHW SICT SIRI SITM SJM SKR SKY SLB SLF SMCI SMPC SMTC SN SNA SNOW SNP SNPS SNX SO SONIC SORKON SPA SPALI SPC SPCG SPCX SPGI SPI SPOT SPVI SRE SSNC SSP STEC STM STRL STT STZ SU SUN SUNB SYM SYNEX TACC TAP TASCO TCAP TD TDG TDY TEL TFC TFG TFM TFX TGH TGT THAI THREL TIDLOR TISCO TJX TKS TLN TMO TMUS TNH TNP TOA TOG TOP TOST TPG TPIPP TPL TPR TQM TRGP TRMB TROW TRP TRU TRUE TSCO TSEM TSLA TSM TSN TTB TTD TTE TTW TTWO TU TVO TW TXN TXRH TYL UBER UBS UFPI UI UL ULS ULTA UPS URI USB USFD UTHR V VECO VEEV VG VIAV VIBHA VLO VMRK VRANDA VRSK VRSN VST VTR WAT WCC WCN WDAY WHA WHAUP WICE WM WMB WMT WORK WPC WPH WPM WRB WSM WST WTRG WTW WY XO XOM XPO XYL YUM ZBH ZBRA ZEN ZS |
| รูปตัวเลขอื่น (เช่น ราคา 278→277.58 · หน่วย ล้านล้าน→แสนล้าน · ศักราช) | 147 | AAOI AAPL ACMR ADBE ADI ADSK ADVANC AEONTS ALAB ALGN AMAT AMD AMZN ANET APH APP ARE ARM ASML AVGO AYUD BBL BKI BRO CAMT CAT CCJ CDNS CEG CGNX CHE CIEN CLH CLS CLX CMCSA CME CMG COHR COO CPF CPT CRDO CRM CRWD CSX DDOG DELL DELTA DRS DVA DY EGCO ELV ENTG ETN EVR FDS FLEX FN FRT FTNT GD GEV GOOGL HRL IBM ICE INTU IPGP ISRG JBL JCI KBANK KEYS KKR KLAC KYCCF LII LITE LOW LRCX LSCC MAR MBK MELI META MKSI MLM MMM MPWR MRNA MRVL MSFT MTSI NDSN NEE NET NOW NRG NTES NVDA NVMI NVR NXPI OHTL ON ONTO ORCL PANW PLD PLXS PNW PODD PRCT PWR QCOM RYAN SAIA SANM SAP SCB SCCC SITM SNOW SNPS SPC SPG SPOT TEL TFMAMA TGH TNH TSEM TSLA TSM TXN TYL UDR USB VECO VMRK VST WDAY WDC WMB ZS |
| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | 491 | A AAOI AAPL ABBNY ABBV ABNB ABT ADBE ADI ADVANC AEP AEVA AHC AIT AJG ALAB ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APURE AR ARE ARES ASW ATO AVY AWK AWR AXP AYUD AZO BAC BALL BAY BBIK BBL BCH BCP BDX BG BGRIM BH BIDU BIIB BIZ BKI BKNG BKR BLK BMY BN BNS BNY BR BRK-B BX BXP CACI CARR CART CASY CBG CBOE CBRS CCET CCI CDNS CEG CENTEL CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CM CMCSA CME CMG CMI CMS CNC CNI COF COHR COM7 COO COP COST CPALL CPAXT CPN CPRT CPT CRC CREDIT CRH CRL CSGP CSX CTSH CTVA CVX CW D DB DCI DD DECK DELL DGX DHI DITTO DMT DOC DPZ DRI DRS DVA ECL ED EG EGCO EGP EHC EMA EME EMR ENB ENTG EQIX ERW ES ESLT ESNT ESS ETN ETR EW EXC EXE EXEL EXPD EXPO EXR FANUY FAST FCX FE FER FICO FIVE FMC FN FNV FPT FR FTNT FTS FTV GD GE GFPT GFS GILD GLOBAL GLW GMED GPSC GRMN GS GWW HAL HANA HARN HCA HD HEI HON HRL HST HTC HUBB IBM ICE ICHI ICLR IDXX IEX III IMO INCY INSM INTU INVH IP IPGP IR IRM ISRG IT ITC ITT ITW IVL JAZZ JBHT JBL JCI JD JNJ KDP KEY KEYS KIM KKP KKR KLAC KLINIQ KMB KNSL KO KR KTB KTC KTOS KVUE KYCCF LANC LDOS LEN LH LHFG LHX LIN LITE LMT LOW M MA MAA MANH MAR MBK MC MCD MCK MCO MDT MEB MEDEZE MEGA MELI MET META MFC MFEC MICRO MINT MKC MKL MKSI MLI MO MPLX MPWR MRDIYT MRSH MS MSA MSCI MSI MTB MTC MTSI NBIS NDAQ NEE NEM NET NNN NOC NOVT NOW NRG NSC NSL NTAP NTES NTRA NVDA NVMI NVO NXPI NYT ODFL OKE OKJ OMCL ONEE ONTO OR ORLY OSP OUST OWL OXY PANW PB PBA PCAR PDYN PEG PEN PFG PFGC PG PH PHM PKG PLD PLXS PNFP PNW PONY PPG PR9 PRG PRU PSA PSX PYPL QCOM RAM RATCH RBC RBF RCAT REG RGA RGLD RJF RL RMD ROJNA ROK ROL ROP ROST RPH RR RSG RTX RY RYAN SAP SAWAD SBAC SBUX SCAP SCGP SCHW SECURE SERV SFM SHR SIRI SJM SLB SLF SMCI SMPC SMTC SNA SNOW SNPS SO SONIC SPALI SPC SPCG SPGI SRE STEC STRL STT STZ SU SUNB SYNEX TACC TASCO TCAP TD TDG TDY TFC TFG TFM TFX TGT THREL TIDLOR TISCO TJX TMO TMUS TNP TOA TOG TOP TOST TPIPP TPL TPR TRGP TRMB TROW TRP TRU TRUE TSEM TSLA TSM TSN TTB TTW TU TVO TW TXN TXRH TYL UBER UI ULTA UPS URI V VECO VEEV VG VIAV VIBHA VICI VLO VMRK VRSK VRSN VST VTR WAT WCC WCN WDAY WHA WHAUP WM WMB WPC WPH WPM WRB WSM WST WTRG WY XO XOM YUM ZBH ZBRA ZS |

### ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ)

เกณฑ์: ห่างไม่เกิน GAP_REL 1.2% (ชั้น 1 ของ migrator) · cron ไม่แตะทั้งสองฝั่ง · มากสุดที่พบ 0.99%

| ชนิด | ใบ | มากสุด | รายชื่อ |
|---|---|---|---|
| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | 34 | 0.99% | AEE ANI BF-B BWXT CBOE CHAYO CMS DD DUK EPG EQIX EXE FDS GLOBAL HSY IIG IVL JAZZ LDOS LPH MFC MMS PRINC RYAN SBAC SECURE SKR SNX SPCX SYM TGH TRMB TRU WICE |

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
- MMS: «105 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV ราคาปัจจุบัน» 115.95 → 116.00 (0.04%)
- PRINC: « value จุดซื้อ MOS 30% ฿ ▯ โซนถูกมาก (deep value) โ» 1.44 → 1.43 (0.7%)
- RYAN: «เหมาะสม $44.27 $ ▯ MOS 30% $35.42 MOS 20% $» 31.00 → 30.99 (0.03%)
- SBAC: «าคา SBAC มูลค่าเหมาะสม $ ▯ จุดสำคัญ ราคา SBAC ปรั» 208 → 207.00 (0.48%)
- SECURE: «เหมาะสม ฿18.50 ฿ ▯ MOS 30% ฿14.80 MOS 20% ฿» 13.00 → 12.95 (0.39%)
- SKR: «เหมาะสม ฿9.25 ฿ ▯ MOS 30% ฿7.40 MOS 20% ฿9» 6.47 → 6.48 (0.15%)
- SNX: «เหมาะสม $233.55 $ ▯ MOS 30% $186.84 MOS 20% » 163.49 → 163.48 (0.01%)
- SPCX: «เหมาะสม $96.30 $ ▯ MOS 30% $77.00 MOS 20% $» 67.40 → 67.41 (0.01%) · «$67.40 MOS 30% $ ▯ MOS 20% $96.30 Fair Valu» 77.00 → 77.04 (0.05%)
- SYM: «เหมาะสม $28.25 $ ▯ MOS 30% $22.60 MOS 20% $» 19.78 → 19.77 (0.05%)
- TGH: «เหมาะสม ฿13.35 ฿ ▯ MOS 30% ฿10.68 MOS 20% ฿» 9.35 → 9.34 (0.11%)
- TRMB: «เหมาะสม $78.22 $ ▯ MOS 30% $62.58 MOS 20% $» 54.76 → 54.75 (0.02%)
- TRU: «.71 เป้าเฉลี่ย Analyst $ ▯ กรอบบน FV TRU ซื้อขายท» 100.59 → 101.00 (0.41%)
- WICE: «เหมาะสม ฿2.65 ฿ ▯ MOS 30% ฿2.12 MOS 20% ฿2» 1.86 → 1.85 (0.54%)

### ใบที่ผ่านโดยใช้ข้อยกเว้นของตัวเทียบ (ไม่เปลี่ยนผลตัดสิน — เปิดเผยให้ตรวจ)

| ข้อยกเว้น | ใบ | รายชื่อ |
|---|---|---|
| ผลต่างที่มีก่อน patch — รูปหรือค่า (≤ GAP_REL · ค่าต่างรายใบอยู่ในหมวดด้านบน) | 208 | AAOI AAPL ACMR ADBE ADI ADSK AEE AEONTS AFL ALAB ALL AMAT AMD AMZN ANET ANI APH APP ARM ASML AVGO AVY AXP BBL BDX BF-B BIIB BJC BKI BLK BMI BWXT CAMT CASY CAT CBOE CCJ CDNS CEG CHAYO CHE CIEN CLH CLS CMS COF COHR COST CRDO CRM CRWD CSCO CVS DD DDOG DE DELL DGX DUK DVA ECL EL EME ENTG EOG EPG EQIX ERIE ESS ETN EVR EXE FCX FDS FDX FLEX FN FTNT GEV GLOBAL GNRC GOOGL GULF HD HSY IBM IIG INTC INTU IPGP IQV ISRG IVL JAZZ JBL KBANK KEYS KLAC KMB KTB KYCCF LDOS LHX LII LITE LMT LOW LPH LRCX LSCC LULU MCK MCO MELI META MFC MKSI MLM MMM MMS MOH MPWR MRVL MSCI MSFT MTSI NDSN NEE NET NOW NRG NSC NTES NTRS NVDA NVMI NVR NXPI ON ONTO ORCL PANW PEP PFG PKG PLTR PLXS POOL PRINC PRU PSX PWR QCOM RACE RDDT REGN RJF RNR RSG RYAN SAIA SANM SAP SBAC SCB SCCC SE SECURE SITM SKR SMTC SNA SNOW SNPS SNX SPC SPCX SPG STT SYM TDG TEL TFC TFMAMA TGH TGT TPR TRMB TRU TRV TSEM TSLA TSM TXN TYL UBER UTHR VECO VEEV VLO VMRK VST WAB WDAY WDC WICE ZBRA ZS |
| %/ปี ต่างตามรูปของ "รวม" (ทั้งสองฝั่ง = f(รวมที่โชว์)) | 153 | AAOI ABT ADBE AEHR ALC ALNY AMATA AMRZ AMZN ASW AUR AVAV AVGO AZN BALL BAY BBIK BBL BJC BKI BMO BNS BWXT CBRS CCEP CDNS CEG CKP CM CNQ COCOCO COHR CPF CPN CRDO CREDIT CRM CRWV CSL DELL DITTO DMT DOHOME EMA ENB ERW ES ETN FER FICO FN FNV FORTH FSMART FTS GFPT GLW GOOGL GRMN HON HUMAN IBM ICHI ICLR IIG III IMO INSM INTC IP KKP KLAC KLINIQ KTB KTOS LEO LITE M MCK MELI META MFEC MPWR MRNA NEE NEO NET NETBAY NOW NSL NTES NVDA NXPI OKJ ONEE OR OUST OWL PAAS PANW PB PBA PNFP PNW PR9 PWR PYPL QCOM RAM RCAT RGLD RL RPRX RY SAP SCAP SCCC SE SHR SICT SIRI SITM SKY SLF SMCI SMPC SNOW SPCX STRL SYNEX TCAP TD TDY TGH THREL TOA TPG TRP TSEM TSLA TSM TSN TTB TTE TXN UBER UBS VECO WAT WDAY WHAUP WPM ZEN |
| วงเล็บทวนวันที่ล้วน (migrator ลบ · f11) | 3 | AZN CSGP PFE |
| หน่วยใหญ่ของเงินต่างกัน ค่าเดียวกัน | 2 | ADVANC PRCT |
| ปีคนละศักราช (2569 ↔ 2026) | 7 | APH BRO CGNX CLS EGCO SANM SMTC |

### รายละเอียดใบที่ตก (ตัวคูณแรกที่ต่าง · ฝั่งที่ไม่นิ่ง)

v1-unstable = ผลของ v1 เปลี่ยนชนิด/ฐานระหว่างจุด grid ติดกันขณะ v2 นิ่ง — ไม่ใช่คำตัดสินว่าฝั่งไหนถูก

- BNY — `cron-diff v1-unstable meta:dividendYield,visible` · side v1 (×1.09→×1.095: meta:dividendYield=v1 visible=v1) · ×1.095 ราคา 178.11: stock-meta.dividendYield v1 1.4 ≠ v2 1.2 || ×1.095 ราคา 178.11: ตัวเลข (page) «…t asset custodian เงินปันผล ~ 1.4» v1 1.4 ≠ v2 1.2
- PTG — `cron-diff v1-unstable gate-warn:W22` · side v1 (×0.855→×0.86: gate-warn:W22=v1) · ×0.86 ราคา 7.05: warning v1 [W22] ≠ v2 [] — v1 W22 ป้าย gauge mCur "ปัจจุบัน $px" ↔ .px ราคา header: 7.1 ≠ 7.05
- THCOM — `cron-diff v1-unstable gate-warn:W22` · side v1 (×0.97→×0.975: gate-warn:W22=v1) · ×0.975 ราคา 9.85: warning v1 [W22] ≠ v2 [] — v1 W22 ป้าย gauge mCur "ปัจจุบัน $px" ↔ .px ราคา header: 9.9 ≠ 9.85
- WWD — `cron-diff v1-unstable visible` · side v1 (×1.135→×1.14: visible=v1) · ×1.14 ราคา 384.48: ช่อง .ret คอลัมน์ 1: v1 -30.1% ≠ v2 -29%

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
- MLI: +2%→+1.5% (×1.065)
- MO: +22.2%→+22% (×0.85)
- MOG-A: -10.2%→-10% (×0.85)
- MOH: -63.7%→-64% (×0.85)
- MPLX: +12.3%→+12% (×0.85)
- MPWR: +3.8%→+4% (×0.85)
- MRDIYT: +2%→+1.6% (×0.96)
- MRNA: -65.7%→-66% (×0.85)
- MRSH: +2%→+1.6% (×0.99)
- MRVL: -6.8%→-7% (×0.85)
- MS: +28.4%→+28% (×0.85)
- MSA: +2%→+1.7% (×1.015)
- MSCI: +8.4%→+8% (×0.85)
- MSFT: -1%→-0.8% (×0.85)
- MSI: +2%→+1.8% (×0.975)
- MTB: +30.5%→+30% (×0.85)
- MTC: +40.8%→+41% (×0.85)
- MTSI: +2%→+1.6% (×0.97)
- MTZ: -41.5%→-41% (×0.85)
- NBIS: +135.9%→+136% (×0.85)
- NBIX: -14.9%→-15% (×0.85)
- NCAP: +56.2%→+56% (×0.85)
- NDAQ: +12.2%→+12% (×0.85)
- NEE: +3.2%→+3% (×0.85)
- NEM: -34.7%→-35% (×0.85)
- NEO: -37.7%→-38% (×0.85)
- NET: +2.3%→+2% (×0.85)
- NETBAY: -16.4%→-16% (×0.85)
- NFG: +62.9%→+63% (×0.85)
- NNN: +34.8%→+35% (×0.85)
- NOC: +2.5%→+2% (×0.85)
- NOK: +2%→+1.6% (×1.145)
- NOVT: -42.5%→-43% (×0.85)
- NOW: +1%→+1.2% (×0.85)
- NRF: -3.8%→-4% (×0.85)
- NRG: +2%→+1.6% (×1.005)
- NSC: +2%→+1.7% (×1.065)
- NSL: +41.6%→+42% (×0.85)
- NTAP: -42.3%→-42% (×0.85)
- NTES: +2.9%→+3% (×0.85)
- NTRA: -56.7%→-57% (×0.85)
- NTRS: -14.9%→-15% (×0.85)
- NTV: -3.9%→-4% (×0.85)
- NUE: -39.5%→-40% (×0.85)
- NVDA: +5.4%→+5% (×0.85)
- NVMI: +2%→+1.6% (×1.09)
- NVO: +1%→+0.8% (×0.85)
- NVR: -6.4%→-6% (×0.85)
- NXPI: +18.9%→+19% (×0.85)
- NYT: +19.6%→+20% (×0.85)
- O: +44.9%→+45% (×0.85)
- ODFL: +2%→+1.8% (×0.94)
- OHTL: +56.8%→+57% (×0.85)
- OKE: +20.5%→+21% (×0.85)
- OKJ: -24.1%→-24% (×0.85)
- OMCL: +18.2%→+18% (×0.85)
- ON: +24.5%→+25% (×0.85)
- ONEE: +8.2%→+8% (×0.85)
- ONTO: 2%→+1.6% (×1.08)
- OR: +20.7%→+21% (×0.85)
- ORCL: +2%→+1.6% (×1.095)
- ORLY: +2%→+1.7% (×0.895)
- OSP: +2%→+1.7% (×0.965)
- OUST: -59.6%→-60% (×0.85)
- OWL: +46.4%→+46% (×0.85)
- OXY: +2%→+1.6% (×1.025)
- PAAS: -25.1%→-25% (×0.85)
- PANW: +2.9%→+3% (×0.85)
- PATH: -31.2%→-31% (×0.85)
- PAYX: +49.9%→+50% (×0.85)
- PB: +10.5%→+11% (×0.85)
- PBA: -16.4%→-16% (×0.85)
- PCAR: -24.1%→-24% (×0.85)
- PDYN: -85.3%→-85% (×0.85)
- PEG: +80.1%→+80% (×0.85)
- PEN: -47.8%→-48% (×0.85)
- PFE: -5.8%→-6% (×0.85)
- PFG: -17.1%→-17% (×0.85)
- PFGC: +12.2%→+12% (×0.85)
- PG: +22.2%→+22% (×0.85)
- PGR: -3.8%→-4% (×0.85)
- PH: +2%→+1.5% (×0.91)
- PHM: -23.6%→-24% (×0.85)
- PKG: +2%→+1.7% (×1.065)
- PLANB: +84.4%→+84% (×0.85)
- PLD: +2%→+1.7% (×0.995)
- PLUS: -49.5%→-50% (×0.85)
- PLXS: +2%→+1.6% (×1.065)
- PM: -5.9%→-6% (×0.85)
- PNFP: +17.8%→+18% (×0.85)
- PNW: +14.7%→+15% (×0.85)
- PONY: -53.7%→-54% (×0.85)
- PPG: +14.5%→+15% (×0.85)
- PR9: +13.7%→+14% (×0.85)
- PRCT: -9.5%→-9% (×0.85)
- PRG: -32.4%→-32% (×0.85)
- PRU: +2%→+1.8% (×1.03)
- PSA: +2%→+1.7% (×1.015)
- PSP: -49.7%→-50% (×0.85)
- PSX: -57.4%→-57% (×0.85)
- PWR: -4.9%→-5% (×0.85)
- PYPL: +62.2%→+62% (×0.85)
- Q-CON: +43.5%→+44% (×0.85)
- QCOM: -2%→-1.7% (×0.85)
- RACE: +38.6%→+39% (×0.85)
- RAM: +15.3%→+15% (×0.85)
- RATCH: +2%→+1.7% (×1.03)
- RBC: -21.1%→-21% (×0.85)
- RBF: -13.8%→-14% (×0.85)
- RCAT: -72.7%→-73% (×0.85)
- RDDT: -18.7%→-19% (×0.85)
- REG: +21.5%→+21% (×0.85)
- REGN: -13.1%→-13% (×0.85)
- RF: +43.1%→+43% (×0.85)
- RGA: +2%→+1.7% (×0.925)
- RGLD: +2.6%→+3% (×0.85)
- RJF: +2%→+1.5% (×0.86)
- RL: +6.8%→+7% (×0.85)
- RMD: +2%→+1.5% (×1.09)
- RNR: -10.9%→-11% (×0.85)
- ROJNA: +96.1%→+96% (×0.85)
- ROK: +1%→+1.5% (×0.915)
- ROL: +56.8%→+57% (×0.85)
- ROP: +2%→+1.8% (×0.875)
- ROST: +2%→+1.9% (×0.97)
- RPH: +10.2%→+10% (×0.85)
- RPRX: -8.6%→-9% (×0.85)
- RR: -31.4%→-31% (×0.85)
- RSG: +2%→+1.5% (×1.005)
- RTX: -10.7%→-11% (×0.85)
- RY: -30.9%→-31% (×0.85)
- RYAN: +9.8%→+10% (×0.85)
- SAIA: -13.5%→-14% (×0.85)
- SAP: -5.6%→-6% (×0.85)
- SAV: -5.3%→-5% (×0.85)
- SAWAD: +5.1%→+5% (×0.85)
- SBAC: +2%→+1.9% (×0.88)
- SBUX: -48.2%→-48% (×0.85)
- SCAP: +3.1%→+3% (×0.85)
- SCCC: -4.4%→-4% (×0.85)
- SCGP: +1%→+1.4% (×0.88)
- SCHW: +5.4%→+5% (×0.85)
- SCI: +44.1%→+44% (×0.85)
- SE: -0%→-0.3% (×0.85)
- SECURE: +33.2%→+33% (×0.85)
- SERV: -82.7%→-83% (×0.85)
- SFM: +46.2%→+46% (×0.85)
- SFT: -11.6%→-12% (×0.85)
- SGC: -67.2%→-67% (×0.85)
- SHOP: -5.1%→-5% (×0.85)
- SHR: +43.6%→+44% (×0.85)
- SHW: -3.7%→-4% (×0.85)
- SICT: -7.2%→-7% (×0.85)
- SIRI: +35.8%→+36% (×0.85)
- SITM: -28.2%→-28% (×0.85)
- SJM: +10.6%→+11% (×0.85)
- SKR: -5.5%→-6% (×0.85)
- SKY: +52.6%→+53% (×0.85)
- SLB: -42.2%→-42% (×0.85)
- SLF: -8.4%→-8% (×0.85)
- SMCI: +2.3%→+2% (×0.85)
- SMPC: +22.8%→+23% (×0.85)
- SMTC: +1%→+1.3% (×0.85)
- SN: -21.7%→-22% (×0.85)
- SNA: +32.6%→+33% (×0.85)
- SNOW: +0%→+0.5% (×0.85)
- SNP: -14.5%→-15% (×0.85)
- SNPS: +21.6%→+22% (×0.85)
- SNX: -8.2%→-8% (×0.85)
- SO: +2%→+1.8% (×1.01)
- SONIC: +1%→+0.8% (×0.85)
- SORKON: -17.8%→-18% (×0.85)
- SPA: -26.9%→-27% (×0.85)
- SPALI: +1%→+1.3% (×0.85)
- SPC: +58.7%→+59% (×0.85)
- SPCG: +60.2%→+60% (×0.85)
- SPCX: -56.2%→-56% (×0.85)
- SPGI: +33.9%→+34% (×0.85)
- SPI: -35.7%→-36% (×0.85)
- SPOT: -2.5%→-3% (×0.85)
- SPVI: +106.6%→+107% (×0.85)
- SRE: +2%→+1.9% (×1)
- SSNC: -3.7%→-4% (×0.85)
- SSP: -19.3%→-19% (×0.85)
- STEC: +1%→+1.4% (×0.885)
- STM: +16.5%→+16% (×0.85)
- STRL: -48.2%→-48% (×0.85)
- STT: -37.2%→-37% (×0.85)
- STZ: +50.5%→+51% (×0.85)
- SU: -38.3%→-38% (×0.85)
- SUN: -19.6%→-20% (×0.85)
- SUNB: -31.9%→-32% (×0.85)
- SYM: -2.3%→-2% (×0.85)
- SYNEX: +23.6%→+24% (×0.85)
- TACC: +14.7%→+15% (×0.85)
- TAP: -13.8%→-14% (×0.85)
- TASCO: +2%→+1.5% (×1.065)
- TCAP: +4.2%→+4% (×0.85)
- TD: -40.7%→-41% (×0.85)
- TDG: +45.7%→+46% (×0.85)
- TDY: +5.6%→+6% (×0.85)
- TEL: -1%→-1.4% (×0.85)
- TFC: +2%→+1.5% (×1.025)
- TFG: -65.4%→-65% (×0.85)
- TFM: -29.3%→-29% (×0.85)
- TFX: +52.3%→+52% (×0.85)
- TGH: -3.2%→-3% (×0.85)
- TGT: -36.6%→-37% (×0.85)
- THAI: +98.8%→+99% (×0.85)
- THREL: -39.6%→-40% (×0.85)
- TIDLOR: +30.7%→+31% (×0.85)
- TISCO: +2%→+1.5% (×0.865)
- TJX: +2%→+1.8% (×1.05)
- TKS: -13.3%→-13% (×0.85)
- TLN: -29.1%→-29% (×0.85)
- TMO: +2.1%→+2% (×0.85)
- TMUS: +11.1%→+11% (×0.85)
- TNH: -16.3%→-16% (×0.85)
- TNP: +1%→+1.4% (×0.985)
- TOA: 10.8%→+11% (×0.85)
- TOG: +1%→+1.2% (×0.85)
- TOP: +2%→+1.7% (×1.005)
- TOST: -39.9%→-40% (×0.85)
- TPG: -18.3%→-18% (×0.85)
- TPIPP: +2%→+1.6% (×1.09)
- TPL: +2%→+1.6% (×0.905)
- TPR: +29.8%→+30% (×0.85)
- TQM: -6.5%→-6% (×0.85)
- TRGP: -16.8%→-17% (×0.85)
- TRMB: +34.2%→+34% (×0.85)
- TROW: +101.8%→+102% (×0.85)
- TRP: +2.1%→+2% (×0.85)
- TRU: +3.1%→+3% (×0.85)
- TRUE: +1%→+1.5% (×0.88)
- TSCO: -4.9%→-5% (×0.85)
- TSEM: -47.7%→-48% (×0.85)
- TSLA: +8.3%→+8% (×0.85)
- TSM: +3.2%→+3% (×0.85)
- TSN: +8.9%→+9% (×0.85)
- TTB: +2.3%→+2% (×0.85)
- TTD: -26.9%→-27% (×0.85)
- TTE: -16.4%→-16% (×0.85)
- TTW: +11.8%→+12% (×0.85)
- TTWO: -21.6%→-22% (×0.85)
- TU: +2%→+1.6% (×0.91)
- TVO: -17.8%→-18% (×0.85)
- TW: +14.2%→+14% (×0.85)
- TXN: +15.7%→+16% (×0.85)
- TXRH: +59.1%→+59% (×0.85)
- TYL: +1%→+1.5% (×0.89)
- UBER: +2%→+1.6% (×0.865)
- UBS: -18.1%→-18% (×0.85)
- UFPI: -12.9%→-13% (×0.85)
- UI: -15.4%→-15% (×0.85)
- UL: +52.4%→+52% (×0.85)
- ULS: -21.8%→-22% (×0.85)
- ULTA: +6.2%→+6% (×0.85)
- UPS: +2%→+1.7% (×1.115)
- URI: -35.8%→-36% (×0.85)
- USB: +51.3%→+51% (×0.85)
- USFD: -19.8%→-20% (×0.85)
- UTHR: -20.2%→-20% (×0.85)
- V: +21.6%→+22% (×0.85)
- VECO: +9.4%→+9% (×0.85)
- VEEV: +2.7%→+3% (×0.85)
- VG: +34.4%→+34% (×0.85)
- VIAV: +0%→+0.2% (×0.85)
- VIBHA: +28.7%→+29% (×0.85)
- VLO: -65.8%→-66% (×0.85)
- VMRK: +2%→+1.6% (×0.915)
- VRANDA: +45.7%→+46% (×0.85)
- VRSK: +40.2%→+40% (×0.85)
- VRSN: -11.1%→-11% (×0.85)
- VST: +23.6%→+24% (×0.85)
- VTR: +24.9%→+25% (×0.85)
- WAT: +6.5%→+6% (×0.85)
- WCC: +58.9%→+59% (×0.85)
- WCN: +8.7%→+9% (×0.85)
- WDAY: -13.4%→-13% (×0.85)
- WHA: +17.7%→+18% (×0.85)
- WHAUP: +2.8%→+3% (×0.85)
- WICE: -29.5%→-30% (×0.85)
- WM: +2%→+1.9% (×0.87)
- WMB: +34.5%→+35% (×0.85)
- WMT: +49.3%→+49% (×0.85)
- WORK: -50.3%→-50% (×0.85)
- WPC: +26.5%→+27% (×0.85)
- WPH: +48.4%→+48% (×0.85)
- WPM: -44.1%→-44% (×0.85)
- WRB: +6.2%→+6% (×0.85)
- WSM: -23.4%→-23% (×0.85)
- WST: -28.2%→-28% (×0.85)
- WTRG: +29.1%→+29% (×0.85)
- WTW: +41.7%→+42% (×0.85)
- WY: +15.8%→+16% (×0.85)
- XO: +2%→+1.5% (×0.945)
- XOM: +2%→+1.7% (×0.9)
- XPO: -21.9%→-22% (×0.85)
- XYL: -11.6%→-12% (×0.85)
- YUM: +2%→+1.9% (×0.95)
- ZBH: +10.7%→+11% (×0.85)
- ZBRA: -27.8%→-28% (×0.85)
- ZEN: -18.1%→-18% (×0.85)
- ZS: +2%→+1.6% (×1.085)

</details>

---

## สรุปสุดท้าย — Task 14 (ระยะ 2 ส่วน E · ย้ายคลังครบ 10 แบตช์)

> สร้างจาก `migration-v2-census.json` หลังแบตช์สุดท้าย ด้วย `node summary.js <census.json> >> <census.md>` (สคริปต์อยู่ใน task-14-report.md) —
> คิดจาก JSON อย่างเดียว · migrator ที่รัน `--census` ซ้ำจะเขียน .md ใหม่ทั้งไฟล์ (บล็อกนี้หาย ต้องต่อท้ายใหม่)

| ผล | ใบ |
|---|---|
| ย้ายเป็น v2 | **865/908** |
| residue (คง v1) | **43** = migrator 39 + cron-diff 4 |
| แบตช์ที่บันทึก | 0:100 · 1:100 · 2:100 · 3:100 · 4:100 · 5:100 · 6:100 · 7:100 · 8:100 · 9:8 |

### residue ต่อชนิด (รายชื่อครบ — input ระยะ 3)

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| legend แสดง N แต่ FV = N | 16 | COHU CTAS DTM DXCM FORM GNTX HMPRO LPLA RELX SHANG SWK TER TT VLTO VRTX WFC |
| จำนวนช่อง %/ปี ไม่เท่าเดิม | 5 | ACN JMT RS SCGD SNNP |
| ค่าไม่ตรงชั้น N | 4 | AMKR LWLG MTI TMAN |
| site legend match ≠ N | 3 | FANG MPC MU |
| site vcellTgt match ≠ N | 3 | BABA STX VRT |
| FV ไม่ตรงกันเอง | 2 | PNC TEAM |
| site vcellFv match ≠ N | 2 | AEM BTG |
| กรอบ FV สองที่ไม่ตรงกัน | 2 | ALLE POET |
| mFair แสดง N แต่ FV = N | 1 | SAPPE |
| site summary match ≠ N | 1 | MXL |
| cron-diff v1-unstable gate-warn:W22 | 2 | PTG THCOM |
| cron-diff v1-unstable meta:dividendYield,visible | 1 | BNY |
| cron-diff v1-unstable visible | 1 | WWD |

<details><summary>เหตุผล residue เต็มรายใบ (43)</summary>

| ใบ | เหตุผล |
|---|---|
| ACN | จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 4 → v2 3) |
| AEM | site vcellFv match ≠ 1 (0) |
| ALLE | กรอบ FV สองที่ไม่ตรงกัน (vcell 158,168 vs fv-box 150,170) |
| AMKR | ค่าไม่ตรงชั้น 1: f50 52→51.73 |
| BABA | site vcellTgt match ≠ 1 (2) |
| BNY | cron-diff v1-unstable meta:dividendYield,visible |
| BTG | site vcellFv match ≠ 1 (0) |
| COHU | legend แสดง 53 แต่ FV = 56 (ต่างเกิน 0.5%) |
| CTAS | legend แสดง 188 แต่ FV = 190 (ต่างเกิน 0.5%) |
| DTM | legend แสดง 120.65 แต่ FV = 97.11 (ต่างเกิน 0.5%) |
| DXCM | legend แสดง 74 แต่ FV = 80 (ต่างเกิน 0.5%) |
| FANG | site legend match ≠ 1 (0) |
| FORM | legend แสดง 142 แต่ FV = 138 (ต่างเกิน 0.5%) |
| GNTX | legend แสดง 32 แต่ FV = 33.67 (ต่างเกิน 0.5%) |
| HMPRO | legend แสดง 6.9 แต่ FV = 7.54 (ต่างเกิน 0.5%) |
| JMT | จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 4 → v2 7) |
| LPLA | legend แสดง 334.08 แต่ FV = 288.31 (ต่างเกิน 0.5%) |
| LWLG | ค่าไม่ตรงชั้น 1: f50 5.2→5.23 |
| MPC | site legend match ≠ 1 (0) |
| MTI | ค่าไม่ตรงชั้น 1: f36 19→18.9 ; f50 19→18.9 |
| MU | site legend match ≠ 1 (0) |
| MXL | site summary match ≠ 1 (0) |
| PNC | FV ไม่ตรงกันเอง: chart.fairLine = 220 แต่ report-data.fv = 201 |
| POET | กรอบ FV สองที่ไม่ตรงกัน (vcell 3,20 vs fv-box 8.1,18.4) |
| PTG | cron-diff v1-unstable gate-warn:W22 |
| RELX | legend แสดง 38 แต่ FV = 44 (ต่างเกิน 0.5%) |
| RS | จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 0 → v2 3) |
| SAPPE | mFair แสดง 35 แต่ FV = 34.2 (ต่างเกิน 0.5%) |
| SCGD | จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 3 → v2 6) |
| SHANG | legend แสดง 44.35 แต่ FV = 39.6 (ต่างเกิน 0.5%) |
| SNNP | จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 3 → v2 6) |
| STX | site vcellTgt match ≠ 1 (2) |
| SWK | legend แสดง 95 แต่ FV = 100 (ต่างเกิน 0.5%) |
| TEAM | FV ไม่ตรงกันเอง: chart.fairLine = 115 แต่ report-data.fv = 133 |
| TER | legend แสดง 340 แต่ FV = 365 (ต่างเกิน 0.5%) |
| THCOM | cron-diff v1-unstable gate-warn:W22 |
| TMAN | ค่าไม่ตรงชั้น 1: f36 10→10.3 ; f50 10→10.3 |
| TT | legend แสดง 447 แต่ FV = 443 (ต่างเกิน 0.5%) |
| VLTO | legend แสดง 96.5 แต่ FV = 97.66 (ต่างเกิน 0.5%) |
| VRT | site vcellTgt match ≠ 1 (2) |
| VRTX | legend แสดง 520 แต่ FV = 480 (ต่างเกิน 0.5%) |
| WFC | legend แสดง 87 แต่ FV = 89 (ต่างเกิน 0.5%) |
| WWD | cron-diff v1-unstable visible |

</details>

### site ที่คง literal ต่อชนิด (เฉพาะ 865 ใบที่ย้าย · รวมทุกเหตุผลย่อย — เหตุผลย่อยดูตาราง "site ที่คง literal" ด้านบน ซึ่งนับรวมใบ residue ด้วย)

| site | ใบ |
|---|---|
| psCard | 860 |
| yieldCard | 757 |
| peCard | 559 |
| pbvCard | 510 |
| mcapCard | 485 |
| scnNote | 218 |
| scn | 138 |
| tgtCard | 100 |
| zone | 87 |
| disc | 9 |
| hintEps | 6 |
| fvBoxRange | 5 |
| scn2div | 3 |
| scn3div | 3 |
| restate | 2 |
| scn1div | 2 |
| hint | 1 |

### การเปิดเผย (ใบที่ย้าย)

| หมวด | ใบ | หมายเหตุ |
|---|---|---|
| cron differential: ตรวจ / ผ่าน / ตก | 869 / 865 / 4 | ตก = BNY PTG THCOM WWD (ไม่เขียน · รายละเอียดในหัวข้อ cron differential) |
| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | 34 | มากสุด 0.99% · AEE ANI BF-B BWXT CBOE CHAYO CMS DD DUK EPG EQIX EXE FDS GLOBAL HSY IIG IVL JAZZ LDOS LPH MFC MMS PRINC RYAN SBAC SECURE SKR SNX SPCX SYM TGH TRMB TRU WICE (ป้ายและค่า v1 → v2 รายใบอยู่ด้านบน) |
| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | 692 | รอเจ้าของตัดสินว่าเป็นรูปหรือค่า (นโยบายปัด fmtMos เดียว) · รายชื่อด้านล่าง |
| %/ปี หมวด 6 ค่าขยับ (v2 คิด %/ปี จาก "รวม" ที่ปัดแล้ว) | 62 | 93 คอลัมน์ · รูปอย่างเดียว 372 คอลัมน์ · รายใบอยู่ในหัวข้อ %/ปี ด้านบน · ไปพร้อมคำถาม fmtMos |
| รูปตัวเลขอื่น (ราคา/หน่วยเงิน/ศักราช) | 147 | |
| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | 491 | |

<details><summary>รูปทศนิยมหมวด 6 เปลี่ยน — 692 ใบ</summary>

A AAOI AAON AAPL ABBNY ABBV ABNB ABT ACE ADBE ADI ADP ADVANC AEHR AEP AER AEVA AHC AIT AJG AKAM ALAB ALC ALGN ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APG APH APP APURE AR ARE ARES AS ASIAN ASW ATO ATS AUR AURA AVAV AVGO AVY AWK AWR AXON AXP AYUD AZN AZO BAC BALL BAX BAY BBIK BBL BCH BCP BDX BG BGC BGRIM BH BIDU BIIB BIZ BJC BKI BKNG BKR BLK BMO BMY BN BNS BOL BR BRK-B BSX BWXT BX BXP C CACI CAH CAMT CARR CART CASY CAT CBG CBOE CBRE CBRS CCEP CCET CCI CCJ CDNS CDW CEG CENTEL CF CFG CG CGNX CHD CHE CHG CI CIEN CKP CL CLH CLS CM CMCSA CME CMG CMI CMS CNC CNI CNQ COCOCO COF COHR COM7 COO COP COST CP CPALL CPAXT CPF CPN CPNG CPRT CPT CPW CRC CRDO CREDIT CRH CRL CRM CRWD CRWV CSCO CSGP CSL CSX CTSH CTVA CVX CW D DASH DB DCI DD DDOG DE DECK DELL DELTA DEO DGX DHI DHR DIS DITTO DLR DMT DOC DOHOME DOW DPZ DRI DRS DUK DUSIT DVA DY EASTW EBAY ECL ED EFX EG EGCO EGP EHC EL ELV EMA EME EMR ENB ENTG EQIX ERW ES ESLT ESNT ESS ETN ETR EVR EW EWBC EXC EXE EXEL EXPD EXPE EXPO EXR FANUY FAST FCX FDS FDX FE FER FICO FISV FIVE FLEX FN FNV FORTH FPT FR FSMART FTNT FTS FTV GD GE GEHC GEV GFPT GFS GGG GILD GIS GLOBAL GLW GMED GNRC GOOGL GPSC GRAB GRMN GS GWRE GWW HAL HANA HARN HCA HD HEI HIG HON HRL HST HSY HTC HUBB HUM HUMAN IBM ICE ICHI ICLR IDXX IESC IEX IFF IIG III ILMN IMO INCY INSM INTC INTU INVH IP IPGP IQV IR IRM ISRG IT ITC ITEL ITT ITW IVL JAZZ JBHT JBL JCI JD JNJ KAMART KCG KDP KEY KEYS KGC KIM KKP KKR KLAC KLINIQ KMB KMI KNSL KO KR KTB KTC KTOS KVUE KYCCF L LANC LDOS LECO LEN LEO LH LHFG LHX LII LIN LITE LMT LNG LOW LPH LRCX LSCC LULU LYV M MA MAA MANH MAR MBK MBLY MC MCD MCK MCO MDLN MDT MEB MEDEZE MEGA MELI MET META MFC MFEC MICRO MINT MKL MKSI MLI MO MOG-A MOH MPLX MPWR MRDIYT MRNA MRSH MRVL MS MSA MSCI MSFT MSI MTB MTC MTSI MTZ NBIS NBIX NCAP NDAQ NEE NEM NEO NET NETBAY NFG NNN NOC NOK NOVT NOW NRF NRG NSC NSL NTAP NTES NTRA NTRS NTV NUE NVDA NVMI NVO NVR NXPI NYT O ODFL OHTL OKE OKJ OMCL ON ONEE ONTO OR ORCL ORLY OSP OUST OWL OXY PAAS PANW PATH PAYX PB PBA PCAR PDYN PEG PEN PFE PFG PFGC PG PGR PH PHM PKG PLANB PLD PLUS PLXS PM PNFP PNW PONY PPG PR9 PRCT PRG PRU PSA PSP PSX PWR PYPL Q-CON QCOM RACE RAM RATCH RBC RBF RCAT RDDT REG REGN RF RGA RGLD RJF RL RMD RNR ROJNA ROK ROL ROP ROST RPH RPRX RR RSG RTX RY RYAN SAIA SAP SAV SAWAD SBAC SBUX SCAP SCCC SCGP SCHW SCI SE SECURE SERV SFM SFT SGC SHOP SHR SHW SICT SIRI SITM SJM SKR SKY SLB SLF SMCI SMPC SMTC SN SNA SNOW SNP SNPS SNX SO SONIC SORKON SPA SPALI SPC SPCG SPCX SPGI SPI SPOT SPVI SRE SSNC SSP STEC STM STRL STT STZ SU SUN SUNB SYM SYNEX TACC TAP TASCO TCAP TD TDG TDY TEL TFC TFG TFM TFX TGH TGT THAI THREL TIDLOR TISCO TJX TKS TLN TMO TMUS TNH TNP TOA TOG TOP TOST TPG TPIPP TPL TPR TQM TRGP TRMB TROW TRP TRU TRUE TSCO TSEM TSLA TSM TSN TTB TTD TTE TTW TTWO TU TVO TW TXN TXRH TYL UBER UBS UFPI UI UL ULS ULTA UPS URI USB USFD UTHR V VECO VEEV VG VIAV VIBHA VLO VMRK VRANDA VRSK VRSN VST VTR WAT WCC WCN WDAY WHA WHAUP WICE WM WMB WMT WORK WPC WPH WPM WRB WSM WST WTRG WTW WY XO XOM XPO XYL YUM ZBH ZBRA ZEN ZS

</details>
