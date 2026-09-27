// Cloudflare Worker — Phase 0 (CLAUDE.md ข้อ 4.1)
//   cron ทุก 10 นาที → ดึงทุกแหล่ง → FloodBundle → KV key เดียว ("bundle")
//   GET /api/data/all.json        ทุกแหล่งในไฟล์เดียว (หน้าเว็บใช้อันนี้ — อ่าน KV 1 ครั้ง/การเปิดหน้า)
//   GET /api/data/{source}.json   เฉพาะแหล่ง
//   GET /api/data/index.json      สถานะแต่ละแหล่ง (เวลาอัปเดต, stale, error) ไม่มี features
//   PUT /api/ingest               (Bearer INGEST_TOKEN) รับ {sources:{...}} จากสคริปต์ภายนอก แล้ว merge ลง KV
//   GET /health
// ผู้ใช้ไม่ยิงตรงไปแหล่งข้อมูลทางการ; แหล่งไหนล่มคงชุดเดิม + stale

import { ingestAll, mergeBundle } from '../../shared/adapters/index.ts';
import type { FloodBundle, FloodCollection, SourceId } from '../../shared/types.ts';
import { SOURCE_IDS, STALE_MS } from '../../shared/util.ts';

// ไม่ฝัง snapshot 1.2 MB ในโค้ดแล้ว — การประเมิน object literal ขนาดนั้นตอน cold start กิน CPU ไปหลาย ms
// (free plan มี 10 ms/ครั้ง) และ KV มีข้อมูลจริงแล้ว; ถ้า KV ว่างจริงๆ ตอบ bundle ว่างพร้อม flag ให้หน้าเว็บบอกผู้ใช้
const EMPTY_BUNDLE: FloodBundle = { generated_at: new Date(0).toISOString(), sources: {} };

// แหล่งที่ payload เล็กพอให้ cron ใน Worker ดึงเองภายในลิมิต CPU (สำรองกรณี GitHub Actions ล่าช้า)
// สสน. (1.4 + 4.6 MB) และ Traffy (2 MB/หน้า) parse ไม่ทันใน 10 ms → ให้ GitHub Actions ส่งเข้ามาทาง PUT /api/ingest แทน
const CRON_SOURCES: SourceId[] = ['bma_flood_road', 'gistda_flood'];

export interface Env {
  FLOOD_DATA: KVNamespace;
  /** R2 bucket สำหรับแจก all.json ผ่าน CDN (ไม่บังคับ — ถ้าไม่มี binding ก็เสิร์ฟจาก /api/data เท่านั้น) */
  DATA_BUCKET?: R2Bucket;
  ALLOWED_ORIGIN?: string;
  INGEST_TOKEN?: string;
  GISTDA_API_KEY?: string;
}

/** เขียน bundle ลง KV และ (ถ้ามี) R2 — R2 = ไฟล์สาธารณะ data.<domain>/all.json ที่ CDN cache ให้ ไม่กินโควตา Worker */
async function storeBundle(env: Env, bundle: FloodBundle | string) {
  const json = typeof bundle === 'string' ? bundle : JSON.stringify(bundle);
  await env.FLOOD_DATA.put(KV_KEY, json);
  if (env.DATA_BUCKET) {
    await env.DATA_BUCKET.put('all.json', json, {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: `public, max-age=${BROWSER_CACHE_S}, s-maxage=${EDGE_CACHE_S}` },
    }).catch((e) => console.error('R2 put failed', e));
  }
}

const KV_KEY = 'bundle';
const BROWSER_CACHE_S = 60; // max-age ฝั่งเบราว์เซอร์
const EDGE_CACHE_S = 120; // s-maxage / Cache API (ใช้ได้เมื่อผูกโดเมนของเราเอง)

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/** คำนวณ stale ตอนอ่าน — ไม่ต้องเขียน KV เพิ่มเมื่อดึงไม่สำเร็จ */
function markStale(bundle: FloodBundle, now = Date.now()): FloodBundle {
  const sources: FloodBundle['sources'] = {};
  for (const [id, c] of Object.entries(bundle.sources) as [SourceId, FloodCollection][]) {
    sources[id] = { ...c, stale: c.stale || now - Date.parse(c.fetched_at) > STALE_MS };
  }
  return { ...bundle, sources };
}

async function readBundle(env: Env): Promise<{ bundle: FloodBundle; fromSnapshot: boolean }> {
  const stored = await env.FLOOD_DATA.get(KV_KEY, { type: 'json', cacheTtl: 60 }) as FloodBundle | null;
  if (stored) return { bundle: markStale(stored), fromSnapshot: false };
  // KV ยังว่าง (deploy ใหม่ / ยังไม่เคย ingest) → bundle ว่าง; หน้าเว็บจะขึ้น "ไม่มีข้อมูล" จนกว่าจะมีการ PUT/ cron สำเร็จ
  return { bundle: EMPTY_BUNDLE, fromSnapshot: true };
}

async function runIngest(env: Env, only?: SourceId[]) {
  const previous = (await env.FLOOD_DATA.get(KV_KEY, { type: 'json' })) as FloodBundle | null;
  const outcome = await ingestAll({ previous, only, keys: { gistda: env.GISTDA_API_KEY }, log: (m) => console.log(m) });
  if (outcome.ok.length) await storeBundle(env, outcome.bundle);
  else console.error('ingest: every source failed; KV untouched');
  return outcome;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngest(env, CRON_SOURCES));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') return json({ ok: true, time: new Date().toISOString() }, 200, cors);

    // รับข้อมูลจากสคริปต์ภายนอก (GitHub Actions / เครื่องในไทยที่อ่านหน้า กทม. ได้)
    // ทางหลักของ production: cron ใน Worker ถูกฆ่าด้วยลิมิต CPU 10 ms (free plan) ตอน parse JSON หลาย MB
    // → ให้ Node ฝั่ง GitHub Actions ทำงานหนักแล้วส่ง bundle เต็มมา Worker เก็บเป็น text ตรงๆ ไม่ parse (CPU ≈ 0)
    if (url.pathname === '/api/ingest' && req.method === 'PUT') {
      const auth = req.headers.get('authorization') ?? '';
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors);
      const text = await req.text();
      if (text.length > 25_000_000) return json({ error: 'too large' }, 413, cors);
      if (req.headers.get('x-ingest-mode') === 'full') {
        // bundle เต็ม (สคริปต์ merge ชุดเดิมมาแล้ว) — ตรวจแค่หัวไฟล์ ไม่ JSON.parse
        if (!text.startsWith('{"generated_at":"')) return json({ error: 'not a bundle' }, 400, cors);
        await storeBundle(env, text);
        return json({ ok: true, mode: 'full', bytes: text.length }, 200, cors);
      }
      let body: { sources?: Partial<Record<SourceId, FloodCollection>> };
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'invalid json' }, 400, cors);
      }
      const previous = (await env.FLOOD_DATA.get(KV_KEY, { type: 'json' })) as FloodBundle | null;
      const merged = mergeBundle(previous, body.sources ?? {});
      await storeBundle(env, merged);
      return json({ ok: true, sources: Object.keys(body.sources ?? {}) }, 200, cors);
    }

    // เรียก ingest ด้วยมือ (ต้องมี token) — ไว้ทดสอบหลัง deploy
    if (url.pathname === '/api/ingest/run' && req.method === 'POST') {
      const auth = req.headers.get('authorization') ?? '';
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors);
      const outcome = await runIngest(env);
      return json({ ok: outcome.ok, failed: outcome.failed }, 200, cors);
    }

    const m = url.pathname.match(/^\/api\/data\/([a-z_]+)\.json$/);
    if (!m || req.method !== 'GET') return json({ error: 'not found' }, 404, cors);
    const what = m[1];

    // Cache API: ลดการอ่าน KV เมื่อคนเข้าพร้อมกันมาก (บน workers.dev จะข้ามไปเฉยๆ)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    }

    const { bundle, fromSnapshot } = await readBundle(env);
    let payload: unknown;
    if (what === 'all') payload = bundle;
    else if (what === 'index') {
      payload = {
        generated_at: bundle.generated_at,
        snapshot: fromSnapshot,
        sources: Object.fromEntries(
          Object.values(bundle.sources).map((c) => [c.source, { fetched_at: c.fetched_at, observed_at: c.observed_at, stale: c.stale, snapshot: c.snapshot, error: c.error, count: c.count, via: c.via }]),
        ),
      };
    } else if ((SOURCE_IDS as string[]).includes(what)) payload = bundle.sources[what as SourceId] ?? null;
    else return json({ error: 'unknown source', sources: SOURCE_IDS }, 404, cors);

    const res = json(payload, 200, {
      ...cors,
      'cache-control': `public, max-age=${BROWSER_CACHE_S}, s-maxage=${EDGE_CACHE_S}`,
      'x-data-snapshot': String(fromSnapshot),
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
} satisfies ExportedHandler<Env>;
