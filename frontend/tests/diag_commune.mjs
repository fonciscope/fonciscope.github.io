// Diagnostic d'une prospection (commune et zones choisies) : pourquoi aucun terrain
import { chromium } from 'playwright';
const COM = process.env.COMMUNE || 'Breuillet', ZONES = (process.env.ZONES || 'UC').split(',');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('https://fonciscope.github.io/#13/48.57/2.17', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(async ({ COM, ZONES }) => {
  const pro = window.tfDebug().pro, store = await import('/js/store.js');
  const z = await pro.zonesListe(COM);
  const out = { zones: z.zones.map((x) => `${x.code}${x.logement_autorise ? '' : '(non logement)'}`).join(' '), doc: z.document_urbanisme };
  const regles = {};
  for (const x of z.zones) { const rg = store.getRules(store.ruleKey(z.document_urbanisme, x.code)); if (rg) regles[x.code] = ['ces', 'h', 'recul', 'ret', 'pt', 'stat'].map((k) => `${k}=${rg[k]}`).join(' ') + ' ' + rg.source; }
  out.reglesAvant = regles;
  for (const essai of [{ commune: COM, zones: ZONES }, { commune: COM, zones: ZONES, logements_min: 0, collectif: false }, { commune: COM, zones: ZONES, logements_min: 0, collectif: false, surface_min: 500, exclure_oap: false, pignon_sur_rue: false, maisons_seulement: false }]) {
    try {
      const res = await pro.lancer(essai);
      const R = pro.results;
      out[JSON.stringify(essai)] = { appliques: res.criteres_appliques, ecartees: res.ecartees, compte: R.compte, retenus: res.terrains_logement, attente: R.attente.length, avert: R.avertissements, top: (res.meilleurs || []).slice(0, 5).map((m) => `${m.reference} ${m.zone} ${m.surface_m2}m² ${m.nature} lg=${m.logements} ${m.logements_source}`) };
    } catch (e) { out[JSON.stringify(essai)] = 'ERREUR ' + e.message; }
  }
  const zs = store.allRules(); out.reglesApres = Object.fromEntries(Object.entries(zs).filter(([k]) => k.startsWith(z.document_urbanisme)).map(([k, v]) => [k, ['ces', 'h', 'recul', 'ret', 'pt', 'stat'].map((c) => `${c}=${v[c]}`).join(' ') + ' ' + v.source]));
  return out;
}, { COM, ZONES });
console.log('DIAG ' + JSON.stringify(r, null, 1));
await b.close();
