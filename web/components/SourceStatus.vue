<script setup lang="ts">
// แถบบน: เวลาอัปเดตล่าสุดของแต่ละแหล่ง + ป้าย "ข้อมูลอาจไม่เป็นปัจจุบัน" ถ้า stale > 30 นาที
import { fmtInt, fmtTime, isStale, relTime, SOURCE_IDS, SOURCE_META, type FloodBundle, type SourceId } from '../utils/format'

const props = defineProps<{ bundle: FloodBundle | null; now: number; error: string | null; loading: boolean; /** แสดงเป็นแถวแนวตั้งในแผงขวา แทน chip เลื่อนแนวนอน */ vertical?: boolean }>()

const hasGistdaKey = !!useRuntimeConfig().public.gistdaKey
const rows = computed(() =>
  SOURCE_IDS
    // GISTDA แสดงเฉพาะเมื่อมี key ฝั่งเว็บ หรือมีข้อมูลสรุปมาจาก Worker
    .filter((id) => id !== 'gistda_flood' || hasGistdaKey || props.bundle?.sources.gistda_flood)
    .map((id: SourceId) => {
      const c = props.bundle?.sources[id]
      // ภาพดาวเทียมมาวันละไม่กี่รอบ — ใช้เกณฑ์ stale 24 ชม. (ที่เหลือ 30 นาที)
      const stale = !c || c.stale || isStale(c.fetched_at, props.now, id === 'gistda_flood' ? 24 * 3600 * 1000 : undefined)
      return { id, meta: SOURCE_META[id], c, stale, snapshot: !!c?.snapshot }
    }),
)
const anyStale = computed(() => rows.value.some((r) => r.stale))
const anySnapshot = computed(() => rows.value.some((r) => r.snapshot))
</script>

<template>
  <div class="status">
    <div v-if="error && !bundle" class="banner banner-error">โหลดข้อมูลไม่สำเร็จ ({{ error }}) — ลองใหม่อีกครั้ง หรือดูลิงก์แหล่งข้อมูลทางการในหน้า “ลิงก์”</div>
    <div v-else-if="anySnapshot" class="banner banner-warn">กำลังแสดง<b>ข้อมูลตัวอย่าง</b>ที่บันทึกไว้ — ยังไม่ได้เชื่อมต่อข้อมูลสด</div>
    <div v-else-if="anyStale" class="banner banner-warn">⚠️ บางแหล่งข้อมูล<b>อาจไม่เป็นปัจจุบัน</b> (เกิน 30 นาที) — ตรวจสอบกับหน่วยงานโดยตรงก่อนตัดสินใจ</div>
    <div v-else-if="error" class="banner banner-warn">รีเฟรชล่าสุดไม่สำเร็จ ({{ error }}) — แสดงข้อมูลชุดก่อนหน้า</div>

    <div class="chips" :class="{ vertical }">
      <div v-for="r in rows" :key="r.id" class="chip src" :class="{ stale: r.stale }" :title="r.meta.name + (r.c?.error ? ` — ${r.c.error}` : '')">
        <span class="name">{{ r.meta.short }}</span>
        <template v-if="r.c">
          <span v-if="r.id === 'gistda_flood'" class="muted small">ภาพล่าสุด</span>
          <span class="muted">{{ fmtTime(r.c.observed_at ?? r.c.fetched_at, now) }}</span>
          <span class="muted small">({{ relTime(r.c.observed_at ?? r.c.fetched_at, now) }})</span>
          <span class="muted small">· {{ fmtInt(r.c.count) }} {{ r.id === 'gistda_flood' ? 'เซลล์ (1 วัน)' : 'จุด' }}</span>
          <span v-if="r.snapshot" class="badge badge-snapshot">ตัวอย่าง</span>
          <span v-else-if="r.c.error" class="badge badge-stale" :title="r.c.error">ต้นทางล่ม · แสดงชุดล่าสุด</span>
          <span v-else-if="r.stale" class="badge badge-stale">ไม่เป็นปัจจุบัน</span>
          <span v-if="r.c.via" class="badge" title="ได้จากเส้นทางสำรอง">สำรอง</span>
        </template>
        <span v-else class="muted small">{{ loading ? 'กำลังโหลด…' : 'ไม่มีข้อมูล' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status { display: grid; gap: 8px; min-width: 0; }
.chips { display: flex; min-width: 0; max-width: 100%; gap: 6px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.src { cursor: default; flex: none; }
.src.stale { border-color: #e0b000; }
.name { font-weight: 600; }
.chips.vertical { flex-direction: column; overflow: visible; padding: 0; }
.chips.vertical .src { border-radius: 12px; white-space: normal; flex-wrap: wrap; row-gap: 2px; }
</style>
