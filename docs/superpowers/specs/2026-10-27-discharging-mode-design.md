# Mode Discharging (siklus operasi bunker) — Desain

Tanggal: 2026-10-27
Status: menunggu review user

## Tujuan

MT TITANIA adalah bunker tanker. Satu **siklus** = loading di terminal, lalu beberapa operasi
discharging ke kapal penerima (nominasi berbeda-beda) sampai cargo habis, lalu loading lagi.
Aplikasi sekarang hanya punya Loading Plan. Desain ini menambah mode **Discharging** dengan
logika dan form yang sama, hanya arah operasinya dibalik (dari cargo penuh, dibongkar).

Sukses berarti:
- Chief Officer bisa membuat rencana discharging per kapal penerima, dengan Initial dari
  Final operasi sebelumnya lalu ditimpa sounding nyata.
- Semua operasi dalam siklus tersimpan dan bisa dibuka lagi.
- Ekspor Excel/PDF discharging mengisi template discharging milik user dengan benar.
- Rencana loading yang sudah ada tidak hilang (migrasi otomatis).

## Keputusan user

| Topik | Keputusan |
|---|---|
| Arsitektur | Pendekatan A: daftar operasi per siklus (`S.ops`), tiap operasi bertipe `load` atau `disch` |
| Nominasi discharge | MT diisi per operasi; kosong = bongkar semua (target 0) |
| Letak pilihan mode | Bagian atas tab Info |
| Riwayat | Daftar operasi per siklus, bisa dibuka lagi |
| Initial operasi discharging baru | Disalin dari Final operasi sebelumnya, lalu ditimpa sounding nyata |
| Watch saat discharging | Pilihan watch sama dengan loading; Excel memakai 3 orang pertama per watch, J102 (standby) kosong |
| Checklist | ISGOTT D-01 dan Pre-Arrival D-34 disembunyikan saat discharging; checklist khusus bunker menyusul (di luar lingkup ini) |

## 1. Template Excel discharging

Sumber: `Discharging Plan.xlsx` dari user (di luar repo). Hasil perbandingan dengan template loading:

**Sama:** info cargo F8-F15, tabel cargo baris 64-73, ballast 80-86, draft 88, SF/BM 90,
kolom stage B/C (Initial), D/E, F/G, H/I, J/K (Final); `STABILITY` dan `Sheet2` (VCF/WCF);
HOURLY tetap `sheet3.xml`.

**Berbeda (kode harus membaca tipe operasi):**

| Item | Loading | Discharging |
|---|---|---|
| Nama sheet utama (`sheet2.xml`) | `Sheet1` | `PLAN` |
| Sheet `REPORT HOURLY` | ada | tidak ada |
| I5 | terminal | kapal penerima (label VESSEL) |
| Watch 1 / Watch 2 | E102-105 / E106-109 (4 baris) | E102-104 / E105-107 (3 baris), J102 standby |
| Navtex | B112 | B110 |
| Inspeksi tangki | B134 | B133 (default "NO BARGE TANK INSPECTION") |
| Persetujuan nominasi | B139 | B138 |
| Prepared by (nama/jabatan) | A181/A182, I181/I182 | A187/A188, I187/I188 |
| Acknowledged by | baris 187/188 | A193/A194, I193/I194 |
| 4 AB | baris 194/195 (A, D, G, J) | baris 197/198 (A, D, G, J) |
| Nomor halaman | A38, A97, A149, A201 | A38, A97, A149, A202 |
| Ballast plan | A94 "DEBALLASTING …" | A94 "NIL" / "BALLASTING …" |

Alamat persis di tabel ini diperiksa ulang terhadap file template saat implementasi.

**Perbaikan template** (salinan baru `.claude/tpl-disch.xlsx`, tidak di-commit; file asli user tidak disentuh):
1. D62/F62/H62/J62: "Squeance 1-4" → "Sequence 1", "Sequence 2", "Sequence 3", "Final".
2. A92: "Details of de-ballasting" → "Details of ballasting".
3. A117 "(1) Preparation for loading", B114 "Initial loading rate …", B124 "… for loading cargo …" → discharging.
4. HOURLY M26 dan seterusnya (Quantity to go): angka tetap diganti rumus seperti L26.
5. Nama kru contoh dibiarkan; aplikasi selalu menimpanya saat ekspor.

Template ini dimuat user lewat dialog Template, seperti template loading.

## 2. Data dan migrasi

- `S.v` 2 → 3. Migrasi `migrateV3(S)`: `S.ops = [{ ...S.plan, type:'load', cy:1, id }]`,
  `S.opCur = 0`, `delete S.plan`. Dipanggil saat start, di `loadState` (kondisi tersimpan) dan
  `importText` (JSON lama). State yang sudah v3 tidak diubah. Mismatch versi lain tetap reset ke contoh.
- `PLs()` mengembalikan `S.ops[S.opCur]` (dinormalisasi seperti sekarang), jadi kode planner,
  Info dan ekspor tetap memakai bentuk objek yang sama.
- Field operasi: `type` (`'load'`/`'disch'`), `cy` (nomor siklus), `id`, plus semua field plan
  yang sudah ada. `terminal` dipakai ulang: saat discharging labelnya "Receiving vessel" (ke I5).
- **Discharging baru** (`opNewDisch`): siklus sama dengan operasi aktif.
  - Initial disalin dari stage Final operasi sebelumnya: sounding cargo per tangki (mode `snd`),
    ballast (`rob.tk`), densitas dan temperatur cargo (loading: campuran ROB + nominasi seperti
    `plApply`; discharging: densitas Initial-nya).
  - `parcels[0]` diisi densitas/temperatur yang sama, `mt` kosong. Seq 1-3 dan Final kosong.
- **Loading baru** (`opNewLoad`): `cy + 1`, plan default.
- Hapus operasi: ketuk dua kali (pola Clear yang ada). Operasi terakhir tidak bisa dihapus.
- Kru, tanda tangan dan template tetap di luar `S` (tidak berubah).

## 3. Logika hitung discharging

- Initial = cargo di kapal saat tiba, input sounding/ullage/volume yang sama dengan ROB sekarang.
- `target = type==='disch' ? max(0, Initial.tov − nom.tov) : Initial.tov + nom.tov`
  (nominasi kosong saat discharging → target 0).
- `remain = total − target` (rumus sama dengan loading; negatif = merah).
- `discharged = Initial.tov − total` menggantikan `loaded` saat discharging.
- Densitas: `cargoW` tidak diubah. Saat discharging, volume ≤ Initial sehingga seluruhnya memakai
  densitas cargo di kapal.
- Ballast plan discharging: tangki dengan Final > Initial + 0.05 m³ → `BALLASTING WBT n (x%)`
  (x = % Final); jika tidak ada → `NIL`. Loading tetap DEBALLASTING seperti sekarang.
- Teks: `Agreed Discharging Quantity … MT, density … and temperature …°C`; inspeksi default
  `NO BARGE TANK INSPECTION`.

## 4. Tampilan

- **Tab Info, atas:** segmen `Loading | Discharging` (menunjukkan tipe operasi aktif),
  daftar operasi siklus aktif (mis. "Loading · <terminal> · 6500 MT", "Disch 1 · <kapal> · 1000 MT"),
  tombol "+ Discharging baru" dan "+ Loading baru (siklus baru)", lipatan "Siklus sebelumnya".
  Memilih segmen yang berbeda dari tipe aktif membuka operasi terakhir bertipe itu di siklus aktif,
  atau menawarkan membuat yang baru.
- **Label per tipe:** Terminal → Receiving vessel; Quantity → Quantity to discharge (kosong = semua);
  dashboard "DISCHARGING PLAN · …"; "ROB cargo" → "Cargo on board"; "Target (ROB + nomination)"
  → "Target (Initial − nomination)"; baris ringkasan "Remaining m³" tetap.
- Tab Plan, Results, Tanks: bentuk tidak berubah.

## 5. Ekspor

- Template dialog: dua slot, "Excel loading" (IndexedDB key `xlsx`, tetap) dan
  "Excel discharging" (key `xlsx_d`). Ekspor memakai slot sesuai tipe operasi aktif; jika slot
  kosong, hanya PDF (perilaku sekarang).
- Pemetaan sel dipindah ke satu objek `XL_MAP = { load:{…}, disch:{…} }` (alamat tabel bagian 1,
  nama sheet, baris halaman). `xlEdits`, `xlFills`, `xlOver`, `buildSheetPdf` membaca `XL_MAP[type]`.
- `buildPlanPdf` (PDF tanpa template): judul, "LOADING SEQUENCE", "LOADED (m3)", "4. DEBALLAST PLAN",
  "PROCEDURES - LOADING OPERATION", "Arrival/Departure Condition Draft" mengikuti tipe.
- Dialog Export: opsi ISGOTT dan Pre-Arrival disembunyikan saat discharging.
- Nama file: `Discharging Plan - <kapal penerima> - <grade> - <mt> MT` (loading tetap seperti sekarang).

## 6. Pengujian

- Fungsi baru yang murni hitungan ditaruh di satu blok `<script>` tanpa akses DOM (penanda
  `// PLAN-CORE`): `migrateV3`, `opFromFinal` (salin Final → Initial), `planTarget`
  (target/remain/discharged), `ballastText`, `XL_MAP`.
- `node tests/plan.test.mjs`: memotong blok engine `LC` dan blok `PLAN-CORE` dari `index.html`,
  menjalankannya di `node:vm`, lalu menguji:
  - migrasi v2 → v3 tidak kehilangan field plan, dan idempoten;
  - target/remaining/discharged untuk loading dan discharging (dengan dan tanpa nominasi);
  - salin Final → Initial menghasilkan sounding dan ballast yang sama dengan Final;
  - teks ballasting/NIL;
  - `XL_MAP.disch` berisi alamat bagian 1.
  Tidak butuh paket tambahan (cukup Node).
- Manual di browser preview: pindah mode, buat operasi, ekspor Excel/PDF discharging dengan
  template discharging, buka kondisi tersimpan lama.
- Rilis: naikkan `C` di `sw.js`; perbarui CLAUDE.md (S.ops, XL_MAP, template kedua, perintah tes).

## Di luar lingkup

- Checklist khusus bunker (menunggu form dari user).
- Perubahan engine stabilitas `LC`.
- Multi-parcel/multi-grade dalam satu operasi discharging.
