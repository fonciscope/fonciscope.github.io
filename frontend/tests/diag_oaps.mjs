import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage();
await page.goto('https://fonciscope.github.io/#13/48.57/2.17', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const api = await import('/js/api.js');
  const out = {};
  for (const p of ['DU_91105', 'DU_37195', 'DU_91223', 'DU_91021', 'DU_91540', 'DU_45234', 'DU_91432']) {
    try {
      const pr = await api.gpuByPartition('prescription-surf', p);
      out[p] = pr.filter((x) => String(x.properties.typepsc) === '18').map((x) => `${(turf.area(x)/1e4).toFixed(1)}ha ${x.properties.libelle}`.slice(0, 70));
    } catch (e) { out[p] = 'err ' + e.message; }
  }
  return out;
});
console.log("DIAG " + JSON.stringify(r, null, 1));
await b.close();
