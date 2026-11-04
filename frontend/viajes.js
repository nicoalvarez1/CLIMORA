// L'API del planificador forma part del mateix servidor FastAPI (port 8000).
const API_BASE = (location.protocol === "file:" || location.port === "5500")
    ? "http://127.0.0.1:8000"
    : location.origin;
const form = document.querySelector("#trip-form");
const dateInput = document.querySelector("#start-date");
const daysInput = document.querySelector("#days-count");
const statusText = document.querySelector("#viajes-estado");
const results = document.querySelector("#viajes-resultados");
const button = document.querySelector("#trip-submit");

// MET Norway ofereix previsió per a 9 dies; ajustem la data màxima del viatge.
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
    statusText.textContent = "Cercant la destinació, llocs d'interès i la previsió…";

    const query = new URLSearchParams(new FormData(form));
    try {
        const response = await fetch(`${API_BASE}/planificar?${query}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "No s'ha pogut crear l'itinerari.");

        data.itinerario.forEach((day, index) => {
            const card = document.createElement("article");
            card.className = "viaje-dia";
            const heading = document.createElement("h3");
            heading.textContent = `Dia ${index + 1} · ${day.fecha}`;
            const place = document.createElement("div");
            place.className = "viaje-lugar";
            place.textContent = day.lugar.nombre;
            const category = document.createElement("p");
            category.textContent = day.lugar.tipo;
            card.append(heading, place, category);

            const weather = document.createElement("p");
            weather.className = "viaje-clima";
            weather.textContent = day.clima
                ? `Previsió: ${day.clima.minima_c}–${day.clima.maxima_c} °C · probabilitat de pluja: ${day.clima.probabilidad_lluvia == null ? "sense dades" : day.clima.probabilidad_lluvia + "%"}`
                : "La previsió meteorològica no està disponible per a aquest dia.";
            card.append(weather);
            results.append(card);
        });
        statusText.textContent = `${data.destino}, ${data.pais} · S'han trobat ${data.lugares_disponibles} llocs.${data.avisos?.length ? " " + data.avisos.join(" ") : ""}`;
        document.querySelector("#viajes-fuentes").textContent = `Fonts: ${data.fuentes.join(" · ")}. Els llocs i la previsió poden canviar.`;
    } catch (error) {
        statusText.textContent = error.message.includes("Failed to fetch")
            ? "No es pot connectar amb l'API. Comprova que el servidor FastAPI del port 8000 estigui engegat."
            : error.message;
    } finally {
        button.disabled = false;
    }
});
}
