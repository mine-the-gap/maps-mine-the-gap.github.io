# Third-party libraries (self-hosted)

These files are served from this site instead of a CDN, so the page needs no
third-party script host and the Content-Security-Policy can stay `script-src 'self'`.
Do not edit them; to upgrade, download the new release into a new versioned folder,
check the hash, and update the `<script>`/`<link>` tags in `index.html`.

| Library | Version | Files | Source | Checked |
|---|---|---|---|---|
| Leaflet | 1.9.4 | `leaflet-1.9.4/leaflet.js`, `leaflet.css`, `images/*.png` | https://unpkg.com/leaflet@1.9.4/dist/ | `leaflet.js` sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo= and `leaflet.css` sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY= (the SRI hashes published on leafletjs.com/download) |
| geotiff.js | 2.1.3 | `geotiff-2.1.3/geotiff.js` (dist-browser build) | https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js | sha256 y1yXMb/uH4v/FyjlTkQ2rageoyWLF4o9ZgPGG1jZnmw= (matches the hash jsDelivr lists for the npm package) |

Downloaded 2026-11-10. Licences: Leaflet BSD-2-Clause, geotiff.js MIT.
