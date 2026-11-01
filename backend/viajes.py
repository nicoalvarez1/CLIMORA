"""API independiente para crear itinerarios con datos abiertos."""

from datetime import date, timedelta

import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def consultar_json(url, *, params=None):
    """Consulta un servicio externo y traduce sus errores a una respuesta clara."""
    try:
        respuesta = requests.get(url, params=params, timeout=20)
        respuesta.raise_for_status()
        return respuesta.json()
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail="No se pudo conectar con uno de los servicios de datos abiertos.",
        ) from error


def buscar_destino(nombre):
    datos = consultar_json(
        GEOCODING_URL,
        params={"name": nombre, "count": 1, "language": "es", "format": "json"},
    )
    resultados = datos.get("results", [])
    if not resultados:
        raise HTTPException(status_code=404, detail="No se encontró ese destino.")
    return resultados[0]


def buscar_lugares(latitud, longitud):
    consulta = f"""[out:json][timeout:15];
    (node(around:5000,{latitud},{longitud})[tourism~\"^(attraction|museum|viewpoint|artwork|zoo|gallery)$\"];
     way(around:5000,{latitud},{longitud})[tourism~\"^(attraction|museum|viewpoint|artwork|zoo|gallery)$\"];
     node(around:5000,{latitud},{longitud})[historic];
     way(around:5000,{latitud},{longitud})[historic];);
    out center tags 30;"""
    datos = consultar_json(OVERPASS_URL, params={"data": consulta})
    lugares = []
    vistos = set()
    for elemento in datos.get("elements", []):
        etiquetas = elemento.get("tags", {})
        nombre = etiquetas.get("name") or etiquetas.get("name:es")
        if not nombre or nombre.casefold() in vistos:
            continue
        vistos.add(nombre.casefold())
        lugares.append({
            "nombre": nombre,
            "tipo": etiquetas.get("tourism") or etiquetas.get("historic") or "Lugar de interés",
            "latitud": elemento.get("lat", elemento.get("center", {}).get("lat")),
            "longitud": elemento.get("lon", elemento.get("center", {}).get("lon")),
        })
    return lugares


@router.get("/planificar")
def planificar_viaje(
    destino: str = Query(min_length=2, max_length=100),
    dias: int = Query(default=3, ge=1, le=7),
    fecha: date = Query(default_factory=date.today),
):
    """Devuelve previsión y una propuesta diaria basada en lugares reales."""
    hoy = date.today()
    if fecha < hoy:
        raise HTTPException(status_code=400, detail="La fecha de inicio no puede estar en el pasado.")
    if fecha > hoy + timedelta(days=15):
        raise HTTPException(status_code=400, detail="Open-Meteo solo ofrece previsión para los próximos 16 días. Elige una fecha más cercana.")

    ciudad = buscar_destino(destino.strip())
    latitud, longitud = ciudad["latitude"], ciudad["longitude"]
    pronostico = consultar_json(
        FORECAST_URL,
        params={
            "latitude": latitud,
            "longitude": longitud,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": ciudad.get("timezone", "auto"),
            "forecast_days": min(16, (fecha - hoy).days + dias),
        },
    ).get("daily", {})
    lugares = buscar_lugares(latitud, longitud)
    if not lugares:
        lugares = [{"nombre": "Paseo por el centro", "tipo": "Sugerencia", "latitud": latitud, "longitud": longitud}]

    itinerario = []
    for indice in range(dias):
        dia_fecha = fecha + timedelta(days=indice)
        dia_texto = dia_fecha.isoformat()
        posicion = pronostico.get("time", []).index(dia_texto) if dia_texto in pronostico.get("time", []) else None
        lugar = lugares[indice % len(lugares)]
        clima = None
        if posicion is not None:
            clima = {
                "maxima_c": pronostico.get("temperature_2m_max", [])[posicion],
                "minima_c": pronostico.get("temperature_2m_min", [])[posicion],
                "probabilidad_lluvia": pronostico.get("precipitation_probability_max", [])[posicion],
            }
        itinerario.append({"fecha": dia_texto, "lugar": lugar, "clima": clima})

    return {
        "destino": ciudad.get("name", destino),
        "pais": ciudad.get("country", ""),
        "itinerario": itinerario,
        "lugares_disponibles": len(lugares),
        "fuentes": ["Open-Meteo Geocoding y Forecast", "OpenStreetMap (Overpass API)"],
    }
