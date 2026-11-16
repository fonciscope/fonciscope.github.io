// Vérification par photo aérienne après une prospection (Gemini simulé) : photos IGN, retrait des immeubles vus
import * as pw from 'playwright';
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('tf-ia-cle', 'AQ.test-cle-factice-0123456789'); localStorage.setItem('tf-ia-modele', 'gemini-2.5-flash'); });
const page = await ctx.newPage();
const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e)));
const img = async (nom) => { const t = (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64'); for (let i = 0; i < t.length; i += 3000) console.log(`IMG-${nom}-${String(i / 3000).padStart(4, '0')}:${t.slice(i, i + 3000)}`); };
let premiere = null;
await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
  const u = route.request().url();
  if (/models\?/.test(u)) return route.fulfill({ json: { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] } });
  const parts = JSON.parse(route.request().postData()).contents[0].parts;
  const imgs = parts.filter((p) => p.inline_data);
  if (imgs.length) {
    if (!premiere) premiere = imgs[0].inline_data.data;
    console.log('APPEL PHOTOS :', imgs.length, 'images, tailles', imgs.map((p) => Math.round(p.inline_data.data.length / 1024) + 'k').join(' '));
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(imgs.map((_, k) => ({ image: k + 1, type: k === 0 ? 'immeuble_collectif' : 'maison_individuelle', confiance: 0.9, constructions: k === 0 ? 'résidence de 4 étages' : 'pavillon et jardin', autour: 'pavillons' }))) }] } }] } });
  }
  // lecture des règlements : rien trouvé
  return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '[]' }] } }] } });
});
await page.goto('https://fonciscope.github.io/#15/47.9480/1.8700', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.click('#tab-pro');
await page.fill('#proCommune', 'Saran (45302)');
await page.locator('#proCommune').press('Tab');
await page.waitForSelector('#proZonesChoix input[data-zone]', { timeout: 60000 }).catch(() => {});
await page.selectOption('#proScope', 'ecran');
await page.fill('#proLmin', '6');
await page.click('#proForm button[type=submit]');
await page.waitForSelector('#proXlsx', { timeout: 240000 });
console.log('AVANT :', (await page.locator('#proStatus').innerText()).split('\n')[0].slice(0, 200));
for (let i = 0; i < 90; i++) { await page.waitForTimeout(2000); const t = await page.locator('#proStatus').innerText(); if (/satellite et retir/.test(t)) break; }
console.log('APRÈS :', (await page.locator('#proStatus').innerText()).replace(/\n/g, ' ').slice(0, 700));
await page.locator('#proRes tr[data-i]').first().click();
await page.waitForTimeout(800);
console.log('DÉTAIL :', (await page.locator('#proRes tr.detail').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 600));
await img('S1-resultats');
if (premiere) { const t = premiere; for (let i = 0; i < t.length; i += 3000) console.log(`IMG-photo-${String(i / 3000).padStart(4, '0')}:${t.slice(i, i + 3000)}`); }
console.log('ERREURS JS :', erreurs.length ? erreurs.join('\n') : 'aucune');
await b.close();
