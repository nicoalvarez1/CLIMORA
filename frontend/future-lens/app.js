(() => {
  "use strict";

  function mountFutureLens(root) {

  const CLIMATE_API = "https://climate-api.open-meteo.com/v1/climate";
  const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
  const BASELINE = { start: 1981, end: 2010 };
  const FUTURE_WINDOW = 20;
  const CACHE_PREFIX = "climora-future-lens-v1";
  const DEFAULT_LOCATION = {
    name: "Barcelona",
    admin1: "Catalunya",
    country: "Espanya",
    latitude: 41.3851,
    longitude: 2.1734,
    timezone: "Europe/Madrid"
  };

  const el = (id) => root.querySelector(`#${id}`);
  const ui = {
    map: el("map"),
    mapStage: root.querySelector(".map-stage"),
    locationForm: el("location-form"),
    locationInput: el("location-input"),
    searchResults: el("search-results"),
    searchStatus: el("search-status"),
    useLocation: el("use-location"),
    pickMapPoint: el("pick-map-point"),
    mapPlaceLabel: el("map-place-label"),
    modelChip: el("model-chip"),
    selectedPlace: el("selected-place"),
    selectedRegion: el("selected-region"),
    modelSelect: el("model-select"),
    periodSlider: el("period-slider"),
    periodOutput: el("period-output"),
    loadingPanel: el("loading-panel"),
    loadingTitle: el("loading-title"),
    loadingDetail: el("loading-detail"),
    metrics: el("metrics"),
    errorPanel: el("error-panel"),
    errorDetail: el("error-detail"),
    retryData: el("retry-data"),
    modelSummary: el("model-summary"),
    summaryText: el("summary-text"),
    dataStatus: el("data-status"),
    aboutData: el("about-data"),
    dataDetails: el("data-details"),
    layerHeat: el("layer-heat"),
    layerRain: el("layer-rain"),
    legendLabel: el("legend-label"),
    legendSwatch: el("legend-swatch"),
    toggleAr: el("toggle-ar"),
    arView: el("ar-view"),
    arVideo: el("ar-video"),
    arTint: el("ar-tint"),
    arLocation: el("ar-location"),
    arPeriod: el("ar-period"),
    arLayerName: el("ar-layer-name"),
    arMainValue: el("ar-main-value"),
    arSubValue: el("ar-sub-value"),
    mapMessage: el("map-message")
  };

  const state = {
    location: { ...DEFAULT_LOCATION },
    model: ui.modelSelect.value,
    map: null,
    marker: null,
    cellSourceReady: false,
    climate: null,
    latestRequest: 0,
    activeController: null,
    activeLayer: "heat",
    cameraStream: null,
    pickingPoint: false,
    mapMessageTimer: null
  };

  const MODEL_LABELS = {
    EC_Earth3P_HR: "EC-Earth3P-HR",
    CMCC_CM2_VHR4: "CMCC-CM2-VHR4",
    FGOALS_f3_H: "FGOALS-f3-H",
    HiRAM_SIT_HR: "HiRAM-SIT-HR",
    MRI_AGCM3_2_S: "MRI-AGCM3-2-S",
    MPI_ESM1_2_XR: "MPI-ESM1-2-XR",
    NICAM16_8S: "NICAM16-8S"
  };

  function setSearchStatus(message, isError = false) {
    ui.searchStatus.textContent = message;
    ui.searchStatus.classList.toggle("is-error", isError);
  }

  function showMapMessage(message, duration = 4200) {
    ui.mapMessage.textContent = message;
    ui.mapMessage.classList.add("is-visible");
    window.clearTimeout(state.mapMessageTimer);
    state.mapMessageTimer = window.setTimeout(() => {
      ui.mapMessage.classList.remove("is-visible");
    }, duration);
  }

  function setDataStatus(message, status = "idle") {
    ui.dataStatus.classList.toggle("is-ready", status === "ready");
    ui.dataStatus.classList.toggle("is-error", status === "error");
    ui.dataStatus.lastChild.textContent = ` ${message}`;
  }

  function regionFor(location) {
    return [location.admin1, location.country].filter(Boolean).join(" · ") || "Punt del mapa";
  }

  function placeLabel(location) {
    const region = location.admin1 || location.country || "Punt seleccionat";
    return `${location.name} · ${region}`.toLocaleUpperCase("ca");
  }

  function updateLocationLabels() {
    ui.selectedPlace.textContent = state.location.name;
    ui.selectedRegion.textContent = regionFor(state.location);
    ui.mapPlaceLabel.textContent = placeLabel(state.location);
    ui.arLocation.textContent = state.location.name;
  }

  function initialiseMap() {
    if (!window.maplibregl) {
      ui.mapMessage.textContent = "No s’ha pogut carregar el motor del mapa. Recarrega la pàgina quan tinguis connexió.";
      ui.mapMessage.classList.add("is-visible");
      return;
    }

    state.map = new maplibregl.Map({
      container: ui.map,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [state.location.longitude, state.location.latitude],
      zoom: 13.2,
      pitch: 54,
      bearing: -18,
      maxPitch: 70,
      attributionControl: true,
      cooperativeGestures: true
    });

    state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const markerElement = document.createElement("div");
    markerElement.className = "climora-marker";
    markerElement.setAttribute("aria-label", "Lloc seleccionat");
    state.marker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat([state.location.longitude, state.location.latitude])
      .addTo(state.map);

    state.map.on("load", () => {
      addClimateLayers();
      addBuildingsLayer();
      loadClimateData();
    });

    state.map.on("error", (event) => {
      const message = event?.error?.message || "";
      if (/style|source|tile/i.test(message)) {
        setSearchStatus("El mapa base no respon ara. Les dades climàtiques es poden consultar igualment.", true);
      }
    });

    state.map.on("click", (event) => {
      if (!state.pickingPoint) return;
      state.pickingPoint = false;
      ui.mapStage.classList.remove("is-picking");
      ui.pickMapPoint.setAttribute("aria-pressed", "false");
      const { lng, lat } = event.lngLat;
      selectLocation({
        name: "Punt seleccionat",
        admin1: `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`,
        country: "",
        latitude: lat,
        longitude: lng,
        timezone: "auto"
      });
      showMapMessage("Punt seleccionat. Consulto la cel·la climàtica més propera.");
    });
  }

  function addClimateLayers() {
    if (!state.map || state.cellSourceReady) return;
    const firstLabel = (state.map.getStyle().layers || []).find((layer) => layer.type === "symbol")?.id;
    state.map.addSource("future-lens-cell", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
    state.map.addLayer({
      id: "future-lens-cell-fill",
      type: "fill",
      source: "future-lens-cell",
      paint: {
        "fill-color": "#ee7651",
        "fill-opacity": 0.23
      }
    }, firstLabel);
    state.map.addLayer({
      id: "future-lens-cell-outline",
      type: "line",
      source: "future-lens-cell",
      paint: {
        "line-color": "#f7d78a",
        "line-width": 1.4,
        "line-opacity": 0.86,
        "line-dasharray": [2, 2]
      }
    }, firstLabel);
    state.cellSourceReady = true;
  }

  function addBuildingsLayer() {
    if (!state.map) return;
    const style = state.map.getStyle();
    const layers = style.layers || [];
    if (layers.some((layer) => /building.*3d|3d.*building/i.test(layer.id))) return;

    const sourceId = Object.keys(style.sources || {}).find((id) => {
      const source = style.sources[id];
      return source.type === "vector" && (/openmaptiles/i.test(id) || /openmaptiles/i.test(source.url || ""));
    });
    if (!sourceId) return;

    const firstLabel = layers.find((layer) => layer.type === "symbol")?.id;
    try {
      state.map.addLayer({
        id: "future-lens-buildings-3d",
        source: sourceId,
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14.3,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 10], 0, "#bdcbb9", 50, "#82958b", 180, "#597468"],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
          "fill-extrusion-opacity": 0.76,
          "fill-extrusion-vertical-gradient": true
        }
      }, firstLabel);
    } catch (error) {
      console.info("Future Lens: el relleu d’edificis no està disponible en aquest estil de mapa.", error);
    }
  }

  function makeApproximateCell(latitude, longitude, radiusKm = 5) {
    const points = [];
    const earthRadiusKm = 6371.0088;
    const lat1 = latitude * Math.PI / 180;
    const lon1 = longitude * Math.PI / 180;
    const angularDistance = radiusKm / earthRadiusKm;

    for (let bearing = 0; bearing <= 360; bearing += 6) {
      const angle = bearing * Math.PI / 180;
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(angle)
      );
      const lon2 = lon1 + Math.atan2(
        Math.sin(angle) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
      );
      points.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
    }

    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { radius_km: radiusKm },
        geometry: { type: "Polygon", coordinates: [points] }
      }]
    };
  }

  function updateClimateCell(data) {
    if (!state.map || !state.cellSourceReady) return;
    const latitude = Number.isFinite(data.latitude) ? data.latitude : state.location.latitude;
    const longitude = Number.isFinite(data.longitude) ? data.longitude : state.location.longitude;
    const source = state.map.getSource("future-lens-cell");
    source.setData(makeApproximateCell(latitude, longitude));
    const bounds = state.map.getBounds();
    const isVisible = bounds && bounds.contains([longitude, latitude]);
    if (!isVisible) {
      state.map.flyTo({ center: [state.location.longitude, state.location.latitude], zoom: 13.8, pitch: 56, duration: 800 });
    }
    updateMapLayerStyle();
  }

  function deltaForActiveLayer() {
    if (!state.climate) return null;
    return state.activeLayer === "heat" ? state.climate.future.summerMax - state.climate.baseline.summerMax :
      percentChange(state.climate.baseline.annualPrecipitation, state.climate.future.annualPrecipitation);
  }

  function updateMapLayerStyle() {
    if (!state.map || !state.cellSourceReady || !state.climate) return;
    const delta = deltaForActiveLayer();
    let fillColor;
    if (!Number.isFinite(delta)) {
      fillColor = "#c6d0c5";
    } else if (state.activeLayer === "heat") {
      fillColor = delta < -0.5 ? "#65bdd0" : delta < 1 ? "#f3d47c" : delta < 3 ? "#f4a159" : "#eb5148";
    } else {
      fillColor = delta < -25 ? "#e46e47" : delta < -8 ? "#e7ad63" : delta < 15 ? "#d9d781" : delta < 35 ? "#6db7bb" : "#3077a5";
    }
    state.map.setPaintProperty("future-lens-cell-fill", "fill-color", fillColor);
    const outline = !Number.isFinite(delta) ? "#dce5d9" : state.activeLayer === "heat" ? "#fff0bf" : delta < 0 ? "#ffcf99" : "#c8f1ef";
    state.map.setPaintProperty("future-lens-cell-outline", "line-color", outline);
    const opacity = !Number.isFinite(delta) ? 0.12 : state.activeLayer === "heat"
      ? Math.min(0.34, 0.18 + Math.max(0, delta) * 0.035)
      : Math.min(0.34, 0.18 + Math.abs(delta) * 0.002);
    state.map.setPaintProperty("future-lens-cell-fill", "fill-opacity", opacity);
  }

  function setLoading(isLoading, title = "Consultant projeccions", detail = "Les sèries diàries poden trigar uns segons.") {
    ui.loadingPanel.hidden = !isLoading;
    ui.metrics.hidden = isLoading;
    ui.modelSummary.hidden = isLoading;
    ui.errorPanel.hidden = true;
    if (isLoading) {
      ui.loadingTitle.textContent = title;
      ui.loadingDetail.textContent = detail;
    }
  }

  function showDataError(message) {
    ui.loadingPanel.hidden = true;
    ui.metrics.hidden = true;
    ui.modelSummary.hidden = true;
    ui.errorPanel.hidden = false;
    ui.errorDetail.textContent = message;
    setDataStatus("No hi ha dades per a aquest model i lloc", "error");
  }

  function cacheKey(location, model) {
    return [
      CACHE_PREFIX,
      Number(location.latitude).toFixed(2),
      Number(location.longitude).toFixed(2),
      model
    ].join(":");
  }

  function readClimateCache(key) {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      const entry = JSON.parse(saved);
      if (entry.expiresAt < Date.now() || !entry.data?.daily?.time?.length) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  function writeClimateCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + 45 * 24 * 60 * 60 * 1000, data }));
    } catch {
      // La pàgina continua funcionant encara que el navegador no permeti desar la memòria cau.
    }
  }

  async function loadClimateData() {
    const requestId = ++state.latestRequest;
    state.activeController?.abort();
    const controller = new AbortController();
    state.activeController = controller;
    const key = cacheKey(state.location, state.model);
    state.climate = null;
    setLoading(true, "Carregant el model", `Analitzo 1981–2049 amb ${MODEL_LABELS[state.model] || state.model}.`);
    setDataStatus("Consultant el model…");
    updateMapLayerStyle();

    const cached = readClimateCache(key);
    if (cached) {
      if (requestId !== state.latestRequest) return;
      applyClimateData(cached);
      return;
    }

    const query = new URL(CLIMATE_API);
    query.searchParams.set("latitude", String(state.location.latitude));
    query.searchParams.set("longitude", String(state.location.longitude));
    query.searchParams.set("start_date", "1981-01-01");
    query.searchParams.set("end_date", "2049-12-31");
    query.searchParams.set("models", state.model);
    query.searchParams.set("daily", "temperature_2m_max,precipitation_sum");
    query.searchParams.set("timezone", state.location.timezone || "auto");

    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch(query.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.reason || `El servei climàtic ha respost amb el codi ${response.status}.`);
      }
      if (!payload.daily?.time?.length || !payload.daily.temperature_2m_max || !payload.daily.precipitation_sum) {
        throw new Error("La resposta no inclou les sèries diàries necessàries per a aquest model.");
      }
      if (requestId !== state.latestRequest) return;
      writeClimateCache(key, payload);
      applyClimateData(payload);
    } catch (error) {
      if (requestId !== state.latestRequest) return;
      const message = error.name === "AbortError"
        ? "La consulta ha trigat massa o s’ha cancel·lat. Torna-ho a provar amb aquest model o selecciona’n un altre."
        : error.message || "Revisa la connexió i la disponibilitat geogràfica del model seleccionat.";
      showDataError(message);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function applyClimateData(data) {
    const baseline = summarisePeriod(data.daily, BASELINE.start, BASELINE.end);
    if (!baseline) {
      showDataError("El model no ha retornat dades per al període de referència 1981–2010.");
      return;
    }
    state.climate = { raw: data, baseline, future: null };
    updateClimateCell(data);
    updateMetricsForWindow();
    ui.loadingPanel.hidden = true;
    ui.errorPanel.hidden = true;
    ui.metrics.hidden = false;
    ui.modelSummary.hidden = false;
    setDataStatus(`Dades del model ${MODEL_LABELS[state.model] || state.model}`, "ready");
  }

  function summarisePeriod(daily, startYear, endYear) {
    const years = new Map();
    const dates = daily.time || [];
    const maxima = daily.temperature_2m_max || [];
    const precipitation = daily.precipitation_sum || [];

    for (let index = 0; index < dates.length; index += 1) {
      const dateText = dates[index];
      const year = Number(String(dateText).slice(0, 4));
      if (year < startYear || year > endYear) continue;
      const month = Number(String(dateText).slice(5, 7));
      const maxTemp = maxima[index] == null ? NaN : Number(maxima[index]);
      const rain = precipitation[index] == null ? NaN : Number(precipitation[index]);
      if (!years.has(year)) years.set(year, { summerMax: [], hotDays: 0, precipitation: 0, rainDays: 0 });
      const bucket = years.get(year);
      if (Number.isFinite(maxTemp)) {
        if (month >= 6 && month <= 8) bucket.summerMax.push(maxTemp);
        if (maxTemp >= 35) bucket.hotDays += 1;
      }
      if (Number.isFinite(rain)) {
        bucket.precipitation += rain;
        bucket.rainDays += 1;
      }
    }

    const validYears = [...years.values()].filter((year) => year.summerMax.length && year.rainDays > 300);
    if (!validYears.length) return null;
    const summerValues = validYears.flatMap((year) => year.summerMax);
    return {
      startYear,
      endYear,
      summerMax: average(summerValues),
      hotDaysPerYear: average(validYears.map((year) => year.hotDays)),
      annualPrecipitation: average(validYears.map((year) => year.precipitation)),
      validYears: validYears.length
    };
  }

  function average(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  function percentChange(base, future) {
    if (!Number.isFinite(base) || !Number.isFinite(future) || Math.abs(base) < 0.01) return null;
    return ((future - base) / Math.abs(base)) * 100;
  }

  function signed(value, digits = 1, unit = "") {
    if (!Number.isFinite(value)) return "Sense dades";
    const rounded = Number(value.toFixed(digits));
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded).toLocaleString("ca-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;
  }

  function number(value, digits = 1) {
    if (!Number.isFinite(value)) return "—";
    return value.toLocaleString("ca-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function updateMetricsForWindow() {
    if (!state.climate) return;
    const start = Number(ui.periodSlider.value);
    const end = start + FUTURE_WINDOW - 1;
    const future = summarisePeriod(state.climate.raw.daily, start, end);
    state.climate.future = future;
    ui.periodOutput.textContent = `${start}–${end}`;
    ui.arPeriod.textContent = `LENT CLIMÀTICA · ${start}–${end}`;
    if (!future) {
      showDataError(`El model no disposa de dades suficients entre ${start} i ${end}. Prova una altra finestra.`);
      return;
    }

    const baseline = state.climate.baseline;
    const temperatureDelta = future.summerMax - baseline.summerMax;
    const heatDayDelta = future.hotDaysPerYear - baseline.hotDaysPerYear;
    const precipitationDelta = percentChange(baseline.annualPrecipitation, future.annualPrecipitation);

    el("temp-delta").textContent = signed(temperatureDelta, 1, " °C");
    el("temp-base").textContent = `${number(baseline.summerMax, 1)} °C`;
    el("temp-future").textContent = `${number(future.summerMax, 1)} °C`;
    el("heat-delta").textContent = signed(heatDayDelta, 1, " dies/any");
    el("heat-base").textContent = `${number(baseline.hotDaysPerYear, 1)} dies/any`;
    el("heat-future").textContent = `${number(future.hotDaysPerYear, 1)} dies/any`;
    el("rain-delta").textContent = Number.isFinite(precipitationDelta) ? signed(precipitationDelta, 0, "%") : "—";
    el("rain-base").textContent = `${number(baseline.annualPrecipitation, 0)} mm/any`;
    el("rain-future").textContent = `${number(future.annualPrecipitation, 0)} mm/any`;

    const direction = temperatureDelta >= 0 ? "més càlid" : "més fresc";
    ui.summaryText.textContent = `A ${state.location.name}, el model ${MODEL_LABELS[state.model] || state.model} situa les màximes mitjanes d’estiu ${Math.abs(temperatureDelta).toLocaleString("ca-ES", { maximumFractionDigits: 1 })} °C ${direction} entre ${start} i ${end}, en comparació amb 1981–2010.`;
    updateMapLayerStyle();
    updateArReadout();
  }

  function setActiveLayer(layer) {
    state.activeLayer = layer;
    const heatActive = layer === "heat";
    ui.layerHeat.classList.toggle("is-active", heatActive);
    ui.layerRain.classList.toggle("is-active", !heatActive);
    ui.layerHeat.setAttribute("aria-pressed", String(heatActive));
    ui.layerRain.setAttribute("aria-pressed", String(!heatActive));
    ui.legendLabel.textContent = heatActive
      ? "Canvi de temperatura màxima d’estiu"
      : "Canvi de precipitació anual";
    ui.legendSwatch.style.background = heatActive
      ? "linear-gradient(90deg, #65bdd0, #f3d47c, #f4a159, #eb5148)"
      : "linear-gradient(90deg, #e46e47, #e7ad63, #d9d781, #6db7bb, #3077a5)";
    updateMapLayerStyle();
    updateArReadout();
  }

  function updateArReadout() {
    if (!state.climate?.future) return;
    if (state.activeLayer === "heat") {
      const delta = state.climate.future.summerMax - state.climate.baseline.summerMax;
      ui.arLayerName.textContent = "ANOMALIA D’ESTIU";
      ui.arMainValue.textContent = signed(delta, 1, " °C");
      ui.arSubValue.textContent = "Màximes mitjanes · període de referència 1981–2010";
      const intensity = Math.min(0.56, 0.22 + Math.max(0, delta) * 0.07);
      const core = delta < 0 ? `rgba(65, 164, 212, ${intensity})` : `rgba(255, 88, 48, ${intensity})`;
      const mid = delta < 0 ? "rgba(82, 181, 222, .13)" : "rgba(255, 151, 64, .15)";
      ui.arTint.style.setProperty("--ar-core", core);
      ui.arTint.style.setProperty("--ar-mid", mid);
    } else {
      const delta = percentChange(state.climate.baseline.annualPrecipitation, state.climate.future.annualPrecipitation);
      ui.arLayerName.textContent = "CANVI DE PRECIPITACIÓ";
      ui.arMainValue.textContent = Number.isFinite(delta) ? signed(delta, 0, "%") : "—";
      ui.arSubValue.textContent = "Precipitació anual mitjana · respecte a 1981–2010";
      const core = !Number.isFinite(delta) ? "rgba(75, 136, 161, .28)" : delta < 0 ? "rgba(229, 125, 62, .35)" : "rgba(44, 155, 201, .38)";
      const mid = delta < 0 ? "rgba(255, 183, 102, .14)" : "rgba(74, 192, 214, .17)";
      ui.arTint.style.setProperty("--ar-core", core);
      ui.arTint.style.setProperty("--ar-mid", mid);
    }
  }

  async function searchPlaces(queryText) {
    const queryTextTrimmed = queryText.trim();
    if (queryTextTrimmed.length < 2) {
      setSearchStatus("Escriu almenys dues lletres per cercar.", true);
      return;
    }
    setSearchStatus("Cercant llocs…");
    ui.searchResults.hidden = true;
    ui.searchResults.replaceChildren();

    const url = new URL(GEOCODING_API);
    url.searchParams.set("name", queryTextTrimmed);
    url.searchParams.set("count", "8");
    url.searchParams.set("language", "es");
    url.searchParams.set("format", "json");
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Geocodificació HTTP ${response.status}`);
      const payload = await response.json();
      const results = payload.results || [];
      if (!results.length) {
        setSearchStatus("No he trobat aquest lloc. Prova el nom d’una ciutat propera.", true);
        return;
      }
      renderSearchResults(results);
      setSearchStatus(`${results.length} resultats. Tria el lloc correcte.`);
    } catch (error) {
      setSearchStatus(error.message || "No s’ha pogut cercar el lloc. Revisa la connexió.", true);
    }
  }

  function renderSearchResults(results) {
    ui.searchResults.replaceChildren();
    results.forEach((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      const primary = document.createElement("strong");
      primary.textContent = result.name;
      const secondary = document.createElement("span");
      secondary.textContent = [result.admin1, result.country].filter(Boolean).join(" · ");
      button.append(primary, secondary);
      button.addEventListener("click", () => {
        selectLocation({
          name: result.name,
          admin1: result.admin1 || "",
          country: result.country || "",
          latitude: Number(result.latitude),
          longitude: Number(result.longitude),
          timezone: result.timezone || "auto"
        });
        ui.locationInput.value = result.name;
        ui.searchResults.hidden = true;
        setSearchStatus("Lloc seleccionat. Carregant la projecció del model…");
      });
      ui.searchResults.appendChild(button);
    });
    ui.searchResults.hidden = false;
  }

  function selectLocation(location) {
    state.location = location;
    updateLocationLabels();
    if (state.marker) state.marker.setLngLat([location.longitude, location.latitude]);
    if (state.map) {
      state.map.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 14.6,
        pitch: 58,
        bearing: -18,
        duration: 1250,
        essential: true
      });
      state.map.once("moveend", addBuildingsLayer);
    }
    loadClimateData();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setSearchStatus("Aquest navegador no permet consultar la ubicació.", true);
      return;
    }
    ui.useLocation.disabled = true;
    setSearchStatus("Demanant permís d’ubicació…");
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      const lat = Number(latitude.toFixed(4));
      const lon = Number(longitude.toFixed(4));
      selectLocation({
        name: "La meva ubicació",
        admin1: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
        country: "",
        latitude: lat,
        longitude: lon,
        timezone: "auto"
      });
      ui.locationInput.value = "La meva ubicació";
      setSearchStatus("Ubicació seleccionada. Open-Meteo rep les coordenades per consultar el model; la memòria cau queda al navegador.");
      ui.useLocation.disabled = false;
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "No s’ha concedit permís d’ubicació. Pots cercar el lloc o triar-lo al mapa."
        : "No s’ha pogut llegir la ubicació. Pots cercar el lloc o triar-lo al mapa.";
      setSearchStatus(message, true);
      ui.useLocation.disabled = false;
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  async function toggleCameraLens() {
    if (state.cameraStream) {
      stopCameraLens();
      return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost") {
      showMapMessage("La càmera només funciona en una pàgina HTTPS segura.", 6500);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showMapMessage("Aquest navegador no ofereix accés a la càmera. El mapa 3D continua disponible.", 6500);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      state.cameraStream = stream;
      ui.arVideo.srcObject = stream;
      await ui.arVideo.play();
      ui.arView.classList.add("is-active");
      ui.arView.setAttribute("aria-hidden", "false");
      ui.mapStage.classList.add("is-ar");
      ui.toggleAr.innerHTML = '<span aria-hidden="true">×</span> Tanca la lent AR';
      updateArReadout();
    } catch (error) {
      state.cameraStream?.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
      const message = error.name === "NotAllowedError"
        ? "Cal donar permís de càmera al navegador per activar la lent AR."
        : "No s’ha pogut iniciar la càmera. Comprova que una altra aplicació no l’estigui utilitzant.";
      showMapMessage(message, 6500);
    }
  }

  function stopCameraLens() {
    state.cameraStream?.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    ui.arVideo.pause();
    ui.arVideo.srcObject = null;
    ui.arView.classList.remove("is-active");
    ui.arView.setAttribute("aria-hidden", "true");
    ui.mapStage.classList.remove("is-ar");
    ui.toggleAr.innerHTML = '<span aria-hidden="true">◉</span> Obre la lent AR';
  }

  function toggleMapPointPicking() {
    state.pickingPoint = !state.pickingPoint;
    ui.mapStage.classList.toggle("is-picking", state.pickingPoint);
    ui.pickMapPoint.setAttribute("aria-pressed", String(state.pickingPoint));
    showMapMessage(state.pickingPoint ? "Clica al mapa per triar el punt climàtic." : "Selecció de punt cancel·lada.");
  }

  function setModelName() {
    const label = MODEL_LABELS[state.model] || state.model;
    ui.modelChip.innerHTML = `CMIP6 <span>·</span> ${label}`;
  }

  ui.locationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchPlaces(ui.locationInput.value);
  });

  ui.locationInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") ui.searchResults.hidden = true;
  });

  root.addEventListener("click", (event) => {
    if (!event.target.closest(".search-card")) ui.searchResults.hidden = true;
  });

  ui.useLocation.addEventListener("click", useCurrentLocation);
  ui.pickMapPoint.addEventListener("click", toggleMapPointPicking);
  ui.modelSelect.addEventListener("change", () => {
    state.model = ui.modelSelect.value;
    setModelName();
    loadClimateData();
  });
  ui.periodSlider.addEventListener("input", updateMetricsForWindow);
  ui.layerHeat.addEventListener("click", () => setActiveLayer("heat"));
  ui.layerRain.addEventListener("click", () => setActiveLayer("rain"));
  ui.toggleAr.addEventListener("click", toggleCameraLens);
  ui.retryData.addEventListener("click", loadClimateData);
  ui.aboutData.addEventListener("click", () => {
    const opening = ui.dataDetails.hidden;
    ui.dataDetails.hidden = !opening;
    ui.aboutData.setAttribute("aria-expanded", String(opening));
    ui.aboutData.querySelector("span").textContent = opening ? "−" : "＋";
  });

  window.addEventListener("pagehide", stopCameraLens);
  window.addEventListener("resize", () => state.map?.resize());

  updateLocationLabels();
  setModelName();
  initialiseMap();
  if (!state.map) loadClimateData();
  }

  window.mountFutureLens = mountFutureLens;
})();
