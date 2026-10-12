(function () {
    "use strict";

    const API_BASE =
        (location.protocol === "file:" || location.port === "5500")
            ? "http://127.0.0.1:8000"   // proves a l'ordinador (Live Server)
            : location.origin;

    const contenidor = document.getElementById("mapa-ciutats");
    const camp1 = document.getElementById("ciudad1");
    const camp2 = document.getElementById("ciudad2");
    const boto1 = document.getElementById("seleccionar-ciutat1");
    const boto2 = document.getElementById("seleccionar-ciutat2");
    const missatge = document.getElementById("mapa-missatge");

    if (!contenidor || !camp1 || !camp2 || !boto1 || !boto2 || !missatge) {
        console.error("CLIMORA: falten elements HTML del globus.");
        return;
    }

    if (typeof Globe !== "function") {
        missatge.textContent =
            "No s'ha carregat la biblioteca del globus. Comprova la connexió a internet.";
        return;
    }

    let campActiu = 1;
    let ultimPunt = null;
    let puntSobre = null;
    const seleccio = { 1: null, 2: null };

    // Colors: daurat per a totes les ciutats, llima i taronja per a les triades.
    const COLOR_CIUTAT = "#ffd36b";
    const COLOR_SOBRE = "#ffffff";
    const COLOR_TRIA = { 1: "#d8ed8b", 2: "#ff9f5a" };

    function numeroTria(point) {
        if (point === seleccio[1]) return 1;
        if (point === seleccio[2]) return 2;
        return 0;
    }

    function hexARgb(hex) {
        return [1, 3, 5].map(function (i) {
            return parseInt(hex.slice(i, i + 2), 16);
        }).join(",");
    }
    let contextAudio = null;
    let puntsCarregats = [];

    function escaparHTML(text) {
        return String(text).replace(/[&<>"']/g, function (caracter) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[caracter];
        });
    }

    // So curt de confirmació.
    function soClic() {
        try {
            const AudioContextDisponible =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextDisponible) return;

            if (!contextAudio) {
                contextAudio = new AudioContextDisponible();
            }

            if (contextAudio.state === "suspended") {
                contextAudio.resume();
            }

            const oscil = contextAudio.createOscillator();
            const volum = contextAudio.createGain();
            const ara = contextAudio.currentTime;

            oscil.type = "sine";
            oscil.frequency.setValueAtTime(740, ara);
            oscil.frequency.exponentialRampToValueAtTime(1040, ara + 0.07);

            volum.gain.setValueAtTime(0.0001, ara);
            volum.gain.exponentialRampToValueAtTime(0.12, ara + 0.015);
            volum.gain.exponentialRampToValueAtTime(0.0001, ara + 0.13);

            oscil.connect(volum);
            volum.connect(contextAudio.destination);

            oscil.start(ara);
            oscil.stop(ara + 0.14);
        } catch (error) {
            console.warn("El so no està disponible.", error);
        }
    }

    // Decideix quin camp s'omplirà en el següent clic.
    function seleccionarCamp(numero) {
        campActiu = numero;

        boto1.classList.toggle("actiu", numero === 1);
        boto2.classList.toggle("actiu", numero === 2);

        boto1.setAttribute("aria-pressed", String(numero === 1));
        boto2.setAttribute("aria-pressed", String(numero === 2));

        missatge.textContent =
            "Ara selecciona la " +
            (numero === 1 ? "primera" : "segona") +
            " ciutat al globus.";

        missatge.classList.remove("seleccionada");
    }

    boto1.addEventListener("click", function () {
        seleccionarCamp(1);
    });

    boto2.addEventListener("click", function () {
        seleccionarCamp(2);
    });

    // Crea el globus.
    const globus = Globe()(contenidor)
        .width(contenidor.clientWidth)
        .height(contenidor.clientHeight)
        .globeImageUrl(
            "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        )
        .backgroundImageUrl(
            "https://unpkg.com/three-globe/example/img/night-sky.png"
        )
        .showAtmosphere(true)
        .atmosphereColor("#8bb9d8")
        .atmosphereAltitude(0.18)
        .pointsData([])
        .pointLat("lat")
        .pointLng("lng")
        .pointAltitude(function (point) {
            if (numeroTria(point)) return 0.05;
            return point === puntSobre ? 0.03 : 0.008;
        })
        .pointRadius(function (point) {
            if (numeroTria(point)) return 0.7;
            return point === puntSobre ? 0.62 : 0.4;
        })
        .pointColor(function (point) {
            const tria = numeroTria(point);
            if (tria) return COLOR_TRIA[tria];
            return point === puntSobre ? COLOR_SOBRE : COLOR_CIUTAT;
        })
        .pointResolution(18)
        .pointsMerge(false)
        .pointsTransitionDuration(250)
        .onPointHover(function (point) {
            puntSobre = point || null;
            contenidor.style.cursor = point ? "pointer" : "grab";
            globus.pointsData([...puntsCarregats]);
        })
        // Anells que bateguen al voltant de les ciutats triades.
        .ringsData([])
        .ringLat("lat")
        .ringLng("lng")
        .ringAltitude(0.012)
        .ringMaxRadius(4)
        .ringPropagationSpeed(2.2)
        .ringRepeatPeriod(850)
        .ringColor(function (point) {
            const rgb = hexARgb(COLOR_TRIA[numeroTria(point)] || COLOR_CIUTAT);
            return function (t) {
                return "rgba(" + rgb + "," + (1 - t) + ")";
            };
        })
        // Arc animat entre les dues ciutats triades.
        .arcsData([])
        .arcStartLat(function (arc) { return arc.inici.lat; })
        .arcStartLng(function (arc) { return arc.inici.lng; })
        .arcEndLat(function (arc) { return arc.final.lat; })
        .arcEndLng(function (arc) { return arc.final.lng; })
        .arcColor(function () { return [COLOR_TRIA[1], COLOR_TRIA[2]]; })
        .arcAltitudeAutoScale(0.35)
        .arcStroke(0.45)
        .arcDashLength(0.45)
        .arcDashGap(0.2)
        .arcDashAnimateTime(2200)
        .pointLabel(function (point) {
            return '<div class="scene-tooltip"><strong>' +
                escaparHTML(point.name) + "</strong><br>" +
                escaparHTML(point.country) + "</div>";
        })
        .onPointClick(function (point) {
            ultimPunt = point;
            seleccio[campActiu] = point;

            // Si es tria la mateixa ciutat per als dos camps, només compta l'últim.
            const altre = campActiu === 1 ? 2 : 1;
            if (seleccio[altre] === point) seleccio[altre] = null;

            const triades = [seleccio[1], seleccio[2]].filter(Boolean);
            globus.ringsData(triades);
            globus.arcsData(
                triades.length === 2
                    ? [{ inici: seleccio[1], final: seleccio[2] }]
                    : []
            );
            globus.pointOfView(
                { lat: point.lat, lng: point.lng, altitude: 1.9 }, 900
            );

            const camp = campActiu === 1 ? camp1 : camp2;
            camp.value = point.name;

            camp.dispatchEvent(new Event("input", { bubbles: true }));
            camp.dispatchEvent(new Event("change", { bubbles: true }));

            // Actualitza el globus per destacar el punt seleccionat.
            globus.pointsData([...puntsCarregats]);

            missatge.textContent =
                "✓ " + point.name + " seleccionada com a " +
                (campActiu === 1 ? "primera ciutat." : "segona ciutat.");

            missatge.classList.remove("seleccionada");
            void missatge.offsetWidth;
            missatge.classList.add("seleccionada");

            contenidor.classList.remove("ciutat-seleccionada");
            void contenidor.offsetWidth;
            contenidor.classList.add("ciutat-seleccionada");

            soClic();

            // PRIMER CLIC: activa la segona ciutat automàticament.
            if (campActiu === 1) {
                setTimeout(function () {
                    seleccionarCamp(2);
                }, 500);
            } else {
                // SEGON CLIC: baixa fins al panell blanc dels camps i del botó.
                setTimeout(function () {
                    const panell = document.querySelector(".cerca-panel");
                    const botoComparar = document.querySelector("#boto");

                    if (!panell || !botoComparar) return;

                    panell.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                    // Efecte visual perquè es vegi clarament el formulari.
                    panell.animate(
                        [
                            {
                                boxShadow: "0 0 0 0 rgba(216,237,139,0)"
                            },
                            {
                                boxShadow: "0 0 0 5px rgba(216,237,139,0.9)"
                            },
                            {
                                boxShadow: "0 18px 55px rgba(18,59,47,0.09)"
                            }
                        ],
                        {
                            duration: 850,
                            easing: "ease-out"
                        }
                    );

                    // El focus va al botó, però NO el prem.
                    botoComparar.focus({
                        preventScroll: true
                    });
                }, 600);
            }
        });

    // Desactiva la rotació automàtica i configura el zoom.
    const controls = globus.controls();
    controls.autoRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 75;
    controls.maxDistance = 300;

    // Carrega les ciutats (amb les seves coordenades reals) des del backend.
    async function carregarCiutats() {
        try {
            const resposta = await fetch(API_BASE + "/ciutats");

            if (!resposta.ok) {
                throw new Error("Error del servidor: " + resposta.status);
            }

            puntsCarregats = await resposta.json();
            globus.pointsData(puntsCarregats);

            missatge.textContent =
                "Tria la primera ciutat i clica un punt daurat. " +
                puntsCarregats.length + " ciutats disponibles.";

        } catch (error) {
            console.error("Error carregant les ciutats:", error);

            missatge.textContent =
                "No s'han pogut carregar els punts del globus. " +
                "Comprova que el servidor està engegat o escriu les ciutats manualment.";
        }
    }

    function ajustarMida() {
        globus
            .width(contenidor.clientWidth)
            .height(contenidor.clientHeight);
    }

    window.addEventListener("resize", ajustarMida);

    carregarCiutats();
})();