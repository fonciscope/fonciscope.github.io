import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage();
await page.goto('https://fonciscope.github.io/#13/48.57/2.17', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const api = await import('/js/api.js');
  const zs = await api.gpuByPartition('zone-urba', 'DU_91105');
  const uc = zs.filter((z) => /^UC/.test(z.properties.libelle)).map((z) => `${z.properties.libelle} : ${z.properties.libelong} (${Math.round(turf.area(z))} m²)`);
  const pr = await api.gpuByPartition('prescription-surf', 'DU_91105');
  const oap = pr.filter((p) => String(p.properties.typepsc) === '18' || /OAP|orientation/i.test(p.properties.libelle || '')).map((p) => `${p.properties.typepsc}/${p.properties.stypepsc} ${p.properties.libelle} (${Math.round(turf.area(p))} m²)`);
  const info = await api.gpuByPartition('info-surf', 'DU_91105').catch(() => []);
  const oapI = info.filter((p) => /OAP|orientation/i.test(`${p.properties.libelle} ${p.properties.txt}`)).map((p) => `${p.properties.typeinf} ${p.properties.libelle} (${Math.round(turf.area(p))} m²)`);
  return { uc, oap, oapI };
});
console.log('DIAG ' + JSON.stringify(r, null, 1));
await b.close();
