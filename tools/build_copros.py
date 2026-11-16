"""Copropriétés immatriculées (Registre national d'immatriculation des copropriétés, ANAH, data.gouv.fr) des
départements copiés : parcelles d'immeubles collectifs existants. Résultat : copros/<INSEE>.json = { idu: {lots, nom} }."""
import argparse, csv, io, json, re, sys, zipfile
from pathlib import Path
import requests

DATASET = "https://www.data.gouv.fr/api/1/datasets/registre-national-dimmatriculation-des-coproprietes/"
S = requests.Session()
S.headers["User-Agent"] = "Fonciscope-coproprietes (github.com/fonciscope/fonciscope.github.io)"


def log(*a):
    print(*a, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    deps = {str(d).zfill(2) for d in json.loads(Path(a.config).read_text())["departements"]}
    res = S.get(DATASET, timeout=60).json()["resources"]
    cands = [r for r in res if (r.get("format") or "").lower() in ("csv", "zip") and not re.search(r"dictionnaire|schema|notice", r.get("title") or "", re.I)]
    cands.sort(key=lambda r: (r.get("last_modified") or "", r.get("filesize") or 0), reverse=True)
    for r in cands[:6]:
        log("Ressource :", r.get("last_modified", "")[:10], r.get("format"), r.get("filesize"), r.get("title"))
    r = cands[0]
    log("Téléchargement :", r["title"], r["url"])
    data = S.get(r["url"], timeout=1800).content
    if data[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(data))
        nom = max((i for i in z.infolist() if i.filename.lower().endswith(".csv")), key=lambda i: i.file_size)
        data = z.read(nom)
    texte = None
    for enc in ("utf-8-sig", "latin-1"):
        try:
            texte = data.decode(enc); break
        except UnicodeDecodeError:
            pass
    sep = ";" if texte[:2000].count(";") > texte[:2000].count(",") else ","
    rd = csv.reader(io.StringIO(texte), delimiter=sep)
    entete = [h.strip().lower() for h in next(rd)]
    log("Colonnes :", entete[:60])
    def col(*motifs, sauf=None):
        for i, h in enumerate(entete):
            if all(re.search(m, h) for m in motifs) and not (sauf and re.search(sauf, h)):
                return i
        return None
    c_insee = col("commune", "code|insee", sauf="postal") 
    c_lots = col("lots", "habitation") if col("lots", "habitation") is not None else col("nombre", "lots")
    c_nom = col("nom", "copro") if col("nom", "copro") is not None else col("nom")
    c_refs = [i for i, h in enumerate(entete) if re.search(r"r[ée]f[ée]rence.*cadastr|cadastr.*r[ée]f", h)]
    log("Index :", c_insee, c_lots, c_nom, c_refs)
    sortie, n = {}, 0
    for l in rd:
        try:
            insee = l[c_insee].strip().zfill(5)
        except (IndexError, TypeError):
            continue
        if insee[:2] not in deps and insee[:3] not in deps:
            continue
        lots = l[c_lots].strip() if c_lots is not None and c_lots < len(l) else ""
        nom = l[c_nom].strip()[:80] if c_nom is not None and c_nom < len(l) else ""
        for i in c_refs:
            if i >= len(l):
                continue
            for ref in re.split(r"[|,;/]", l[i]):
                m = re.search(r"(?:(\d{5})\s*)?(\d{3})?\s*([A-Z0-9]{1,2})\s*0*(\d{1,4})\s*$", ref.strip().upper())
                if not m or not ref.strip():
                    continue
                com = m.group(1) or insee
                idu = com + (m.group(2) or "000") + m.group(3).rjust(2, "0") + m.group(4).zfill(4)
                sortie.setdefault(com, {})[idu] = {"lots": int(lots) if lots.isdigit() else None, "nom": nom}
                n += 1
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for insee, d in sortie.items():
        (out / f"{insee}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    log(f"Copropriétés : {n} parcelles dans {len(sortie)} communes")
    if sortie:
        k = next(iter(sortie)); log("Exemple :", k, list(sortie[k].items())[:3])


if __name__ == "__main__":
    sys.exit(main())
