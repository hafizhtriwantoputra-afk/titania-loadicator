# Mode Discharging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah mode Discharging (daftar operasi per siklus bunker) di samping Loading, dengan hitungan, tampilan dan ekspor Excel/PDF per tipe operasi.

**Architecture:** `S.plan` menjadi `S.ops[S.opCur]` (tipe `load`/`disch`), dimigrasi dari state v2. Fungsi murni baru (migrasi, target, teks ballast, salin Final → Initial, peta sel Excel) ada di satu blok `<script>` `PLAN-CORE` tanpa DOM, diuji dengan `node`. Kode planner/ekspor yang ada membaca `PLs().type` dan `XL_MAP[type]`.

**Tech Stack:** HTML/JS satu file (`index.html`), tanpa bundler; Node (bawaan `node:vm`, `node:assert`) untuk tes; Python stdlib untuk menyalin template.

**Spec:** `docs/superpowers/specs/2026-10-27-discharging-mode-design.md`

## Global Constraints

- Semua kode di `index.html`. Jangan baca file utuh; baris `const SHIP` dan `const EXAMPLES` sangat panjang (pakai `cut -c1-300`).
- Tanpa paket/library baru. Tes cukup `node tests/plan.test.mjs`.
- Kru, tanda tangan, template Excel dan checklist tidak pernah masuk git atau `S`.
- `.claude/tpl-disch.xlsx` dan `Discharging Plan.xlsx` tidak di-commit.
- Identitas git netral (`titania-loadicator` / `noreply@example.com`). Jangan push.
- Satuan internal sounding = cm; tampilan/masukan lewat `toCm`/`fromCm` (`S.lenUnit`, default mm).
- Cache `C` di `sw.js` dinaikkan sekali saja, di Task 7 (ke `titania-lc-v3-26`).
- Setiap pesan commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tes hanya memotong blok `PLAN-CORE` (fungsi baru tidak memakai `LC`), bukan engine `LC` seperti tertulis di spec.
- IndexedDB key template loading tetap `xlsx`; discharging `xlsx_d`.

## Review Focus

1. Kondisi tersimpan lama (`lc_saved`, v2) dibuka lewat Saved → harus dimigrasi, bukan reset ke contoh. (Task 2, tes `migrateV3` + cek manual Task 7.)
2. JSON v2 yang diimpor punya `plan` kosong/tidak ada → operasi load default terbentuk. (Task 1, tes `migrateV3 without plan`.)
3. Nominasi discharge lebih besar dari cargo di kapal → target 0, bukan negatif. (Task 1, tes `planTarget clamps`.)
4. Operasi discharging baru saat operasi sebelumnya Final kosong (tanpa isian Seq) → Initial = Initial sebelumnya, karena sel kosong = sama dengan stage sebelumnya. (Task 3: `opFinal` me-resolve sel kosong lewat `planSeq`; dicek manual di Step 3 dengan operasi loading yang Seq-nya kosong.)
5. Ekspor discharging saat hanya template loading yang dimuat → tidak memakai template loading; hanya PDF sederhana. (Task 6, cek manual.)

---

### Task 1: Blok PLAN-CORE + tes Node

**Files:**
- Modify: `index.html` — sisipkan `<script>` baru tepat setelah `</script>` engine LC (sekarang baris 873, cari `grep -n "^const MiniPDF"` dan sisipkan sebelum `<script>` pembukanya).
- Create: `tests/plan.test.mjs`

**Interfaces:**
- Produces (global di halaman, semua murni):
  - `migrateV3(st) -> st` — mutasi dan kembalikan. `st.v===3`: tidak diubah. `st.v===2`: `st.ops=[{...(st.plan||{}), type:'load', cy:1, id:'op1'}]`, `st.opCur=0`, `delete st.plan`, `st.v=3`. Versi lain: dikembalikan apa adanya (pemanggil yang memutuskan reset).
  - `planTarget(type, initTov, nomTov) -> number` — `load`: `initTov + (nomTov||0)`; `disch`: `nomTov>0 ? Math.max(0, initTov-nomTov) : 0`.
  - `ballastText(type, rows) -> string` — `rows = [{ name, first, last, minPct, lastPct }]` (m³ dan %), urutan dipertahankan. `load`: tangki dengan `last < first-0.05` → `'WBT '+name+' ('+minPct+'%)'`, gabung `', '`, awali `'DEBALLASTING '`, kosong → `'NO DEBALLASTING'`. `disch`: `last > first+0.05` → `'WBT '+name+' ('+Math.round(lastPct)+'%)'`, awali `'BALLASTING '`, kosong → `'NIL'`.
  - `opFromFinal(base, prev, fin, id) -> op` — `base` = `planDefault()`; `fin = { snd:{tankId: nilai dalam satuan tampilan}, bal:{tankId: m³}, rho, temp }`. Hasil: salinan `base` dengan `type:'disch'`, `cy:prev.cy`, `id`, `grade:prev.grade`, `port:prev.port`, `rob.mode:'snd'`, `rob.t[id]={val}` untuk tiap `fin.snd` > 0, `rob.tk={...fin.bal}`, `rob.rho`/`rob.temp` dan `parcels[0].rho`/`.temp` = `fin.rho`/`fin.temp` (string kosong bila null), `parcels[0].mt:''`, `view:'rob'`.
  - `XL_MAP` — lihat tabel di bawah.

`XL_MAP` (nilai persis):

| key | `load` | `disch` |
|---|---|---|
| `sheet` | `'Sheet1'` | `'PLAN'` |
| `title` | `'Loading Plan'` | `'Discharging Plan'` |
| `w1` | `['E102','E103','E104','E105']` | `['E102','E103','E104']` |
| `w2` | `['E106','E107','E108','E109']` | `['E105','E106','E107']` |
| `compact` | `false` | `true` |
| `standby` | `null` | `'J102'` |
| `navtex` | `'B112'` | `'B110'` |
| `inspect` | `'B134'` | `'B133'` |
| `agree` | `'B139'` | `'B138'` |
| `prep` | `{ row:181 }` | `{ row:187 }` |
| `ack` | `{ row:187 }` | `{ row:193 }` |
| `abs` | `{ row:194 }` | `{ row:197 }` |
| `pages` | `[38,97,149,201]` | `[38,97,149,202]` |
| `sig` | `{ o:[176,181,180], ack:[182,187,186], ab:[189,190,193], abCols:{0:'ab0',3:'ab1',6:'ab2',9:'ab3'} }` | `{ o:[182,185,186], ack:[186,189,192], ab:[193,194,196], abCols:{0:'ab0',2:'ab1',6:'ab2',9:'ab3'} }` |

(`sig` = `[barisAwal, barisAkhir, barisNama]`, 0-based, dari anchor gambar tanda tangan di drawing template; nilai `load` sama dengan `sigSlotOf` sekarang.)

- [ ] **Step 1: Tulis tes yang gagal** — `tests/plan.test.mjs` membaca `index.html`, memotong teks di antara `// PLAN-CORE start` dan `// PLAN-CORE end`, menjalankan `vm.runInNewContext(code + '\n;({migrateV3, planTarget, ballastText, opFromFinal, XL_MAP})')`, lalu `node:assert/strict`:
  - `migrateV3 v2`: `{v:2, plan:{port:'X', seq:[1]}}` → `v===3`, `ops.length===1`, `ops[0].type==='load'`, `ops[0].cy===1`, `ops[0].port==='X'`, `opCur===0`, `!('plan' in st)`.
  - `migrateV3 idempotent`: menjalankan dua kali menghasilkan `ops.length===1`.
  - `migrateV3 without plan`: `{v:2}` → `ops[0].type==='load'`.
  - `planTarget`: `('load',200,6000)===6200`; `('disch',7000,1000)===6000`; `('disch',7000,'')===0`; `planTarget clamps`: `('disch',500,1000)===0`.
  - `ballastText`: `('load',[{name:'1W',first:300,last:20,minPct:5,lastPct:2}])==='DEBALLASTING WBT 1W (5%)'`; `('load',[])==='NO DEBALLASTING'`; `('disch',[{name:'5W',first:120,last:900,minPct:10,lastPct:61.4}])==='BALLASTING WBT 5W (61%)'`; `('disch',[{name:'5W',first:120,last:120.03,minPct:10,lastPct:9}])==='NIL'`.
  - `opFromFinal`: dengan `base` minimal `{rob:{t:{},tk:{},mode:'vol'},parcels:[{mt:'500'}],seq:[]}`, `prev={cy:2,grade:'VLSFO',port:'SG'}`, `fin={snd:{COTK3P:8301,COTK1P:0},bal:{WBTK5P:120},rho:0.9503,temp:42}` → `type==='disch'`, `cy===2`, `rob.mode==='snd'`, `rob.t.COTK3P.val===8301`, `!('COTK1P' in rob.t)`, `rob.tk.WBTK5P===120`, `parcels[0].rho===0.9503`, `parcels[0].mt===''`, `grade==='VLSFO'`; `base` tidak berubah (`base.rob.mode==='vol'`).
  - `XL_MAP`: `XL_MAP.disch.sheet==='PLAN'`, `XL_MAP.disch.w2[0]==='E105'`, `XL_MAP.disch.pages[3]===202`, `XL_MAP.load.navtex==='B112'`.
  - Cetak `ok N tests` di akhir.

- [ ] **Step 2: Jalankan, pastikan gagal**
  Run: `node tests/plan.test.mjs`
  Expected: gagal karena penanda `PLAN-CORE start` tidak ditemukan.

- [ ] **Step 3: Implementasi** — blok `<script>` baru berisi komentar `// PLAN-CORE start` … `// PLAN-CORE end`, hanya `const`/`function` di atas, tanpa `$`, `document`, `S`, `LC`. `opFromFinal` menyalin `base` dengan `JSON.parse(JSON.stringify(base))`.

- [ ] **Step 4: Jalankan, pastikan lulus**
  Run: `node tests/plan.test.mjs`
  Expected: `ok` dan tidak ada AssertionError.

- [ ] **Step 5: Commit**
```bash
git add index.html tests/plan.test.mjs
git commit -m "Plan core: migration, targets, ballast text, Final-to-Initial copy, Excel cell maps (with node tests)"
```

---

### Task 2: State v3 (ops) dan migrasi di semua pintu masuk

**Files:**
- Modify: `index.html` — `blankState` (`grep -n "return {v:2"`), startup (`if(!S || S.v!==2)`), `loadState`, `exportJSON`, `importText`, `PLs` (`grep -n "function PLs"`), `planDefault`.

**Interfaces:**
- Consumes: `migrateV3` (Task 1).
- Produces: `S.v===3`, `S.ops: op[]`, `S.opCur: number`; `PLs() -> op` (operasi aktif, dinormalisasi); `planDefault()` kini memuat `type:'load'`.

- [ ] **Step 1: `blankState()`** mengembalikan `v:3`, `ops:[{...planDefault(), cy:1, id:'op1'}]`, `opCur:0`.
- [ ] **Step 2: Startup**: `let S = store.get('lc_current'); if(S && S.v===2) migrateV3(S); if(!S || S.v!==3){ S = exampleState(0); } else { toMM(S); }`.
- [ ] **Step 3: `loadState(st)`**: panggil `migrateV3` pada salinan sebelum digabung dengan `blankState()`. `importText`: ganti `st.v=2` menjadi `if(st.v!==3) st.v=2` lalu biarkan `loadState` memigrasi. `exportJSON`: `v:3`.
- [ ] **Step 4: `PLs()`**: ambil `S.ops[S.opCur]` (kalau `ops` kosong/indeks di luar rentang: buat `[{...planDefault(), cy:1, id:'op1'}]`, `opCur=0`), lalu normalisasi yang sama seperti sekarang pada objek itu; `type` default `'load'`, `cy` default `1`. Semua pemakaian langsung `S.plan` lain (`grep -n "S\.plan"`) diganti `PLs()`.
- [ ] **Step 5: Verifikasi** — `node tests/plan.test.mjs` tetap lulus; buka preview (`python3 -m http.server 8000` lewat launch config), pastikan tab Plan dan Info menampilkan rencana lama yang sama seperti sebelum perubahan, dan console tanpa error.
- [ ] **Step 6: Commit** — `git commit -am "State v3: plans live in S.ops, v2 states migrate on start, load and import"`

---

### Task 3: Operasi dan siklus di tab Info

**Files:**
- Modify: `index.html` — markup tab Info (`grep -n 'id="t-info"'`, sisipkan kartu baru sebelum `<details>` "Loading Plan"), CSS secukupnya mengikuti kelas yang ada (`group`, `seg`, `btn sm`), `renderInfo`.

**Interfaces:**
- Consumes: `opFromFinal`, `PLs`, `planSeq`/`planRob` (untuk Final), `planDefault`.
- Produces:
  - `opFinal(op) -> { snd, bal, rho, temp }` — sounding Final yang sudah di-resolve (kosong = stage sebelumnya) dalam satuan tampilan (`fromCm`), ballast Final (m³), densitas/temperatur: load = campuran ROB + nominasi (rumus `rhoB`/`tB` di handler `plApply`), disch = `rob.rho`/`rob.temp`. Menghitung dengan mengaktifkan `op` sementara lalu memanggil `planRob()`/`planSeq()`, lalu mengembalikan `S.opCur`.
  - `opNewDisch()`, `opNewLoad()`, `opOpen(i)`, `opDelete(i)` — semuanya `store.set('lc_current',S)` lalu `renderInfo(); renderPlan();`.
  - `opLabel(op, i) -> string` — `'Loading'` atau `'Disch '+n` (n = urutan disch di siklus), lalu `terminal`, lalu `parcels[0].mt+' MT'` bila ada, digabung `' · '`.

- [ ] **Step 1: Kartu "Operation"** di atas tab Info: segmen `#opType` (`Loading` | `Discharging`, `on` sesuai `PLs().type`), daftar operasi siklus aktif `#opList` (tombol per operasi, aktif ditandai `on`, tombol hapus ketuk-dua-kali seperti `rbClear`), tombol `#opNewD` "+ Discharging" dan `#opNewL` "+ Loading (new cycle)", `<details>` "Previous cycles" berisi operasi `cy` lebih kecil dikelompokkan per siklus.
- [ ] **Step 2: Perilaku** — `opNewDisch`: `S.ops.push(opFromFinal(planDefault(), PLs(), opFinal(PLs()), newId()))`, `opCur` ke operasi baru. `opNewLoad`: push `{...planDefault(), cy: maxCy+1, id:newId()}`. Segmen `#opType` berbeda dari tipe aktif: buka operasi terakhir bertipe itu di siklus aktif, kalau tidak ada panggil `opNewDisch`/`opNewLoad`. `opDelete` menolak bila hanya satu operasi.
- [ ] **Step 3: Verifikasi manual** di preview: buat Disch dari rencana loading contoh; Initial di tab Plan berisi sounding Final loading (mode Snd) dan ballast Final; pindah ke Loading dan kembali, isian tidak hilang; reload halaman, daftar operasi tetap.
- [ ] **Step 4: Commit** — `git commit -am "Info: operation cycle list, new discharging from previous Final, new loading starts a cycle"`

---

### Task 4: Hitungan dan label planner per tipe

**Files:**
- Modify: `index.html` — `planSeq`, `planUpdate`, `renderPlan`/`renderSeq` (label), markup label Info (`inTerm`, `inMT`, `inRobRho`, `inRobTemp`, judul "Loading Plan"/"ROB"), `planData`, `buildPlanPdf`.

**Interfaces:**
- Consumes: `planTarget`, `ballastText`, `PLs().type`.
- Produces: `planSeq()` item `{ …, target, remain, loaded, discharged }`; `planData()` menambah `type` dan mengganti `deb` (array) dengan `ballast` (string dari `ballastText`).

- [ ] **Step 1: `planSeq`** — `target = planTarget(P.type, rob.tov, NOM.tov)`, `discharged = rob.tov - total`.
- [ ] **Step 2: Label `disch`** (`load` tidak berubah): Info "Terminal" → "Receiving vessel", "Loading quantity MT (air)" → "Discharge quantity MT (air, blank = all)", judul grup "Loading Plan" → "Discharging Plan", "ROB" → "Cargo on board", "ROB density/temperature" → "Cargo density/temperature"; Plan footer "Target (ROB + nomination)" → "Target (Initial − nomination)"; dashboard `'LOADING PLAN · '` → `'DISCHARGING PLAN · '`, label Initial `'ROB cargo m³'` → `'Cargo on board m³'`; `plApply` nama kondisi diawali `'Disch'`.
- [ ] **Step 3: `planData`** — `rows` untuk `ballastText` dari `BAL_PAIRS` urutan `['5W','4W','3W','2W','1W','FWD W','FPT']` dengan `minPct = BAL_MIN(ids[0])`, `lastPct = vol Final / kapasitas pasangan * 100`; `inspect` disch = `'NO BARGE TANK INSPECTION'`; `agree` disch = `'Agreed Discharging Quantity '+mt+' MT, density '+rho+' and temperature '+temp+'°C'`.
- [ ] **Step 4: `buildPlanPdf`** — untuk disch: judul `DISCHARGING CARGO OPERATION PLAN`, `3. DISCHARGING SEQUENCE`, baris `DISCH (m3)` dengan nilai `sA.cargoTot - s.cargoTot`, `4. BALLAST PLAN - Details of ballasting of WBT's` + `d.ballast`, `PROCEDURES - DISCHARGING OPERATION`, `(3) Agreement of cargo nomination with Chief Engineer / Bunker Surveyor`, remarks tanpa "LOADING MASTER" (pakai `'INFORM RECEIVING VESSEL __'+XP_STATIC.informMin+'__ MINUTES BEFORE COMPLETION AND REDUCE DISCHARGING RATE.'`).
- [ ] **Step 5: Verifikasi** — `node tests/plan.test.mjs` lulus; di preview operasi disch dengan nominasi 1000 MT: Remaining positif di Seq tanpa isian, turun saat sounding dikurangi; nominasi kosong → target 0; operasi loading tetap menampilkan angka yang sama seperti sebelum Task 1.
- [ ] **Step 6: Commit** — `git commit -am "Planner: discharging targets, discharged volume, ballasting text and labels"`

---

### Task 5: Template Excel discharging (salinan lokal)

**Files:**
- Create (tidak di-commit): `.claude/tpl-disch.xlsx`
- Script sementara di scratchpad (tidak di-commit).

**Interfaces:**
- Produces: template untuk slot `xlsx_d` (dimuat user di Task 6).

- [ ] **Step 1: Skrip Python stdlib** menyalin `../loading-plan-excel/Discharging Plan.xlsx` ke `.claude/tpl-disch.xlsx` part demi part, mengubah hanya `xl/sharedStrings.xml` dan `xl/worksheets/sheet3.xml`:
  - Teks D62/F62/H62/J62 → `Sequence 1`, `Sequence 2`, `Sequence 3`, `Final` (tambahkan string baru di sharedStrings bila string lama dipakai sel lain).
  - A92 → `4. BALLAST PLAN - Details of ballasting of WBT's`.
  - A117 → `(1) Preparation for discharging`; B114 → `c)  Initial discharging rate to be minimum to prevent accumulation of static charge`; B124: `for loading cargo` → `for discharging cargo`.
  - HOURLY M26:O26 dan L63:O63: angka tetap → rumus seperti L26 (`=$E$26-M24` dst., sesuaikan kolom); hapus `<v>` supaya dihitung ulang.
- [ ] **Step 2: Verifikasi** — jalankan ulang `xdiff`-style dump: hanya sel di atas yang berbeda dari file asli; file terbuka tanpa error di Numbers/Excel (cek manual user) atau minimal `PlanXlsx.readZip` di preview tidak melempar error.
- [ ] **Step 3:** Tidak ada commit (file di `.claude/`, sudah di-exclude).

---

### Task 6: Ekspor per tipe

**Files:**
- Modify: `index.html` — `TPL`/`tplLoad`/`tplSave`/`tplShow`, markup dialog Template (`#tpModal`) dan Export (`#xpOpts`), `xlEdits`, `xlFills`, `xlOver`, `sigSlotOf`, `sigMaps`, `exportPlan`, `xpOpen`, handler `#xpTplFile`.

**Interfaces:**
- Consumes: `XL_MAP`, `planData().type`, `planData().ballast`.
- Produces: `TPLS = { load:{bytes,name}, disch:{bytes,name} }` (IndexedDB key `xlsx` / `xlsx_d`); `tplFor(type) -> {bytes,name}`; `sigSlotOf(sheet, an)` membaca `XL_MAP` lewat `sheet` (`'Sheet1'` → load, `'PLAN'` → disch); `sigMaps(d)` mengembalikan kunci `XL_MAP[d.type].sheet`.

- [ ] **Step 1: Dua slot template** — dialog Template punya dua baris (Excel loading / Excel discharging) dengan tombol pilih file masing-masing; `tplShow` menampilkan keduanya.
- [ ] **Step 2: `xlEdits(d)`** — semua alamat yang ada di `XL_MAP` diambil dari `m = XL_MAP[d.type]`: watch (`compact`: `[o,...j].filter(Boolean).slice(0, m.w1.length)` ditulis berurutan, sisa sel dikosongkan; non-compact: posisi seperti sekarang), `standby` dikosongkan, `navtex`, `inspect`, `agree`, `prep.row`/`+1`, `ack.row`/`+1`, `abs.row`/`+1`, `pages`, `A94 = d.ballast`. HOURLY (`sheet3.xml`) tidak berubah.
- [ ] **Step 3: `sigSlotOf`** — ganti rentang tetap dengan `XL_MAP[...].sig`; untuk loading hasilnya harus sama persis dengan sekarang.
- [ ] **Step 4: `exportPlan`** — `tpl = tplFor(d.type)`; `buildSheetPdf(tpl.bytes, res, [m.sheet], true, sg)`; nama file `m.title + ' - ' + …` (disch: kapal penerima = `d.terminal`); label tombol `m.title+' PDF'`; `isg`/`pre` tidak dibuat untuk disch. `xpOpen`: opsi `isg`/`pre` disembunyikan bila `PLs().type==='disch'`; opsi Excel/HOURLY nonaktif bila `tplFor(type)` kosong.
- [ ] **Step 5: Verifikasi manual** — muat `.claude/tpl-disch.xlsx` ke slot discharging; ekspor operasi disch: Excel terbuka, I5 = kapal penerima, watch di E102-107, tanda tangan di posisi template, A94 sesuai; PDF Sheet dan HOURLY tercetak. Ekspor operasi loading dengan `.claude/tpl.xlsx` menghasilkan file yang sama seperti sebelum perubahan (bandingkan sel `sheet2.xml` dengan skrip dump). Ekspor disch tanpa template discharging → hanya PDF sederhana.
- [ ] **Step 6: Commit** — `git commit -am "Export: discharging template slot, per-type cell maps and signature slots, hide ISGOTT/Pre-Arrival for discharging"`

---

### Task 7: Rilis dan dokumentasi

**Files:**
- Modify: `sw.js` (`C` → `'titania-lc-v3-26'`), `CLAUDE.md`.

- [ ] **Step 1:** Naikkan `C` di `sw.js`.
- [ ] **Step 2: `CLAUDE.md`** — ganti "There is no … test suite" dengan perintah `node tests/plan.test.mjs`; State: `S.v` 3, `S.ops`/`S.opCur`, `PLs()` = operasi aktif, migrasi `migrateV3`; Export: `XL_MAP`, dua template (`xlsx`, `xlsx_d`), alamat discharging; blok `PLAN-CORE`.
- [ ] **Step 3: Cek akhir** — `node tests/plan.test.mjs` lulus; di preview: buka kondisi tersimpan lama dari Saved (migrasi), impor JSON v2, siklus Loading → Disch 1 → Disch 2 → Loading baru, console tanpa error, tampilan mobile (375 px) tanpa scroll horizontal di kartu Operation.
- [ ] **Step 4: Commit** — `git commit -am "Discharging mode: bump cache to v3-26, update CLAUDE.md"`
