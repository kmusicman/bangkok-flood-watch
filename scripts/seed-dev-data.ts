// ถ้ายังไม่มี web/public/data/all.json (ยังไม่ได้รัน ingest:local) ให้ copy snapshot ไปก่อน
// เพื่อให้ `npm run dev` / `npm run generate` ทำงานได้ทันที (หน้าเว็บจะขึ้นป้าย "ข้อมูลตัวอย่าง")
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const target = resolve(ROOT, 'web/public/data/all.json');
if (!existsSync(target)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(ROOT, 'shared/snapshots/all.json'), target);
  console.log('seeded web/public/data/all.json from shared/snapshots/all.json (ข้อมูลตัวอย่าง — รัน `npm run ingest:local` เพื่อดึงข้อมูลสด)');
}
