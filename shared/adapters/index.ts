// ตัวรวม adapter: ดึงทุกแหล่งพร้อมกัน แหล่งไหนล้มก็คงชุดเดิมไว้ + ติด flag stale
// ใช้ได้ทั้งใน Cloudflare Worker (cron) และสคริปต์ Node (scripts/ingest.ts / GitHub Actions)

import type { FloodBundle, FloodCollection, FloodFeature, SourceId } from '../types.ts';
import { makeCollection, SOURCE_IDS } from '../util.ts';
import { fetchBma } from './bma.ts';
import { fetchGistdaSummary, gistdaCollection } from './gistda.ts';
import { fetchRain, fetchWaterlevel } from './thaiwater.ts';
import { fetchTraffy } from './traffy.ts';

/** key/secret ที่ adapter บางตัวต้องใช้ — ไม่มี key = ข้ามแหล่งนั้น */
export interface FetchKeys {
  gistda?: string;
}

export type FetchResult = { features: FloodFeature[]; via?: string | null; collection?: FloodCollection };

export const FETCHERS: Record<SourceId, (keys: FetchKeys) => Promise<FetchResult>> = {
  thaiwater_waterlevel: async () => ({ features: await fetchWaterlevel() }),
  thaiwater_rain: async () => ({ features: await fetchRain() }),
  bma_flood_road: () => fetchBma(),
  traffy_flood: async () => ({ features: await fetchTraffy() }),
  gistda_flood: async ({ gistda }) => {
    if (!gistda) throw new Error('no GISTDA_API_KEY');
    return { features: [], collection: gistdaCollection(await fetchGistdaSummary(gistda)) };
  },
};

/** แหล่งที่ต้องมี key — ถ้าไม่มีจะไม่ถูกดึงและไม่นับเป็นความล้มเหลว */
const NEEDS_KEY: Partial<Record<SourceId, keyof FetchKeys>> = { gistda_flood: 'gistda' };

export interface IngestOptions {
  /** ชุดข้อมูลรอบก่อน — ใช้แทนเมื่อดึงไม่สำเร็จ */
  previous?: FloodBundle | null;
  /** ดึงเฉพาะแหล่งที่ระบุ (ค่าเริ่มต้น: ทุกแหล่ง) */
  only?: SourceId[];
  keys?: FetchKeys;
  log?: (msg: string) => void;
}

export interface IngestOutcome {
  bundle: FloodBundle;
  ok: SourceId[];
  failed: { id: SourceId; error: string }[];
  skipped: SourceId[];
}

/** ดึงทุกแหล่ง → FloodBundle; ไม่โยน error ออกมา (ล้มเป็นราย source) */
export async function ingestAll(opts: IngestOptions = {}): Promise<IngestOutcome> {
  const { previous = null, keys = {}, log = () => {} } = opts;
  const skipped: SourceId[] = [];
  const only = (opts.only ?? SOURCE_IDS).filter((id) => {
    const k = NEEDS_KEY[id];
    if (k && !keys[k]) { skipped.push(id); return false; }
    return true;
  });
  if (skipped.length) log(`– skipped (no key): ${skipped.join(', ')}`);

  const settled = await Promise.allSettled(only.map((id) => FETCHERS[id](keys)));
  const bundle: FloodBundle = { generated_at: new Date().toISOString(), sources: { ...(previous?.sources ?? {}) } };
  const ok: SourceId[] = [];
  const failed: IngestOutcome['failed'] = [];

  only.forEach((id, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      const c = r.value.collection ?? makeCollection(id, r.value.features, { via: r.value.via ?? null });
      bundle.sources[id] = c;
      ok.push(id);
      log(`✓ ${id}: ${c.count} ${c.features.length ? 'features' : 'items'}${c.via ? ` (via ${c.via})` : ''}`);
      return;
    }
    const error = String(r.reason?.message ?? r.reason);
    failed.push({ id, error });
    const prev = previous?.sources?.[id];
    bundle.sources[id] = prev
      ? { ...prev, stale: true, error }
      : makeCollection(id, [], { stale: true, error, fetched_at: new Date(0).toISOString() });
    log(`✗ ${id}: ${error}${prev ? ' (keeping previous)' : ' (no previous data)'}`);
  });

  return { bundle, ok, failed, skipped };
}

/** รวมชุดที่ส่งเข้ามา (บางส่วนได้) เข้ากับ bundle เดิม — ใช้ใน Worker เมื่อรับ PUT /api/ingest */
export function mergeBundle(previous: FloodBundle | null, incoming: Partial<Record<SourceId, FloodCollection>>): FloodBundle {
  const sources = { ...(previous?.sources ?? {}) };
  for (const id of SOURCE_IDS) {
    const c = incoming[id];
    if (c && c.type === 'FeatureCollection' && c.source === id && Array.isArray(c.features)) sources[id] = c;
  }
  return { generated_at: new Date().toISOString(), sources };
}
