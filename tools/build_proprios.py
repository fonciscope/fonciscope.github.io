"""Propriétaires personnes morales (sociétés, SCI, communes, bailleurs…) des parcelles des départements copiés.

Source : DGFiP, « Fichiers des locaux et des parcelles des personnes morales » (data.economie.gouv.fr), données publiques,
mises à jour chaque année. Les propriétaires personnes physiques n'y figurent pas (ils ne sont pas publics).
Résultat : proprios/<code INSEE>.json = { idu: "DÉNOMINATION (forme juridique)" }.
"""
import argparse, csv, io, json, re, sys, zipfile
from pathlib import Path
import requests

DATASET = "https://www.data.gouv.fr/api/1/datasets/fichiers-des-locaux-et-des-parcelles-des-personnes-morales/"
S = requests.Session()
S.headers["User-Agent"] = "Fonciscope-proprietaires (github.com/fonciscope/fonciscope.github.io)"


def log(*a):
    print(*a, flush=True)


def archives(deps):
    """Archives « parcelles » de l'année la plus récente qui couvrent les départements demandés."""
    res = S.get(DATASET, timeout=60).json()["resources"]
    parc = []
    for r in res:
        t = r.get("title") or ""
        if r.get("format") != "zip" or not re.search(r"parcelle", t, re.I):
            continue
        an = re.search(r"situation (\d{4})", t)
        bornes = re.findall(r"(\d{1,3})\s*(?:à|a)\s*(\d{1,3})", t)
        if an and bornes:
            parc.append((int(an.group(1)), int(bornes[0][0]), int(bornes[0][1]), t, r["url"]))
    annee = max(p[0] for p in parc)
    garde = {}
    for d in deps:
        n = int(re.sub(r"\D", "", d) or 0)
        for a, lo, hi, t, u in parc:
            if a == annee and lo <= n <= hi:
                garde.setdefault(u, (t, []))[1].append(d)
    log(f"Situation {annee} :", {t: ds for t, ds in garde.values()})
    return annee, garde


def colonne(entete, *motifs):
    for i, h in enumerate(entete):
        if all(re.search(m, h, re.I) for m in motifs):
            return i
    return None


def lire_csv(data, deps, sortie):
    for enc in ("utf-8-sig", "latin-1"):
        try:
            texte = data.decode(enc); break
        except UnicodeDecodeError:
            continue
    lignes = csv.reader(io.StringIO(texte), delimiter=";")
    entete = next(lignes)
    c = {"dep": colonne(entete, "partement"), "com": colonne(entete, "code commune"), "pre": colonne(entete, "pr[ée]fixe"),
         "sec": colonne(entete, "section"), "num": colonne(entete, "plan"), "nom": colonne(entete, "nomination"),
         "forme": colonne(entete, "forme juridique abr")}
    if None in (c["dep"], c["com"], c["sec"], c["num"], c["nom"]):
        log("  colonnes non reconnues :", entete[:30]); return 0
    n = 0
    for l in lignes:
        try:
            dep = l[c["dep"]].strip().zfill(2)
            if dep not in deps:
                continue
            com = l[c["com"]].strip().zfill(3)[-3:]
            pre = (l[c["pre"]].strip() if c["pre"] is not None else "").zfill(3) or "000"
            sec = l[c["sec"]].strip().upper().rjust(2, "0")
            num = l[c["num"]].strip().zfill(4)
            nom = re.sub(r"\s+", " ", l[c["nom"]]).strip()
            forme = l[c["forme"]].strip() if c["forme"] is not None else ""
        except IndexError:
            continue
        if not nom or not sec or not num.strip("0"):
            continue
        insee, idu = dep + com, dep + com + pre + sec + num
        lib = f"{nom} ({forme})" if forme and forme.upper() not in nom.upper() else nom
        d = sortie.setdefault(insee, {})
        d[idu] = lib if idu not in d or lib in d[idu] else f"{d[idu]} / {lib}"
        n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    deps = [str(d).zfill(2) for d in json.loads(Path(a.config).read_text())["departements"]]
    annee, garde = archives(deps)
    sortie = {}
    for url, (titre, ds) in garde.items():
        log("Téléchargement :", titre)
        r = S.get(url, timeout=1800, stream=True)
        r.raise_for_status()
        buf = io.BytesIO()
        for bloc in r.iter_content(1 << 22):
            buf.write(bloc)
        log(f"  {buf.tell() / 1e6:.0f} Mo")
        z = zipfile.ZipFile(buf)
        for info in z.infolist():
            nom = info.filename
            if info.is_dir():
                continue
            # fichiers par département (le numéro figure dans le nom) ; zip imbriqués possibles
            if not any(re.search(rf"(^|[^0-9]){d}0?([^0-9]|$)", Path(nom).stem) for d in ds) and len(z.infolist()) > 3:
                continue
            data = z.read(info)
            if nom.lower().endswith(".zip"):
                z2 = zipfile.ZipFile(io.BytesIO(data))
                for i2 in z2.infolist():
                    if not i2.is_dir():
                        log("  lecture", nom, ">", i2.filename, lire_csv(z2.read(i2), set(ds), sortie))
            else:
                log("  lecture", nom, lire_csv(data, set(ds), sortie))
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for insee, d in sortie.items():
        (out / f"{insee}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    (out / "index.json").write_text(json.dumps({"annee": annee, "communes": len(sortie), "parcelles": sum(len(d) for d in sortie.values())}))
    log(f"Propriétaires personnes morales : {sum(len(d) for d in sortie.values())} parcelles dans {len(sortie)} communes (situation {annee})")


if __name__ == "__main__":
    sys.exit(main())
