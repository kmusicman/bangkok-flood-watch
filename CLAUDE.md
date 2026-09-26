# Bangkok Flood Watch — แผนงานสำหรับ Claude Code

> สถานการณ์: ฝนตกหนัก 24–27 ก.ย. 2569 ถนนหลักใน กทม. น้ำท่วมขังหลายเส้น และท่วมหลายจังหวัด
> เป้าหมาย: ปล่อย MVP ให้ใช้งานได้จริง **ภายในวันนี้** แล้วค่อยเพิ่มฟีเจอร์
>
> ## 🚨 ขอบเขตรอบนี้ (Phase 0): **แดชบอร์ดรวมข้อมูลอย่างเดียว — read-only**
> ทำแค่ข้อ 1 (แผนที่ + ข้อมูลทางการ) และหน้า `/links` (เครื่องมือ + สายด่วน)
> **ยังไม่ทำ** ระบบแจ้งเหตุ, SOS, verify, admin, Supabase — ส่วนเหล่านี้ (ข้อ 5, 6, 8 และหน้า `/report` `/sos` `/admin`) เป็น Phase 1 เก็บไว้เป็นแผนเท่านั้น อย่าเพิ่งเขียนโค้ด
> ขอบเขต: MVP เริ่มที่ กทม. แต่ **ออกแบบ schema/แผนที่ให้รองรับทั้งประเทศตั้งแต่แรก** (มีคอลัมน์ province, แผนที่ zoom ออกได้ทั้งประเทศ)
> ข้อจำกัดหลัก: **ค่าใช้จ่ายใกล้ 0 บาท** — ใช้ free tier เท่านั้น ห้ามใช้บริการที่คิดเงินต่อครั้ง (Google Maps API, SMS OTP)

---

## 1. สิ่งที่ระบบต้องทำ

1. **แผนที่น้ำท่วม** — แสดงถนน/จุดที่น้ำท่วม จากข้อมูลทางการ + รายงานประชาชนที่ verify แล้ว
2. **ช่องทางแจ้งเหตุ** — ประชาชนส่งได้ 2 แบบ
   - `flood_report` รายงานน้ำท่วม (พิกัด, รูป, ระดับน้ำ)
   - `sos` ขอความช่วยเหลือ (พิกัด, จำนวนคน, ประเภทความช่วยเหลือ, ช่องทางติดต่อ)
3. **Verify อัตโนมัติ** — ให้คะแนนความน่าเชื่อถือ ให้คนตรวจเฉพาะเคสที่ระบบตัดสินไม่ได้

## 2. Tech Stack (ฟรีทั้งหมด)

| ส่วน | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Frontend | Nuxt 3 (`nuxt generate` → static) | mobile-first, ภาษาไทย |
| Hosting | Cloudflare Pages | ฟรี, ใช้ `*.pages.dev` ได้ |
| แผนที่ | MapLibre GL + OpenFreeMap tiles | ห้ามใช้ Google Maps API |
| Cache ข้อมูล (Phase 0) | Cloudflare Workers KV | free tier, ไม่ต้องมี DB |
| DB / Storage / Auth (Phase 1) | Supabase (Postgres + PostGIS) | free tier |
| Login | Supabase Auth (email) **เฉพาะแอดมิน/อาสา** | ประชาชนแจ้งได้โดยไม่ต้อง login — ระบุตัวด้วยเบอร์โทร |
| Anti-spam | Cloudflare Turnstile | ฟรี |
| Data ingest / scoring | Cloudflare Workers + Cron Triggers | ทุก 5–10 นาที |
| AI ตรวจรูป | Gemini Flash (free tier) | เรียกเฉพาะเคสกำกวม |
| ช่องทางแจ้ง | เว็บฟอร์มเท่านั้น + ช่องเบอร์โทรติดต่อกลับ | **ไม่ทำ LINE OA** ในรอบนี้ |

> ⚠️ ลิมิต free tier เปลี่ยนบ่อย — ตรวจหน้า pricing ปัจจุบันก่อน deploy

## 3. แหล่งข้อมูลทางการ

### 3.1 ดึงเข้าระบบ (data layer บนแผนที่)

| แหล่ง | ข้อมูล | สถานะ API | Phase |
|---|---|---|---|
| คลังข้อมูลน้ำแห่งชาติ `thaiwater.net` (One Map น้ำ `/new4all`) | ระดับน้ำสถานีหลัก, ปริมาณน้ำในเขื่อน, อัตราระบาย, ฝน 24 ชม. — **ทั้งประเทศ** | public API | 0 |
| Traffy Fondue (NECTEC × กทม.) | เรื่องร้องเรียนที่มีคำว่า "ท่วม" | public share API | 0 |
| สำนักการระบายน้ำ กทม. `weather.bangkok.go.th/flood` | เซนเซอร์วัดน้ำท่วมถนน | **ไม่มี API ทางการ** เว็บบล็อก client ที่ไม่ใช่เบราว์เซอร์ → ขอ feed จาก กทม. | 0 (ถ้าเข้าถึงได้) |
| กทม. `weather.bangkok.go.th/rain` | ฝนรายสถานีใน กทม. | ไม่มี API ทางการ — ตรวจสอบเหมือนข้างบน | 1 |
| กทม. `weather.bangkok.go.th/KlongMap` | อัตราการไหลของคลอง | ไม่มี API ทางการ, เว็บล่มบ่อย → cache + fallback | 1 |
| **GISTDA Disaster Platform** | พื้นที่น้ำท่วมจากดาวเทียม ย้อนหลัง 1/3/7/30 วัน + พื้นที่ท่วมซ้ำซาก — **ทั้งประเทศ** | **Open API (JSON) + WMS/WMTS/TMS** ที่ `api-gateway.gistda.or.th/api/2.0/resources` ต้องสมัครรับ API key ฟรี | 1 (เลเยอร์ tile ใส่ MapLibre ได้ตรงๆ) |
| **Google Flood Forecasting API** | พยากรณ์น้ำล้นตลิ่งตามสถานีวัด ล่วงหน้าหลายวัน (`SearchLatestFloodStatusByArea`, `QueryGaugeForecasts`) | ต้องขอสิทธิ์เข้าถึงจาก Google — สมัครไว้ก่อน | 2 |
| กรมอุตุนิยมวิทยา `data.tmd.go.th` | ประกาศเตือนภัย | ต้องสมัคร UID/UKEY ฟรี | 1 |
| กรมทางหลวง HDMS `hdms.doh.go.th/dashboard` | จุดน้ำท่วม/ผ่านไม่ได้บนทางหลวง | ไม่พบ public API — ตรวจ network ของ dashboard แล้วขออนุญาตก่อนดึง; ถ้าไม่ได้ให้ลิงก์ออก | 2 |
| Longdo Traffic `traffic.longdo.com` | เหตุการณ์จราจร/น้ำท่วมจากผู้ใช้ + CCTV | Longdo Map API มี key ฟรี — ตรวจ terms เรื่องการแสดงผล | 2 |
| OpenGISData-Thailand | ขอบเขตเขต/จังหวัด | GeoJSON | 0 |

### 3.2 ลิงก์ออกเท่านั้น (ไม่ดึงข้อมูล — ใส่ในหน้า `/links`)
- CCTV กทม. `cpudapp.bangkok.go.th/bmatraffic` — CCTV มีเงื่อนไขการใช้งาน ห้าม embed/re-stream
- เรดาร์ฝน: กรมอุตุฯ `weather.tmd.go.th` (แอป Thai Weather), Windy `windy.com`
- Google Flood Hub `sites.research.google/floods` — อ่านง่ายสำหรับคนทั่วไป
- แอปเช็คน้ำ GISTDA, `disaster.gistda.or.th/flood`
- กรมทางหลวงชนบท `scs.drr.go.th` (สถานะสายทาง), รฟท. `ttsview.railway.co.th/v3/` (สถานะรถไฟ)

**งานแรกของ Claude Code:** ตรวจ endpoint จริงของแต่ละแหล่ง (ดูตัวอย่าง parser ได้ที่ repo โอเพนซอร์ส `github.com/Ton-Munoi99/bangkok-flood-watch-3d`) เขียน adapter แยกต่อแหล่ง พร้อม snapshot สำรองเมื่อดึงไม่ได้ และหน้าเว็บต้อง **ระบุเวลาอัปเดตล่าสุดของแต่ละแหล่งเสมอ**

## 4. Architecture

### 4.1 Phase 0 — ไม่ต้องมีฐานข้อมูล
```
[ผู้ใช้ มือถือ] ── Cloudflare Pages (Nuxt static)
      │  อ่าน: GET /api/data/{source}.json  (Worker, cache 2–5 นาที)
      ▼
[Cloudflare Worker]
   ├─ Cron ทุก 5–10 นาที: ดึง thaiwater / Traffy / BMA (ถ้าได้) / GISTDA (ถ้ามี key)
   │    → normalize เป็น GeoJSON → เก็บใน Workers KV (key ต่อแหล่ง + fetched_at)
   ├─ ถ้าดึงไม่ได้: คงข้อมูลชุดเดิมไว้ + ติด flag stale
   └─ GET /api/data/* อ่านจาก KV ส่งให้หน้าเว็บ (CORS เฉพาะโดเมนเรา)
```
- ใช้ Workers KV (free tier) แทน Supabase — เขียนน้อยครั้ง (ทุก 5–10 นาที) อ่านเยอะ เหมาะกับ KV
- รูปแบบข้อมูลกลาง: GeoJSON FeatureCollection, properties อย่างน้อย `source, name, value, unit, level ('normal'|'watch'|'warning'|'critical'), observed_at`
- ผู้ใช้ไม่ยิงตรงไปแหล่งข้อมูลทางการ

### 4.2 Phase 1 — เพิ่มระบบแจ้งเหตุ (ยังไม่ทำ)
```
[ผู้ใช้ มือถือ] ── Cloudflare Pages (Nuxt static)
      │  อ่าน: Supabase (anon key + RLS, อ่านเฉพาะ view สาธารณะ)
      │  เขียน: Worker /api/report (Turnstile + rate limit) ──► Supabase
      ▼
[Cloudflare Worker Cron]
   ├─ ingest: thaiwater / Traffy / BMA → ตาราง official_signals
   └─ score: คำนวณคะแนนรายงานใหม่ → อัปเดต status
[หน้า /admin] ── Supabase Auth (อาสาสมัคร/แอดมิน) ── คิวตรวจ + คิว SOS
```

ผู้ใช้ **ไม่ยิงตรง** ไปแหล่งข้อมูลทางการ — Worker ดึงมา cache ไว้ใน DB

## 5. Database Schema (Supabase) — Phase 1

```sql
create extension if not exists postgis;

create table reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('flood_report','sos')),
  location geography(Point,4326) not null,
  water_level text check (water_level in ('ankle','knee','waist','chest','impassable')),
  description text,
  photo_path text,                 -- Supabase Storage
  photo_exif_time timestamptz,
  photo_exif_location geography(Point,4326),
  contact_phone text,              -- เบอร์ติดต่อกลับ: บังคับสำหรับ SOS, ไม่บังคับสำหรับ flood_report — ห้ามเปิดสาธารณะ
  phone_hash text,                 -- sha256(normalized phone + secret salt) ใช้นับประวัติผู้แจ้ง/กันสแปม
  -- SOS เท่านั้น
  people_count int,
  backup_phone text,               -- เบอร์สำรอง (ญาติ) ไม่บังคับ — ห้ามเปิดสาธารณะ
  needs text[],                    -- 'evacuation','medical','food','elderly','disabled','children'
  -- verification
  score int default 0,
  score_breakdown jsonb,
  status text not null default 'pending'
    check (status in ('pending','verified','needs_review','rejected','resolved')),
  sos_priority int,                -- 1 = ด่วนสุด
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '6 hours'
);
create index on reports using gist(location);
create index on reports(status, created_at desc);

create table official_signals (
  id text primary key,             -- source + source_id
  source text not null,            -- 'bma_sensor','thaiwater','traffy'
  location geography(Point,4326) not null,
  value numeric,                   -- ระดับน้ำ (ซม.) หรือฝน (มม.)
  flooded boolean,
  raw jsonb,
  observed_at timestamptz not null
);
create index on official_signals using gist(location);

create table reporter_stats (
  phone_hash text primary key,     -- ระบุตัวผู้แจ้งด้วยเบอร์ (hash)
  verified_count int default 0,
  rejected_count int default 0
);

-- view สาธารณะ: ไม่มีเบอร์โทร, SOS แสดงพิกัดแบบหยาบ
create view public_reports as
select id, type, water_level, status, created_at,
  case when type = 'sos'
       then ST_SnapToGrid(location::geometry, 0.005)::geography  -- ~500 ม.
       else location end as location,
  case when type = 'flood_report' then photo_path end as photo_path
from reports
where status in ('verified','needs_review') and expires_at > now();
```

เปิด RLS ทุกตาราง: `anon` อ่านได้เฉพาะ `public_reports` และ `official_signals`; เขียนผ่าน Worker (service role) เท่านั้น

## 6. [Phase 1] อัลกอริทึม Verify (ขั้นบันได — ถูกก่อน แพงทีหลัง)

**ขั้น 1 — กฎฟรี (ทุกรายงาน)**

| สัญญาณ | คะแนน |
|---|---|
| EXIF เวลาอยู่ภายใน 2 ชม. | +15 |
| EXIF พิกัดห่างจากหมุด < 300 ม. | +15 |
| รูปไม่มี EXIF | 0 (ไม่หักคะแนน — หลายแอปลบ EXIF) |
| มีรายงานอื่นจาก **ผู้แจ้งต่างคน** ในรัศมี 300 ม. / 2 ชม. | +15 ต่อราย (สูงสุด +30) |
| เซนเซอร์ กทม. / Traffy ใกล้เคียงยืนยันน้ำท่วม (500 ม. / 3 ชม.) | +25 |
| ฝนสะสม 24 ชม. ในเขตนั้น > 60 มม. | +10 |
| ผู้แจ้งใส่เบอร์ติดต่อ (รูปแบบเบอร์ไทยถูกต้อง) | +5 |
| ผู้แจ้งมีประวัติ verified ≥ 3 และ rejected = 0 | +10 |
| ผู้แจ้งมีประวัติ rejected ≥ 2 | −30 |

> เบอร์ไม่ได้ยืนยันด้วย OTP (ประหยัดค่า SMS) จึงให้น้ำหนักน้อย — ใช้หลักเพื่อ **ให้แอดมิน/อาสาโทรกลับยืนยันเคสกำกวมหรือ SOS ได้** และนับประวัติผ่าน `phone_hash`
> Rate limit เพิ่ม: เบอร์เดียวกันส่งได้ไม่เกิน 10 รายงาน / ชม.

**ขั้น 2 — ตัดสิน**
- `score ≥ 60` → `verified` (ขึ้นแผนที่ทันที)
- `30 ≤ score < 60` และมีรูป → ส่ง **Gemini Flash** ถามว่า "รูปนี้มีน้ำท่วมถนนจริงไหม ระดับประมาณไหน" ตอบ JSON `{flooded: bool, level, confidence}` — ถ้า flooded && confidence ≥ 0.7 → +25
- ที่เหลือ → `needs_review` (แสดงบนแผนที่เป็นหมุดจาง "ยังไม่ยืนยัน")
- เก็บเหตุผลทุกข้อใน `score_breakdown` ให้แอดมินเห็น

**ขั้น 3 — หมดอายุ** รายงานน้ำท่วมหายจากแผนที่หลัง 6 ชม. ถ้าไม่มีรายงานใหม่ยืนยันซ้ำ (น้ำลดเร็ว)

### ⚠️ กฎเหล็กสำหรับ SOS
- **SOS ห้าม reject อัตโนมัติ ไม่ว่าคะแนนเท่าไร** — ระบบใช้คะแนนแค่จัด `sos_priority` เท่านั้น
- ความเร่งด่วนสูงสุด: ระดับน้ำ chest/impassable, มีผู้สูงอายุ/ผู้ป่วย/ผู้พิการ/เด็กเล็ก, needs = medical
- ทุก SOS แสดงในคิวแอดมินทันที และหน้าส่ง SOS ต้องแสดงปุ่มโทร (`tel:`) ได้ทันที — ระบบเราเป็นช่องทางเสริม ไม่ใช่ทดแทนสายด่วน:
  - **1784 ปภ.** ขอความช่วยเหลือ/อพยพ (ทั้งประเทศ) + LINE `@1784DDPM`
  - **1669** เจ็บป่วยฉุกเฉิน (สพฉ.)
  - **1555** กทม. (แสดงเมื่อพิกัดอยู่ใน กทม.)
  - แสดงคำเตือนความปลอดภัยไฟฟ้า: **1130 กฟน.** (กทม.–นนทบุรี–สมุทรปราการ) / **1129 กฟภ.** (จังหวัดอื่น) — เลือกตามพิกัด
- เบอร์โทรผู้ขอ SOS เห็นได้เฉพาะแอดมิน (PDPA)

## 7. หน้าเว็บ

| หน้า | รายละเอียด |
|---|---|
| `/` | แผนที่เต็มจอ: เลเยอร์เซนเซอร์ทางการ / รายงาน verified / ยังไม่ยืนยัน, ค้นหาชื่อถนน-เขต, legend, เวลาอัปเดตแต่ละแหล่ง, ปุ่มลอย "แจ้งน้ำท่วม" และ "ขอความช่วยเหลือ" (สีแดง) |
| `/report` | ใช้ GPS อัตโนมัติ (ลากหมุดแก้ได้), ถ่ายรูป (ย่อฝั่งเบราว์เซอร์ ≤ 1280px, JPEG 0.7 **ก่อนย่อให้อ่าน EXIF เก็บไว้**), เลือกระดับน้ำเป็นรูปไอคอน (ตาตุ่ม/เข่า/เอว/อก/รถผ่านไม่ได้), ช่องเบอร์ติดต่อกลับ (ไม่บังคับ, `type=tel`, ตรวจรูปแบบเบอร์ไทย 0XXXXXXXXX), Turnstile |
| `/sos` | ฟอร์มสั้นที่สุด ใช้งานได้แม้เน็ตช้า, ปุ่มโทร 1784/1669/1555 อยู่บนสุด, **ช่องเบอร์ติดต่อกลับ (บังคับ)** + เบอร์สำรองของญาติ (ไม่บังคับ), หลังส่งแสดงเลขเคส + ข้อความ "เจ้าหน้าที่/อาสาจะโทรกลับที่เบอร์นี้ กรุณาเปิดเครื่องไว้" |
| `/links` | รวมเครื่องมือรัฐ/เอกชน (ข้อ 3.2) จัดหมวด: ระดับน้ำ-เขื่อน / เรดาร์ฝน / ถนน-CCTV / พยากรณ์ + สายด่วนทั้งหมดเป็นปุ่มโทรได้: 1784, 1669, 1555, 1586 (ทล.), 1146 (ทช.), 1130/1129 — เป็นหน้า static ทำเสร็จเร็ว ใส่ใน Phase 0 |
| `/admin` | คิว SOS (เรียง priority) + คิว needs_review พร้อม score_breakdown, **ปุ่มโทรกลับ (`tel:`) ในแต่ละเคส**, ช่องบันทึกผลการโทร, ปุ่ม verify / reject / resolved ปุ่มเดียวจบ |

UX: ภาษาไทยทั้งหมด, ปุ่มใหญ่, ใช้ได้บนมือถือจอเล็กและเน็ตอ่อน, รองรับ dark mode

## 8. Anti-abuse — Phase 1
- Turnstile ทุกฟอร์ม
- Rate limit ใน Worker: 5 รายงาน / IP / 10 นาที
- ขนาดรูปสูงสุด 2 MB หลังย่อ, รับเฉพาะ image/jpeg, image/png, image/webp
- ไม่แสดงรูปจากรายงานที่ยังไม่ verify บนหน้าสาธารณะ
- Rate limit ตามเบอร์: 10 รายงาน / เบอร์ / ชม.
- เบอร์โทรเก็บแบบ normalize (`0XXXXXXXXX`) ห้ามปรากฏใน view สาธารณะ, log, หรือ error message

## 9. ลำดับการทำงาน

**Phase 0 — แดชบอร์ดรวมข้อมูล (read-only) ← ทำรอบนี้**
1. ตรวจ endpoint จริงของ thaiwater, Traffy, BMA sensor (+ GISTDA ถ้าได้ key แล้ว) เขียน adapter แยกต่อแหล่ง → GeoJSON กลาง + snapshot สำรอง
2. Worker: Cron ingest → KV, และ `GET /api/data/*`
3. หน้า `/` แผนที่:
   - เลเยอร์เปิด/ปิดได้: ระดับน้ำ-ฝน (thaiwater), เซนเซอร์น้ำท่วมถนน กทม., เรื่องร้องเรียนน้ำท่วม (Traffy, 24 ชม.), พื้นที่ท่วมจากดาวเทียม GISTDA (ถ้ามี key)
   - สีตาม `level`, แตะหมุดแล้วเห็นค่า + แหล่ง + เวลา
   - แถบบน: เวลาอัปเดตล่าสุดของแต่ละแหล่ง, แสดงป้าย "ข้อมูลอาจไม่เป็นปัจจุบัน" ถ้า stale > 30 นาที
   - รายการสรุป "ถนน/จุดที่น้ำท่วมตอนนี้" แบบ list ใต้แผนที่ (อ่านง่ายกว่าแผนที่บนมือถือ) เรียงตามความรุนแรง กรองตามเขต/จังหวัดได้
   - ปุ่มลอย "สายด่วน" เปิด bottom sheet: 1784, 1669, 1555, 1586, 1146, 1130/1129 เป็นปุ่ม `tel:`
4. หน้า `/links` (static) — ข้อ 3.2 + สายด่วนทั้งหมด
5. ข้อความ disclaimer ท้ายหน้า: รวบรวมจากแหล่งทางการ ไม่ใช่หน่วยงานรัฐ, ขอความช่วยเหลือให้โทร 1784 / 1669
6. Deploy Cloudflare Pages + Worker, ทดสอบบนมือถือจริง, ทดสอบกรณีแหล่งข้อมูลล่ม

**Phase 1 — ระบบแจ้งเหตุ + verify**
- Supabase (ข้อ 5), `/report`, `/sos`, `/admin`, scoring ขั้น 1 (ข้อ 6), anti-abuse (ข้อ 8)
- GISTDA ใช้เป็นสัญญาณ verify เพิ่ม (+15 ถ้ารายงานอยู่ในพื้นที่ท่วม 3 วันล่าสุด)
- เลเยอร์เขื่อนทั้งประเทศจาก thaiwater + ประกาศเตือนภัยกรมอุตุฯ
- Gemini Flash สำหรับเคสกำกวม, reporter_stats ผ่าน `phone_hash`
- ค้นหาถนน, แชร์ลิงก์จุดน้ำท่วม

**Phase 2**
- ติดต่อ กทม. ขอ feed ทางการของเซนเซอร์น้ำบนถนน
- ขยายทั้งประเทศ (ทางหลวงจาก HDMS, Longdo; พยากรณ์จาก Google Flood Forecasting API)

## 10. Definition of Done

**Phase 0**
- [ ] เปิดหน้าแรกบนมือถือแล้วเห็นแผนที่พร้อมข้อมูลทางการ ภายใน 3 วินาทีบน 4G
- [ ] ทุกเลเยอร์แสดงแหล่งที่มาและเวลาอัปเดต
- [ ] ปิดแหล่งข้อมูลใดแหล่งหนึ่งแล้ว หน้าเว็บยังทำงาน และขึ้นป้าย stale ถูกต้อง
- [ ] ปุ่มสายด่วนกดโทรได้จริงบน iOS/Android
- [ ] คนเข้าพร้อมกันมากๆ ไม่ทำให้ยิงไปแหล่งข้อมูลทางการเพิ่ม (อ่านจาก KV เท่านั้น)
- [ ] ค่าใช้จ่ายรายเดือน = 0 (ยกเว้นโดเมนถ้าซื้อ)

**Phase 1**
- [ ] แจ้งน้ำท่วมพร้อมรูปได้ภายใน 30 วินาที
- [ ] ส่ง SOS ได้ และแอดมินเห็นในคิวทันที
- [ ] รายงาน 3 ฉบับจากคนต่างกันในจุดเดียวกัน ถูก verify อัตโนมัติ
- [ ] ข้อมูลส่วนตัว (เบอร์, พิกัดแม่นยำของ SOS) ไม่หลุดผ่าน anon key — ทดสอบด้วยการ query ตรง

## 11. Environment Variables
```
# Phase 0
GISTDA_API_KEY=                 # ไม่บังคับ — สมัครฟรีที่ api-gateway.gistda.or.th (ไม่มีก็ข้ามเลเยอร์นี้)
ALLOWED_ORIGIN=                 # โดเมนหน้าเว็บ สำหรับ CORS
# KV namespace binding: FLOOD_DATA (ตั้งใน wrangler.toml)

# Phase 1
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Worker เท่านั้น ห้ามอยู่ใน frontend
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
GEMINI_API_KEY=
TMD_UID= / TMD_UKEY=            # สมัครที่ data.tmd.go.th
PHONE_HASH_SALT=                # Worker เท่านั้น — ใช้ hash เบอร์โทร

# Phase 2
LONGDO_MAP_KEY=
```
