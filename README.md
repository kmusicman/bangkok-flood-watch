# Bangkok Flood Watch — Phase 0 (แดชบอร์ด read-only)

แผนที่น้ำท่วมรวมข้อมูลทางการ อัปเดตทุก 10 นาที ค่าใช้จ่าย 0 บาท (Cloudflare free tier + OpenFreeMap)
แผนงานเต็มดู [CLAUDE.md](CLAUDE.md) — รอบนี้ทำเฉพาะ **Phase 0**: แผนที่ + รายการ + `/links` + สายด่วน (ยังไม่มีระบบแจ้งเหตุ/SOS/admin)

## โครงสร้าง

```
shared/            โค้ดกลางที่ Worker, สคริปต์ และหน้าเว็บใช้ร่วมกัน
  types.ts         รูปแบบข้อมูลกลาง (GeoJSON FeatureCollection + metadata ต่อแหล่ง)
  adapters/        adapter แยกต่อแหล่ง: thaiwater.ts, bma.ts, traffy.ts (+ index.ts = ingestAll)
  data/bma_districts.json   รหัสเซนเซอร์ กทม. → เขต (สร้างจาก thaiwater flood_road)
  snapshots/       all.json = ข้อมูลตัวอย่างสำหรับ fallback/dev, raw/ = ตัวอย่าง API ดิบสำหรับเทสต์
worker/            Cloudflare Worker: cron ingest → KV, GET /api/data/*.json
web/               Nuxt 3 static (nuxt generate) → Cloudflare Pages
scripts/           ingest.ts (รันเอง/GitHub Actions), check-sources.ts (เทสต์ parser)
.github/workflows/ingest.yml   ingest บน GitHub Actions ทุก 10 นาที (ทางเลือกแทน cron ใน Worker)
```

## แหล่งข้อมูล (ตรวจ endpoint จริง 26 ก.ย. 2569)

| source id | แหล่ง | endpoint | หมายเหตุ |
|---|---|---|---|
| `thaiwater_waterlevel` | สสน. ระดับน้ำสถานีหลัก ทั้งประเทศ (~800 สถานี) | `api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` | public, ไม่ต้องใช้ key; level จาก `situation_level` (5 = ล้นตลิ่ง → critical) |
| `thaiwater_rain` | สสน. ฝนสะสม 24 ชม. (~4,300 สถานี) | `.../public/rain_24h` | เก็บเฉพาะ ≥ 10 มม.; เกณฑ์กรมอุตุฯ 35/90/150 มม. |
| `bma_flood_road` | สำนักการระบายน้ำ กทม. เซนเซอร์น้ำท่วมถนน (236 จุด) | หน้า `weather.bangkok.go.th/flood/` (HTML ฝัง `const floodData`) | **ไม่มี API ทางการ** เว็บตอบ 403 ให้ UA ที่ไม่ใช่เบราว์เซอร์ และมักตอบเฉพาะ IP ไทย → fallback ไป `.../public/flood_road` ของ สสน. (relay, บางครั้งค้างหลายชั่วโมง) → ถ้าไม่ได้ทั้งคู่ คงชุดเดิม + stale |
| `traffy_flood` | Traffy Fondue เรื่องร้องเรียนที่มีคำว่า "ท่วม" 24 ชม. | `publicapi.traffy.in.th/share/teamchadchart/search?limit=1000&offset=…` | API ไม่กรอง keyword ให้ → กรองเอง; วันฝนหนักมี > 2,500 เรื่อง/วัน |
| `gistda_flood` | GISTDA Disaster Platform พื้นที่น้ำท่วมจากดาวเทียม ทั้งประเทศ (กริด H3 ~0.1 ตร.กม./เซลล์) | `api-gateway.gistda.or.th/api/2.0/resources` — `features/flood/{1day,3days,7days,30days}` (JSON แบ่งหน้า limit ≤ 1000, **38,000+ เซลล์/วัน** → ดึงแค่ `limit=1` เอาจำนวน + รอบภาพ), `maps/flood/{period}/tms/{z}/{x}/{y}` (PNG 512px, เลขแถวแบบ **XYZ** แม้ชื่อ tms) | ใช้ **2 key**: key ไม่จำกัด (Worker/สคริปต์, `GISTDA_API_KEY`) และ key จำกัด HTTP referrer (`NUXT_PUBLIC_GISTDA_KEY` ใน `web/.env`) ให้เบราว์เซอร์โหลด tile ตรงจาก GISTDA — ไม่เปลือง quota Worker; `bbox`/`skipGeometry` ใช้ไม่ได้ |

รูปแบบกลางต่อ feature: `source, id, name, province, province_code, district, value, unit, level ('normal'|'watch'|'warning'|'critical'), observed_at, detail, url, photo, agency`
ต่อแหล่ง: `fetched_at, observed_at, via, stale, snapshot, error, count`

## รันในเครื่อง

```bash
npm install                 # Node ≥ 22.18 (รัน .ts ตรงได้ ไม่ต้อง build)
npm run check               # เทสต์ parser กับตัวอย่างใน shared/snapshots/raw
npm run check -- --live     # + ยิง endpoint จริงทุกแหล่ง รายงานสถานะ
npm run ingest:local        # ดึงข้อมูลสด → web/public/data/all.json (+ อัปเดต shared/snapshots/all.json)
npm run dev                 # http://localhost:3000 (หน้าเว็บอ่านจาก /data/all.json)
```

## Deploy (ฟรีทั้งหมด) — Worker เดียวเสิร์ฟทั้งเว็บและ API

Production: **https://flood-watch.flood-watch-worker.workers.dev** (deploy ครั้งแรก 26 ก.ย. 2569)
Cloudflare รวม Pages เข้ากับ Workers แล้ว → หน้าเว็บ static อยู่ใน `[assets]` ของ Worker เดียวกับ API (origin เดียว ไม่ต้องตั้ง CORS)

```bash
cd worker && npx wrangler login && cd ..
npx wrangler kv namespace create FLOOD_DATA --cwd worker   # ครั้งแรก: เอา id ไปใส่ worker/wrangler.toml
cd worker && npx wrangler secret put INGEST_TOKEN && npx wrangler secret put GISTDA_API_KEY && cd ..
npm run deploy            # = build:web (nuxt generate, NUXT_PUBLIC_DATA_BASE=/api/data, ตัด data/ ของ dev ออก) + wrangler deploy
curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://flood-watch.flood-watch-worker.workers.dev/api/ingest/run   # ingest รอบแรกทันที ไม่ต้องรอ cron
```
- อัปเดตครั้งต่อไป: `npm run deploy` คำสั่งเดียว
- ต้องยืนยันอีเมลของบัญชี Cloudflare ก่อน ไม่งั้น upload Worker จะขึ้น error 10034
- ผลรัน ingest จาก edge จริง (26 ก.ย. 2569): ดึงได้ครบทั้ง 5 แหล่ง รวมหน้า กทม. ด้วย (Traffy ต้องให้ timeout 75 วิ/หน้า)
- KV ใช้ key เดียว (`bundle`) → เขียน 1 ครั้ง/รอบ = 144 ครั้ง/วัน (ลิมิตฟรี 1,000) และหน้าเว็บอ่าน 1 ครั้ง/การเปิดหน้า (ลิมิตฟรี 100,000/วัน)
- ถ้า cron ใน Worker ล้มเพราะ **CPU เกิน 10 ms** (free plan) ให้เปิดใช้ `.github/workflows/ingest.yml` แทน (ตั้ง secrets `WORKER_URL`, `INGEST_TOKEN`) — Worker จะรับข้อมูลทาง `PUT /api/ingest`
- ถ้า Worker (IP ต่างประเทศ) ดึงหน้า กทม. ไม่ได้ ใช้เครื่องในไทยรัน `npm run ingest:push -- --only bma_flood_road` ผ่าน cron/launchd ทุก 10 นาที
  (ทดสอบใน `wrangler dev` เมื่อ 26 ก.ย. 2569: สสน. + Traffy ดึงผ่าน Worker ได้, หน้า กทม. ตอบ "internal error" จาก fetch ของ workerd — ต้องดูอีกทีหลัง deploy จริง)
- ทดสอบในเครื่อง: `cd worker && npx wrangler dev --test-scheduled` แล้ว `curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"` เพื่อยิง cron (ผลอยู่ใน log ของ wrangler, KV local อยู่ที่ `worker/.wrangler/state`)
- ก่อน KV มีข้อมูล Worker จะตอบ `shared/snapshots/all.json` พร้อม `snapshot: true` (หน้าเว็บขึ้นป้าย "ข้อมูลตัวอย่าง")

### GISTDA keys
ที่ `api-gateway.gistda.or.th` → API Keys → สร้าง 2 key: (1) ข้อจำกัด "ไม่มี" → `wrangler secret put GISTDA_API_KEY` (2) ข้อจำกัด "อ้างอิง HTTP" ใส่โดเมนเว็บ (`https://flood-watch.flood-watch-worker.workers.dev` + `http://localhost:3000` สำหรับ dev) → `web/.env` `NUXT_PUBLIC_GISTDA_KEY` (ถูก inline ตอน build) — ปุ่ม "แสดงผล API Key" โชว์ค่าที่ถูกบังไว้ ต้องกด "คัดลอก" เท่านั้นถึงได้ key จริง; ถ้าย้ายโดเมนต้องกลับไปแก้รายการ referrer

## ทดสอบกรณีแหล่งข้อมูลล่ม
- `ingestAll` ใช้ `Promise.allSettled` — แหล่งที่ล้มจะคงชุดเดิมจาก KV + `stale: true, error`
- อ่านจาก KV ทุกครั้งจะคำนวณ `stale` ใหม่ถ้า `fetched_at` เก่ากว่า 30 นาที (ไม่ต้องเขียน KV เพิ่ม)
- หน้าเว็บ: chip ของแหล่งขึ้นป้าย "ไม่เป็นปัจจุบัน" + banner เตือนด้านบน; ถ้าโหลด all.json ไม่ได้เลย ขึ้น banner แดงพร้อมลิงก์ไป `/links`

## Definition of Done (Phase 0) — สถานะ
- [x] เปิดหน้าแรกบนมือถือแล้วเห็นแผนที่พร้อมข้อมูลทางการ (all.json ≈ 430 KB gzip)
- [x] ทุกเลเยอร์แสดงแหล่งที่มาและเวลาอัปเดต
- [x] ปิดแหล่งข้อมูลใดแหล่งหนึ่งแล้วหน้าเว็บยังทำงาน และขึ้นป้าย stale
- [x] ปุ่มสายด่วนเป็น `tel:` ทุกเบอร์ (ทดสอบบนอุปกรณ์จริงหลัง deploy)
- [x] ผู้ใช้อ่านจาก KV เท่านั้น ไม่ยิงไปแหล่งทางการ
- [ ] Deploy Cloudflare Pages + Worker และทดสอบบนมือถือจริงบน 4G
