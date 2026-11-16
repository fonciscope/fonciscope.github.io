// Breuillet (UC) : les grands secteurs d'OAP écartent presque tout ; le bouton « Voir aussi les terrains en OAP » doit relancer et en trouver.
import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('https://fonciscope.github.io/#13/48.57/2.17', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.click('#tab-pro'); await page.waitForTimeout(800);
const avant = await page.evaluate(async () => {
  const pro = window.tfDebug().pro;
  const res = await pro.lancer({ commune: 'Breuillet', zones: ['UC'], exclure_oap: true });
  return { terrains: res.terrains_logement, ecartees: res.ecartees };
});
console.log('AVANT ' + JSON.stringify(avant));
await page.waitForTimeout(2000);
console.log('STATUT ' + (await page.locator('#proStatus').innerText().catch((e) => 'absent ' + e.message)).slice(0, 600));
const bouton = page.locator('[data-pro-avec-oap]');
console.log('BOUTON ' + (await bouton.count()) + ' ' + (await bouton.first().textContent().catch(() => '')));
await bouton.first().click();
await page.waitForFunction(() => { const p = window.tfDebug().pro; return !p.running && p.results; }, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const apres = await page.evaluate(() => { const R = window.tfDebug().pro.results; return { n: R.list.length, oap: R.list.filter((h) => h.oap).length, groupes: R.list.filter((h) => h.groupe).length, top: R.list.slice(0, 6).map((h) => `${h.f.properties.idu} ${h.zone.properties.libelle} ${Math.round(h.occ.S)}m² oap=${!!h.oap} lg=${h.opt ? h.opt.lg : h.pot ? h.pot.lg : '?'}`) }; });
console.log('APRES ' + JSON.stringify(apres, null, 1));
await page.screenshot({ path: 'e2e_oap.png' });
if (!apres.n) { console.log('ECHEC aucun terrain'); process.exit(1); }
await b.close();
