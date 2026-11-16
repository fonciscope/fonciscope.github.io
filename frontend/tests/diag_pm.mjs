// Diagnostic : ressources du jeu « Fichiers des locaux et des parcelles des personnes morales »
for (const slug of ['fichiers-des-locaux-et-des-parcelles-des-personnes-morales', 'fichiers-majic-des-personnes-morales']) {
  const j = await (await fetch(`https://www.data.gouv.fr/api/1/datasets/${slug}/`)).json();
  console.log('==', slug, j.last_update);
  for (const r of j.resources || []) console.log('RES', r.last_modified?.slice(0, 10), r.format, r.filesize, '|', r.title, '|', r.url);
}
try {
  const a = await (await fetch('https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fichiers-des-locaux-et-des-parcelles-des-personnes-morales/attachments')).json();
  console.log('ATTACH', JSON.stringify(a).slice(0, 4000));
} catch (e) { console.log('ATTACH erreur', e.message); }
