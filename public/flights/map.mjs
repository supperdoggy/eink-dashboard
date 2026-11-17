const radians = Math.PI / 180;

function path(ctx, points, project) {
  ctx.beginPath();
  for (const [i, point] of points.entries()) {
    const [x, y] = project(point);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function directRoute(a, b) {
  const vector = ({lat, lon}) => [Math.cos(lat * radians) * Math.cos(lon * radians),
    Math.cos(lat * radians) * Math.sin(lon * radians), Math.sin(lat * radians)];
  const from = vector(a), to = vector(b);
  const angle = Math.acos(Math.max(-1, Math.min(1, from.reduce((sum, value, i) => sum + value * to[i], 0))));
  const sine = Math.sin(angle);
  if (sine < 1e-6) return [a, b];
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    const [x,y,z] = from.map((value, j) => (value * Math.sin((1-t)*angle) + to[j] * Math.sin(t*angle)) / sine);
    return { lat: Math.atan2(z, Math.hypot(x,y)) / radians, lon: Math.atan2(y,x) / radians };
  });
}

export function drawMap(canvas, countries, flight, design, status) {
  const radar = design === 'radar';
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(canvas);
  const color = name => css.getPropertyValue(`--color-${name}`).trim();
  const ink = color('ink'), ocean = color('ocean');
  const direct = flight ? directRoute(flight.origin, flight.destination) : [];
  const points = flight ? [...direct, ...flight.trail, flight.position]
    : [{lat: 43, lon: -7}, {lat: 59, lon: 27}];
  const lats = points.map(point => point.lat);
  const lons = points.map(point => point.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const centerLat = (latMax + latMin) / 2, centerLon = (lonMax + lonMin) / 2;
  const cosine = Math.max(.25, Math.cos(centerLat * radians));
  const scale = Math.min((height - 76) / Math.max(latMax - latMin, 3.5),
    (width - 140) / Math.max((lonMax - lonMin) * cosine, 5.5));
  const project = ({ lat, lon }) => [width / 2 + (lon - centerLon) * scale * cosine,
    height / 2 - 9 - (lat - centerLat) * scale];

  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = .8;
  ctx.fillStyle = color('land');
  ctx.strokeStyle = color('coast');
  for (const ring of countries) {
    path(ctx, ring.map(([lon, lat]) => ({ lon, lat })), project);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = color('grid');
  ctx.lineWidth = .65;
  const step = scale > 28 ? 2 : scale > 12 ? 5 : 10;
  ctx.setLineDash(radar ? [2, 3] : []);
  for (let value = -180; value <= 180; value += step) {
    const [x] = project({lat: centerLat, lon: value});
    if (x < 0 || x > width) continue;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let value = -90; value <= 90; value += step) {
    const [, y] = project({lat: value, lon: centerLon});
    if (y < 0 || y > height) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = ink;
  ctx.font = '600 13px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText('N', width - 24, 19);
  ctx.beginPath();
  ctx.moveTo(width - 24, 24); ctx.lineTo(width - 19, 37); ctx.lineTo(width - 24, 34); ctx.lineTo(width - 29, 37);
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'left';

  if (!flight) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('route');
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 5]);
  path(ctx, direct, project);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = ocean;
  path(ctx, flight.trail, project);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink;
  ctx.stroke();

  const airportPoints = [flight.origin, flight.destination];
  for (const [index, airport] of airportPoints.entries()) {
    const [x, y] = project(airport);
    const other = project(airportPoints[1-index]);
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2*Math.PI);
    ctx.fillStyle = index === 0 ? ocean : ink;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.stroke();
    const textX = x > other[0] ? x + 11 : x - 11;
    ctx.textAlign = x > other[0] ? 'left' : 'right';
    ctx.font = '650 13px Chivo Mono';
    ctx.lineWidth = 3;
    ctx.strokeStyle = ocean;
    ctx.strokeText(airport.code, textX, y + 4);
    ctx.fillStyle = ink;
    ctx.fillText(airport.code, textX, y + 4);
  }

  const [x,y] = project(flight.position);
  ctx.beginPath();
  ctx.arc(x,y, radar ? 24 : 16, 0, Math.PI*2);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.setLineDash(status === 'signal lost' ? [2, 4] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate((flight.position.heading || 0) * radians);
  ctx.beginPath();
  ctx.moveTo(0,-12); ctx.lineTo(2.2,-9); ctx.lineTo(2.7,-2); ctx.lineTo(11,4);
  ctx.lineTo(11,7); ctx.lineTo(2.6,4.5); ctx.lineTo(2,8); ctx.lineTo(5,10.5);
  ctx.lineTo(5,12); ctx.lineTo(0,10.5); ctx.lineTo(-5,12); ctx.lineTo(-5,10.5);
  ctx.lineTo(-2,8); ctx.lineTo(-2.6,4.5); ctx.lineTo(-11,7); ctx.lineTo(-11,4);
  ctx.lineTo(-2.7,-2); ctx.lineTo(-2.2,-9); ctx.closePath();
  ctx.strokeStyle = ocean;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}
