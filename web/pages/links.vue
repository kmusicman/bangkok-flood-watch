<script setup lang="ts">
// หน้า static: เครื่องมือรัฐ/เอกชน (CLAUDE.md ข้อ 3.2) + สายด่วนทั้งหมดเป็นปุ่มโทร
import { HOTLINES, SAFETY_NOTE } from '../utils/hotlines'

interface Link { name: string; url: string; note: string }
const GROUPS: { title: string; icon: string; links: Link[] }[] = [
  {
    title: 'ระดับน้ำ · เขื่อน · คลอง',
    icon: '🌊',
    links: [
      { name: 'คลังข้อมูลน้ำแห่งชาติ (One Map น้ำ)', url: 'https://www.thaiwater.net/new4all', note: 'ระดับน้ำสถานีหลัก ปริมาณน้ำในเขื่อน ฝน 24 ชม. ทั้งประเทศ (สสน.)' },
      { name: 'เซนเซอร์น้ำท่วมถนน กทม.', url: 'https://weather.bangkok.go.th/flood/', note: 'ระดับน้ำบนผิวจราจรรายจุด (สำนักการระบายน้ำ)' },
      { name: 'ฝนรายสถานี กทม.', url: 'https://weather.bangkok.go.th/rain', note: 'ปริมาณฝนสะสมรายเขต (สำนักการระบายน้ำ)' },
      { name: 'อัตราการไหลของคลอง กทม.', url: 'https://weather.bangkok.go.th/KlongMap', note: 'ระดับน้ำในคลองหลัก (เว็บล่มบ่อยช่วงฝนหนัก)' },
    ],
  },
  {
    title: 'เรดาร์ฝน · พยากรณ์',
    icon: '🌧️',
    links: [
      { name: 'เรดาร์ฝน กรมอุตุนิยมวิทยา', url: 'https://weather.tmd.go.th', note: 'เรดาร์ตรวจอากาศแบบ real-time + แอป Thai Weather' },
      { name: 'ประกาศเตือนภัย กรมอุตุนิยมวิทยา', url: 'https://www.tmd.go.th', note: 'ประกาศฝนตกหนัก / พายุ' },
      { name: 'Windy', url: 'https://www.windy.com/?radar', note: 'เรดาร์ฝนและพยากรณ์ล่วงหน้า (ดูง่ายบนมือถือ)' },
      { name: 'Google Flood Hub', url: 'https://sites.research.google/floods', note: 'พยากรณ์น้ำล้นตลิ่งตามสถานีวัด ล่วงหน้าหลายวัน' },
    ],
  },
  {
    title: 'ถนน · CCTV · การเดินทาง',
    icon: '🚗',
    links: [
      { name: 'CCTV จราจร กทม.', url: 'https://cpudapp.bangkok.go.th/bmatraffic', note: 'ดูภาพสดจากกล้อง (มีเงื่อนไขการใช้งาน ไม่สามารถนำมาแสดงในเว็บนี้)' },
      { name: 'Longdo Traffic', url: 'https://traffic.longdo.com', note: 'เหตุการณ์จราจร น้ำท่วม จากผู้ใช้ + CCTV' },
      { name: 'กรมทางหลวง — สถานการณ์น้ำท่วมบนทางหลวง', url: 'https://hdms.doh.go.th/dashboard', note: 'จุดที่ผ่านไม่ได้บนทางหลวงทั่วประเทศ' },
      { name: 'กรมทางหลวงชนบท — สถานะสายทาง', url: 'https://scs.drr.go.th', note: 'สายทางชนบทที่ได้รับผลกระทบ' },
      { name: 'การรถไฟฯ — สถานะขบวนรถ', url: 'https://ttsview.railway.co.th/v3/', note: 'ตรวจสอบขบวนรถล่าช้า / งดเดิน' },
    ],
  },
  {
    title: 'ดาวเทียม · พื้นที่น้ำท่วม',
    icon: '🛰️',
    links: [
      { name: 'GISTDA — พื้นที่น้ำท่วมจากดาวเทียม', url: 'https://disaster.gistda.or.th/flood', note: 'แผนที่น้ำท่วมย้อนหลัง 1/3/7 วัน + พื้นที่ท่วมซ้ำซาก ทั้งประเทศ' },
      { name: 'Traffy Fondue (ทีมชัชชาติ)', url: 'https://share.traffy.in.th/teamchadchart', note: 'เรื่องร้องเรียนน้ำท่วมจากประชาชนใน กทม. และแจ้งเรื่องใหม่' },
    ],
  },
]

useHead({ title: 'ลิงก์และสายด่วน — Bangkok Flood Watch' })
</script>

<template>
  <div class="links">
    <section class="card hot">
      <h2>📞 สายด่วน (กดเพื่อโทร)</h2>
      <div class="hotlines">
        <div v-for="h in HOTLINES" :key="h.number" class="hot-row">
          <a class="btn" :class="h.urgent ? 'btn-danger' : 'btn-primary'" :href="`tel:${h.number}`">โทร {{ h.number }}</a>
          <div>
            <div class="name">{{ h.name }}</div>
            <div class="muted small">{{ h.note }}</div>
            <a v-if="h.line" class="small" :href="h.line.url" target="_blank" rel="noopener">LINE {{ h.line.id }} ↗</a>
          </div>
        </div>
      </div>
      <p class="banner banner-warn small">⚡ {{ SAFETY_NOTE }}</p>
    </section>

    <section v-for="g in GROUPS" :key="g.title" class="card">
      <h2>{{ g.icon }} {{ g.title }}</h2>
      <ul>
        <li v-for="l in g.links" :key="l.url">
          <a :href="l.url" target="_blank" rel="noopener" class="link">
            <span class="name">{{ l.name }} ↗</span>
            <span class="muted small">{{ l.note }}</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.links { display: grid; gap: 12px; }
h2 { font-size: 18px; margin: 0 0 10px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.link { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; text-decoration: none; color: var(--text); }
.link:active { background: var(--chip); }
.name { font-weight: 600; }
.hotlines { display: grid; gap: 10px; }
.hot-row { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; }
@media (min-width: 720px) { .hotlines { grid-template-columns: 1fr 1fr; } }
</style>
