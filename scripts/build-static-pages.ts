// สร้างไฟล์ประกอบหน้า SEO ก่อน nuxt generate:
//   web/data/areas-static.json — ชื่อเซนเซอร์/สถานีต่อเขต-จังหวัด (ข้อความคงที่ใน HTML ให้ Google อ่านได้)
//   web/public/sitemap.xml     — ทุก route + lastmod วันที่ build
// ใช้ข้อมูลจาก web/public/data/all.json ถ้ามี (สด) ไม่งั้นใช้ shared/snapshots/all.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FloodBundle, FloodFeature } from '../shared/types.ts';
import { AREA_ROUTES, BANGKOK_DISTRICTS, BANGKOK_TH, PROVINCES } from '../web/data/areas.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const live = resolve(ROOT, 'web/public/data/all.json');
const src = existsSync(live) ? live : resolve(ROOT, 'shared/snapshots/all.json');
const bundle = JSON.parse(readFileSync(src, 'utf8')) as FloodBundle;
const feats = (id: keyof FloodBundle['sources']) => bundle.sources[id]?.features ?? [];

const names = (list: FloodFeature[], max: number) => [...new Set(list.map((f) => f.properties.name))].slice(0, max);

const districts: Record<string, { sensors: string[]; stations: number; traffy: number }> = {};
for (const a of BANGKOK_DISTRICTS) {
  const inD = (f: FloodFeature) => f.properties.province === BANGKOK_TH && f.properties.district === a.th;
  districts[a.th] = {
    sensors: names(feats('bma_flood_road').filter(inD), 15),
    stations: feats('thaiwater_waterlevel').filter(inD).length,
    traffy: feats('traffy_flood').filter(inD).length,
  };
}
const provinces: Record<string, { stations: string[]; rain: number; districts: string[] }> = {};
for (const a of PROVINCES) {
  const inP = (f: FloodFeature) => f.properties.province === a.th;
  const wl = feats('thaiwater_waterlevel').filter(inP);
  provinces[a.th] = {
    stations: names(wl, 12),
    rain: feats('thaiwater_rain').filter(inP).length,
    districts: [...new Set(wl.map((f) => f.properties.district).filter((d): d is string => !!d))].slice(0, 12),
  };
}
mkdirSync(resolve(ROOT, 'web/data'), { recursive: true });
writeFileSync(resolve(ROOT, 'web/data/areas-static.json'), JSON.stringify({ built_at: new Date().toISOString(), districts, provinces }));

const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: '/', pri: '1.0', freq: 'hourly' },
  { loc: '/en/', pri: '0.8', freq: 'hourly' },
  { loc: '/links/', pri: '0.6', freq: 'weekly' },
  ...AREA_ROUTES.map((r) => ({ loc: r, pri: r.endsWith('/bangkok/') || r.endsWith('/province/') ? '0.7' : '0.8', freq: 'hourly' })),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map((u) => `  <url><loc>https://bangkokflood.com${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`)
  .join('\n')}\n</urlset>\n`;
writeFileSync(resolve(ROOT, 'web/public/sitemap.xml'), xml);
console.log(`areas-static.json (${Object.keys(districts).length} districts, ${Object.keys(provinces).length} provinces) + sitemap.xml (${urls.length} urls) from ${src.replace(ROOT + '/', '')}`);
