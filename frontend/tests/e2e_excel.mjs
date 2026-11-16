// Fichier de prospection Excel : prospection de Saran (zone affichée), téléchargement du fichier, contrôle du contenu
import * as pw from 'playwright';
const nav = pw[process.env.NAVIGATEUR || 'chromium'];
const b = await nav.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e)));
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
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#proXlsx')]);
await dl.saveAs('prospection.xlsx');
console.log('FICHIER :', dl.suggestedFilename());
const xl = await import('exceljs').then((m) => m.default || m).catch(() => null);
if (xl) {
  const wb = new xl.Workbook(); await wb.xlsx.readFile('prospection.xlsx');
  const ws = wb.worksheets[0];
  console.log('FEUILLE :', ws.name, ws.rowCount, 'lignes, filtre', JSON.stringify(ws.autoFilter));
  for (let i = 1; i <= Math.min(10, ws.rowCount); i++) console.log('LIGNE', i, JSON.stringify(ws.getRow(i).values));
}
console.log('ERREURS JS :', erreurs.length ? erreurs.join('\n') : 'aucune');
await b.close();
