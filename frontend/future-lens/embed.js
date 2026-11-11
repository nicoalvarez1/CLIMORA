(() => {
  "use strict";

  const feature = document.getElementById("future-lens");
  const host = document.getElementById("future-lens-component");
  const tabList = document.querySelector(".pestanyes");
  const featureUrl = new URL("future-lens/", document.baseURI);
  const mapLibreScriptUrl = "https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.js";
  const mapLibreCssUrl = "https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.css";
  let mountPromise = null;
  let mounted = false;

  if (!feature || !host) return;

  function setSelectedTab(selected) {
    tabList?.querySelectorAll(".pestanya").forEach((tab) => {
      const active = tab.dataset.vista === selected;
      tab.classList.toggle("activa", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }

  function showExistingView(view) {
    feature.classList.add("vista-oculta");
    if (view) {
      window.history.replaceState(null, "", `#${view}`);
      setSelectedTab(view);
    }
  }

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    return new Promise((resolve) => {
      const existing = document.getElementById("future-lens-maplibre-script");
      if (existing) {
        if (existing.dataset.loaded === "true" || existing.dataset.failed === "true") return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.id = "future-lens-maplibre-script";
      script.src = mapLibreScriptUrl;
      script.async = true;
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", () => { script.dataset.failed = "true"; resolve(); }, { once: true });
      document.head.appendChild(script);
    });
  }

  async function mountFeature() {
    if (mounted) return;
    if (mountPromise) return mountPromise;

    mountPromise = (async () => {
      try {
        const [markupResponse, cssResponse] = await Promise.all([
          fetch(new URL("component.html", featureUrl)),
          fetch(new URL("styles.css", featureUrl))
        ]);
        if (!markupResponse.ok || !cssResponse.ok) throw new Error("No s’han pogut carregar els fitxers de Future Lens.");
        const [markup, css] = await Promise.all([markupResponse.text(), cssResponse.text()]);
        const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
        shadow.innerHTML = `<link rel="stylesheet" href="${mapLibreCssUrl}"><style>${css}</style>${markup}`;
        await loadMapLibre();
        if (typeof window.mountFutureLens !== "function") throw new Error("No s’ha pogut iniciar la lent climàtica.");
        window.mountFutureLens(shadow);
        mounted = true;
        window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      } catch (error) {
        const message = document.createElement("p");
        message.setAttribute("role", "alert");
        message.textContent = error.message || "No s’ha pogut obrir Future Lens. Recarrega la pàgina i torna-ho a provar.";
        if (host.shadowRoot) host.shadowRoot.replaceChildren(message);
        else host.replaceChildren(message);
        mountPromise = null;
      }
    })();

    return mountPromise;
  }

  async function activateFeature() {
    ["comparador", "resultats", "riscos", "viajes"].forEach((id) => {
      document.getElementById(id)?.classList.add("vista-oculta");
    });
    feature.classList.remove("vista-oculta");
    setSelectedTab("future-lens");
    window.history.replaceState(null, "", "#future-lens");
    document.getElementById("explora")?.scrollIntoView({ behavior: "smooth", block: "start" });
    await mountFeature();
    window.dispatchEvent(new Event("resize"));
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.(".pestanya");
    const anchor = event.target.closest?.('a[href^="#"]');
    if (tab?.dataset.vista === "future-lens" || anchor?.getAttribute("href") === "#future-lens") {
      event.preventDefault();
      activateFeature();
      return;
    }
    if (tab?.dataset.vista && tab.dataset.vista !== "future-lens") {
      showExistingView(tab.dataset.vista);
      return;
    }
    const href = anchor?.getAttribute("href");
    if (["#comparador", "#riscos", "#viajes"].includes(href)) {
      showExistingView(href.slice(1));
    }
  });

  if (window.location.hash === "#future-lens") activateFeature();
})();
