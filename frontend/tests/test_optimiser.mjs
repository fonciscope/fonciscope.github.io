// Plan optimisé : barres de logements dans une parcelle rectangulaire de 40 m (rue) × 70 m
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
globalThis.turf = turf;
const { optimiser } = await import('../js/faisabilite.js');
// parcelle orientée nord-sud, rue au sud (côté bas)
const lng0 = 1.87, lat0 = 47.95, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
const P = (x, y) => [lng0 + x / kx, lat0 + y / ky];
const f = turf.polygon([[P(0, 0), P(40, 0), P(40, 70), P(0, 70), P(0, 0)]]);
const fac = { a: 40, p1: turf.point(P(0, 0)), p2: turf.point(P(40, 0)), cap: turf.bearing(P(0, 0), P(40, 0)), surRue: true };
// CES 50 %, retrait 4 m, recul 5 m, hauteur 12 m : 1 400 m² d'emprise permis
const o = optimiser(f, fac, { ret: 4, recul: 5, ces: 50, pt: 20, S: 2800, h: 12 });
assert.ok(o, 'plan trouvé');
console.log(`Plan : ${o.nb} bâtiment(s), épaisseur ${o.profondeur} m, ${o.orientation}, emprise ${Math.round(o.emprise)} m²`);
assert.ok(o.emprise <= 1400 + 5, 'emprise au sol respectée');
assert.ok(o.emprise >= 1000, 'enveloppe bien utilisée');
// chaque bâtiment est dans l'enveloppe (retrait 4 m)
const env = turf.buffer(f, -4, { units: 'meters' });
for (const b of o.batiments) {
  const x = turf.intersect(turf.featureCollection([b, env]));
  assert.ok(x && turf.area(x) >= turf.area(b) * 0.97, 'bâtiment dans l\'enveloppe');
}
// petite parcelle : un seul bâtiment
const g = turf.polygon([[P(0, 0), P(20, 0), P(20, 25), P(0, 25), P(0, 0)]]);
const o2 = optimiser(g, { ...fac, p2: turf.point(P(20, 0)) }, { ret: 3, recul: 0, ces: 60, pt: 20, S: 500, h: 9 });
assert.ok(o2 && o2.nb === 1);
console.log(`Petite parcelle : ${o2.nb} bâtiment, ${Math.round(o2.emprise)} m²`);
console.log('test_optimiser : ok');
