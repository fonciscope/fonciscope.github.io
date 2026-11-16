/* global turf */
// Faisabilité d'une parcelle : implantation d'un bâtiment (esquisse) et bilan ligne par ligne,
// pré-remplis avec les règles du PLU, modifiables à la main.

// ---------- Géométrie ----------
const anneau = (f) => {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates[0];
  // MultiPolygon : plus grand morceau
  let best = null, a = -1;
  for (const c of g.coordinates) { const ar = turf.area(turf.polygon(c)); if (ar > a) { a = ar; best = c[0]; } }
  return best;
};

/**
 * Façade sur rue : côtés de la parcelle qui ne touchent aucune parcelle voisine (à 1,5 m près).
 * Les côtés contigus presque alignés sont fusionnés ; la plus longue façade est retenue.
 * Sans voisines connues, le plus long côté est pris.
 */
export function facade(f, voisines = []) {
  const r = anneau(f);
  const lignes = [];
  for (const v of voisines) {
    try { turf.flatten(turf.polygonToLine(v)).features.forEach((l) => lignes.push(l)); } catch { /* géométrie invalide */ }
  }
  const cotes = [];
  for (let i = 0; i < r.length - 1; i++) {
    const p1 = r[i], p2 = r[i + 1], len = turf.distance(p1, p2, { units: 'meters' });
    if (len < 0.5) continue;
    const mid = turf.midpoint(p1, p2);
    const libre = !lignes.length || lignes.every((l) => turf.pointToLineDistance(mid, l, { units: 'meters' }) > 1.5);
    cotes.push({ p1, p2, len, cap: turf.bearing(p1, p2), libre });
  }
  // fusion des côtés libres consécutifs presque alignés (écart < 20°)
  const groupes = [];
  for (const c of cotes) {
    const g = groupes[groupes.length - 1];
    if (c.libre && g && g.libre && Math.abs(((c.cap - g.cap + 540) % 360) - 180) < 20 && g.p2 === c.p1) { g.p2 = c.p2; g.len += c.len; }
    else groupes.push({ ...c });
  }
  const libres = groupes.filter((g) => g.libre);
  const pool = libres.length ? libres : groupes;
  const best = pool.reduce((a, b) => (b.len > a.len ? b : a), pool[0]);
  return { a: best.len, p1: best.p1, p2: best.p2, cap: turf.bearing(best.p1, best.p2), surRue: libres.length > 0 };
}

/** Sens « vers l'intérieur » de la parcelle depuis la façade (cap + 90° ou − 90°). */
function versInterieur(f, fac) {
  const mid = turf.midpoint(fac.p1, fac.p2);
  const a = turf.destination(mid, 2, fac.cap + 90, { units: 'meters' });
  return turf.booleanPointInPolygon(a, f) ? fac.cap + 90 : fac.cap - 90;
}

/**
 * Esquisse : rectangle de longueur c (le long de la façade) et de profondeur d,
 * posé à `recul` mètres de la façade, décalé latéralement de `decal` mètres, tourné de `rot` degrés,
 * puis limité à l'enveloppe constructible (parcelle diminuée du retrait sur les limites).
 */
export function esquisse(f, fac, { c, d, recul = 0, decal = 0, avance = 0, rot = 0, ret = 0 }) {
  const inw = versInterieur(f, fac);
  const mid = turf.midpoint(fac.p1, fac.p2);
  const centreAvant = turf.destination(turf.destination(mid, decal, fac.cap, { units: 'meters' }), recul + avance, inw, { units: 'meters' });
  const p1 = turf.destination(centreAvant, c / 2, fac.cap + 180, { units: 'meters' });
  const p2 = turf.destination(centreAvant, c / 2, fac.cap, { units: 'meters' });
  const p3 = turf.destination(p2, d, inw, { units: 'meters' });
  const p4 = turf.destination(p1, d, inw, { units: 'meters' });
  let rect = turf.polygon([[p1, p2, p3, p4, p1].map((p) => p.geometry.coordinates)]);
  if (rot) rect = turf.transformRotate(rect, rot, { pivot: turf.centroid(rect) });
  let env = f;
  try { if (ret > 0) env = turf.buffer(f, -ret, { units: 'meters' }) || f; } catch { env = f; }
  let bat = null;
  try { bat = turf.intersect(turf.featureCollection([rect, env])); } catch { bat = null; }
  return { rect, bat, env, emprise: bat ? turf.area(bat) : 0 };
}

// ---------- Bilan ----------
/** Valeurs de départ tirées de la parcelle, des règles du PLU et des réglages. */
export function valeursInitiales({ S, regles, hyp, fac, inconstructible = 0 }) {
  const ces = regles.ces !== null && regles.ces !== undefined ? regles.ces * 100 : 100;
  const niv = regles.h !== null && regles.h !== undefined ? Math.round((regles.h / hyp.hEt) * 10) / 10 : 1;
  const b = regles.ret !== null && regles.ret !== undefined ? regles.ret : 0;
  return {
    S, inc: Math.round(inconstructible), ces, a: fac ? Math.round(fac.a * 100) / 100 : 0, b, d: 15,
    niv, niveaux: null, ratioBrut: hyp.k * 100, ratioHab: 95, taille: hyp.sMoy, social: 0, seuilSocial: 0,
    placesLgt: regles.stat !== null && regles.stat !== undefined ? regles.stat : 1, m2Place: 60, placeSurf: 20,
    ptSsol: regles.pt !== null && regles.pt !== undefined ? regles.pt * 100 : 20, placeSsol: 30,
    recul: regles.recul !== null && regles.recul !== undefined ? regles.recul : 0, decal: 0, avance: 0, rot: 0,
  };
}

/** Pourcentage de chaque niveau : 100 % jusqu'au dernier niveau entier, puis la fraction restante. */
export function niveauxPct(niv) {
  const n = Math.max(1, Math.ceil(niv - 1e-9)), out = [];
  for (let i = 1; i <= n; i++) out.push(i <= Math.floor(niv) ? 100 : Math.round((niv - Math.floor(niv)) * 100));
  return out;
}

/**
 * Bilan complet (mêmes lignes qu'un tableau de faisabilité) à partir des valeurs saisies
 * et de l'emprise réellement dessinée (empriseDessin, m²).
 */
export function bilan(v, empriseDessin) {
  const Sc = Math.max(0, v.S - v.inc);
  const empMax = (Sc * v.ces) / 100;
  const c = Math.max(0, v.a - 2 * v.b);
  const empCalc = empriseDessin !== undefined && empriseDessin !== null ? empriseDessin : c * v.d;
  const emp = Math.min(empMax, empCalc);
  const pct = v.niveaux && v.niveaux.length ? v.niveaux : niveauxPct(v.niv);
  const brute = pct.reduce((a, p) => a + (emp * p) / 100, 0);
  const sdp = (brute * v.ratioBrut) / 100;
  const shab = (sdp * v.ratioHab) / 100;
  const lgt = Math.floor(sdp / v.taille);
  const sociaux = v.social && sdp >= (v.seuilSocial || 0) ? Math.ceil((lgt * v.social) / 100) : 0;
  const places = Math.ceil(v.placesLgt ? lgt * v.placesLgt : sdp / (v.m2Place || 60));
  const surfBox = Math.max(0, v.S - emp - (v.S * v.ptSsol) / 100);
  const placesSurf = Math.floor(surfBox / (v.placeSurf || 20));
  const parNivSsol = (v.S * (100 - v.ptSsol)) / 100;
  const maxParNiv = Math.floor(parNivSsol / (v.placeSsol || 30));
  const reste = Math.max(0, places - placesSurf);
  const nivSsol = reste ? Math.ceil(reste / Math.max(1, maxParNiv)) : 0;
  return { Sc, empMax, c, empCalc, emp, pct, brute, sdp, shab, lgt, sociaux, places, surfBox, placesSurf, parNivSsol, maxParNiv, nivSsol };
}

// ---------- Plan optimisé : barres de logements dans l'enveloppe constructible ----------
/**
 * Cherche l'implantation qui donne le plus de logements selon le PLU : une à trois barres rectangulaires
 * (épaisseur de 10 à 18 m, longueur 10 m au moins), parallèles à la rue ou perpendiculaires, entièrement dans
 * l'enveloppe constructible (parcelle diminuée du retrait sur les limites et du recul sur la voie), espacées d'au moins
 * la moitié de leur hauteur (8 m minimum), sans dépasser l'emprise au sol ni la pleine terre autorisées.
 * @returns { batiments: [Feature], emprise, profondeur, orientation, nb } ou null
 */
export function optimiser(f, fac, { ret = 0, recul = 0, ces = 100, pt = 0, S, h = 9, inc = 0 }) {
  // enveloppe : retrait sur les limites, puis recul côté rue
  let env = f;
  try { if (ret > 0) env = turf.buffer(f, -ret, { units: 'meters' }) || null; } catch { env = f; }
  if (!env) return null;
  if (recul > ret && fac) {
    try {
      const bande = turf.buffer(turf.lineString([fac.p1.geometry ? fac.p1.geometry.coordinates : fac.p1, fac.p2.geometry ? fac.p2.geometry.coordinates : fac.p2]), recul, { units: 'meters' });
      const d = turf.difference(turf.featureCollection([env, bande]));
      if (d) env = d;
    } catch { /* bande de recul non calculable */ }
  }
  const Sx = S || turf.area(f);
  const cap = Math.max(0, Math.min(((Sx - inc) * ces) / 100, Sx * (1 - pt / 100)));
  if (cap < 60) return null;
  // repère local en mètres
  const c0 = turf.centroid(f).geometry.coordinates, kx = 111320 * Math.cos((c0[1] * Math.PI) / 180), ky = 110540;
  const loc = ([x, y]) => [(x - c0[0]) * kx, (y - c0[1]) * ky];
  const geo = ([x, y]) => [x / kx + c0[0], y / ky + c0[1]];
  const polys = env.geometry.type === 'Polygon' ? [env.geometry.coordinates] : env.geometry.coordinates;
  const anneaux = polys.flatMap((p) => p.map((r) => r.map(loc)));
  const capRue = fac ? fac.cap : 0;
  const angles = [capRue, capRue + 90];
  const gap = Math.max(8, h / 2);
  let best = null;
  for (const capA of angles) {
    const a = ((90 - capA) * Math.PI) / 180; // direction de la barre (cap géographique -> angle mathématique)
    const ca = Math.cos(-a), sa = Math.sin(-a);
    const rot = anneaux.map((r) => r.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]));
    let ymin = Infinity, ymax = -Infinity;
    rot.forEach((r) => r.forEach(([, y]) => { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }));
    // intervalles couverts par l'enveloppe sur une horizontale
    const couvre = (y) => {
      const xs = [];
      for (const r of rot) for (let i = 0; i < r.length - 1; i++) {
        const [x1, y1] = r[i], [x2, y2] = r[i + 1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((p, q) => p - q);
      const out = [];
      for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
      return out;
    };
    const inter = (A, B) => { const o = []; for (const [a1, a2] of A) for (const [b1, b2] of B) { const l = Math.max(a1, b1), r = Math.min(a2, b2); if (r - l > 0) o.push([l, r]); } return o; };
    for (const d of [10, 12, 14, 16, 18]) {
      const pas = 0.5, barres = [];
      for (let y = ymin + 0.05; y + d <= ymax; y += pas) {
        let I = couvre(y + 0.2);
        for (const t of [0.25, 0.5, 0.75]) I = inter(I, couvre(y + d * t));
        I = inter(I, couvre(y + d - 0.2));
        const g = I.reduce((m, x) => (x[1] - x[0] > m[1] - m[0] ? x : m), [0, 0]);
        const L = g[1] - g[0];
        if (L >= 10) barres.push({ y, x1: g[0], x2: g[1], aire: L * d });
      }
      if (!barres.length) continue;
      // jusqu'à 3 barres espacées (programmation dynamique sur la position)
      const n = barres.length, dp = [barres.map((b) => [Math.min(b.aire, cap), [b]])];
      for (let k = 1; k < 3; k++) {
        const prev = dp[k - 1], cur = [];
        for (let i = 0; i < n; i++) {
          let m = null;
          for (let j = 0; j < i; j++) {
            if (!prev[j] || barres[i].y < barres[j].y + d + gap) continue;
            const tot = prev[j][1].reduce((s, b) => s + b.aire, 0) + barres[i].aire;
            if (!m || Math.min(tot, cap) > m[0]) m = [Math.min(tot, cap), [...prev[j][1], barres[i]]];
          }
          cur.push(m);
        }
        dp.push(cur);
      }
      for (const lvl of dp) for (const x of lvl) {
        if (!x) continue;
        const tot = x[1].reduce((s, b) => s + b.aire, 0);
        // à emprise égale : moins de bâtiments, puis plus compact
        if (!best || x[0] > best.val + 1 || (Math.abs(x[0] - best.val) <= 1 && (x[1].length < best.barres.length || (x[1].length === best.barres.length && tot < best.tot)))) {
          best = { val: x[0], tot, barres: x[1], d, ca, sa, capA };
        }
      }
    }
  }
  if (!best) return null;
  // barres raccourcies à l'emprise autorisée si besoin
  const k = best.tot > best.val ? best.val / best.tot : 1;
  const inv = ([x, y]) => [x * best.ca + y * best.sa, -x * best.sa + y * best.ca];
  const batiments = best.barres.map((b) => {
    const L = (b.x2 - b.x1) * k, x1 = b.x1 + ((b.x2 - b.x1) - L) / 2, x2 = x1 + L;
    const ring = [[x1, b.y], [x2, b.y], [x2, b.y + best.d], [x1, b.y + best.d], [x1, b.y]].map((p) => geo(inv(p)));
    return turf.polygon([ring], { longueur: Math.round(L), profondeur: best.d });
  });
  return { batiments, emprise: batiments.reduce((s, b) => s + turf.area(b), 0), profondeur: best.d, nb: batiments.length, orientation: Math.abs(((best.capA - capRue) % 180)) < 1 ? 'parallèle à la rue' : 'perpendiculaire à la rue', env };
}
