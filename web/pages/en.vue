<script setup lang="ts">
// English landing page for "bangkok flood map" queries — dashboard UI itself stays Thai (numbers/colours are universal)
const url = 'https://bangkokflood.com/en/'
const title = 'Bangkok Flood Map Today — Live Flooded Roads, Water Levels & Satellite Flood Extent | Bangkok Flood Watch'
const description = 'Real-time Bangkok and Thailand flood map: flooded roads from BMA street sensors, river levels and 24-hour rainfall from the National Hydroinformatics Institute, citizen flood reports (Traffy Fondue) and GISTDA satellite flood extent. Updated every 10 minutes. Free, no app needed.'
useHead({
  htmlAttrs: { lang: 'en' },
  title,
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:locale', content: 'en_US' },
    { name: 'twitter:title', content: 'Bangkok Flood Map Today — live flooded roads & water levels' },
    { name: 'twitter:description', content: description },
  ],
  link: [
    { rel: 'canonical', href: url },
    { rel: 'alternate', hreflang: 'en', href: url },
    { rel: 'alternate', hreflang: 'th', href: 'https://bangkokflood.com/' },
    { rel: 'alternate', hreflang: 'x-default', href: 'https://bangkokflood.com/' },
  ],
})
</script>

<template>
  <div class="en">
    <section class="intro">
      <h1>Bangkok Flood Map — live flooded roads, water levels and satellite flood extent</h1>
      <p class="muted small">
        This page combines official Thai flood data on one map, refreshed automatically every 10 minutes:
        <b>street flood sensors</b> from the Bangkok Metropolitan Administration (water depth in cm on major roads),
        <b>river levels and 24-hour rainfall</b> nationwide from the National Hydroinformatics Institute (HII),
        <b>citizen flood reports with photos</b> from Traffy Fondue, and <b>satellite-detected flood extent</b> (1/3/7/30 days) from GISTDA.
        Colours: red = critical, orange = warning, amber = watch, green = normal. Tap any marker or list item for details.
        The dashboard labels are in Thai; the map and numbers need no translation.
      </p>
      <p class="muted small">
        <b>Emergency numbers (Thailand):</b> <a href="tel:1784">1784</a> Disaster Prevention &amp; Mitigation (rescue/evacuation) ·
        <a href="tel:1669">1669</a> medical emergency · <a href="tel:1555">1555</a> Bangkok city hotline · <a href="tel:1155">1155</a> Tourist Police.
        This is a volunteer-run aggregator, not a government service — always confirm with the authorities before travelling.
      </p>
    </section>

    <FloodDashboard />

    <p class="small"><NuxtLink to="/">ภาษาไทย (Thai version)</NuxtLink> · <NuxtLink to="/links/">Hotlines &amp; official links</NuxtLink></p>
  </div>
</template>

<style scoped>
.en { display: grid; gap: 10px; }
.en > * { min-width: 0; }
.intro h1 { font-size: 20px; margin: 4px 0 2px; }
.intro p { margin: 0 0 6px; }
</style>
