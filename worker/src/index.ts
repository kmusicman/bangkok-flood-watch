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
import SNAPSHOT from '../../shared/snapshots/all.json' with { type: 'json' };

export interface Env {
  FLOOD_DATA: KVNamespace;
  ALLOWED_ORIGIN?: string;
  INGEST_TOKEN?: string;
  GISTDA_API_KEY?: string;
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
  // KV ยังว่าง (deploy ใหม่ / cron ยังไม่เคยสำเร็จ) → ใช้ตัวอย่างที่ฝังมา ติด flag snapshot ให้หน้าเว็บเตือน
  return { bundle: markStale(SNAPSHOT as unknown as FloodBundle), fromSnapshot: true };
}

async function runIngest(env: Env, only?: SourceId[]) {
  // รอบแรกที่ KV ยังว่าง ใช้ snapshot เป็นชุดก่อนหน้า — แหล่งที่ดึงไม่ได้ (เช่น กทม.) จะยังมีข้อมูลตัวอย่างติด flag แทนที่จะว่างเปล่า
  const previous = ((await env.FLOOD_DATA.get(KV_KEY, { type: 'json' })) as FloodBundle | null) ?? (SNAPSHOT as unknown as FloodBundle);
  const outcome = await ingestAll({ previous, only, keys: { gistda: env.GISTDA_API_KEY }, log: (m) => console.log(m) });
  if (outcome.ok.length) await env.FLOOD_DATA.put(KV_KEY, JSON.stringify(outcome.bundle));
  else console.error('ingest: every source failed; KV untouched');
  return outcome;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngest(env));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') return json({ ok: true, time: new Date().toISOString() }, 200, cors);

    // รับข้อมูลจากสคริปต์ภายนอก (GitHub Actions / เครื่องในไทยที่อ่านหน้า กทม. ได้)
    if (url.pathname === '/api/ingest' && req.method === 'PUT') {
      const auth = req.headers.get('authorization') ?? '';
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors);
      let body: { sources?: Partial<Record<SourceId, FloodCollection>> };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid json' }, 400, cors);
      }
      const previous = (await env.FLOOD_DATA.get(KV_KEY, { type: 'json' })) as FloodBundle | null;
      const merged = mergeBundle(previous, body.sources ?? {});
      await env.FLOOD_DATA.put(KV_KEY, JSON.stringify(merged));
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
