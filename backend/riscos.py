# CLIMORA — Anàlisi de risc de catàstrofes naturals
#
# Aquest fitxer NO modifica el Python antic: n'importa l'app i les ciutats
# i hi afegeix una ruta nova (/riscos).
#
# Com engegar-ho (en lloc de "uvicorn main:app"):
#     uvicorn riscos:app --reload
#
# Si el vostre fitxer antic no es diu main.py, canvieu "main" a la línia següent.
import main as antic

from fastapi import HTTPException

app = antic.app
cities = antic.cities
buscar_ciutat = antic.buscar_ciutat


# ---------------------------------------------------------------------------
# Zones geogràfiques (lat_min, lat_max, lng_min, lng_max, puntuació 0-100).
# Són rectangles aproximats: guanya la PRIMERA zona que conté la ciutat.
# ---------------------------------------------------------------------------

ZONES_SISMIQUES = [
    # Excepcions de baix risc dins de regions actives
    (1, 7, 100, 104.5, 15),       # península de Malacca (Singapur, Kuala Lumpur)
    (-4, 7, 109, 119, 20),        # Borneo
    (22, 29.5, 46, 56.5, 20),     # costa aràbiga del golf Pèrsic
    # Àsia oriental i Pacífic
    (30, 36, 129.5, 141, 95),     # Japó (sud i centre)
    (34, 46, 132.5, 146, 95),     # Japó (centre i nord)
    (21, 26.5, 120, 129, 85),     # Taiwan i illes Ryukyu
    (4, 21, 116, 127, 85),        # Filipines
    (-11, 6, 94, 127, 80),        # Indonèsia
    (-12, 0, 130, 160, 85),       # Papua Nova Guinea
    (-22, -12, 160, 180, 60),     # Fiji i Pacífic sud
    (-48, -34, 165, 179, 85),     # Nova Zelanda
    # Àsia continental
    (28, 37, 60, 97, 80),         # Himàlaia, Hindu Kush, nord de l'Índia i el Pakistan
    (15, 28, 89, 98, 70),         # Myanmar, Bangladesh i nord-est de l'Índia
    (22, 40, 97, 106, 70),        # oest de la Xina (Sichuan, Yunnan, Gansu)
    (35, 45, 80, 95, 60),         # Xinjiang
    (34, 41, 108, 119, 55),       # nord de la Xina
    (36, 44, 63, 80, 80),         # Àsia central
    # Orient Mitjà i Mediterrani
    (36, 42, 26, 45, 85),         # Turquia i Caucas
    (25, 40, 45.5, 63, 80),       # Iran i voltants
    (29, 37, 34, 37, 55),         # Llevant (falla del mar Mort)
    (34, 43, 19, 27, 80),         # Grècia i sud dels Balcans
    (44, 46, 25, 28, 60),         # Romania (Vrancea)
    (36, 47, 6.5, 19, 55),        # Itàlia i Adriàtic
    (36.5, 39.5, -10, -7.5, 55),  # Lisboa
    (30, 37.5, -10, 6.5, 50),     # Magrib i sud d'Espanya
    (63, 67, -25, -13, 60),       # Islàndia
    # Àfrica
    (-16, 13, 28, 43, 40),        # vall del Rift
    # Amèrica
    (54, 65, -165, -140, 85),     # Alaska
    (42, 51, -125, -121.5, 65),   # Cascàdia
    (32, 42, -125, -116, 85),     # Califòrnia
    (14, 21.5, -106, -91, 80),    # centre i sud de Mèxic
    (7, 15.5, -93, -77, 80),      # Amèrica Central
    (17, 20.5, -78, -64, 65),     # Carib
    (9, 12, -77, -62, 50),        # costa carib de Colòmbia i Veneçuela
    (-56, 9, -82, -66, 85),       # Andes
]
SISME_PER_DEFECTE = 10

ZONES_CICLONS = [
    (26, 38, 105, 116.5, 25),     # interior de la Xina (hi arriben afeblits)
    (9.5, 21, 116, 127, 90),      # Filipines
    (12, 32, 105, 145, 85),       # Pacífic nord-oest (tifons)
    (32, 39, 117, 145, 60),       # Japó, Corea i nord de la Xina
    (8, 24, 80, 96.5, 75),        # golf de Bengala
    (15, 26, 56, 74, 40),         # mar d'Aràbia
    (13, 31, -97, -59, 80),       # Carib i golf de Mèxic (huracans)
    (31, 42.5, -82, -69, 45),     # costa est dels Estats Units
    (-26, -10, 34.5, 60, 70),     # Índic sud-oest
    (-24, -10, 112, 155, 70),     # nord d'Austràlia
    (-22, -12, 160, 180, 75),     # Pacífic sud
]
CICLO_PER_DEFECTE = 3

# Costes exposades a tsunamis. Com que les dades no diuen si una ciutat és a
# primera línia de mar, són franges costaneres aproximades.
ZONES_TSUNAMIS = [
    (1, 7, 100, 104.5, 10),       # estret de Malacca (protegit)
    (-4, 7, 109, 119, 25),        # Borneo
    (35, 37.5, -120.5, -118.5, 5),  # vall central de Califòrnia (interior)
    (45, 46, -123, -122, 10),     # Portland (interior)
    (42, 46, 129.5, 135, 20),     # Primórie (Vladivostok)
    (30, 46, 129.5, 146, 75),     # Japó
    (21, 26.5, 120, 123, 60),     # Taiwan
    (4, 21, 116, 127, 70),        # Filipines
    (-11, 6, 94, 127, 65),        # Indonèsia
    (-48, -34, 165, 179, 55),     # Nova Zelanda
    (5, 14, 79.5, 81, 50),        # sud-est de l'Índia i Sri Lanka
    (-27, -17, -71, -70, 80),     # costa nord de Xile
    (-56, -27, -76, -70.9, 80),   # costa centre i sud de Xile
    (-17, -3.5, -82, -76, 75),    # costa del Perú
    (-3.5, 1.5, -81.5, -79.5, 65),  # costa de l'Equador
    (15, 17, -105, -92, 60),      # costa pacífica de Mèxic
    (18, 23, -161, -154, 70),     # Hawaii
    (54, 62, -165, -140, 60),     # Alaska
    (42, 51, -125.5, -122, 55),   # Cascàdia
    (32, 38.5, -123, -117, 35),   # costa de Califòrnia
    (36.5, 39.5, -10, -8.5, 45),  # Lisboa
    (36, 41.5, 22.5, 29.5, 30),   # mar Egeu i mar de Màrmara
    (37, 41, 14, 16.5, 30),       # sud d'Itàlia
]
TSUNAMI_PER_DEFECTE = 3


def puntuacio_zona(ciutat, zones, per_defecte):
    lat = ciutat["latitude"]
    lng = ciutat["longitude"]

    for lat_min, lat_max, lng_min, lng_max, punts in zones:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return punts

    return per_defecte


def limitar(valor):
    return int(round(max(0, min(100, valor))))


def nivell(punts):
    if punts < 25:
        return "Baix"
    if punts < 50:
        return "Moderat"
    if punts < 75:
        return "Alt"
    return "Molt alt"


# ---------------------------------------------------------------------------
# Un càlcul per cada tipus de risc. Cada funció retorna (puntuació, explicació).
# ---------------------------------------------------------------------------

def risc_terratremol(c):
    punts = puntuacio_zona(c, ZONES_SISMIQUES, SISME_PER_DEFECTE)

    if punts >= 75:
        text = "Es troba en una de les zones sísmiques més actives del planeta."
    elif punts >= 50:
        text = "Zona amb activitat sísmica notable i terratrèmols històrics."
    elif punts >= 25:
        text = "Activitat sísmica ocasional a la regió."
    else:
        text = "Lluny dels grans límits de plaques tectòniques."

    return punts, text


def risc_ciclo(c):
    punts = puntuacio_zona(c, ZONES_CICLONS, CICLO_PER_DEFECTE)

    if punts >= 75:
        text = "Dins d'una conca molt activa de ciclons tropicals (huracans o tifons)."
    elif punts >= 50:
        text = "Els ciclons tropicals hi arriben amb certa freqüència."
    elif punts >= 25:
        text = "Hi poden arribar ciclons tropicals, normalment afeblits."
    else:
        text = "Fora de les rutes habituals dels ciclons tropicals."

    return punts, text


def risc_tsunami(c):
    punts = puntuacio_zona(c, ZONES_TSUNAMIS, TSUNAMI_PER_DEFECTE)

    if punts >= 50:
        text = ("Regió amb costes exposades a tsunamis generats per grans "
                "terratrèmols submarins. El risc real depèn de la distància al mar.")
    elif punts >= 25:
        text = ("Tsunamis poc freqüents però possibles a les costes de la regió. "
                "El risc real depèn de la distància al mar.")
    else:
        text = "Sense fonts properes de grans tsunamis."

    return punts, text


def risc_inundacio(c):
    pluja = c["precipitation_mm"]
    codi = c["climate_code"]
    monsonic = codi in ("Am", "Aw", "As") or (len(codi) > 1 and codi[1] == "w")

    punts = pluja / 30 + (20 if monsonic else 0)

    text = f"{pluja} mm de pluja a l'any"
    if monsonic:
        text += ", concentrada en una estació humida molt marcada."
    else:
        text += ", repartida de manera més regular."

    return limitar(punts), text


def risc_calor(c):
    maxima = max(c["avg_temp_jan"], c["avg_temp_jul"])
    humitat = c["humidity_percent"]

    punts = (maxima - 20) * 6.5
    text = f"El mes més càlid té una mitjana de {maxima} °C"

    if maxima >= 27 and humitat >= 70:
        punts += 10
        text += f" amb humitat alta ({humitat}%), que agreuja la calor."
    else:
        text += "."

    return limitar(punts), text


def risc_sequera(c):
    pluja = c["precipitation_mm"]
    codi = c["climate_code"]

    if codi.startswith("BW"):
        punts, text = 90, "Clima desèrtic: l'aigua és escassa tot l'any."
    elif codi.startswith("BS"):
        punts, text = 65, "Clima semiàrid, amb pluges escasses i irregulars."
    elif codi.startswith("Cs"):
        punts, text = 50, "Clima mediterrani, amb estius molt secs."
    elif pluja < 600:
        punts, text = 40, f"Pluja anual baixa ({pluja} mm)."
    elif pluja < 1000:
        punts, text = 25, f"Pluja anual moderada ({pluja} mm)."
    else:
        punts, text = 10, f"Pluja anual abundant ({pluja} mm)."

    if len(codi) > 1 and codi[1] == "w" and not codi.startswith("B"):
        punts += 10
        text += " Té una estació seca marcada."

    return limitar(punts), text


def risc_incendi(c):
    pluja = c["precipitation_mm"]
    codi = c["climate_code"]

    if codi == "Csa":
        punts, text = 75, "Estius calorosos i secs: condicions ideals per als incendis forestals."
    elif codi == "Csb":
        punts, text = 60, "Estius secs que afavoreixen els incendis forestals."
    elif codi.startswith("BS"):
        punts, text = 50, "Vegetació seca bona part de l'any."
    elif codi.startswith("BW"):
        punts, text = 15, "Poca vegetació per cremar en un entorn desèrtic."
    elif codi in ("Aw", "As"):
        punts, text = 40, "L'estació seca afavoreix els focs de sabana."
    elif codi in ("Dfb", "Dfc", "Dwc"):
        punts, text = 30, "Risc d'incendis als boscos boreals a l'estiu."
    elif codi == "Cfa" and pluja < 1300:
        punts, text = 30, "Períodes secs ocasionals amb risc d'incendi."
    else:
        punts, text = 15, "Clima humit, poc favorable als grans incendis."

    if c["country"] == "australia":
        punts += 30
        text += " Austràlia pateix grans incendis de matollar de manera recurrent."

    return limitar(punts), text


def risc_fred(c):
    minima = min(c["avg_temp_jan"], c["avg_temp_jul"])
    punts = (5 - minima) * 5

    return limitar(punts), f"El mes més fred té una mitjana de {minima} °C."


RISCOS = [
    ("Terratrèmols", "🌋", risc_terratremol),
    ("Tsunamis", "🌊", risc_tsunami),
    ("Ciclons tropicals", "🌀", risc_ciclo),
    ("Inundacions", "🌧️", risc_inundacio),
    ("Onades de calor", "🔥", risc_calor),
    ("Sequera", "🏜️", risc_sequera),
    ("Incendis forestals", "🌲", risc_incendi),
    ("Onades de fred", "❄️", risc_fred),
]


def analitzar_riscos(ciutat):
    riscos = []

    for tipus, icona, funcio in RISCOS:
        punts, explicacio = funcio(ciutat)
        riscos.append({
            "tipus": tipus,
            "icona": icona,
            "puntuacio": punts,
            "nivell": nivell(punts),
            "explicacio": explicacio,
        })

    riscos.sort(key=lambda r: r["puntuacio"], reverse=True)

    # Índex global: pesen sobretot els tres riscos més alts.
    tres_mes_alts = [r["puntuacio"] for r in riscos[:3]]
    index_global = limitar(
        0.4 * tres_mes_alts[0] + 0.6 * sum(tres_mes_alts) / 3
    )

    return {
        "ciutat": ciutat["name"].title(),
        "pais": ciutat["country"].title(),
        "clima": ciutat["climate_type"],
        "index_global": index_global,
        "nivell_global": nivell(index_global),
        "risc_principal": riscos[0]["tipus"],
        "riscos": riscos,
        "nota": (
            "Estimació orientativa calculada a partir de la ubicació i de les "
            "dades climàtiques de CLIMORA. No substitueix els mapes oficials "
            "de perillositat."
        ),
    }


@app.get("/riscos")
def riscos(ciutat: str):
    trobada = buscar_ciutat(ciutat)

    if trobada is None:
        raise HTTPException(
            status_code=404,
            detail=f"No s'ha trobat la ciutat: {ciutat}"
        )

    return analitzar_riscos(trobada)


# ---------------------------------------------------------------------------
# Top 10 de països per a un tipus de risc.
# La puntuació d'un país és la mitjana de les seves ciutats a CLIMORA.
# ---------------------------------------------------------------------------

ALIES_PAISOS = {"frança": "france"}


@app.get("/riscos/top")
def top_paisos(tipus: str):
    funcio = None

    for nom, icona, candidata in RISCOS:
        if nom.casefold() == tipus.strip().casefold():
            tipus, funcio = nom, candidata

    if funcio is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existeix el tipus de risc: {tipus}"
        )

    paisos = {}

    for ciutat in cities:
        pais = ALIES_PAISOS.get(ciutat["country"], ciutat["country"])
        punts, _ = funcio(ciutat)
        paisos.setdefault(pais, []).append((punts, ciutat["name"]))

    classificacio = []

    for pais, valors in paisos.items():
        mitjana = sum(punts for punts, _ in valors) / len(valors)
        pitjor = max(valors)

        classificacio.append({
            "pais": pais.title(),
            "puntuacio": limitar(mitjana),
            "nivell": nivell(mitjana),
            "ciutats": len(valors),
            "ciutat_mes_exposada": pitjor[1].title(),
            "_ordre": (-mitjana, -pitjor[0], pais),
        })

    classificacio.sort(key=lambda p: p["_ordre"])

    top = classificacio[:10]
    for posicio, pais in enumerate(top, start=1):
        del pais["_ordre"]
        pais["posicio"] = posicio

    return {
        "tipus": tipus,
        "top": top,
        "nota": (
            "Mitjana de les ciutats de cada país incloses a CLIMORA. "
            "Estimació orientativa, no un rànquing oficial."
        ),
    }


# ---------------------------------------------------------------------------
# Publicació: el mateix servidor també serveix la pàgina (carpeta frontend).
# Ha d'anar al final, després de totes les rutes.
# ---------------------------------------------------------------------------

from pathlib import Path

from fastapi.staticfiles import StaticFiles

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"

if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")