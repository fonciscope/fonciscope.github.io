// Vérification par photo aérienne (IGN) : chaque terrain proposé est montré à Gemini sur la photo la plus récente,
// contour de la parcelle tracé en jaune ; l'IA dit ce qu'elle voit (maison individuelle, immeuble collectif, activité…).
// Les photos aériennes de l'IGN sont publiques. Aucun nom de propriétaire n'est envoyé.
/* global turf */
import { cleIA, choisirModele, gemFetch, erreurHttp, ErreurIA } from './assistant.js';

const WMS = 'https://data.geopf.fr/wms-r/wms';
const R = 6378137;
const merc = ([lng, lat]) => [R * (lng * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

/** Photo aérienne de la parcelle (carré de 512 px, marge de 12 m) avec son contour, en JPEG base64. */
export async function imageParcelle(f) {
  const b = turf.bbox(f);
  let [x0, y0] = merc([b[0], b[1]]), [x1, y1] = merc([b[2], b[3]]);
  const m = 12 / Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180); // 12 m au sol, en mètres Mercator
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const cote = Math.max(x1 - x0, y1 - y0, 60), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  x0 = cx - cote / 2; x1 = cx + cote / 2; y0 = cy - cote / 2; y1 = cy + cote / 2;
  const N = 512;
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:3857&BBOX=${x0},${y0},${x1},${y1}&WIDTH=${N}&HEIGHT=${N}&FORMAT=image/jpeg`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`photo aérienne indisponible (${r.status})`);
  const bmp = await createImageBitmap(await r.blob());
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  g.drawImage(bmp, 0, 0, N, N);
  g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3;
  const px = (c) => { const [x, y] = merc(c); return [((x - x0) / cote) * N, N - ((y - y0) / cote) * N]; };
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  g.beginPath();
  for (const p of polys) for (const ring of p) ring.forEach((c, i) => { const [x, y] = px(c); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  return cv.toDataURL('image/jpeg', 0.82).split(',')[1];
}

const TYPES = ['maison_individuelle', 'maisons_mitoyennes', 'immeuble_collectif', 'activite_commerce', 'equipement', 'terrain_nu', 'jardin_ou_friche', 'parking', 'chantier_recent', 'autre'];
const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      image: { type: 'INTEGER' },
      type: { type: 'STRING', enum: TYPES },
      confiance: { type: 'NUMBER', description: 'de 0 à 1' },
      constructions: { type: 'STRING', description: 'ce qui est construit dans le contour jaune, en quelques mots' },
      autour: { type: 'STRING', description: 'le voisinage immédiat : pavillons, immeubles, activités…' },
    },
    required: ['image', 'type', 'confiance'],
  },
};
const CONSIGNE = `Tu es un expert en prospection foncière. Pour chaque photo aérienne verticale (vue du ciel, nord en haut),
regarde UNIQUEMENT ce qui est à l'intérieur du contour jaune (une parcelle cadastrale) et classe-le :
maison_individuelle (une villa ou un pavillon avec jardin), maisons_mitoyennes (maisons accolées en bande),
immeuble_collectif (bâtiment d'habitation de plusieurs étages ou résidence, toit plat ou large, parkings collectifs),
activite_commerce (entrepôt, hangar, commerce, bureaux), equipement (école, gymnase, église…), terrain_nu,
jardin_ou_friche, parking, chantier_recent, autre. Donne une confiance de 0 à 1, décris en quelques mots ce qui est
construit dans le contour et le voisinage immédiat (pavillons, immeubles…). Réponds pour chaque image, dans l'ordre.`;

/**
 * Vérifie une liste de terrains par photo aérienne, par paquets de 8 images par appel.
 * Ajoute h.satellite = { type, confiance, constructions, autour } à chaque terrain vérifié.
 */
export async function verifier(liste, onEtape) {
  const cle = cleIA();
  if (!cle) throw new ErreurIA('Ajoutez votre clé Gemini (bulle Assistant) pour vérifier par satellite');
  const modele = await choisirModele(cle);
  let faits = 0;
  for (let i = 0; i < liste.length; i += 8) {
    const lot = liste.slice(i, i + 8);
    onEtape && onEtape(`Photos aériennes : ${i + 1} à ${i + lot.length} sur ${liste.length}…`);
    const parts = [{ text: CONSIGNE }], ok = [];
    for (const h of lot) {
      try { const img = await imageParcelle(h.f); parts.push({ text: `Image ${ok.length + 1}` }, { inline_data: { mime_type: 'image/jpeg', data: img } }); ok.push(h); } catch { /* photo indisponible : terrain non vérifié */ }
    }
    if (!ok.length) continue;
    onEtape && onEtape(`Analyse de ${ok.length} photo(s) par Gemini…`);
    const r = await gemFetch(cle, `/models/${modele}:generateContent`, { method: 'POST', body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA } }) });
    if (!r.ok) throw await erreurHttp(r);
    const j = await r.json();
    let rep = [];
    try { rep = JSON.parse((j.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('')); } catch { rep = []; }
    for (const x of Array.isArray(rep) ? rep : []) {
      const h = ok[(+x.image || 0) - 1];
      if (h && TYPES.includes(x.type)) { h.satellite = { type: x.type, confiance: +x.confiance || 0, constructions: x.constructions || '', autour: x.autour || '' }; faits++; }
    }
  }
  return faits;
}

export const LIBELLES = {
  maison_individuelle: 'maison individuelle', maisons_mitoyennes: 'maisons mitoyennes', immeuble_collectif: 'immeuble collectif',
  activite_commerce: 'activité ou commerce', equipement: 'équipement', terrain_nu: 'terrain nu', jardin_ou_friche: 'jardin ou friche',
  parking: 'parking', chantier_recent: 'chantier récent', autre: 'autre',
};
