# สีแบรนด์ต่อหุ้น — หลักการเลือกสี (Brand Color Convention)

ทุกรายงานในระบบ template มี **สีเฉพาะตัว** เก็บใน `report-data.theme` (ดู CLAUDE.md §9)
สีไม่ได้สุ่ม — **เลือกตามลักษณะของหุ้นแต่ละตัว** ดังนี้:

## หลักการเลือก (priority)

1. **มีสีแบรนด์/โลโก้ที่จำได้ → ใช้สีนั้น**
   เช่น GOOGL ฟ้า Google, MSFT ฟ้า Microsoft, TSLA/TSM/Corning(GLW)/Oracle(ORCL) แดง,
   PANW/Cloudflare(NET) ส้ม, Accenture(ACN) ม่วง, SAP/Cisco(CSCO) ฟ้า, Sea/Shopee(SE) ส้มแดง,
   Cadence(CDNS)/Arista(ANET) เขียว, Nokia(NOK) น้ำเงินเข้ม
2. **ไม่มีสีแบรนด์ชัด (B2B / semiconductor / EMS) → เลือกสีตาม "เซกเตอร์/ลักษณะธุรกิจ"** เพื่อให้ต่างกันและสื่อความหมาย:
   | ลักษณะธุรกิจ | โทนสี |
   |---|---|
   | Photonics / laser / optics (transceiver, fiber, EML) | teal · cyan · magenta · violet (กระจายไม่ให้ฟ้าซ้ำ) |
   | Foundry / OSAT / metrology / chip-tooling | copper · bronze · steel |
   | Power / energy / EV / utility | เขียว · amber |
   | Memory / storage (DRAM, NAND, HDD) | amber · gold |
   | Cybersecurity | ส้ม · แดง |
   | Medical / surgical robotics | เขียวการแพทย์ |
3. **เลี่ยงน้ำเงิน default** (`#1557b0`/`#2c3a52`) — โทนที่เราเลิกใช้ (เคยเป็นสีกลางของ 74 ตัว)
4. **คุมความหลากหลายในกลุ่ม** — หุ้นเซกเตอร์เดียวกันไล่เฉดต่างกัน ไม่ให้สีซ้ำเป๊ะ (ยกเว้นแบรนด์ร่วมจริง เช่น TSM/STM แดง)

## วิธีทำงาน (เทคนิค)

- เก็บแค่ **"สีเมล็ด" (seed) 1 ค่าต่อหุ้น** ใน `tools/seeds.json`
- `tools/brandtheme.js` → `makeTheme(seed)` คำนวณ **ธีมเต็มชุด** ด้วย color math (HSL):
  `darkGrad` (header/verdict เข้ม→สว่าง) · `accent`/`accentDark` (เส้นกราฟ/เลข section) · `glow` · ตัวอักษรทินต์ตามแบรนด์ (`subColor`/`headerMuted`/`verdictText`/`vcellLabel`)
- ไม่แตะ `chgBg`/`chgColor` (สีขึ้น/ลง = semantic) · `badge` ตามสี accent อัตโนมัติ
- เพิ่มหุ้นใหม่/เปลี่ยนสี: ใส่ seed ใน `seeds.json` แล้ว `node tools/brandtheme.js tools/seeds.json --write`

## เหตุผลรายตัว (74 ตัวที่เติมสีรอบนี้)

> 44 ตัวที่เหลือมีสีแบรนด์เฉพาะอยู่ก่อนแล้ว (KBANK เขียวกสิกร, SCB ม่วง, NVDA เขียว, AAPL เทา, ฯลฯ)

| Sym | Seed | เหตุผล | Sym | Seed | เหตุผล |
|---|---|---|---|---|---|
| GOOGL | `#4285f4` | ฟ้า Google | MSFT | `#0078d4` | ฟ้า Microsoft |
| CSCO | `#049fd9` | ฟ้า Cisco | INTC | `#0071c5` | ฟ้า Intel |
| DELL | `#0076ce` | ฟ้า Dell | QCOM | `#3253dc` | ฟ้า Qualcomm/Snapdragon |
| SAP | `#0faaff` | ฟ้า SAP | ASML | `#0b5fa5` | ฟ้า ASML |
| BIDU | `#2932e1` | น้ำเงิน Baidu | NOK | `#124191` | น้ำเงิน Nokia |
| ZS | `#0d6dff` | ฟ้า Zscaler | ADSK | `#0696d7` | ฟ้า-cyan Autodesk |
| ACN | `#a100ff` | ม่วง Accenture | PANW | `#fa582d` | ส้ม Palo Alto |
| NET | `#e8731f` | ส้ม Cloudflare-like edge | SE | `#ee4d2d` | ส้มแดง Shopee |
| TEL | `#f47b20` | ส้ม TE Connectivity | APH | `#e8821a` | ส้ม Amphenol |
| FLEX | `#ff7a00` | ส้ม EMS | TSLA | `#cc0000` | แดง Tesla |
| TSM | `#c4161c` | แดง TSMC | STM | `#c4161c` | แดง ST (auto/SiC) |
| GLW | `#c8102e` | แดง Corning | TXN | `#d23a3a` | แดง TI (analog) |
| GFS | `#c0392b` | แดง specialty foundry | AMKR | `#d4233a` | แดง OSAT |
| CDNS | `#159e3f` | เขียว Cadence (EDA) | ANET | `#1fb56b` | เขียว Arista |
| ETN | `#00a651` | เขียวพลังงาน | ON | `#46b450` | เขียว power/SiC |
| MPWR | `#1faa4d` | เขียว power-mgmt | VST | `#2bb24c` | เขียวโรงไฟฟ้า |
| ISRG | `#16b04d` | เขียวการแพทย์ | SMCI | `#1bb07a` | เขียว AI-server |
| SANM | `#16a36a` | เขียว EMS scale | AAOI | `#00b3b3` | teal photonics |
| COHR | `#00b4c8` | cyan laser | CRDO | `#00b4d8` | cyan connectivity |
| VIAV | `#00b3c7` | cyan optical test | SMTC | `#00b8c4` | cyan datacenter link |
| LWLG | `#00b8c4` | teal EO-polymer | IPGP | `#00b3a4` | teal fiber laser |
| FN | `#1bbcaf` | teal optics EMS | CAMT | `#1aa3a3` | teal metrology |
| NVMI | `#1ba39c` | teal metrology | TSEM | `#15a0a0` | teal specialty foundry |
| MXL | `#00a0e0` | cyan-blue mixed-signal | ACMR | `#1aa3e8` | aqua wafer-clean |
| CIEN | `#d6249b` | magenta coherent optics | POET | `#d63ac4` | magenta interposer |
| MKSI | `#d6177a` | magenta laser | KEYS | `#d61f6e` | magenta test/spectrum |
| ALAB | `#7b3ff2` | violet AI fabric | CLS | `#6a3fd6` | violet ODM |
| FORM | `#8a4fff` | violet probe-card | LITE | `#7c4dff` | violet InP laser |
| LSCC | `#7b3fe4` | violet FPGA | MTSI | `#9b3ff0` | violet analog/photonics |
| SNPS | `#7b4dff` | violet EDA | PLXS | `#7b4ddb` | violet EMS |
| VECO | `#8a3ffc` | violet laser-anneal | MU | `#e0a312` | gold memory |
| WDC | `#e0721b` | amber storage | JBL | `#e8a31a` | amber EMS |
| PWR | `#f0b417` | amber grid/power | SITM | `#d4a017` | amber MEMS clock |
| AEHR | `#e8731a` | amber burn-in heat | NXPI | `#e8731f` | amber edge-AI/auto |
| AMAT | `#c77b30` | copper deposition | ASX | `#b87333` | copper OSAT |
| KLAC | `#b3793a` | copper inspection | COHU | `#a8702f` | copper test-handler |
| LRCX | `#c8651b` | copper etch/dep | ONTO | `#b06a2c` | bronze metrology |
| UMC | `#bf7a38` | copper foundry | — | — | — |
