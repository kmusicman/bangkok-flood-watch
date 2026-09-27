<script setup lang="ts">
import { BANGKOK_DISTRICTS } from '../../data/areas'
import areaStatic from '../../data/areas-static.json'
const st = (areaStatic as { districts: Record<string, { sensors: string[]; traffy: number }> }).districts
const url = 'https://bangkokflood.com/bangkok/'
useHead({
  title: 'น้ำท่วมกรุงเทพฯ วันนี้ รายเขตทั้ง 50 เขต — Bangkok Flood Watch',
  meta: [
    { name: 'description', content: 'เลือกดูน้ำท่วมรายเขตในกรุงเทพมหานครทั้ง 50 เขต: ถนนที่น้ำท่วมจากเซนเซอร์ กทม., เรื่องร้องเรียนจากประชาชน และภาพดาวเทียม อัปเดตทุก 10 นาที' },
    { property: 'og:url', content: url },
  ],
  link: [{ rel: 'canonical', href: url }],
})
</script>

<template>
  <div class="idx">
    <nav class="small muted"><NuxtLink to="/">หน้าแรก</NuxtLink> › กทม. รายเขต</nav>
    <h1>น้ำท่วมกรุงเทพฯ วันนี้ — เลือกดูรายเขต</h1>
    <p class="muted small">ทั้ง 50 เขต แต่ละหน้าแสดงแผนที่และรายการจุดน้ำท่วมเฉพาะเขตนั้น พร้อมรายชื่อจุดวัดน้ำท่วมถนนของสำนักการระบายน้ำ</p>
    <ul class="list">
      <li v-for="a in BANGKOK_DISTRICTS" :key="a.slug">
        <NuxtLink :to="`/bangkok/${a.slug}/`" class="item">
          <span class="name">เขต{{ a.th }}</span>
          <span class="muted small">{{ a.en }}<template v-if="st[a.th]?.sensors.length"> · เซนเซอร์ {{ st[a.th].sensors.length }} จุด</template></span>
        </NuxtLink>
      </li>
    </ul>
    <p class="small"><NuxtLink to="/province/">ดูน้ำท่วมรายจังหวัดทั่วประเทศ →</NuxtLink></p>
  </div>
</template>

<style scoped>
.idx { display: grid; gap: 10px; }
h1 { font-size: 20px; margin: 0; }
.idx p { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.item { display: grid; gap: 2px; padding: 10px 12px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; text-decoration: none; color: var(--text); }
.name { font-weight: 600; }
</style>
