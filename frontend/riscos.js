(function () {
    "use strict";

    const API_RISCOS = "http://127.0.0.1:8000/riscos";

    const formulari = document.querySelector("#formulari-riscos");
    const camp = document.querySelector("#ciutat-risc");
    const boto = document.querySelector("#boto-riscos");
    const missatge = document.querySelector("#missatge-riscos");
    const resultat = document.querySelector("#resultat-riscos");
    const resum = document.querySelector("#resum-riscos");
    const llista = document.querySelector("#llista-riscos");
    const nota = document.querySelector("#nota-riscos");

    if (!formulari || !camp || !boto || !missatge || !resultat || !resum || !llista || !nota) {
        console.error("CLIMORA: falten elements HTML de l'apartat de riscos.");
        return;
    }

    // ---------- Vistes: comparador / riscos ----------

    const seccioRiscos = document.querySelector("#riscos");
    const seccionsComparador = [
        document.querySelector("#comparador"),
        document.querySelector("#resultats")
    ];
    const pestanyes = document.querySelectorAll(".pestanya");

    function mostrarVista(vista) {
        const esRiscos = vista === "riscos";

        seccioRiscos.classList.toggle("vista-oculta", !esRiscos);
        seccionsComparador.forEach(function (seccio) {
            if (seccio) seccio.classList.toggle("vista-oculta", esRiscos);
        });

        pestanyes.forEach(function (pestanya) {
            const activa = pestanya.dataset.vista === vista;
            pestanya.classList.toggle("activa", activa);
            pestanya.setAttribute("aria-selected", String(activa));
        });

        // El globus ha de recalcular la mida quan torna a ser visible.
        if (!esRiscos) window.dispatchEvent(new Event("resize"));
    }

    document.querySelectorAll('a[href="#comparador"], a[href="#riscos"]')
        .forEach(function (enllac) {
            enllac.addEventListener("click", function (event) {
                event.preventDefault();
                mostrarVista(enllac.getAttribute("href").slice(1));
                document.querySelector("#explora").scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        });

    mostrarVista(location.hash === "#riscos" ? "riscos" : "comparador");

    // ---------- Fotografies (Unsplash) ----------

    const UNSPLASH = "https://images.unsplash.com/photo-";
    const MIDA = "?auto=format&fit=crop&w=900&q=80";

    const FOTOS = {
        "Terratrèmols": "1677233861362-c3aa97f11638",
        "Tsunamis": "1559962219-f52ccd86944e",
        "Ciclons tropicals": "1457327289196-f38b88d97147",
        "Inundacions": "1657069345471-c54f2432b79c",
        "Onades de calor": "1594315590298-329f49c8dcb9",
        "Sequera": "1549885606-bbc17accf949",
        "Incendis forestals": "1619461129861-d0c1479c48b4",
        "Onades de fred": "1552425889-8104689adba1"
    };

    function posarFoto(element, tipus) {
        if (FOTOS[tipus]) {
            element.style.backgroundImage =
                'url("' + UNSPLASH + FOTOS[tipus] + MIDA + '")';
        }
    }

    const CLASSES = {
        "Baix": "nivell-baix",
        "Moderat": "nivell-moderat",
        "Alt": "nivell-alt",
        "Molt alt": "nivell-molt-alt"
    };

    function crear(etiqueta, classe, text) {
        const element = document.createElement(etiqueta);
        if (classe) element.className = classe;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    // ---------- Galeria: clic a un risc -> top 10 de països ----------

    const galeria = document.querySelector("#galeria-riscos");

    if (galeria) {
        const panellTop = crear("section", "risc-top hidden");
        panellTop.setAttribute("aria-live", "polite");
        galeria.after(panellTop);

        async function mostrarTop(tipus, boto) {
            galeria.querySelectorAll(".risc-foto").forEach(function (altre) {
                altre.classList.toggle("activa", altre === boto);
                altre.setAttribute("aria-pressed", String(altre === boto));
            });

            panellTop.classList.remove("hidden");
            panellTop.innerHTML = "";
            panellTop.appendChild(crear("p", "risc-top-estat", "Carregant el rànquing..."));

            try {
                const url = new URL(API_RISCOS + "/top");
                url.searchParams.set("tipus", tipus);

                const resposta = await fetch(url.toString(), {
                    headers: { Accept: "application/json" }
                });

                if (!resposta.ok) {
                    throw new Error("Error del servidor: " + resposta.status);
                }

                const dades = await resposta.json();

                panellTop.innerHTML = "";

                const cap = crear("div", "risc-top-cap");
                const titols = crear("div");
                titols.append(
                    crear("div", "kicker", "Top 10 de països"),
                    crear("h3", "", dades.tipus + ": països amb més risc")
                );

                const tancar = crear("button", "risc-top-tancar", "Tancar ✕");
                tancar.type = "button";
                tancar.addEventListener("click", function () {
                    panellTop.classList.add("hidden");
                    boto.classList.remove("activa");
                    boto.setAttribute("aria-pressed", "false");
                });

                cap.append(titols, tancar);

                const llistaTop = crear("ol", "risc-top-llista");

                dades.top.forEach(function (pais) {
                    const fila = crear("li", CLASSES[pais.nivell] || "");

                    const info = crear("div", "risc-top-info");
                    info.append(
                        crear("strong", "", pais.pais),
                        crear("span", "",
                            "Ciutat més exposada: " + pais.ciutat_mes_exposada +
                            " · " + pais.ciutats +
                            (pais.ciutats === 1 ? " ciutat analitzada" : " ciutats analitzades"))
                    );

                    const barra = crear("div", "risc-barra");
                    const ple = crear("div");
                    ple.style.width = pais.puntuacio + "%";
                    barra.appendChild(ple);

                    fila.append(
                        crear("span", "risc-top-posicio", pais.posicio),
                        info,
                        barra,
                        crear("span", "risc-nivell", pais.nivell + " · " + pais.puntuacio)
                    );

                    llistaTop.appendChild(fila);
                });

                panellTop.append(cap, llistaTop, crear("p", "nota", "ⓘ " + dades.nota));
                panellTop.scrollIntoView({ behavior: "smooth", block: "nearest" });

            } catch (error) {
                console.error("Error carregant el top de països:", error);
                panellTop.innerHTML = "";
                panellTop.appendChild(crear("p", "risc-top-estat",
                    "No s'ha pogut carregar el rànquing. Comprova que el servidor està engegat amb l'última versió de riscos.py."));
            }
        }

        Object.keys(FOTOS).forEach(function (tipus) {
            const boto = crear("button", "risc-foto");
            boto.type = "button";
            boto.setAttribute("aria-pressed", "false");
            boto.title = "Veure els 10 països amb més risc";
            posarFoto(boto, tipus);

            boto.append(
                crear("span", "risc-foto-nom", tipus),
                crear("span", "risc-foto-accio", "Top 10 països →")
            );

            boto.addEventListener("click", function () {
                mostrarTop(tipus, boto);
            });

            galeria.appendChild(boto);
        });
    }

    function mostrar(dades) {
        resum.className = "risc-resum " + (CLASSES[dades.nivell_global] || "");
        resum.innerHTML = "";

        const index = crear("div", "risc-index");
        index.append(
            crear("strong", "", dades.index_global),
            crear("span", "", "de 100")
        );

        const text = crear("div");
        text.append(
            crear("h3", "", dades.ciutat + ", " + dades.pais),
            crear("p", "",
                "Risc global " + dades.nivell_global.toLowerCase() +
                ". El risc principal són: " + dades.risc_principal.toLowerCase() +
                ". Clima: " + dades.clima + ".")
        );

        resum.append(index, text);

        llista.innerHTML = "";

        dades.riscos.forEach(function (risc) {
            const targeta = crear("article",
                "risc-targeta " + (CLASSES[risc.nivell] || ""));

            const cap = crear("div", "risc-cap");
            cap.append(
                crear("h4", "", risc.icona + " " + risc.tipus),
                crear("span", "risc-nivell", risc.nivell + " · " + risc.puntuacio)
            );

            const barra = crear("div", "risc-barra");
            const ple = crear("div");
            ple.style.width = risc.puntuacio + "%";
            barra.appendChild(ple);

            const foto = crear("div", "risc-targeta-foto");
            posarFoto(foto, risc.tipus);

            const cos = crear("div", "risc-targeta-cos");
            cos.append(cap, barra, crear("p", "", risc.explicacio));

            targeta.append(foto, cos);
            llista.appendChild(targeta);
        });

        nota.textContent = "ⓘ " + dades.nota;
    }

    formulari.addEventListener("submit", async function (event) {
        event.preventDefault();

        const ciutat = camp.value.trim();

        if (!ciutat) {
            missatge.textContent = "Escriu el nom d'una ciutat.";
            return;
        }

        boto.disabled = true;
        boto.textContent = "Analitzant...";
        missatge.textContent = "Calculant els riscos...";
        resultat.classList.add("hidden");

        try {
            const url = new URL(API_RISCOS);
            url.searchParams.set("ciutat", ciutat);

            const resposta = await fetch(url.toString(), {
                headers: { Accept: "application/json" }
            });

            if (resposta.status === 404) {
                missatge.textContent =
                    "No tenim dades de «" + ciutat + "». Prova amb el nom en anglès.";
                return;
            }

            if (!resposta.ok) {
                throw new Error("Error del servidor: " + resposta.status);
            }

            mostrar(await resposta.json());

            resultat.classList.remove("hidden");
            missatge.textContent = "Anàlisi completada.";
            resultat.scrollIntoView({ behavior: "smooth", block: "start" });

        } catch (error) {
            console.error("Error en l'anàlisi de riscos:", error);
            missatge.textContent =
                "No s'ha pogut fer l'anàlisi. Comprova que el servidor està engegat amb riscos.py.";
        } finally {
            boto.disabled = false;
            boto.textContent = "Analitzar riscos →";
        }
    });
})();