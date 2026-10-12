const formulari = document.querySelector("#formulari");
const campCiutat1 = document.querySelector("#ciudad1");
const campCiutat2 = document.querySelector("#ciudad2");
const boto = document.querySelector("#boto");
const missatge = document.querySelector("#missatge");
const resultats = document.querySelector("#resultats");
const ciutats = document.querySelector("#ciutats");
const titol1 = document.querySelector("#titol1");
const titol2 = document.querySelector("#titol2");
const cosTaula = document.querySelector("#cos-taula");
const conclusio = document.querySelector("#conclusio");

const API_URL = "http://127.0.0.1:8000/comparar";

formulari.addEventListener("submit", async function (event) {
    event.preventDefault();

    const ciutat1 = campCiutat1.value.trim();
    const ciutat2 = campCiutat2.value.trim();

    if (!ciutat1 || !ciutat2) {
        missatge.textContent = "Escriu el nom de les dues ciutats.";
        return;
    }

    boto.disabled = true;
    boto.textContent = "Comparant...";
    missatge.textContent = "Carregant les dades...";
    resultats.classList.add("hidden");

    try {
        const url = new URL(API_URL);
        url.searchParams.set("ciudad1", ciutat1);
        url.searchParams.set("ciudad2", ciutat2);

        const resposta = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" }
        });

        if (!resposta.ok) {
            throw new Error("Error del servidor: " + resposta.status);
        }

        const dades = await resposta.json();

        if (!Array.isArray(dades.ciudades) || dades.ciudades.length !== 2) {
            throw new Error("La resposta no conté les dues ciutats esperades.");
        }

        mostrarCiutats(dades.ciudades);
        mostrarComparacio(dades.comparacion, dades.ciudades);

        resultats.classList.remove("hidden");
        missatge.textContent = "Comparació completada correctament.";

        resultats.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        console.error("Error en la comparació:", error);
        missatge.textContent =
            "No s'ha pogut completar la comparació. Comprova el servidor i els noms de les ciutats.";
    } finally {
        boto.disabled = false;
        boto.innerHTML =
            'Comparar ciutats <span class="button-arrow" aria-hidden="true">→</span>';
    }
});


/* Busca el nom de la ciutat sense dependre d'una única clau. */
function obtenirNomCiutat(ciutat, index) {
    if (!ciutat || typeof ciutat !== "object") {
        return index === 0 ? campCiutat1.value.trim() : campCiutat2.value.trim();
    }

    const clausPossibles = [
        "ciudad", "ciutat", "name", "Nombre", "nombre",
        "nom", "city", "City", "Nombre ciudad", "Nom"
    ];

    for (const clau of clausPossibles) {
        if (ciutat[clau] !== undefined && ciutat[clau] !== null) {
            const valor = String(ciutat[clau]).trim();
            if (valor !== "") return valor;
        }
    }

    const entrada = Object.entries(ciutat).find(([clau, valor]) =>
        /^(nombre|nom|name|ciudad|ciutat|city)$/i.test(clau.trim()) &&
        typeof valor === "string" &&
        valor.trim() !== ""
    );

    if (entrada) return entrada[1].trim();

    return index === 0
        ? campCiutat1.value.trim()
        : campCiutat2.value.trim();
}


function mostrarCiutats(llistaCiutats) {
    ciutats.innerHTML = "";

    const nom1 = obtenirNomCiutat(llistaCiutats[0], 0);
    const nom2 = obtenirNomCiutat(llistaCiutats[1], 1);

    titol1.textContent = nom1;
    titol2.textContent = nom2;

    llistaCiutats.forEach(function (ciutat, index) {
        const targeta = document.createElement("article");
        targeta.className = "targeta";

        const nom = obtenirNomCiutat(ciutat, index);
        const simbol = index === 0 ? "🌿" : "🌍";

        const capcalera = document.createElement("div");
        capcalera.className = "city-top";

        const blocNom = document.createElement("div");
        const titol = document.createElement("h3");
        titol.textContent = nom;

        const etiqueta = document.createElement("span");
        etiqueta.className = "city-tag";
        etiqueta.textContent = "Dades climàtiques";

        blocNom.append(titol, etiqueta);

        const icona = document.createElement("div");
        icona.className = "city-symbol";
        icona.setAttribute("aria-hidden", "true");
        icona.textContent = simbol;

        capcalera.append(blocNom, icona);
        targeta.appendChild(capcalera);

        const dadesCiutat = document.createElement("div");
        dadesCiutat.className = "city-details";

        Object.entries(ciutat).forEach(function ([clau, valor]) {
            if (/^(ciudad|ciutat|name|nombre|nom|city|nombre ciudad)$/i.test(clau.trim())) {
                return;
            }

            const fila = document.createElement("p");
            fila.className = "dada";

            const nomDada = document.createElement("span");
            nomDada.className = "dada-label";
            nomDada.textContent = formatarNom(clau);

            const valorDada = document.createElement("strong");
            valorDada.textContent = formatarValor(valor);

            fila.append(nomDada, valorDada);
            dadesCiutat.appendChild(fila);
        });

        targeta.appendChild(dadesCiutat);
        ciutats.appendChild(targeta);
    });
}


function mostrarComparacio(comparacio, llistaCiutats) {
    cosTaula.innerHTML = "";

    const nom1 = obtenirNomCiutat(llistaCiutats[0], 0);
    const nom2 = obtenirNomCiutat(llistaCiutats[1], 1);

    titol1.textContent = nom1;
    titol2.textContent = nom2;

    if (Array.isArray(comparacio)) {
        comparacio.forEach(function (filaDada, index) {
            const fila = document.createElement("tr");

            if (filaDada && typeof filaDada === "object") {
                const claus = Object.keys(filaDada);
                const etiqueta =
                    filaDada.indicador ??
                    filaDada.nombre ??
                    filaDada.nom ??
                    filaDada.name ??
                    filaDada.variable ??
                    "Indicador " + (index + 1);

                const valor1 =
                    filaDada.ciudad1 ?? filaDada.ciutat1 ??
                    filaDada[nom1] ?? filaDada.valor1 ?? filaDada[claus[1]];

                const valor2 =
                    filaDada.ciudad2 ?? filaDada.ciutat2 ??
                    filaDada[nom2] ?? filaDada.valor2 ?? filaDada[claus[2]];

                afegirCelda(fila, etiqueta, true);
                afegirCelda(fila, valor1);
                afegirCelda(fila, valor2);
            } else {
                afegirCelda(fila, "Indicador " + (index + 1), true);
                afegirCelda(fila, filaDada);
                afegirCelda(fila, "—");
            }

            cosTaula.appendChild(fila);
        });

    } else if (comparacio && typeof comparacio === "object") {
        Object.entries(comparacio).forEach(function ([clau, valor]) {
            const fila = document.createElement("tr");
            afegirCelda(fila, formatarNom(clau), true);

            if (Array.isArray(valor)) {
                afegirCelda(fila, valor[0]);
                afegirCelda(fila, valor[1]);
            } else if (valor && typeof valor === "object") {
                afegirCelda(fila, valor.ciudad1 ?? valor.ciutat1 ?? valor.valor1 ?? "—");
                afegirCelda(fila, valor.ciudad2 ?? valor.ciutat2 ?? valor.valor2 ?? "—");
            } else {
                afegirCelda(fila, valor);
                afegirCelda(fila, "—");
            }

            cosTaula.appendChild(fila);
        });
    }

    if (conclusio) {
        conclusio.textContent =
            "La comparació permet observar les diferències entre " +
            nom1 + " i " + nom2 +
            ". Les conclusions depenen de les dades disponibles.";
    }
}


function afegirCelda(fila, valor, esCapcalera = false) {
    const celda = document.createElement(esCapcalera ? "th" : "td");

    if (esCapcalera) {
        celda.scope = "row";
    }

    celda.textContent = formatarValor(valor);
    fila.appendChild(celda);
}


function formatarNom(nom) {
    return String(nom)
        .replace(/_/g, " ")
        .replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, "$1 $2")
        .replace(/^./, lletra => lletra.toUpperCase());
}


function formatarValor(valor) {
    if (valor === null || valor === undefined || valor === "") {
        return "—";
    }

    if (typeof valor === "object") {
        return JSON.stringify(valor);
    }

    return String(valor);
}