<script setup lang="ts">
import { BANGKOK_DISTRICTS } from '../data/areas'


useHead({
  title: 'น้ำท่วมวันนี้ กรุงเทพฯ และทั่วประเทศ — แผนที่น้ำท่วมเรียลไทม์ | Bangkok Flood Watch',
  link: [
    { rel: 'canonical', href: 'https://bangkokflood.com/' },
    { rel: 'alternate', hreflang: 'th', href: 'https://bangkokflood.com/' },
    { rel: 'alternate', hreflang: 'en', href: 'https://bangkokflood.com/en/' },
    { rel: 'alternate', hreflang: 'x-default', href: 'https://bangkokflood.com/' },
  ],
})
</script>

<template>
  <div class="home">
    <FloodDashboard />

    <!-- ข้อความนี้อยู่ใน HTML ที่ prerender แล้ว → Google อ่านได้แม้ยังไม่รัน JS (h1 อยู่ในแถบบน คำนวณจาก route ใน utils/headings.ts) -->
    <section class="intro card">
      <h2>เกี่ยวกับข้อมูลในแผนที่</h2>
      <p class="muted small">
        เช็กถนนที่น้ำท่วมใน กทม. จากเซนเซอร์สำนักการระบายน้ำ, ระดับน้ำและฝนสะสมทั่วประเทศจากคลังข้อมูลน้ำแห่งชาติ (สสน.),
        เรื่องร้องเรียนน้ำท่วมจากประชาชนผ่าน Traffy Fondue และพื้นที่น้ำท่วมจากดาวเทียม GISTDA — อัปเดตอัตโนมัติทุก 10 นาที
        แตะหมุดหรือรายการเพื่อดูระดับน้ำ รูป และเวลาอัปเดต · ต้องการความช่วยเหลือโทร <a href="tel:1784">1784</a> หรือ <a href="tel:1669">1669</a>
      </p>
    </section>

    <!-- ลิงก์ภายในไปหน้ารายเขต/จังหวัด (ช่วยให้ Google เจอและจัดอันดับคำค้นรายพื้นที่) -->
    <section class="areas card">
      <h2>น้ำท่วมรายเขต กรุงเทพมหานคร</h2>
      <div class="chips">
        <NuxtLink v-for="a in BANGKOK_DISTRICTS" :key="a.slug" :to="`/bangkok/${a.slug}/`" class="chip">{{ a.th }}</NuxtLink>
      </div>
      <p class="small"><NuxtLink to="/province/">ดูน้ำท่วมรายจังหวัดทั่วประเทศ →</NuxtLink> · <NuxtLink to="/en/">English</NuxtLink></p>
    </section>
  </div>
</template>

<style scoped>
.home { display: grid; gap: 10px; }
.home > * { min-width: 0; }
.intro h2 { font-size: 17px; margin: 0 0 6px; }
.intro p { margin: 0; }
.areas h2 { font-size: 17px; margin: 0 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips .chip { text-decoration: none; min-height: 32px; padding: 4px 10px; font-size: 13px; }
.areas p { margin: 10px 0 0; }
</style>
