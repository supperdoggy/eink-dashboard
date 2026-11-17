# Holešovice, at a glance

See the [project guide](PROJECT.md) for the architecture, setup, and day-to-day operation.

Three HTML/CSS dashboards for a black-and-white Waveshare 7.5″ e-paper display, targeting **800 × 480** pixels. Confirm the resolution printed on your panel before connecting hardware: older 7.5″ variants use a different resolution and driver.

| Design | Display URL | Emphasis |
| --- | --- | --- |
| Hello, Holešovice | `/?design=daily&display=1` | Weather poster, temperature sticker, friendly forecast and both platforms |
| Weather buddy | `/?design=weather&display=1` | Weather character, speech bubble, temperature and clothing advice |
| A little adventure | `/?design=station&display=1` | Tram-ticket layout with both platforms and a weather stub |

## Run

The dashboard server uses **Python 3.9+ and its standard library**. Fonts and icons are checked in and served locally. No browser, Node, API keys or npm install is needed just to serve and view the HTML.

```bash
python3 scripts/sync_transit.py
python3 server.py
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) for **A little adventure**, the selected default. [Compare all three designs](http://127.0.0.1:8787/?design=all) when needed. The server also refreshes the timetable in the background when its download is older than six hours. On a first boot without a timetable, the UI shows its unavailable state until the initial import completes. An offline refresh retains the previous timetable; an expired feed is explicitly rejected.

## Five illustrated worlds

Open [the alternative HTML gallery](http://127.0.0.1:8787/worlds.html), or `/worlds.html` on the Pi's port 8787. These are additional views. The physical screen can use **Little Adventure** or **Daylight Mountain**, selected on `/display.html`. The other scenes remain HTML previews.

| View | Display URL | What changes |
| --- | --- | --- |
| Apartment transmission | `/worlds.html?view=transmission&display=1` | Heavy ink bulletin, fictional halftone sector scan, real weather observations, one daily story transmission |
| Persistent courtyard | `/worlds.html?view=courtyard&display=1` | Miso's favourite windowsill, a leaf moved by wind changes, puddles remembered after rain |
| Last petrol station | `/worlds.html?view=petrol&display=1` | Temperature/feels-like/wind on a price board; night signage, vending machine and occasional vehicles |
| Four-panel weather comic | `/worlds.html?view=comic&display=1` | Weather-driven comic with three-hour episodes and exact temperature/conditions in the last panel |
| Daylight mountain | `/worlds.html?view=mountain&display=1` | Climber progresses between real sunrise and sunset; shorter daylight means a lower final camp |

Each view is exactly **800×480**, uses local fonts and live SVG layers, and includes scheduled departures in both directions. The gallery's weather studies simulate clear weather and day/night versions of rain, snow and wind. They are visibly labelled and never alter saved memory. Display-only URLs and **Download live PNG** always use actual weather. NAS and indoor sensors are explicitly unconnected.

`data/world.json` stores the fictional world's birth date, observed rain, wind/leaf state and daily journal. It is updated atomically only when something changes. Puddles remain for 18 hours after an observed rain interval; old or stale weather cannot create a new event. The autumn leaf moves when wind is at least 14 km/h and changes by at least 50 degrees from its previous anchor. Miso prefers the windowsill in cold or wet weather and after dark. Comic episodes and parked vehicles are stable during each three-hour slot. The daily story starts at fictional transmission 0174; its first fortnight is an authored sequence, followed by short recurring dispatches. No historical events are invented before installation.

The mountain uses the eight supplied clear, rain, snow and wind engravings for day and night as proportional background images, with the original PNG files kept unchanged. The climber and tent follow calibrated points along the engraved trail; motion is measured by distance along that route. The background switches on the same sunrise/sunset clock, including night artwork before dawn, rather than waiting for the cached weather daylight flag. Current rain or snow selects its matching artwork first; otherwise wind of at least 20 km/h selects the wind image. Other conditions use the base day/night image. The exact weather reading, climber/tent and tram departures remain live overlays; engraved weather is not drawn twice. The moon in the night artwork is illustrative.

The mountain uses Open-Meteo's sunrise/sunset times. Its position is the elapsed daylight fraction multiplied by the day's length relative to a 16-hour climb. After sunset it shows a tent at the day's final position; before sunrise it waits at base camp. This is a fictional illustration of daylight, not an altitude or hiking recommendation.

Export a live alternative with `npm run render -- --design=transmission` (or `courtyard`, `petrol`, `comic`, `mountain`). The physical refresh service follows the saved dashboard choice. `npm run check:worlds` checks the gallery and all weather states; set `DASHBOARD_URL=http://127.0.0.1:8787` when using the default server port (the test defaults to the isolated preview server on 8790).

## Choose the physical dashboard

Open **`/display.html` on the Pi's port 8787**. Choose **Little Adventure** (the original tram-ticket dashboard) or **Daylight Mountain**, then select **Use this dashboard**. The page shows the saved choice and the last dashboard actually shown on the panel. Both designs remain available independently.

The choice is stored atomically in `data/display-settings.json` and survives server restarts and Pi reboots. Each minute the worker reads it again. Missing settings default to the original `station` design. A one-off CLI `--design=station` or `--design=mountain` overrides the saved choice only for that invocation.

On the Pi, `eink-dashboard.service` sets `EINK_HARDWARE=1`, allowing the settings endpoint to request the fixed `eink-refresh.service` using non-interactive sudo. The provisioned `maks` account already has passwordless sudo. The minute timer also applies saved choices if an immediate refresh is unavailable or another update is running. A choice changed during rendering discards that old render before touching the panel; an already-started hardware transfer finishes safely. Only real-data display URLs are used for the physical screen.

`GET /api/display/settings` returns the selection and display status. `POST /api/display/settings` accepts JSON such as `{"design":"mountain"}` or `{"design":"station"}`. Cross-origin browser requests, non-JSON bodies and unsupported choices are rejected. A local preview server without `EINK_HARDWARE=1` can save its local settings but does not start the Pi's display service.

The last successful image and source snapshot for each design are preserved in `images/station.png` / `images/station.json` and `images/mountain.png` / `images/mountain.json`. `images/dashboard.png` and `.json` point to copies of the last completed active frame. On upgrade, the original active frame is archived before Mountain is first displayed. The original HTML, greeting deck and assets remain unchanged.

## Three greetings a day

The ticket's headline rotates at **06:00, 12:00 and 18:00 in Europe/Prague**, on the next dashboard refresh. The evening greeting remains through midnight until 06:00, so it changes exactly three times a day. Daylight-saving changes follow Prague's local clock.

The [100 authored phrases](PHRASES.md) include **16 year-round greetings** and **21 for each season**. Each phrase belongs to morning, afternoon or evening. Seasons use Prague's meteorological months: spring March–May, summer June–August, autumn September–November, winter December–February. A new season starts with its first 06:00 greeting, preserving the overnight message.

Selection uses a deterministic daily rotation through a shuffled eligible deck. Refreshing the browser or restarting the Pi keeps the same headline. Each eligible phrase appears before that period's deck repeats; adjacent slots use different phrases. No API or background AI generation is involved. Clothing advice remains based on the actual forecast, independently of the seasonal greeting.

Edit `public/phrases.json` to change the copy, then restart the Python server. The default PNG renderer and `/api/render` also use A little adventure. Add `?display=1` to the root URL for the panel-only view.

Mountain uses the same seasonal schedule with a combined deck of **200 phrases**: the original 100 plus [100 mountain phrases](MOUNTAIN_PHRASES.md) in `public/mountain-phrases.json`. Its headline comes from `mountainGreeting` in `/api/dashboard`; the original dashboard still uses the unchanged `greeting` deck. The selected line stays stable across minute refreshes and restarts. Restart the Python server after editing either phrase file.

To view it from another device on your LAN:

```bash
python3 server.py --host 0.0.0.0
```

The server is intended for your local network; it has no public-hosting or authentication setup.

## Export a screen image

For screenshot rendering, install Node.js 18+ and Chrome/Chromium, then install the development tools:

```bash
npm install
npm run render -- --design=daily
npm run render -- --design=weather
npm run render -- --design=station
```

Keep the Python server running while rendering. PNGs are saved in `previews/`. Each is exactly 800 × 480 with only pure black and white pixels. The browser gallery's **Download PNG** buttons run the same renderer. The exported PNG uses grayscale PNG encoding containing two pixel values; it is not a packed 1-bit panel buffer. Convert it with Pillow's `image.convert("1")` when handing it to the correct Waveshare driver.

The renderer detects common Chrome locations on macOS and Linux. Override when necessary:

```bash
CHROME_PATH=/usr/bin/chromium npm run render -- --design=station
```

Optional renderer arguments: `--url=http://127.0.0.1:8787` and `--output=/absolute/path/dashboard.png`. Rendering can run on this computer or an always-on server, with the Pi fetching the PNG. The Pi installation below uses the distribution’s native `chromium-headless-shell` to render directly on the Zero 2 W.

## Real data and refresh behavior

- **Weather:** [Open-Meteo](https://open-meteo.com/en/docs), using the official stop coordinates (50.107826, 14.447080). Current conditions are weather-model estimates, not readings from a sensor at the stop. Upstream requests are cached for ten minutes. Forecast times and the next six forecast hours are recalculated on each dashboard request. Night icons follow the API's daylight field.
- **Precipitation:** hourly probability covers rain or snow combined. “Peak today” is the maximum remaining hourly probability, not the probability of precipitation anywhere during the whole day. Expected snowfall, when positive, is shown in centimetres. No separate snow probability is invented.
- **Trams:** [PID / ROPID's official GTFS feed](https://pid.cz/o-systemu/opendata/), downloaded from `https://data.pid.cz/PID_GTFS.zip`. The importer retains only tram departures at **U521Z1P (platform A)** and **U521Z2P (platform B)**. These are the two platforms of the same **Ortenovo náměstí** stop. The dashboard groups departures by direction, with headings such as **Towards Nádraží Holešovice** and **Towards Dělnická**. Direction labels come from the following stop in each trip, not a guessed destination mapping.
- **Timetables include calendar exceptions and overnight services** with times above 24:00. GTFS service-day timestamps use local noon minus twelve elapsed hours to handle daylight-saving transitions. Pickup-disabled calls are excluded.
- **Times are scheduled, without live delays or real-time cancellations.** A future Golemio integration will need your own API key, kept on the backend. No borrowed tokens or fabricated departures are used.
- **The browser refreshes once per minute.** Each snapshot carries Prague-local departure times and visible weather/update timestamps. Weather refresh failures show a stale label; a forecast from a previous day is not reused as today's. Failed browser refreshes hide old tram countdowns.
- **Clothing advice:** a simple heuristic based on feels-like temperature, upcoming precipitation and snowfall. It is not an external forecast product or a guarantee of comfort.

All designs share `GET /api/dashboard`. Preview navigation and export controls stay outside the physical display canvas. Browser preview selection is stored in the URL; physical-screen selection is saved separately on the Pi. The Pi timer renders this HTML locally and sends the resulting bitmap to the Waveshare `epd7in5_V2` driver, using a full refresh followed by deep sleep.

## Raspberry Pi installation and minute updates

The target is **Raspberry Pi Zero 2 W, Raspberry Pi OS Lite 32-bit (Trixie), user `maks`, hostname `eink-dash`**, with the project at `/home/maks/eink-dashboard`. Copy the source files, `public`, `scripts`, `hardware`, `vendor`, `deploy`, and the npm manifests to that directory. A valid `data/transit.sqlite` can be copied to avoid waiting for the initial feed import; otherwise it is downloaded automatically. Do not copy macOS `node_modules` to the Pi.

With the Pi powered off, connect the display as tested. The **Rev2.3 HAT switches are B (0.47 Ω) and 0 (4-line SPI)**. The working panel driver is `epd7in5_V2`. Keep the ribbon in its confirmed working orientation. Power off before touching the ribbon or HAT.

On the Pi, run:

```bash
cd /home/maks/eink-dashboard
bash deploy/install-on-pi.sh
```

The installer installs native Chromium, Node and the Python hardware dependencies, enables SPI, and installs three systemd units:

- `eink-dashboard.service` serves the HTML and API on port **8787**, caches Open-Meteo requests for ten minutes, and refreshes the official PID feed every six hours.
- `eink-refresh.timer` starts a refresh at each minute boundary, plus once after boot. It starts automatically after a power cycle.
- `eink-refresh.service` reads the saved physical-dashboard choice, renders **Little Adventure** or **Daylight Mountain**, validates an 800×480 binary image and a recent snapshot timestamp, performs one full panel refresh, then sleeps and powers down the display interface. It runs as `maks`, with GPIO/SPI group access.

All rendering and data access run on the Pi; your Mac is not required. A full refresh causes a brief visible flash each minute. No partial-refresh waveforms are used. Greetings continue to change at 06:00, 12:00 and 18:00 Prague time.

Systemd and file locks prevent overlapping refreshes. Each stage has a timeout. A failed render never sends an old screenshot as a new update; the panel keeps its previous image and visible update time. Weather failures use a marked same-day cached forecast; valid scheduled tram data continues to work offline. Expired timetables and unavailable weather show explicit empty states. The next timer invocation retries a failed refresh. A hardware failure during a transfer may leave an incomplete image until the next successful update.

Check operation:

```bash
systemctl status eink-dashboard.service eink-refresh.timer
systemctl list-timers eink-refresh.timer
journalctl -u eink-refresh.service -n 50 --no-pager
cat data/display-status.json
```

Open `http://eink-dash.local:8787` on a reachable local network, or use the Pi's Tailscale hostname and port 8787. `GET /api/display` reports the last display attempt and last successful update; `GET /display.png` returns the last bitmap whose driver update completed. The current bitmap and its source snapshot are saved as `images/dashboard.png` and `images/dashboard.json`. The HTTP server is intended for your private LAN/Tailscale network.

Manual operations:

```bash
# One immediate update; systemd prevents overlap with the timer.
sudo systemctl start eink-refresh.service

# Pause automatic updates (the panel retains its image).
sudo systemctl stop eink-refresh.timer

# Resume.
sudo systemctl start eink-refresh.timer

# Render without touching the display.
python3 hardware/refresh.py --render-only
```

A render-only check saves `images/preview.png`, `images/preview.json` and `data/render-status.json`; it preserves the displayed image and its success record.

### Diagnose Wi-Fi and display outages

On the Pi, `bash deploy/enable-diagnostics.sh` enables persistent system logs and adds Wi-Fi, supplicant, and IPv4 DHCP debug messages. The journal is configured for 256 MiB and a maximum age of 14 days, with earlier rotation when it reaches the size limit. Logs stay on the Pi and include kernel events, Tailscale, data provider failures, browser errors, and panel refresh timings.

The weather worker fetches Open-Meteo in the background every ten minutes and waits a minute after failed attempts. Dashboard requests read the last complete forecast immediately. If it is stale, the display labels it as saved weather. If there is no forecast for the current day, the clock and any valid scheduled trams still update.

To keep retrying after a disconnect, install Wi-Fi recovery on the Pi with its existing NetworkManager profile name. NetworkManager retries indefinitely. A timer also attempts to reactivate the same profile after three consecutive checks with `wlan0` down. The timer leaves an active connection and a disabled Wi-Fi radio alone.

```bash
bash deploy/install-wifi-recovery.sh "Dumb home"
sudo journalctl -u eink-wifi-recover.service -o short-iso --no-pager
sudo journalctl --list-boots
sudo journalctl -b -1 -u NetworkManager -u wpa_supplicant -u tailscaled \
  -u eink-dashboard.service -u eink-refresh.service -o short-iso --no-pager
sudo journalctl -k -b -1 -o short-iso --no-pager
```

Use `-b 0` for the current boot or add `--since` and `--until` to narrow the time window. Authentication failures, DHCP failures, and dashboard render errors appear in separate units.

The installer expects the username and path above. Adjust the three unit files and installer guard if deploying under a different account or directory.

## Checks

```bash
npm test
npm run check:browser
node scripts/check-display.mjs
```

The tests require Pillow (`python3-pil` on the Pi, or `python3 -m pip install Pillow` in a local environment). They cover calendar additions/removals, midnight service times, expired feeds, separate platforms, past-departure filtering, DST origins, forecast interval boundaries, stale/invalid rendered images, failed rendering, failed display writes and overlapping refreshes. The chooser browser check defaults to an isolated server on port 8792 and intercepts all setting writes, so it never requests physical updates. Browser checks require the server and Chrome; they cover gallery widths from 320 to 1440 pixels, exact panel geometry, Czech fonts/icons, real provider responses, long destinations and unavailable states.

## Design and assets

Built with the requested [Hallmark frontend skill](https://github.com/Nutlope/hallmark), adapting its Newsprint, Carnival and Wayfind directions to the physical black-and-white screen. The three layouts deliberately change hierarchy rather than only swapping fonts. Hallmark's app-screen scope applies; its marketing hero rules do not.

The playful revision uses Fredoka for rounded display type and DM Sans for the timetable. A code-drawn weather buddy changes its outline and precipitation marks with the current weather. The playful styles live in `public/playful.css`.

Fonts: Fredoka, DM Sans, Zilla Slab and Chivo Mono (SIL OFL). Icons: Lucide (ISC). License files are in `public/assets/`. `node scripts/prepare-assets.mjs` rebuilds the copied assets after installing npm dependencies. Transit data is attributed to PID / ROPID under CC BY; weather is attributed to Open-Meteo on each screen.
