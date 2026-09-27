<script setup lang="ts">
import { PROVINCES } from '../../data/areas'
import areaStatic from '../../data/areas-static.json'
const st = (areaStatic as { provinces: Record<string, { stations: string[]; rain: number }> }).provinces
const url = 'https://bangkokflood.com/province/'
useHead({
  title: 'น้ำท่วมวันนี้ รายจังหวัดทั่วประเทศ 77 จังหวัด — Bangkok Flood Watch',
  meta: [
    { name: 'description', content: 'เลือกดูสถานการณ์น้ำท่วมรายจังหวัดทั่วประเทศไทย: ระดับน้ำสถานีวัด ฝนสะสม 24 ชม. และพื้นที่น้ำท่วมจากดาวเทียม GISTDA อัปเดตทุก 10 นาที' },
    { property: 'og:url', content: url },
  ],
  link: [{ rel: 'canonical', href: url }],
})
</script>

<template>
  <div class="idx">
    <nav class="small muted"><NuxtLink to="/">หน้าแรก</NuxtLink> › รายจังหวัด</nav>
    <h1>น้ำท่วมวันนี้ — เลือกดูรายจังหวัด</h1>
    <p class="muted small">แต่ละหน้าแสดงระดับน้ำ ฝน และพื้นที่น้ำท่วมจากดาวเทียมเฉพาะจังหวัดนั้น · กรุงเทพฯ มีหน้า<NuxtLink to="/bangkok/">รายเขต 50 เขต</NuxtLink>แยกต่างหาก</p>
    <ul class="list">
      <li>
        <NuxtLink to="/bangkok/" class="item"><span class="name">กรุงเทพมหานคร</span><span class="muted small">Bangkok · รายเขต 50 เขต</span></NuxtLink>
      </li>
      <li v-for="a in PROVINCES" :key="a.slug">
        <NuxtLink :to="`/province/${a.slug}/`" class="item">
          <span class="name">{{ a.th }}</span>
          <span class="muted small">{{ a.en }}<template v-if="st[a.th]?.stations.length"> · สถานีวัดน้ำ {{ st[a.th].stations.length }} แห่ง</template></span>
        </NuxtLink>
      </li>
    </ul>
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
