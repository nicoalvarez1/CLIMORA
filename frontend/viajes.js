// La API del planificador forma parte del mismo servidor FastAPI (puerto 8000).
const API_BASE = (location.protocol === "file:" || location.port === "5500")
    ? "http://127.0.0.1:8000"
    : location.origin;
const form = document.querySelector("#trip-form");
const dateInput = document.querySelector("#start-date");
const statusText = document.querySelector("#viajes-estado");
const results = document.querySelector("#viajes-resultados");
const button = document.querySelector("#trip-submit");

// La previsión consultada está disponible desde hoy hasta 15 días adelante.
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
if (form && dateInput && statusText && results && button) {
    dateInput.min = localDate;
    dateInput.max = new Date(today.getTime() - today.getTimezoneOffset() * 60000 + 15 * 86400000)
        .toISOString().slice(0, 10);
    dateInput.value = localDate;

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
