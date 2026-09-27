<script setup lang="ts">
// หน้า SEO รายเขต กทม.: /bangkok/<slug>/ — title/h1/ข้อความคงที่ตรงคำค้น "น้ำท่วม <เขต> วันนี้" + แดชบอร์ดกรองเขตนั้น
import { BANGKOK_DISTRICTS, BANGKOK_TH, districtBySlug } from '../../data/areas'
import areaStatic from '../../data/areas-static.json'

const route = useRoute()
const area = districtBySlug(String(route.params.district))
if (!area) throw createError({ statusCode: 404, statusMessage: 'ไม่พบเขตนี้', fatal: true })

const st = (areaStatic as { districts: Record<string, { sensors: string[]; stations: number; traffy: number }> }).districts[area.th] ?? { sensors: [], stations: 0, traffy: 0 }
const url = `https://bangkokflood.com/bangkok/${area.slug}/`
const title = `น้ำท่วม${area.th} วันนี้ — แผนที่น้ำท่วมเขต${area.th} กรุงเทพฯ | Bangkok Flood Watch`
const description = `เช็กน้ำท่วมเขต${area.th} (${area.en}) กรุงเทพมหานคร แบบเรียลไทม์: ถนนที่น้ำท่วมจากเซนเซอร์สำนักการระบายน้ำ${st.sensors.length ? ` ${st.sensors.length} จุด` : ''} เรื่องร้องเรียนจากประชาชน (Traffy) และภาพดาวเทียม อัปเดตทุก 10 นาที`
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
    <nav class="crumbs small muted"><NuxtLink to="/">หน้าแรก</NuxtLink> › <NuxtLink to="/bangkok/">กทม. รายเขต</NuxtLink> › เขต{{ area.th }}</nav>
    <h1>น้ำท่วมเขต{{ area.th }} วันนี้</h1>
    <p class="muted small">
      แผนที่และรายการจุดน้ำท่วมในเขต{{ area.th }} กรุงเทพมหานคร ({{ area.en }}) รวมจากข้อมูลทางการ: เซนเซอร์วัดระดับน้ำบนถนนของสำนักการระบายน้ำ กทม.,
      เรื่องร้องเรียนน้ำท่วมจากประชาชนผ่าน Traffy Fondue และพื้นที่น้ำท่วมจากดาวเทียม GISTDA — อัปเดตทุก 10 นาที
      รายการด้านล่างกรองเฉพาะเขตนี้ให้แล้ว (เปลี่ยนเขตได้ในช่องเลือก)
    </p>
    <p v-if="st.sensors.length" class="small muted">
      จุดวัดน้ำท่วมถนนของ กทม. ในเขต{{ area.th }} ({{ st.sensors.length }} จุด): {{ st.sensors.join(' · ') }}
    </p>

    <FloodDashboard :province="BANGKOK_TH" :district="area.th" />

    <section class="areas card">
      <h2>เขตอื่นใน กทม.</h2>
      <div class="chips">
        <NuxtLink v-for="a in BANGKOK_DISTRICTS" :key="a.slug" :to="`/bangkok/${a.slug}/`" class="chip" :aria-current="a.slug === area.slug ? 'page' : undefined">{{ a.th }}</NuxtLink>
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
