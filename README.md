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
worker/            Cloudflare Worker: เก็บ bundle (text) ใน KV, GET /api/data/{all,index}.json, cron สะกิด GitHub — ไม่ parse อะไรเอง
web/               Nuxt 3 static (nuxt generate) → Cloudflare Pages
scripts/           ingest.ts (รันเอง/GitHub Actions), check-sources.ts (เทสต์ parser), build-cctv-dds.ts (กล้องจุดน้ำท่วม)
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

Production: **https://bangkokflood.com** (โดเมนซื้อผ่าน Cloudflare Registrar 26 ก.ย. 2569, zone id `4b0518ca…`; `www.bangkokflood.com` เสิร์ฟเหมือนกัน, โฮสต์ `*.workers.dev` ปิดแล้ว)
Cloudflare รวม Pages เข้ากับ Workers แล้ว → หน้าเว็บ static อยู่ใน `[assets]` ของ Worker เดียวกับ API (origin เดียว ไม่ต้องตั้ง CORS)

```bash
cd worker && npx wrangler login && cd ..
npx wrangler kv namespace create FLOOD_DATA --cwd worker   # ครั้งแรก: เอา id ไปใส่ worker/wrangler.toml
cd worker && npx wrangler secret put INGEST_TOKEN && npx wrangler secret put GITHUB_DISPATCH_TOKEN && cd ..   # GISTDA_API_KEY อยู่ฝั่ง GitHub secrets ไม่ใช่ Worker
npm run deploy            # = build:web (nuxt generate, NUXT_PUBLIC_DATA_BASE=/api/data, ตัด data/ ของ dev ออก) + wrangler deploy
curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://bangkokflood.com/api/ingest/dispatch   # สั่ง GitHub Actions ดึงรอบแรกทันที (หรือ npm run ingest:push จากเครื่องนี้)
```
- อัปเดตครั้งต่อไป: `npm run deploy` คำสั่งเดียว
- โดเมน: `routes` แบบ `custom_domain = true` ใน `worker/wrangler.toml` — wrangler สร้าง DNS + ใบรับรองให้ตอน deploy (www ใช้เวลาออกใบรับรองไม่กี่นาที)
- โควตาฟรีที่เป็นเพดานจริง: **Worker 100,000 คำขอ/วัน** (static assets ไม่นับ) — หน้าเว็บโหลด all.json 1 ครั้ง/การเปิด + ทุก 5 นาทีที่เปิดค้าง; ถ้าจะให้รับได้ไม่จำกัดให้เปิด R2 แล้วเพิ่ม binding `DATA_BUCKET` (โค้ดรองรับแล้วใน `storeBundle`) และชี้ `NUXT_PUBLIC_DATA_BASE` ไปที่ custom domain ของ bucket
- ต้องยืนยันอีเมลของบัญชี Cloudflare ก่อน ไม่งั้น upload Worker จะขึ้น error 10034
- KV ใช้ key เดียว (`bundle`, ≈ 3 MB text) → เขียน 1 ครั้ง/รอบ = 144 ครั้ง/วัน (ลิมิตฟรี 1,000) และหน้าเว็บอ่าน 1 ครั้ง/การเปิดหน้า (ลิมิตฟรี 100,000/วัน)
- **Worker ห้าม `JSON.parse` bundle ในทุกเส้นทาง** — 28 ก.ย. 2569 ทุก `GET /api/data/*` ตอบ 503 (error 1102 `exceededResources`) เพราะเส้นทางอ่านเคย parse 3 MB ทุกครั้งที่ edge cache หมด (CPU p99 66–90 ms ต่อคำขอ เกินลิมิต free plan) → ตอนนี้ `all.json` = text จาก KV ตรงๆ, `index.json` = อ่านเฉพาะหัวไฟล์ (`index` ที่ `scripts/ingest.ts` ฝังไว้ **ก่อน** `sources` ผ่าน `withIndex()`), endpoint ต่อแหล่ง `{source}.json` ถูกตัดออก
- **ตัวดึงข้อมูลหลัก = GitHub Actions** (`.github/workflows/ingest.yml` ทุก 10 นาที → `PUT /api/ingest` แบบ `x-ingest-mode: full`, Worker เก็บ text ตรงๆ ไม่ parse) — ยืนยันแล้ว 27 ก.ย. 2569 ว่า cron ใน Worker ถูกฆ่าด้วยลิมิต CPU 10 ms ของ free plan (สถานะ `exceededResources` ทุกรอบ) ตอน parse JSON ของ สสน./Traffy; cron ใน Worker **ไม่ดึงอะไรเองแล้ว** (แม้ BMA+GISTDA ก็ต้อง parse ชุดเดิม 3 MB ตอน merge → ถูกฆ่าที่ 10 ms ทุกรอบ ตรวจ 28 ก.ย. 2569) เหลือแค่สะกิด GitHub; ถ้า GitHub ล่มข้อมูลจะค้างและหน้าเว็บขึ้นป้าย "ไม่เป็นปัจจุบัน"
- **หน้า กทม. ยิงตรงแค่ทุก 30 นาที** (รอบที่เริ่มนาที 0–9 และ 30–39 ตามนาฬิกา UTC; ปรับได้ด้วย `BMA_DIRECT_EVERY_MIN`, บังคับด้วย `BMA_DIRECT=1/0`) — ไฟร์วอลล์ของ `weather.bangkok.go.th` จำกัดครั้งต่อ IP (28 ก.ย. 2569: IP ไทยได้ 200 ครั้งแรกแล้ว 403 ติดกัน, runner GitHub โดน 403 ตั้งแต่ 16:22 น.) รอบอื่นใช้ relay ของ สสน. อย่างเดียว; ถ้า relay ก็เก่า รอบนั้นคงชุดเดิมทั้งก้อน (`SkipRound`) ไม่เขียน error ทับ
- Secrets ใน GitHub repo: `WORKER_URL=https://bangkokflood.com`, `INGEST_TOKEN` (จาก `.env`), `GISTDA_API_KEY` (จาก `.env`)
- **ตัวจับเวลา = cron ของ Cloudflare** (ตรงเวลา) ซึ่งเรียก GitHub `workflow_dispatch` ทุก 10 นาที (`dispatchGithub` ใน Worker, secret `GITHUB_DISPATCH_TOKEN` = fine-grained PAT สิทธิ์ Actions read/write เฉพาะ repo นี้; `GITHUB_REPO` ใน wrangler.toml) — `on: schedule` ของ GitHub เก็บไว้เป็นสำรองแต่ไม่ตรงเวลา/ไม่เริ่มสำหรับ repo ใหม่ (27 ก.ย. 2569 รอ 1 ชม. ไม่ยิงเลย); ทดสอบด้วย `POST /api/ingest/dispatch` (Bearer INGEST_TOKEN) → `github_status: 204`
- ถ้า PAT หมดอายุ: cron จะ log `github dispatch → 401` และข้อมูล สสน./Traffy จะค้าง → สร้าง PAT ใหม่แล้ว `wrangler secret put GITHUB_DISPATCH_TOKEN`
- ดูสถิติ cron/CPU: GraphQL `workersInvocationsAdaptive` (dimensions `datetimeHour, status`) — `exceededResources` = โดนลิมิต
- ทดสอบในเครื่อง: `cd worker && npx wrangler dev` แล้ว `npm run ingest:push` (WORKER_URL=http://localhost:8787) — KV local อยู่ที่ `worker/.wrangler/state`
- ก่อน KV มีข้อมูล Worker จะตอบ bundle ว่างพร้อม header `x-data-snapshot: true` (หน้าเว็บขึ้น "ไม่มีข้อมูล")

### สถิติผู้เข้าชม
- **Cloudflare Web Analytics** (ฟรี, ไม่ใช้คุกกี้): เปิดไว้แล้วสำหรับ `bangkokflood.com` แบบ *Automatic setup* (Cloudflare ฉีด beacon ให้เองที่ edge ไม่ต้องแก้โค้ด) — ดูที่ dashboard → Analytics → Web analytics; ส่วนจำนวนคำขอ/error ของ API ดูที่ Workers & Pages → flood-watch → Metrics
- **Google Analytics 4**: ติดแล้ว (`NUXT_PUBLIC_GA_ID` ใน `web/.env`, property "Bangkok Flood Watch") — `components/CookieConsent.vue` โหลด gtag **หลังผู้ใช้กดยอมรับ** เท่านั้น (PDPA), จำคำตอบใน localStorage key `cookie-consent`; ก่อนยอมรับไม่มีคำขอไป Google เลย
- ถ้าโฮสต์ที่อื่นที่ไม่ผ่าน Cloudflare: ใส่ `NUXT_PUBLIC_CF_BEACON=<token>` (จาก Manage site → JS snippet) แทน automatic setup

### หน้ารายพื้นที่ (SEO)
- `/bangkok/` + `/bangkok/<slug>/` 50 เขต และ `/province/` + `/province/<slug>/` 76 จังหวัด, `/en/` ภาษาอังกฤษ — รายชื่อ/slug อยู่ใน `web/data/areas.ts` (ค่า `th` ต้องตรงกับ `district`/`province` ในข้อมูล)
- `scripts/build-static-pages.ts` (รันอัตโนมัติก่อน dev/generate) สร้าง `web/data/areas-static.json` (ชื่อเซนเซอร์/สถานีต่อพื้นที่ → ข้อความคงที่ใน HTML) และ `web/public/sitemap.xml` (131 URL + lastmod)
- ทุกหน้าใช้ `components/FloodDashboard.vue` เดียวกัน ส่ง `province`/`district` เพื่อกรองรายการและซูมแผนที่

### ปุ่มแชร์
`components/ShareButton.vue` ใน header: มือถือใช้ Web Share API (แชร์เข้า LINE/Facebook/Messenger ตรงๆ) เดสก์ท็อปเป็นเมนู LINE / Facebook / X / คัดลอกลิงก์ ของ**หน้าปัจจุบัน** (หน้ารายเขตแชร์ลิงก์เขตนั้น) และส่ง event `share` ไป GA ถ้าผู้ใช้ยอมรับคุกกี้

### SEO / ให้ Google เจอ
- ใน HTML ที่ prerender แล้วมี `<h1>` + ย่อหน้าอธิบาย (`pages/index.vue` section.intro), title/description ภาษาไทย, canonical, Open Graph + Twitter card (`public/og.png` เรนเดอร์จาก `scratch/og.html` ด้วยเบราว์เซอร์ — PIL วาดสระ/วรรณยุกต์ไทยไม่ได้), JSON-LD `WebSite`, `public/robots.txt` (block `/api/`), `public/sitemap.xml`
- ถ้าแก้ `og.png` ให้เปลี่ยน `?v=` ใน `nuxt.config.ts` และ purge URL เดิมใน Cloudflare (Caching → Configuration → Custom Purge) เพราะ edge cache รูปไว้
- `www` → apex เป็น 301 ด้วย Redirect Rule ของ zone (template "Redirect from WWW to root")
- **Google Search Console:** เพิ่ม property แบบ *Domain* `bangkokflood.com` → ยืนยันด้วย TXT record ใน DNS ของ Cloudflare → ส่ง sitemap `https://bangkokflood.com/sitemap.xml` → ขอ index หน้า `/` และ `/links/` ด้วย URL Inspection

### GISTDA keys
ที่ `api-gateway.gistda.or.th` → API Keys → สร้าง 2 key: (1) ข้อจำกัด "ไม่มี" → `wrangler secret put GISTDA_API_KEY` (2) ข้อจำกัด "อ้างอิง HTTP" ใส่โดเมนเว็บ (`https://flood-watch.flood-watch-worker.workers.dev` + `http://localhost:3000` สำหรับ dev) → `web/.env` `NUXT_PUBLIC_GISTDA_KEY` (ถูก inline ตอน build) — ปุ่ม "แสดงผล API Key" โชว์ค่าที่ถูกบังไว้ ต้องกด "คัดลอก" เท่านั้นถึงได้ key จริง; ถ้าย้ายโดเมนต้องกลับไปแก้รายการ referrer

## โครงหน้าเว็บ (28 ก.ย. 2569 — ปรับตามภาพอ้างอิงของผู้ใช้ คงสี/โลโก้เดิม)
- `app.vue`: แถบบน = โลโก้ + บรรทัดเล็ก + h1 (คำนวณจาก route ใน `web/utils/headings.ts` — ห้ามให้หน้าตั้งค่าผ่าน state เพราะแถบบน render ก่อนหน้า → hydration mismatch) + ป้าย "ข้อมูล ณ / ดึงเมื่อ" (ซ่อนบนมือถือ) + ปุ่มแชร์; แถบเมนูล่างติดจอ 4 ปุ่ม (แผนที่ / รายเขต กทม. / รายจังหวัด / ลิงก์·สายด่วน); ปุ่มลอยสายด่วนสีแดงอยู่เหนือแถบเมนู
- `FloodDashboard.vue`: แถวเครื่องมือ (segmented กทม.|ทั้งประเทศ · ค้นหา · จังหวัด · เขต · ปุ่ม "ชั้นข้อมูล" เปิด `LayerPicker` · ล้างตัวกรอง) → แผนที่ซ้าย (3fr, sticky) + แผงขวา (2fr) แบบแท็บ **ภาพรวม** (`FloodOverview`: การ์ด "ดูจุดน้ำท่วมใกล้ฉัน", การ์ดนับสถานะ 2×2 แตะเพื่อกรองระดับทั้งรายการและหมุด, ต้องเฝ้าระวัง 5 อันดับ, ตัวเลขสรุป, สถานะแหล่งข้อมูล) / **รายการ** (`FloodList`) / **ใกล้ฉัน** (`FloodNearby`: geolocation ในเครื่อง เรียงตามระยะทาง + หมุดตำแหน่งบนแผนที่); มือถือ: เครื่องมือพับ 3 แถว แผนที่ 56vh แผงอยู่ใต้แผนที่
- ตัวกรอง/การนับอยู่ใน `composables/useFloodItems.ts` (แชร์ระหว่างแถวเครื่องมือ ภาพรวม รายการ); ข้อมูลกลางใน `useFloodData()` — `start()` เรียกครั้งเดียวจากแดชบอร์ด (หน้า /links ไม่โหลด 3 MB)
- ข้อความ SEO (h1 + ย่อหน้าอธิบาย) ยัง prerender: h1 อยู่ในแถบบน ย่อหน้าอยู่ในการ์ด "เกี่ยวกับข้อมูล" ใต้แดชบอร์ด

## กล้องที่จุดวัดน้ำท่วมถนน กทม. (มีภาพนิ่ง)
- ที่มา (แกะจากหน้า `floodbangkok.bangkok.go.th/device-info` 30 ก.ย. 2569 — เว็บ POPNIX Flood ใช้ต้นทางเดียวกัน): รายการกล้อง `…/bkk/dds/services/api/floods/v1/items/camera_profile?limit=-1` (876 ตัว, `SensorName` = รหัสเซนเซอร์ FL.xxx.nn ตรงกับ id หมุด "น้ำท่วมถนน กทม." ของเรา), ภาพนิ่ง `https://floodbangkok.bangkok.go.th/api/proxy?rtcUrl=<LiveStream>` → JPEG 1280×720/1920×1080 (5–10 วินาที/ภาพ, proxy ใช้ ffmpeg ตัดเฟรม; โฮสต์สตรีม `*.larry-cctv.com` ไม่มีใน DNS สาธารณะ)
- **ผ่าน Worker ไม่ได้**: floodbangkok ตอบ 403 ทุกคำขอจาก Cloudflare Worker (ลองทั้ง UA บอทและ header เบราว์เซอร์เต็มชุด) แต่ตอบ 200 ให้ IP ไทย รวมถึงคำขอที่ Referer เป็น bangkokflood.com → เบราว์เซอร์ผู้ใช้ขอภาพเอง **เฉพาะตอนแตะปุ่ม** (ไม่ preload ไม่ auto-refresh) — เป็นข้อยกเว้นของหลัก "ผู้ใช้ไม่ยิงแหล่งทางการตรง" ที่ผู้ใช้ต้องรับรู้
- proxy ของ กทม. รับโหลดได้น้อย: ยิงพร้อมกัน 12 แล้วเริ่มตอบ 500 "ffmpeg capture failed" → สคริปต์เช็คทีละ 3 + พัก 1 วิ
- `npm run build:cctv-dds` (= `scripts/build-cctv-dds.ts`) ดึงรายการ + เช็คกล้องละ 1 ครั้ง (ราว 45–60 นาที) → `web/data/cctv-dds.json` (จุดที่มีกล้องส่งภาพได้ + LiveStream ของแต่ละกล้อง) แล้ว commit + deploy — รันด้วยมือเป็นครั้งคราว
- หน้าเว็บ: เลเยอร์ "กล้องจุดน้ำท่วม" (ป้ายสีแบรนด์) + ปุ่มดูภาพใน popup ของเซนเซอร์น้ำท่วมถนนที่รหัสตรงกัน (📹 ในรายการ)
- ไม่ใช้: กล้องจราจร bmatraffic (ล่ม + CLAUDE.md ห้าม embed; เลเยอร์ตำแหน่งกล้องจราจร 185 จุดที่ลิงก์ไป Longdo ถูกเอาออกตามที่ผู้ใช้ขอ 30 ก.ย. 2569), กล้อง iTIC/กรมทางหลวง (`traffic.longdo.com/camera.json` 256 ตัว แต่ภาพนิ่ง `jpeg2.php` ตอบภาพว่าง มีแต่ HLS ต้องมีเซิร์ฟเวอร์ตัดเฟรม)

## ทดสอบกรณีแหล่งข้อมูลล่ม
- `ingestAll` ใช้ `Promise.allSettled` — แหล่งที่ล้มจะคงชุดเดิมจาก KV + `stale: true, error`
- ป้าย "ไม่เป็นปัจจุบัน" (fetched_at เก่ากว่า 30 นาที / GISTDA 24 ชม.) คำนวณฝั่งหน้าเว็บ (`SourceStatus.vue`) — Worker ไม่แตะเนื้อหา bundle
- หน้าเว็บ: chip ของแหล่งขึ้นป้าย "ไม่เป็นปัจจุบัน" + banner เตือนด้านบน; ถ้าโหลด all.json ไม่ได้เลย ขึ้น banner แดงพร้อมลิงก์ไป `/links`

## Definition of Done (Phase 0) — สถานะ
- [x] เปิดหน้าแรกบนมือถือแล้วเห็นแผนที่พร้อมข้อมูลทางการ (all.json ≈ 430 KB gzip)
- [x] ทุกเลเยอร์แสดงแหล่งที่มาและเวลาอัปเดต
- [x] ปิดแหล่งข้อมูลใดแหล่งหนึ่งแล้วหน้าเว็บยังทำงาน และขึ้นป้าย stale
- [x] ปุ่มสายด่วนเป็น `tel:` ทุกเบอร์ (ทดสอบบนอุปกรณ์จริงหลัง deploy)
- [x] ผู้ใช้อ่านจาก KV เท่านั้น ไม่ยิงไปแหล่งทางการ
- [ ] Deploy Cloudflare Pages + Worker และทดสอบบนมือถือจริงบน 4G
