<script setup lang="ts">
// ไอคอนกล้อง CCTV แบบ inline (chip/legend) — รูปเดียวกับหมุดบนแผนที่ (web/utils/cctvIcon.ts)
import { CCTV_SVG } from '../utils/cctvIcon'
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — SVG คงที่จากโค้ดเรา ไม่ใช่ข้อมูลภายนอก -->
  <span class="cctv-icon" aria-hidden="true" v-html="CCTV_SVG" />
</template>

<style scoped>
.cctv-icon { display: inline-flex; width: 18px; height: 18px; flex: none; }
.cctv-icon :deep(svg) { width: 100%; height: 100%; }
</style>
