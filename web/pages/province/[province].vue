<script setup lang="ts">
// หน้า SEO รายจังหวัด: /province/<slug>/ — "น้ำท่วม <จังหวัด> วันนี้" + แดชบอร์ดกรองจังหวัดนั้น
import { PROVINCES, provinceBySlug } from '../../data/areas'
import areaStatic from '../../data/areas-static.json'

const route = useRoute()
const area = provinceBySlug(String(route.params.province))
if (!area) throw createError({ statusCode: 404, statusMessage: 'ไม่พบจังหวัดนี้', fatal: true })

const st = (areaStatic as { provinces: Record<string, { stations: string[]; rain: number; districts: string[] }> }).provinces[area.th] ?? { stations: [], rain: 0, districts: [] }
const url = `https://bangkokflood.com/province/${area.slug}/`
const title = `น้ำท่วม${area.th} วันนี้ — ระดับน้ำ ฝน และพื้นที่น้ำท่วมจากดาวเทียม | Bangkok Flood Watch`
const description = `เช็กสถานการณ์น้ำท่วมจังหวัด${area.th} (${area.en}) แบบเรียลไทม์: ระดับน้ำสถานีวัด${st.stations.length ? ` ${st.stations.length} แห่ง` : ''} ฝนสะสม 24 ชม. และพื้นที่น้ำท่วมจากดาวเทียม GISTDA อัปเดตทุก 10 นาที`
useHead({
  title,
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
  ],
  link: [{ rel: 'canonical', href: url }],
})
</script>

<template>
  <div class="area">
    <nav class="crumbs small muted"><NuxtLink to="/">หน้าแรก</NuxtLink> › <NuxtLink to="/province/">รายจังหวัด</NuxtLink> › {{ area.th }}</nav>
    <h1>น้ำท่วม{{ area.th }} วันนี้</h1>
    <p class="muted small">
      ระดับน้ำ ฝนสะสม 24 ชั่วโมง และพื้นที่น้ำท่วมจากดาวเทียมในจังหวัด{{ area.th }} ({{ area.en }}) จากคลังข้อมูลน้ำแห่งชาติ (สสน.) และ GISTDA — อัปเดตทุก 10 นาที
      รายการด้านล่างกรองเฉพาะจังหวัดนี้ให้แล้ว (เลือกอำเภอเพิ่มได้) · เปิดชั้น "ดาวเทียม GISTDA" บนแผนที่เพื่อดูพื้นที่ที่น้ำท่วมจริง
    </p>
    <p v-if="st.stations.length" class="small muted">
      สถานีวัดระดับน้ำใน{{ area.th }} ({{ st.stations.length }} แห่ง): {{ st.stations.join(' · ') }}<template v-if="st.districts.length"> — ครอบคลุมอำเภอ {{ st.districts.join(', ') }}</template>
    </p>

    <FloodDashboard :province="area.th" />

    <section class="areas card">
      <h2>จังหวัดอื่น</h2>
      <div class="chips">
        <NuxtLink to="/bangkok/" class="chip">กรุงเทพฯ (รายเขต)</NuxtLink>
        <NuxtLink v-for="a in PROVINCES" :key="a.slug" :to="`/province/${a.slug}/`" class="chip" :aria-current="a.slug === area.slug ? 'page' : undefined">{{ a.th }}</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.area { display: grid; gap: 10px; }
.area > * { min-width: 0; }
h1 { font-size: 20px; margin: 0; }
.area p { margin: 0; }
.areas h2 { font-size: 16px; margin: 0 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips .chip { text-decoration: none; min-height: 32px; padding: 4px 10px; font-size: 13px; }
.chips .chip[aria-current] { background: var(--brand); color: #fff; border-color: transparent; }
</style>
