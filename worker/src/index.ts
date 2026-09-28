// Cloudflare Worker — Phase 0 (CLAUDE.md ข้อ 4.1)
//   ตัวดึงข้อมูล = GitHub Actions (.github/workflows/ingest.yml) → PUT /api/ingest แบบ full → KV key เดียว ("bundle")
//   cron ทุก 10 นาที → แค่สะกิด GitHub (workflow_dispatch) — ไม่ดึง/ไม่ parse อะไรเองเลย
//   GET /api/data/all.json        ทุกแหล่งในไฟล์เดียว (หน้าเว็บใช้อันนี้) — ส่ง text จาก KV ตรงๆ
//   GET /api/data/index.json      สถานะแต่ละแหล่ง (เวลาอัปเดต, error, count) — อ่านจากหัวไฟล์ที่สคริปต์ฝังมา
//   PUT /api/ingest               (Bearer INGEST_TOKEN, x-ingest-mode: full) เก็บ bundle ทั้งก้อนเป็น text
//   GET /health
//
// กฎเหล็กของ Worker นี้: **ห้าม JSON.parse bundle** ในทุกเส้นทาง
//   free plan จำกัด CPU ~10 ms/ครั้ง; bundle ≈ 3 MB (Traffy 1.3 MB + สสน. 0.9 MB) parse กิน 50–90 ms
//   28 ก.ย. 2569 ทุก GET /api/data/* ตอบ 503 (error 1102 exceededResources) เพราะ readBundle parse ทุกครั้งที่ edge cache หมด
//   และ cron ที่พยายาม merge ชุดเดิม (parse 3 MB) ถูกฆ่าที่ 10 ms ทุกรอบ → ตัดทิ้งทั้งหมด ให้ Node ฝั่ง GitHub ทำงานหนักแทน
// ผู้ใช้ไม่ยิงตรงไปแหล่งข้อมูลทางการ; แหล่งไหนล่ม สคริปต์คงชุดเดิม + stale/error ไว้ใน bundle เอง

export interface Env {
  FLOOD_DATA: KVNamespace;
  /** R2 bucket สำหรับแจก all.json ผ่าน CDN (ไม่บังคับ — ถ้าไม่มี binding ก็เสิร์ฟจาก /api/data เท่านั้น) */
  DATA_BUCKET?: R2Bucket;
  ALLOWED_ORIGIN?: string;
  INGEST_TOKEN?: string;
  /** fine-grained PAT (Actions: read/write ของ repo นี้) — ให้ cron ของ Cloudflare สะกิด GitHub Actions ทุก 10 นาที */
  GITHUB_DISPATCH_TOKEN?: string;
  /** owner/repo ของ workflow ingest.yml */
  GITHUB_REPO?: string;
}

const KV_KEY = 'bundle';
const BROWSER_CACHE_S = 60; // max-age ฝั่งเบราว์เซอร์
const EDGE_CACHE_S = 120; // s-maxage / Cache API (ใช้ได้เมื่อผูกโดเมนของเราเอง)
const BUNDLE_HEAD = '{"generated_at":"';
const SOURCES_KEY = ',"sources":';
// KV ว่าง (deploy ใหม่ / ยังไม่เคย ingest) → ตอบ bundle ว่างพร้อม flag ให้หน้าเว็บบอกผู้ใช้
const EMPTY_BUNDLE_TEXT = `${BUNDLE_HEAD}${new Date(0).toISOString()}","index":{}${SOURCES_KEY}{}}`;

/** สั่ง GitHub รัน workflow ingest.yml (workflow_dispatch) — schedule ของ GitHub เองไม่ตรงเวลา/ไม่เริ่มสำหรับ repo ใหม่ */
async function dispatchGithub(env: Env): Promise<number | null> {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO) return null;
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/ingest.yml/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      'user-agent': 'flood-watch-worker (+https://bangkokflood.com)',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  console.log(`github dispatch → ${r.status}${r.ok ? '' : ' ' + (await r.text()).slice(0, 200)}`);
  return r.status; // 204 = รับคำสั่งแล้ว
}

/** เขียน bundle (text) ลง KV และ (ถ้ามี) R2 — R2 = ไฟล์สาธารณะ data.<domain>/all.json ที่ CDN cache ให้ ไม่กินโควตา Worker */
async function storeBundle(env: Env, json: string) {
  await env.FLOOD_DATA.put(KV_KEY, json);
  if (env.DATA_BUCKET) {
    await env.DATA_BUCKET.put('all.json', json, {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: `public, max-age=${BROWSER_CACHE_S}, s-maxage=${EDGE_CACHE_S}` },
    }).catch((e) => console.error('R2 put failed', e));
  }
}

/** ตรวจรูปแบบ bundle ที่รับมาแค่จากหัวไฟล์ — ต้องเป็น {"generated_at":"…","index":{…},"sources":{…}} ตามที่ scripts/ingest.ts เขียน */
function looksLikeBundle(text: string): boolean {
  const i = text.indexOf(SOURCES_KEY);
  return text.startsWith(BUNDLE_HEAD) && i > 0 && i < 100_000 && text.slice(0, i).includes('"index":{');
}

/** index.json = ส่วนหัวของ bundle (ก่อน "sources") — ไม่กี่ KB parse ได้ใน < 1 ms */
function bundleIndex(text: string): string {
  const i = text.indexOf(SOURCES_KEY);
  const head = JSON.parse(text.slice(0, i) + '}') as { generated_at: string; index?: unknown };
  return JSON.stringify({ generated_at: head.generated_at, sources: head.index ?? {} });
}

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

function authorized(req: Request, env: Env): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return !!env.INGEST_TOKEN && auth === `Bearer ${env.INGEST_TOKEN}`;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // งานเดียว: สะกิด GitHub Actions ให้ดึงข้อมูลแล้ว PUT กลับมา (CPU ≈ 0 อยู่ในลิมิต free plan แน่นอน)
    ctx.waitUntil(dispatchGithub(env));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') return json({ ok: true, time: new Date().toISOString() }, 200, cors);

    // รับ bundle เต็มจาก GitHub Actions (scripts/ingest.ts --push) — เก็บ text ตรงๆ ไม่ parse
    if (url.pathname === '/api/ingest' && req.method === 'PUT') {
      if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      if (req.headers.get('x-ingest-mode') !== 'full') return json({ error: 'only x-ingest-mode: full is supported (Worker never parses bundles)' }, 400, cors);
      const text = await req.text();
      if (text.length > 25_000_000) return json({ error: 'too large' }, 413, cors);
      if (!looksLikeBundle(text)) return json({ error: 'not a bundle (need generated_at + index + sources in this order)' }, 400, cors);
      await storeBundle(env, text);
      // ล้าง edge cache ให้คนเห็นชุดใหม่ทันที ไม่ต้องรอ s-maxage
      const cache = caches.default;
      ctx.waitUntil(Promise.all(['all', 'index'].map((w) => cache.delete(new Request(`${url.origin}/api/data/${w}.json`, { method: 'GET' })))));
      return json({ ok: true, mode: 'full', bytes: text.length }, 200, cors);
    }

    // ทดสอบการสะกิด GitHub ด้วยมือ (ต้องมี token)
    if (url.pathname === '/api/ingest/dispatch' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      const status = await dispatchGithub(env);
      return json({ github_status: status, configured: !!(env.GITHUB_DISPATCH_TOKEN && env.GITHUB_REPO) }, 200, cors);
    }

    const m = url.pathname.match(/^\/api\/data\/(all|index)\.json$/);
    if (!m || req.method !== 'GET') {
      if (url.pathname.startsWith('/api/data/')) return json({ error: 'only all.json and index.json are served' }, 404, cors);
      return json({ error: 'not found' }, 404, cors);
    }
    const what = m[1];

    // Cache API: ลดการอ่าน KV เมื่อคนเข้าพร้อมกันมาก
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    }

    const stored = await env.FLOOD_DATA.get(KV_KEY, { type: 'text', cacheTtl: 60 });
    const text = stored ?? EMPTY_BUNDLE_TEXT;
    const fromSnapshot = !stored;
    const body = what === 'all' ? text : bundleIndex(text);

    const res = json(body, 200, {
      ...cors,
      'cache-control': `public, max-age=${BROWSER_CACHE_S}, s-maxage=${EDGE_CACHE_S}`,
      'x-data-snapshot': String(fromSnapshot),
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
} satisfies ExportedHandler<Env>;
