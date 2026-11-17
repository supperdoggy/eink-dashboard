# Flight watch

Open `/flights.html?view=atlas` or `/flights.html?view=radar` on the dashboard server. Add `&display=1` for the 800 × 480 layout, or `&mode=replay` for a labelled fictional example with an accelerated landing and handoff.

Both views share one server-side tracker. While a live preview is open, it checks [adsb.lol](https://www.adsb.lol/docs/open-data/api) at most once every 185 seconds. Candidates are randomly sampled from airborne flights near Central Europe with a plausible regional route from [ADSBdb](https://www.adsbdb.com/). The dotted line is the direct airport-to-airport route. The solid trail consists of positions received since tracking began. State is held in memory until the web server restarts.

An aircraft reported on the ground within 8 km of its destination is held for 10 minutes before a different flight is selected. If coverage is lost, the preview marks the last position stale and keeps waiting for up to 45 minutes. Ground coverage and route matches depend on the providers. The replay works from local files and makes no calls to the flight API.

`countries.json` contains rounded exterior rings from Natural Earth's 1:110m Admin 0 Countries data, version 5.1.2. [Source GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_admin_0_countries.geojson) · [Public domain terms](https://www.naturalearthdata.com/about/terms-of-use/)
