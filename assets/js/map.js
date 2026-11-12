/**
 * MINE-THE-GAP Maps: the global mining land-use explorer (Leaflet + geotiff.js).
 * Moved out of index.html so the page's CSP can be script-src 'self'; no inline
 * event handlers. Text from the data (band names, values) is written with
 * textContent, never innerHTML.
 */
(function () {
    'use strict';

    const DATA_VERSION = "20251227";
    // The COG is served by this same site, so derive its URL from the page's origin
    // (https://maps.minethegap.eu in production, http://localhost:… when testing).
    const BASE_URL = new URL('/assets/data/', location.origin).href;
    const cogUrl = `${BASE_URL}material_areas_km2-${DATA_VERSION}.tif`;
    const readmeUrl = `${BASE_URL}material_areas_km2-${DATA_VERSION}.txt`;

    const $ = (id) => document.getElementById(id);

    // Update Modal links on load
    $('download-link').href = cogUrl;
    $('readme-link').href = readmeUrl;
    $('cog-link-display').textContent = cogUrl;

    // Global state - initialized from metadata
    let NODATA = 65535;
    let materials = [];

    /* ---------- Info modal ---------- */
    function toggleModal(show) {
        $('modal-overlay').classList.toggle('active', show);
        if (show) $('modal-close-btn').focus();
    }
    $('info-btn').addEventListener('click', () => toggleModal(true));
    $('modal-close-btn').addEventListener('click', () => toggleModal(false));
    $('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) toggleModal(false);
        // "Get in touch" inside the modal: contact.js opens the dialog; close this one.
        else if (e.target.closest('[data-contact-open]')) toggleModal(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $('modal-overlay').classList.contains('active')) toggleModal(false);
    });

    /* ---------- Site navigation pill (collapses to a menu on phones) ---------- */
    const nav = $('map-nav');
    const navToggle = $('map-nav-toggle');
    const setNav = (open) => {
        nav.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', String(open));
    };
    navToggle.addEventListener('click', (e) => { e.stopPropagation(); setNav(!nav.classList.contains('open')); });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)));
    document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setNav(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });

    /* ---------- Copy the COG link ---------- */
    async function copyCogLink() {
        const text = $('cog-link-display').textContent;
        const btn = $('copy-btn');

        // Visual feedback: the CSS swaps the icon and colours while .copied is set.
        const showSuccess = () => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 2000);
        };

        // 1. Modern API (HTTPS required)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                showSuccess();
                return;
            } catch (err) {
                console.warn('Clipboard API failed, trying fallback...', err);
            }
        }

        // 2. Fallback to legacy execCommand (older browsers or HTTP)
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.className = 'visually-hidden';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            if (document.execCommand('copy')) showSuccess();
        } catch (err) {
            console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
    }
    $('copy-btn').addEventListener('click', copyCogLink);

    /* ---------- Map ---------- */
    const map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 12,
        zoomControl: false
    });

    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Basemaps (tile hosts are listed in the page's CSP img-src)
    // Esri basemaps: no key needed. The credit follows Esri's attribution rules ("Powered by Esri" plus the data
    // sources each service lists in its copyrightText).
    const ESRI = 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a>';
    // The plain map follows the light / dark theme (theme.js): Esri's light or dark grey canvas, which share their
    // sources and so their credit.
    const CANVAS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_{shade}_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    const isDark = () => (window.mtgIsDark ? window.mtgIsDark() : true);
    const canvasUrl = () => CANVAS.replace('{shade}', isDark() ? 'Dark' : 'Light');
    const mapLayer = L.tileLayer(canvasUrl(), {
        maxNativeZoom: 16,
        attribution: ESRI + ' | Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, and the GIS user community'
    });
    document.addEventListener('mtg-theme', () => {
        mapLayer.setUrl(canvasUrl());
        if (rasterLayer) rasterLayer.redraw();  // the light theme rims the data (below)
    });

    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: ESRI + ' | Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    mapLayer.addTo(map);

    L.control.layers({ "Map": mapLayer, "Satellite": satLayer }, null, { position: 'bottomleft' }).addTo(map);

    map.on('baselayerchange', () => { if (rasterLayer) rasterLayer.bringToFront(); });

    let tiff, image, rasterLayer, currentBandData, width, height, origin, res, clickMarker;

    function parseGdalMetadata(xmlString) {
        if (!xmlString) return {};

        // Remove null bytes (\u0000), which break Firefox's DOMParser, and trim whitespace.
        const cleanXml = xmlString.replace(/\u0000/g, '').trim();

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(cleanXml, "text/xml");

        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
            console.warn("GDAL Metadata XML Parse Error:", parseError[0].textContent);
            return {};
        }

        const items = xmlDoc.getElementsByTagName("Item");
        const meta = {};
        for (let i = 0; i < items.length; i++) {
            const name = items[i].getAttribute("name");
            const sample = items[i].getAttribute("sample");
            const text = items[i].textContent.trim();

            if (name === "DESCRIPTION" && sample !== null) {
                meta[parseInt(sample, 10)] = text;
            } else if (name && name.startsWith("BAND_")) {
                meta[parseInt(name.replace("BAND_", ""), 10) - 1] = text;
            }
        }
        return meta;
    }

    async function initMapTool() {
        try {
            tiff = await GeoTIFF.fromUrl(cogUrl);
            image = await tiff.getImage();

            const gdalNoData = image.getGDALNoData();
            if (gdalNoData !== null) NODATA = gdalNoData;

            const numBands = image.getSamplesPerPixel();

            let descriptions = {};
            try {
                if (image.fileDirectory && image.fileDirectory.GDAL_METADATA) {
                    descriptions = parseGdalMetadata(image.fileDirectory.GDAL_METADATA);
                }
            } catch (metaErr) {
                console.warn("Could not access GDAL_METADATA:", metaErr);
            }
            materials = [];
            for (let i = 0; i < numBands; i++) {
                materials.push(descriptions[i] || `Band ${i + 1}`);
            }

            width = image.getWidth();
            height = image.getHeight();
            origin = image.getOrigin();
            res = image.getResolution();

            const select = $('layer-select');
            select.replaceChildren();
            materials.forEach((m, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = m.replace(/_/g, ' ');
                select.appendChild(opt);
            });

            select.addEventListener('change', async (e) => {
                const bandIndex = parseInt(e.target.value, 10);
                const raster = await image.readRasters({ samples: [bandIndex] });
                currentBandData = raster[0];
                if (rasterLayer) { rasterLayer.redraw(); rasterLayer.bringToFront(); }
            });

            const initialBand = await image.readRasters({ samples: [0] });
            currentBandData = initialBand[0];
            setupGridLayer();
            map.on('click', handleMapClick);
        } catch (err) { console.error("Initialization Error:", err); }
    }

    // On the light map the palest classes would fade into the grey, so there every patch of data gets a thin dark rim;
    // the colours (and the legend) stay the same in both themes.
    const RIM = [92, 58, 16, 170];

    function setupGridLayer() {
        rasterLayer = L.gridLayer({ opacity: 0.85, zIndex: 1000 });
        rasterLayer.createTile = function (coords) {
            const tile = document.createElement('canvas');
            tile.width = tile.height = 256;
            const ctx = tile.getContext('2d');
            const imgData = ctx.createImageData(256, 256);
            const hasData = new Uint8Array(256 * 256);
            for (let y = 0; y < 256; y++) {
                for (let x = 0; x < 256; x++) {
                    const p = map.unproject(coords.multiplyBy(256).add([x, y]), coords.z);
                    const rX = Math.floor((p.lng - origin[0]) / res[0]);
                    const rY = Math.floor((p.lat - origin[1]) / res[1]);
                    if (rX >= 0 && rX < width && rY >= 0 && rY < height) {
                        const val = currentBandData[rY * width + rX];
                        if (val !== NODATA && val > 0) {
                            hasData[y * 256 + x] = 1;
                            const idx = (y * 256 + x) * 4;
                            let c;
                            if (val < 50) c = [255,255,204,180];
                            else if (val < 200) c = [255,237,160,200];
                            else if (val < 500) c = [254,217,118,220];
                            else if (val < 1000) c = [254,178,76,230];
                            else if (val < 2500) c = [253,141,60,240];
                            else if (val < 5000) c = [240,59,32,250];
                            else c = [189,0,38,255];
                            imgData.data[idx] = c[0]; imgData.data[idx+1] = c[1];
                            imgData.data[idx+2] = c[2]; imgData.data[idx+3] = c[3];
                        }
                    }
                }
            }
            if (!isDark()) {
                for (let y = 0; y < 256; y++) {
                    for (let x = 0; x < 256; x++) {
                        const i = y * 256 + x;
                        if (hasData[i]) continue;
                        const next = (x > 0 && hasData[i - 1]) || (x < 255 && hasData[i + 1]) ||
                            (y > 0 && hasData[i - 256]) || (y < 255 && hasData[i + 256]);
                        if (next) imgData.data.set(RIM, i * 4);
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return tile;
        };
        rasterLayer.addTo(map).bringToFront();
    }

    function infoLine(cls, text) {
        const div = document.createElement('div');
        div.className = cls;
        div.textContent = text;
        return div;
    }

    async function handleMapClick(e) {
        if (clickMarker) map.removeLayer(clickMarker);
        clickMarker = L.marker(e.latlng).addTo(map);

        const info = $('pixel-info');
        info.replaceChildren(infoLine('pixel-busy', 'Sampling layers...'));

        const rX = Math.floor((e.latlng.lng - origin[0]) / res[0]);
        const rY = Math.floor((e.latlng.lat - origin[1]) / res[1]);
        if (rX < 0 || rX >= width || rY < 0 || rY >= height) {
            info.replaceChildren(infoLine('pixel-hint', 'Outside the data extent.'));
            return;
        }

        const fullImage = await tiff.getImage(0);
        const pixelSample = await fullImage.readRasters({ window: [rX, rY, rX + 1, rY + 1] });
        const rows = [];
        materials.forEach((m, i) => {
            const val = pixelSample[i][0];
            if (val !== NODATA && val > 0) {
                const row = document.createElement('div');
                row.className = 'val-row';
                const name = document.createElement('span');
                name.textContent = m.replace(/_/g, ' ');
                const num = document.createElement('span');
                num.className = 'val-num';
                num.textContent = `${(val / 10).toFixed(1)} km²`;
                row.append(name, num);
                rows.push(row);
            }
        });
        info.replaceChildren(...(rows.length ? rows : [infoLine('', 'No mining detected.')]));
    }

    // Scripts are deferred, so the DOM is ready here; wait for 'load' as before.
    if (document.readyState === 'complete') initMapTool();
    else window.addEventListener('load', initMapTool);
})();
