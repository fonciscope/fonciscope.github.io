// Contrôle de syntaxe de tous les modules du site (un module invalide bloque tout le site dans le navigateur)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'js');
let ko = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^import [^;]*;$/mg, '').replace(/^export (default )?/mg, '').replace(/^export \{[^}]*\};?$/mg, '');
  try { new Function(src); } catch (e) { ko++; console.log(`ERREUR DE SYNTAXE ${f} : ${e.message}`); }
}
if (ko) process.exit(1); else console.log('Syntaxe des modules : ok');
