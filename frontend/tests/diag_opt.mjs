// Diagnostic : durée de l'optimiseur de plans sur des parcelles réelles, et déroulé de la prospection
import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (/^(ETAPE|OPT)/.test(m.text())) console.log(m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('https://fonciscope.github.io/#15/47.9480/1.8700', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(async () => {
  const api = await import('/js/api.js'); const fais = await import('/js/faisabilite.js');
  const out = [];
  for (const ref of [['45302', 'AE', '229'], ['45302', 'AY', '307'], ['45302', 'AZ', '363']]) {
    const f = await api.parcelleByRef(...ref);
    const t0 = performance.now();
    const fac = fais.facade(f, []);
    const t1 = performance.now();
    const o = fais.optimiser(f, fac, { ret: 4, recul: 5, ces: 40, pt: 25, S: +f.properties.contenance, h: 9 });
    out.push(`OPT ${ref.join(' ')} : facade ${Math.round(t1 - t0)} ms, optimiseur ${Math.round(performance.now() - t1)} ms, ${o ? o.nb + ' bât. ' + Math.round(o.emprise) + ' m²' : 'aucun'}`);
  }
  return out;
});
r.forEach((x) => console.log(x));
await page.evaluate(() => { let der = '', t0 = performance.now(); setInterval(() => { const s = (document.querySelector('#proStatus')?.innerText || '').split('\n')[0].slice(0, 90); if (s !== der) { der = s; console.log('ETAPE ' + Math.round((performance.now() - t0) / 1000) + ' s : ' + s); } }, 500); });
await page.evaluate(() => { window.tfDebug().pro.lancer({ commune: 'Saran', perimetre: 'ecran', logements_min: 6, surface_min: 1200 }).catch((e) => console.log('ETAPE erreur ' + e.message)); });
await page.waitForTimeout(240000);
await b.close();
