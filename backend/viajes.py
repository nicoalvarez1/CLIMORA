"""API del planificador con datos abiertos y caché para reducir consultas."""

from datetime import date, datetime, timedelta, timezone
from threading import Lock
from time import monotonic
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import logging

import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
MET_FORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
PHOTON_URL = "https://photon.komoot.io/reverse"
OVERPASS_URLS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
USER_AGENT = "CLIMORA travel planner/1.0 (open data client)"
logger = logging.getLogger(__name__)

# Caché en memoria: lugares por 24 h, coordenadas por 30 días y previsión por 3 h.
CACHE = {}
CACHE_LOCK = Lock()

TIPUS_LLOCS_CATALA = {
    "attraction": "Lloc d'interès",
    "museum": "Museu",
    "viewpoint": "Mirador",
    "artwork": "Obra d'art",
    "zoo": "Zoo",
    "gallery": "Galeria",
    "theme_park": "Parc temàtic",
    "aquarium": "Aquari",
    "monument": "Monument",
    "information": "Punt d'informació",
    "historic": "Lloc històric",
    "castle": "Castell",
    "memorial": "Memorial",
    "archaeological_site": "Jaciment arqueològic",
    "church": "Església",
    "ruins": "Ruïnes",
    "fort": "Fortificació",
    "battlefield": "Camp de batalla",
    "monastery": "Monestir",
    "manor": "Casa senyorial",
}


def traduir_tipus_lloc(tipus):
    clau = tipus.casefold()
    if clau in TIPUS_LLOCS_CATALA:
        return TIPUS_LLOCS_CATALA[clau]
    return "Lloc d'interès"


def obtener_con_cache(clave, segundos, cargar):
    """Reutiliza una respuesta reciente para no consultar la API en cada clic."""
    ahora = monotonic()
    with CACHE_LOCK:
        entrada = CACHE.get(clave)
        if entrada and entrada[0] > ahora:
            return entrada[1]

    valor = cargar()
    with CACHE_LOCK:
        CACHE[clave] = (monotonic() + segundos, valor)
    return valor


def consultar_json(url, *, params=None, servicio="servicio de datos", headers=None, timeout=15):
    """Hace una petición HTTP y devuelve un error legible si el proveedor falla."""
    try:
        respuesta = requests.get(
            url, params=params, headers=headers, timeout=timeout
        )
        respuesta.raise_for_status()
        return respuesta.json()
    except requests.HTTPError as error:
        respuesta = error.response
        codigo = respuesta.status_code if respuesta is not None else "desconocido"
        logger.warning("%s ha respost amb l'error HTTP %s", servicio, codigo)
        raise HTTPException(
            status_code=502,
            detail=f"{servicio} ha respost amb l'error HTTP {codigo}.",
        ) from error
    except requests.RequestException as error:
        logger.warning("Error de conexión con %s: %s", servicio, error)
        raise HTTPException(
            status_code=502,
            detail=f"No s'ha pogut connectar amb {servicio} ({type(error).__name__}).",
        ) from error


def buscar_destino(nombre):
    """Geocodifica un nombre y guarda sus coordenadas durante un mes."""
    def cargar():
        datos = consultar_json(
            GEOCODING_URL,
            params={"name": nombre, "count": 1, "language": "ca", "format": "json"},
            servicio="Open-Meteo Geocoding",
        )
        resultados = datos.get("results", [])
        if not resultados:
            raise HTTPException(status_code=404, detail="No s'ha trobat aquesta destinació.")
        return resultados[0]

    return obtener_con_cache(("destino", nombre.casefold()), 30 * 86400, cargar)


def buscar_lugares_photon(latitud, longitud):
    """Cerca llocs d'interès d'OpenStreetMap a prop de les coordenades."""
    datos = consultar_json(
        PHOTON_URL,
        params={
            "lat": latitud,
            "lon": longitud,
            "radius": 5,
            "osm_tag": "tourism",
            "limit": 20,
            "lang": "ca",
        },
        servicio="OpenStreetMap Photon",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )

    tipos_validos = {
        "attraction", "museum", "viewpoint", "artwork", "zoo", "gallery",
        "theme_park", "aquarium", "monument", "information",
    }
    lugares = []
    vistos = set()
    for elemento in datos.get("features", []):
        propiedades = elemento.get("properties", {})
        nombre = propiedades.get("name")
        tipo = propiedades.get("osm_value", "")
        if not nombre or tipo not in tipos_validos or nombre.casefold() in vistos:
            continue
        vistos.add(nombre.casefold())
        coordenadas = elemento.get("geometry", {}).get("coordinates", [longitud, latitud])
        lugares.append({
            "nombre": nombre,
            "tipo": traduir_tipus_lloc(tipo),
            "latitud": coordenadas[1],
            "longitud": coordenadas[0],
        })
    return lugares


def buscar_lugares_overpass(latitud, longitud):
    """Consulta una instància d'Overpass com a alternativa a Photon."""
    consulta = f"""[out:json][timeout:10];
    (nwr(around:3000,{latitud},{longitud})[tourism~\"^(attraction|museum|viewpoint|artwork|zoo|gallery)$\"][name];
     nwr(around:3000,{latitud},{longitud})[historic][name];);
    out center tags 20;"""
    ultimo_error = None
    for url in OVERPASS_URLS:
        try:
            respuesta = requests.get(
                url,
                params={"data": consulta},
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=8,
            )
            respuesta.raise_for_status()
            elementos = respuesta.json().get("elements", [])
            lugares = []
            vistos = set()
            for elemento in elementos:
                etiquetas = elemento.get("tags", {})
                nombre = etiquetas.get("name") or etiquetas.get("name:en")
                if not nombre or nombre.casefold() in vistos:
                    continue
                vistos.add(nombre.casefold())
                centro = elemento.get("center", {})
                lugares.append({
                    "nombre": nombre,
                    "tipo": traduir_tipus_lloc(etiquetas.get("tourism") or etiquetas.get("historic") or "Lloc d'interès"),
                    "latitud": elemento.get("lat", centro.get("lat", latitud)),
                    "longitud": elemento.get("lon", centro.get("lon", longitud)),
                })
            if lugares:
                return lugares
        except (requests.RequestException, ValueError) as error:
            ultimo_error = error

    raise HTTPException(
        status_code=502,
        detail="Els serveis públics de llocs d'interès no han respost.",
    ) from ultimo_error


def buscar_lugares(latitud, longitud):
    """Fa servir Photon i, si no respon, Overpass; desa el resultat durant 24 h."""
    clave = ("lugares", round(latitud, 3), round(longitud, 3))

    def cargar():
        try:
            lugares = buscar_lugares_photon(latitud, longitud)
            if lugares:
                return {"lugares": lugares, "fuente": "Photon (OpenStreetMap)"}
        except HTTPException as error:
            logger.warning("Photon no respondió: %s", error.detail)

        lugares = buscar_lugares_overpass(latitud, longitud)
        return {"lugares": lugares, "fuente": "Overpass (OpenStreetMap)"}

    return obtener_con_cache(clave, 86400, cargar)


def obtener_pronostico(latitud, longitud):
    """Consulta MET Norway i reutilitza la previsió durant tres hores."""
    clave = ("pronostico", round(latitud, 3), round(longitud, 3))

    def cargar():
        return consultar_json(
            MET_FORECAST_URL,
            params={"lat": latitud, "lon": longitud},
            servicio="MET Norway",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )

    return obtener_con_cache(clave, 3 * 3600, cargar)


def pronostico_por_dia(datos, zona_horaria, fechas):
    """Agrupa temperatures horàries i probabilitat de pluja per dia local."""
    try:
        zona = ZoneInfo(zona_horaria)
    except ZoneInfoNotFoundError:
        zona = timezone.utc

    agrupados = {dia: {"temperaturas": [], "lluvia": []} for dia in fechas}
    for tramo in datos.get("properties", {}).get("timeseries", []):
        instante = datetime.fromisoformat(tramo["time"].replace("Z", "+00:00"))
        dia_local = instante.astimezone(zona).date().isoformat()
        if dia_local not in agrupados:
            continue

        contenido = tramo.get("data", {})
        detalles = contenido.get("instant", {}).get("details", {})
        temperatura = detalles.get("air_temperature")
        if temperatura is not None:
            agrupados[dia_local]["temperaturas"].append(temperatura)

        for periodo in ("next_1_hours", "next_6_hours"):
            probabilidad = contenido.get(periodo, {}).get("details", {}).get("probability_of_precipitation")
            if probabilidad is not None:
                agrupados[dia_local]["lluvia"].append(probabilidad)

    resultado = {}
    for dia, valores in agrupados.items():
        temperaturas = valores["temperaturas"]
        if temperaturas:
            lluvias = valores["lluvia"]
            resultado[dia] = {
                "maxima_c": round(max(temperaturas), 1),
                "minima_c": round(min(temperaturas), 1),
                "probabilidad_lluvia": round(max(lluvias)) if lluvias else None,
            }
    return resultado


@router.get("/planificar")
def planificar_viaje(
    destino: str = Query(min_length=2, max_length=100),
    dias: int = Query(default=3, ge=1, le=7),
    fecha: date = Query(default_factory=date.today),
):
    """Retorna un lloc per dia i la previsió quan està disponible."""
    hoy = date.today()
    if fecha < hoy:
        raise HTTPException(status_code=400, detail="La data d'inici no pot ser anterior a avui.")
    if fecha + timedelta(days=dias - 1) > hoy + timedelta(days=8):
        raise HTTPException(status_code=400, detail="La previsió arriba fins a 9 dies. Escurça el viatge o tria una data més propera.")

    ciudad = buscar_destino(destino.strip())
    latitud, longitud = ciudad["latitude"], ciudad["longitude"]
    fechas = [(fecha + timedelta(days=indice)).isoformat() for indice in range(dias)]
    avisos = []

    try:
        pronostico = pronostico_por_dia(
            obtener_pronostico(latitud, longitud),
            ciudad.get("timezone", "UTC"),
            fechas,
        )
    except HTTPException as error:
        logger.warning("No s'ha pogut carregar la previsió de MET Norway: %s", error.detail)
        pronostico = {}
        avisos.append("La previsió meteorològica no està disponible ara; l'itinerari es mostrarà sense aquesta informació.")

    try:
        resultado_lugares = buscar_lugares(latitud, longitud)
        lugares = resultado_lugares["lugares"]
        fuente_lugares = resultado_lugares["fuente"]
    except HTTPException as error:
        logger.warning("No s'han pogut consultar llocs d'OpenStreetMap: %s", error.detail)
        lugares = []
        fuente_lugares = None
        avisos.append("No s'han pogut carregar llocs propers; hem afegit un suggeriment per explorar el centre.")

    lugares_reales = len(lugares)
    if not lugares:
        lugares = [{"nombre": "Passeig pel centre", "tipo": "Suggeriment", "latitud": latitud, "longitud": longitud}]

    itinerario = []
    for indice, dia_texto in enumerate(fechas):
        itinerario.append({
            "fecha": dia_texto,
            "lugar": lugares[indice % len(lugares)],
            "clima": pronostico.get(dia_texto),
        })

    fuentes = ["Open-Meteo Geocoding", "MET Norway Locationforecast"]
    if fuente_lugares and lugares_reales:
        fuentes.append(fuente_lugares)

    return {
        "destino": ciudad.get("name", destino),
        "pais": ciudad.get("country", ""),
        "itinerario": itinerario,
        "lugares_disponibles": lugares_reales,
        "fuentes": fuentes,
        "avisos": avisos,
    }
