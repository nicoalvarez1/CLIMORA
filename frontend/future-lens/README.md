# CLIMORA Future Lens

In-page climate explorer integrated into the original CLIMORA tab bar. The existing `index.html` loads this feature only when a visitor opens the “Lent climàtica” tab.

- Component markup, styles, data logic, and tab integration live in this directory; the original CLIMORA content and APIs remain separate.
- No API keys, paid map account, build step, or package installation are required.
- MapLibre GL JS is loaded from unpkg; basemap tiles come from OpenFreeMap.
- Geocoding and daily CMIP6 climate series come from Open-Meteo. Its free API is limited to non-commercial use and requires attribution. The feature shows its data sources and limitations.
- Camera access requires an HTTPS deployment (or localhost) and explicit browser permission. If unavailable, the 3D map remains usable.
