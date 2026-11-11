# Mountain artwork

The eight day/night weather PNGs were supplied by the user on 7 November 2026 and are copied without image edits.

- `mountain-day.png`: `Альпійська вершина в чорно-білій гравюрі.png`
- `mountain-night.png`: `Нічна гірська гравюра під місяцем.png`

- `mountain-day-rain.png`: `Денний гірський дощ у чорно-білій гравюрі.png`
- `mountain-night-rain.png`: `Нічна злива над альпійським масивом.png`
- `mountain-day-snow.png`: `Альпійська вершина під густим снігопадом.png`
- `mountain-night-snow.png`: `Нічний снігопад над засніженою вершиною.png`
- `mountain-day-wind.png`: `Вітряна гравюра гірського хребта.png`
- `mountain-night-wind.png`: `Місячний вітер над горами.png`

Images are 1619×971, except daytime rain and both wind images, which are 1620×971. The HTML scales them proportionally to 800px wide and clips the unused lower margin behind the separate tram strip. The original PNG files are retained unchanged; the existing screenshot renderer converts the final composed dashboard to pure black/white pixels for the panel.

The SVG traveller follows calibrated points along the engraved path. Movement uses distance along that route; daylight progress and the seasonal climb length remain calculated from real sunrise/sunset data. Background selection follows that same sunrise/sunset clock, with the weather API's daylight field used only if solar times are unavailable. Before sunrise the tent waits at base camp; after sunset it stays at the day's finishing point.

The moon and stars belong to the supplied night artwork and are illustrative. The climber, tent, temperature and departure times remain separate live layers.

Current weather selects rain or snow artwork first. Otherwise wind at or above 20 km/h selects the wind artwork. Clear, cloudy, foggy and unavailable conditions use the base day/night artwork; the exact current condition is always written in the live reading. Existing WMO rain codes include drizzle, freezing rain, showers and thunderstorms; snow codes include snow showers. A cold temperature or a future rain probability does not by itself select precipitation artwork.

Rain, snow and wind are already engraved into their images, so no duplicate SVG precipitation is drawn on top. The live background uses actual weather and solar times. The gallery also exposes day and night weather studies, which are explicitly labelled simulations and do not change saved world memory or display-only exports.
