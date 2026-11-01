// La API del planificador forma parte del mismo servidor FastAPI (puerto 8000).
const API_BASE = (location.protocol === "file:" || location.port === "5500")
    ? "http://127.0.0.1:8000"
    : location.origin;
const form = document.querySelector("#trip-form");
const dateInput = document.querySelector("#start-date");
const daysInput = document.querySelector("#days-count");
const statusText = document.querySelector("#viajes-estado");
const results = document.querySelector("#viajes-resultados");
const button = document.querySelector("#trip-submit");

// MET Norway ofrece previsión para 9 días; ajustamos la última fecha al viaje.
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
if (form && dateInput && daysInput && statusText && results && button) {
    dateInput.min = localDate;
    dateInput.value = localDate;

    function actualizarFechaMaxima() {
        const dias = Math.min(7, Math.max(1, Number(daysInput.value) || 1));
        const ultimoInicio = new Date(
            today.getTime() - today.getTimezoneOffset() * 60000 + (9 - dias) * 86400000
        ).toISOString().slice(0, 10);
        dateInput.max = ultimoInicio;
        if (dateInput.value > ultimoInicio) dateInput.value = ultimoInicio;
    }

    actualizarFechaMaxima();
    daysInput.addEventListener("input", actualizarFechaMaxima);

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    results.replaceChildren();
    button.disabled = true;
    statusText.textContent = "Buscando destino, lugares y previsión…";

    const query = new URLSearchParams(new FormData(form));
    try {
        const response = await fetch(`${API_BASE}/planificar?${query}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "No se pudo crear el itinerario.");

        data.itinerario.forEach((day, index) => {
            const card = document.createElement("article");
            card.className = "viaje-dia";
            const heading = document.createElement("h3");
            heading.textContent = `Día ${index + 1} · ${day.fecha}`;
            const place = document.createElement("div");
            place.className = "viaje-lugar";
            place.textContent = day.lugar.nombre;
            const category = document.createElement("p");
            category.textContent = day.lugar.tipo;
            card.append(heading, place, category);

            const weather = document.createElement("p");
            weather.className = "viaje-clima";
            weather.textContent = day.clima
                ? `Previsión: ${day.clima.minima_c}–${day.clima.maxima_c} °C · lluvia: ${day.clima.probabilidad_lluvia ?? "sin dato"}%`
                : "Previsión meteorológica no disponible para este día.";
            card.append(weather);
            results.append(card);
        });
        statusText.textContent = `${data.destino}, ${data.pais} · ${data.lugares_disponibles} lugares encontrados.${data.avisos?.length ? " " + data.avisos.join(" ") : ""}`;
        document.querySelector("#viajes-fuentes").textContent = `Fuentes: ${data.fuentes.join(" · ")}. Los lugares y la previsión pueden cambiar.`;
    } catch (error) {
        statusText.textContent = error.message.includes("Failed to fetch")
            ? "No se puede conectar con la API. Comprueba que el servidor FastAPI del puerto 8000 está iniciado."
            : error.message;
    } finally {
        button.disabled = false;
    }
});
}
