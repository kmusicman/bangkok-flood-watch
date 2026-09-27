<script setup lang="ts">
const consentOpen = useState('cookie-consent-open', () => false)
</script>

<template>
  <footer class="container small muted">
    <p>
      <b>ข้อจำกัดความรับผิดชอบ:</b> เว็บนี้รวบรวมข้อมูลจากแหล่งทางการ (คลังข้อมูลน้ำแห่งชาติ สสน., สำนักการระบายน้ำ กทม., Traffy Fondue)
      โดยอาสาสมัคร <b>ไม่ใช่หน่วยงานรัฐ</b> ข้อมูลอาจล่าช้าหรือคลาดเคลื่อน โปรดตรวจสอบกับหน่วยงานโดยตรงก่อนตัดสินใจเดินทาง
    </p>
    <p>
      หากต้องการความช่วยเหลือ โทร <a href="tel:1784">1784</a> (ปภ.) หรือ <a href="tel:1669">1669</a> (เจ็บป่วยฉุกเฉิน)
      · <NuxtLink to="/links">ลิงก์แหล่งข้อมูลและสายด่วนทั้งหมด</NuxtLink>
    </p>
    <p>
      ดูรายพื้นที่: <NuxtLink to="/bangkok/">กรุงเทพฯ รายเขต</NuxtLink> · <NuxtLink to="/province/">รายจังหวัดทั่วประเทศ</NuxtLink> · <NuxtLink to="/en/">English</NuxtLink>
    </p>
    <p>
      แผนที่ © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors
      · <button class="linklike" type="button" @click="consentOpen = true">ตั้งค่าคุกกี้</button>
    </p>
  </footer>
</template>

<style scoped>
footer { padding: 16px 12px calc(80px + env(safe-area-inset-bottom)); }
.linklike { background: none; border: 0; padding: 0; color: var(--brand); text-decoration: underline; cursor: pointer; font-size: inherit; }
</style>
