// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const data = require('./data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

const GEMMA_MODEL = process.env.GEMMA_MODEL || 'gemma2:2b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';

let routes = JSON.parse(JSON.stringify(data.routes));
let buses = JSON.parse(JSON.stringify(data.buses));
let smartAlerts = [];
let waitlist = [];
let savedCommutes = [];
let bookingCounter = 0;
let reportCounter = 0;
let waitlistCounter = 0;

const calculateDistance = (p1, p2) => data.haversine(p1.lat, p1.lng, p2.lat, p2.lng);

const locationById = (id) => data.locations.find((item) => item.id === Number(id));

const buildLocationGraph = (locations, k = 4) => {
  const graph = new Map();
  locations.forEach((loc) => graph.set(loc.id, []));

  const addEdge = (fromId, toId, weight) => {
    const list = graph.get(fromId) || [];
    if (!list.some((edge) => edge.to === toId)) {
      list.push({ to: toId, weight });
      graph.set(fromId, list);
    }
  };

  locations.forEach((source, index) => {
    const nearest = locations
      .filter((target) => target.id !== source.id)
      .map((target) => ({ target, distance: calculateDistance(source, target) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);

    nearest.forEach(({ target, distance }) => {
      addEdge(source.id, target.id, distance);
      addEdge(target.id, source.id, distance);
    });

    const ringTarget = locations[(index + 1) % locations.length];
    const ringDistance = calculateDistance(source, ringTarget);
    addEdge(source.id, ringTarget.id, ringDistance);
    addEdge(ringTarget.id, source.id, ringDistance);
  });

  return graph;
};

const runDijkstra = (graph, startId, endId) => {
  const ids = Array.from(graph.keys());
  const dist = new Map(ids.map((id) => [id, Number.POSITIVE_INFINITY]));
  const prev = new Map(ids.map((id) => [id, null]));
  const pending = new Set(ids);
  dist.set(startId, 0);

  while (pending.size > 0) {
    let current = null;
    let currentBest = Number.POSITIVE_INFINITY;

    pending.forEach((id) => {
      const candidate = dist.get(id);
      if (candidate < currentBest) {
        currentBest = candidate;
        current = id;
      }
    });

    if (current === null || !Number.isFinite(currentBest)) break;
    if (current === endId) break;
    pending.delete(current);

    (graph.get(current) || []).forEach((edge) => {
      if (!pending.has(edge.to)) return;
      const score = dist.get(current) + edge.weight;
      if (score < dist.get(edge.to)) {
        dist.set(edge.to, score);
        prev.set(edge.to, current);
      }
    });
  }

  const path = [];
  let step = endId;
  while (step != null) {
    path.unshift(step);
    step = prev.get(step);
  }

  if (path[0] !== startId) {
    return { path: [startId, endId], distanceMeters: calculateDistance(locationById(startId), locationById(endId)) };
  }

  return { path, distanceMeters: dist.get(endId) };
};

const toMeters = (point, latRef) => ({
  x: point.lng * 111320 * Math.cos((latRef * Math.PI) / 180),
  y: point.lat * 110540
});

const distancePointToSegmentMeters = (point, segStart, segEnd) => {
  const latRef = (point.lat + segStart.lat + segEnd.lat) / 3;
  const p = toMeters(point, latRef);
  const a = toMeters(segStart, latRef);
  const b = toMeters(segEnd, latRef);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  return Math.hypot(p.x - projX, p.y - projY);
};

const distancePointToPolylineMeters = (point, polyline) => {
  if (!polyline || polyline.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    best = Math.min(best, distancePointToSegmentMeters(point, polyline[i], polyline[i + 1]));
  }
  return best;
};

const parseGemmaJson = (rawText) => {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // continue to extraction fallback
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_error) {
    return null;
  }
};

const normalizeGemmaOutput = (gemmaPayload) => {
  const outputRoutes = Array.isArray(gemmaPayload?.routes) ? gemmaPayload.routes : [];
  const outputBuses = Array.isArray(gemmaPayload?.buses) ? gemmaPayload.buses : [];

  const safeRoutes = outputRoutes
    .map((route, idx) => {
      const stopIds = Array.isArray(route.stopIds)
        ? route.stopIds.map((id) => Number(id)).filter((id) => Boolean(locationById(id)))
        : [];
      if (stopIds.length < 2) return null;

      const points = stopIds.map((id) => {
        const loc = locationById(id);
        return { lat: loc.lat, lng: loc.lng };
      });

      return {
        id: idx + 1,
        name: route.name || `Gemma Route ${idx + 1}`,
        points,
        stops: stopIds
      };
    })
    .filter(Boolean);

  const fallbackRoutes = safeRoutes.length ? safeRoutes : JSON.parse(JSON.stringify(data.routes));
  const validRouteIds = new Set(fallbackRoutes.map((route) => route.id));

  const safeBuses = outputBuses
    .map((bus, idx) => {
      const routeId = Number(bus.routeId);
      if (!validRouteIds.has(routeId)) return null;
      const route = fallbackRoutes.find((item) => item.id === routeId);
      return {
        id: idx + 1,
        number: bus.number || `OD 01 GM ${100 + idx}`,
        routeId,
        capacity: Math.max(20, Number(bus.capacity) || 40),
        occupied: Math.max(0, Math.min(Number(bus.occupied) || 0, Number(bus.capacity) || 40)),
        currentIndex: Math.max(0, Math.min(route.points.length - 2, Number(bus.currentIndex) || 0)),
        progress: Math.max(0, Math.min(0.99, Number(bus.progress) || 0)),
        speed: Math.max(16, Number(bus.speed) || 32),
        direction: Number(bus.direction) === -1 ? -1 : 1
      };
    })
    .filter(Boolean);

  const fallbackBuses = safeBuses.length ? safeBuses : JSON.parse(JSON.stringify(data.buses));
  return { routes: fallbackRoutes, buses: fallbackBuses };
};

const generateRoutesAndBusesWithGemma2B = async () => {
  const prompt = `You are a transit planner for Bhubaneswar. Generate JSON only with keys routes and buses.

rules:
- routes: 2 to 4 items
- each route has: name, stopIds (existing location ids only)
- use this location list: ${JSON.stringify(data.locations.map((loc) => ({ id: loc.id, name: loc.name })))}
- buses: 5 to 8 items
- each bus has: number, routeId (1-based route index), capacity, occupied, currentIndex, progress, speed, direction
- direction is 1 or -1

Output format:
{
  "routes": [{"name":"...","stopIds":[1,5,3]}],
  "buses": [{"number":"OD 01 ZZ 999","routeId":1,"capacity":40,"occupied":20,"currentIndex":0,"progress":0.3,"speed":34,"direction":1}]
}`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GEMMA_MODEL, prompt, stream: false })
    });

    if (!response.ok) throw new Error(`Ollama status ${response.status}`);
    const payload = await response.json();
    const parsed = parseGemmaJson(payload.response);
    if (!parsed) throw new Error('Gemma output parsing failed');

    const normalized = normalizeGemmaOutput(parsed);
    routes = normalized.routes;
    buses = normalized.buses;
    console.log(`Gemma initialized routes=${routes.length}, buses=${buses.length}`);
  } catch (error) {
    routes = JSON.parse(JSON.stringify(data.routes));
    buses = JSON.parse(JSON.stringify(data.buses));
    console.log(`Gemma init fallback active (${error.message})`);
  }
};

const currentBusPosition = (bus, route) => {
  const pointCount = route.points.length;
  const safeIndex = Math.max(0, Math.min(pointCount - 2, bus.currentIndex));
  const p1 = route.points[safeIndex];
  const p2 = route.points[safeIndex + 1];

  return {
    lat: p1.lat + (p2.lat - p1.lat) * bus.progress,
    lng: p1.lng + (p2.lng - p1.lng) * bus.progress
  };
};

const calculateETA = (bus, targetLat, targetLng) => {
  const route = routes.find((r) => r.id === bus.routeId);
  if (!route) return 999;

  const pos = currentBusPosition(bus, route);
  const directMeters = data.haversine(pos.lat, pos.lng, targetLat, targetLng);

  const speedMs = (Math.max(10, bus.speed) * 1000) / 3600;
  return Math.max(1, Math.round(directMeters / speedMs / 60));
};

const getTimeWindowFactor = () => {
  const hour = new Date().getHours();
  if ((hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21)) {
    return { traffic: 1.35, confidencePenalty: 18, label: 'Peak' };
  }
  if (hour >= 12 && hour <= 15) {
    return { traffic: 1.15, confidencePenalty: 9, label: 'Midday' };
  }
  return { traffic: 1.0, confidencePenalty: 4, label: 'Normal' };
};

const confidenceColor = (confidence) => {
  if (confidence >= 80) return 'green';
  if (confidence >= 60) return 'amber';
  return 'red';
};

const occupancyBand = (ratio) => {
  if (ratio < 0.45) return 'Low';
  if (ratio < 0.75) return 'Medium';
  if (ratio < 0.95) return 'High';
  return 'Very High';
};

const calculatePredictiveEtaMeta = (bus, fromLocation, distanceToPathMeters = 0) => {
  const baseEta = calculateETA(bus, fromLocation.lat, fromLocation.lng);
  const window = getTimeWindowFactor();
  const jitter = (bus.id * 3 + new Date().getMinutes()) % 5;
  const adjustedEta = Math.max(1, Math.round(baseEta * window.traffic + jitter * 0.2));

  const occupiedRatio = bus.occupied / Math.max(1, bus.capacity);
  const crowdPenalty = Math.round(occupiedRatio * 20);
  const pathPenalty = Math.min(15, Math.round(distanceToPathMeters / 120));
  const confidence = Math.max(35, 95 - window.confidencePenalty - crowdPenalty - pathPenalty);

  return {
    predictedEtaMinutes: adjustedEta,
    confidencePercent: confidence,
    reliabilityColor: confidenceColor(confidence),
    crowdLevel: occupancyBand(occupiedRatio),
    likelyCrowdedAtArrival: occupiedRatio >= 0.72,
    trafficWindow: window.label
  };
};

const calcPathDistanceMeters = (pathPoints) => {
  let total = 0;
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    total += calculateDistance(pathPoints[i], pathPoints[i + 1]);
  }
  return total;
};

const summarizeAlerts = (alerts) => {
  if (!alerts.length) {
    return 'No active crowd reports. Route is operating normally.';
  }

  const delayReports = alerts.filter((item) => item.type === 'road_blocked' || item.type === 'missed_stop').length;
  const crowdReports = alerts.filter((item) => item.type === 'overcrowded').length;
  const severe = alerts.filter((item) => item.severity >= 4).length;

  if (severe > 0) {
    return 'Multiple high-severity reports detected. Expect significant delay and choose backup route.';
  }
  if (delayReports > 0) {
    return 'Recent road and stop reports indicate a likely 8-12 minute delay on this corridor.';
  }
  if (crowdReports > 0) {
    return 'Crowd reports suggest packed buses in this time window. Consider next less crowded option.';
  }
  return 'Minor reports observed, but route remains mostly stable.';
};

const buildBusSafetyMeta = (bus) => {
  const cleanliness = 3 + ((bus.id * 17 + new Date().getDate()) % 20) / 10;
  const driverRating = 3.2 + ((bus.id * 13 + new Date().getHours()) % 16) / 10;
  return {
    womenSeatsMarked: Math.max(4, Math.round(bus.capacity * 0.18)),
    cleanlinessScore: Number(Math.min(5, cleanliness).toFixed(1)),
    driverRating: Number(Math.min(5, driverRating).toFixed(1)),
    panicSupport: true
  };
};

const buildMultimodalComparison = (distanceMeters, bestBusEta) => {
  const km = distanceMeters / 1000;
  const busMinutes = Math.max(1, Math.round(bestBusEta));
  const walkMinutes = Math.max(8, Math.round((km / 4.8) * 60));
  const autoMinutes = Math.max(6, Math.round((km / 22) * 60));
  const rideMinutes = Math.max(7, Math.round((km / 24) * 60));
  const erickshawMinutes = Math.max(7, Math.round((km / 16) * 60));

  const options = [
    { mode: 'Mo Bus', etaMinutes: busMinutes, costInr: Math.max(10, Math.round(km * 6)), crowd: 'Variable' },
    { mode: 'Auto', etaMinutes: autoMinutes, costInr: Math.max(40, Math.round(km * 14)), crowd: 'Low' },
    { mode: 'Ride Share', etaMinutes: rideMinutes, costInr: Math.max(55, Math.round(km * 16)), crowd: 'Low' },
    { mode: 'E-rickshaw', etaMinutes: erickshawMinutes, costInr: Math.max(25, Math.round(km * 10)), crowd: 'Medium' },
    { mode: 'Walk', etaMinutes: walkMinutes, costInr: 0, crowd: 'None' }
  ];

  const cheapest = options.reduce((a, b) => (a.costInr <= b.costInr ? a : b));
  const fastest = options.reduce((a, b) => (a.etaMinutes <= b.etaMinutes ? a : b));
  return { options, cheapest: cheapest.mode, fastest: fastest.mode };
};

setInterval(() => {
  buses.forEach((bus) => {
    const route = routes.find((r) => r.id === bus.routeId);
    if (!route || route.points.length < 2) return;

    bus.progress += bus.speed / 1200;

    while (bus.progress >= 1) {
      bus.progress -= 1;
      bus.currentIndex += bus.direction;

      if (bus.currentIndex >= route.points.length - 1) {
        bus.currentIndex = route.points.length - 2;
        bus.direction = -1;
      }

      if (bus.currentIndex < 0) {
        bus.currentIndex = 0;
        bus.direction = 1;
      }
    }

    const pos = currentBusPosition(bus, route);
    const nextPoint = route.points[Math.min(route.points.length - 1, bus.currentIndex + 1)];

    io.emit('bus-update', {
      busId: bus.id,
      number: bus.number,
      lat: pos.lat,
      lng: pos.lng,
      occupied: bus.occupied,
      capacity: bus.capacity,
      etaToNextStop: calculateETA(bus, nextPoint.lat, nextPoint.lng)
    });
  });
}, 2500);

app.get('/api/locations', (req, res) => res.json(data.locations));
app.get('/api/routes', (req, res) => res.json(routes));
app.get('/api/buses', (req, res) => res.json(buses));

app.get('/api/buses/safety', (req, res) => {
  const payload = buses.map((bus) => ({
    busId: bus.id,
    number: bus.number,
    ...buildBusSafetyMeta(bus)
  }));
  return res.json(payload);
});

app.post('/api/gemma/regenerate', async (req, res) => {
  await generateRoutesAndBusesWithGemma2B();
  return res.json({ routes: routes.length, buses: buses.length, model: GEMMA_MODEL });
});

app.post('/api/plan-trip', (req, res) => {
  const { fromId, toId } = req.body;
  const from = data.locations.find((l) => l.id === Number(fromId));
  const to = data.locations.find((l) => l.id === Number(toId));

  if (!from || !to) {
    return res.status(400).json({ error: 'Invalid locations' });
  }

  const graph = buildLocationGraph(data.locations, 4);
  const shortest = runDijkstra(graph, from.id, to.id);
  const shortestPathLocations = shortest.path
    .map((id) => locationById(id))
    .filter(Boolean);
  const pathPoints = shortestPathLocations.map((item) => ({ lat: item.lat, lng: item.lng }));

  const corridorThresholdMeters = 900;

  const busOptions = buses
    .map((bus) => {
      const route = routes.find((r) => r.id === bus.routeId);
      if (!route) return null;

      const position = currentBusPosition(bus, route);
      const distanceToShortestPath = distancePointToPolylineMeters(position, pathPoints);
      const predictive = calculatePredictiveEtaMeta(bus, from, distanceToShortestPath);
      return {
        busId: bus.id,
        number: bus.number,
        routeId: bus.routeId,
        etaMinutes: predictive.predictedEtaMinutes,
        confidencePercent: predictive.confidencePercent,
        reliabilityColor: predictive.reliabilityColor,
        crowdLevel: predictive.crowdLevel,
        likelyCrowdedAtArrival: predictive.likelyCrowdedAtArrival,
        trafficWindow: predictive.trafficWindow,
        seatsLeft: bus.capacity - bus.occupied,
        status: bus.capacity - bus.occupied > 0 ? 'Available' : 'Full (next bus coming)',
        distanceToPathMeters: Math.round(distanceToShortestPath),
        safety: buildBusSafetyMeta(bus)
      };
    })
    .filter(Boolean)
    .filter((bus) => bus.distanceToPathMeters <= corridorThresholdMeters)
    .sort((a, b) => (a.etaMinutes - b.etaMinutes) || (a.distanceToPathMeters - b.distanceToPathMeters));

  const fallbackBuses = busOptions.length
    ? busOptions
    : buses
        .map((bus) => ({
          ...calculatePredictiveEtaMeta(bus, from),
          busId: bus.id,
          number: bus.number,
          routeId: bus.routeId,
          etaMinutes: calculateETA(bus, from.lat, from.lng),
          seatsLeft: bus.capacity - bus.occupied,
          status: bus.capacity - bus.occupied > 0 ? 'Available' : 'Full (next bus coming)',
          distanceToPathMeters: -1,
          safety: buildBusSafetyMeta(bus)
        }))
        .sort((a, b) => a.etaMinutes - b.etaMinutes);

  const nextThree = fallbackBuses.slice(0, 3);
  const nextAvailable = fallbackBuses.find((bus) => bus.seatsLeft > 0) || null;
  const pathDistanceMeters = calcPathDistanceMeters(pathPoints);
  const activeRouteAlerts = smartAlerts.filter(
    (alert) => alert.routeId === null || fallbackBuses.some((bus) => bus.routeId === alert.routeId)
  );

  const modal = buildMultimodalComparison(pathDistanceMeters, nextThree[0] ? nextThree[0].etaMinutes : 12);

  return res.json({
    routeName: `Shortest corridor: ${from.name} -> ${to.name}`,
    path: pathPoints,
    pathLocationIds: shortest.path,
    shortestDistanceMeters: Math.round(shortest.distanceMeters),
    shortestDistanceKm: Number((pathDistanceMeters / 1000).toFixed(2)),
    buses: fallbackBuses,
    nextThreeBuses: nextThree,
    seatSummary: {
      nextAvailableBusId: nextAvailable ? nextAvailable.busId : null,
      nextAvailableBusEta: nextAvailable ? nextAvailable.etaMinutes : null,
      allFull: !nextAvailable
    },
    alerts: activeRouteAlerts,
    aiAlertSummary: summarizeAlerts(activeRouteAlerts),
    multimodalComparison: modal,
    message: busOptions.length
      ? 'Showing buses near the shortest route (Gemma + live simulation)'
      : 'No buses near shortest route right now, showing nearest upcoming buses instead'
  });
});

app.get('/api/alerts', (req, res) => {
  const routeId = req.query.routeId ? Number(req.query.routeId) : null;
  const payload = routeId ? smartAlerts.filter((alert) => alert.routeId === routeId) : smartAlerts;
  return res.json({
    alerts: payload,
    aiSummary: summarizeAlerts(payload)
  });
});

app.post('/api/alerts/report', (req, res) => {
  const { routeId, busId, type, severity, message, userId } = req.body;
  const normalizedType = ['overcrowded', 'rash_driver', 'missed_stop', 'road_blocked', 'cleanliness'].includes(type)
    ? type
    : 'overcrowded';
  const report = {
    id: `ALR-${Date.now()}-${++reportCounter}`,
    routeId: Number.isFinite(Number(routeId)) ? Number(routeId) : null,
    busId: Number.isFinite(Number(busId)) ? Number(busId) : null,
    type: normalizedType,
    severity: Math.max(1, Math.min(5, Number(severity) || 3)),
    message: message || 'User-reported transit issue',
    userId: userId || 'anonymous',
    createdAt: new Date().toISOString()
  };

  smartAlerts.unshift(report);
  smartAlerts = smartAlerts.slice(0, 120);

  io.emit('alert-update', report);
  return res.json({ status: 'accepted', report, aiSummary: summarizeAlerts(smartAlerts) });
});

app.post('/api/waitlist', (req, res) => {
  const { userId, fromId, toId, seats } = req.body;
  const entry = {
    id: `WLT-${Date.now()}-${++waitlistCounter}`,
    userId: userId || 'anonymous',
    fromId: Number(fromId),
    toId: Number(toId),
    seats: Math.max(1, Number(seats) || 1),
    status: 'active',
    createdAt: new Date().toISOString()
  };
  waitlist.unshift(entry);
  waitlist = waitlist.slice(0, 300);
  return res.json({ status: 'waitlisted', entry });
});

app.get('/api/waitlist/:id', (req, res) => {
  const entry = waitlist.find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Waitlist item not found' });
  return res.json(entry);
});

app.post('/api/route-compare', (req, res) => {
  const { fromId, toId } = req.body;
  const from = locationById(fromId);
  const to = locationById(toId);
  if (!from || !to) return res.status(400).json({ error: 'Invalid locations' });

  const graph = buildLocationGraph(data.locations, 4);
  const shortest = runDijkstra(graph, from.id, to.id);
  const points = shortest.path.map((id) => locationById(id)).filter(Boolean);
  const distanceMeters = calcPathDistanceMeters(points);
  const simulatedBestBusEta = Math.max(1, Math.round(distanceMeters / 380));
  return res.json(buildMultimodalComparison(distanceMeters, simulatedBestBusEta));
});

app.post('/api/commute/save', (req, res) => {
  const { userId, fromId, toId, label } = req.body;
  if (!locationById(fromId) || !locationById(toId)) {
    return res.status(400).json({ error: 'Invalid locations' });
  }

  const item = {
    id: `CMT-${Date.now()}-${savedCommutes.length + 1}`,
    userId: userId || 'anonymous',
    fromId: Number(fromId),
    toId: Number(toId),
    label: label || 'Daily commute',
    createdAt: new Date().toISOString()
  };
  savedCommutes.unshift(item);
  savedCommutes = savedCommutes.slice(0, 500);
  return res.json({ status: 'saved', commute: item });
});

app.get('/api/commute/:userId', (req, res) => {
  const items = savedCommutes.filter((item) => item.userId === req.params.userId);
  return res.json(items);
});

app.get('/api/eco-impact/:userId', (req, res) => {
  const items = savedCommutes.filter((item) => item.userId === req.params.userId);
  const monthlyTrips = Math.max(10, items.length * 18);
  const co2KgSaved = Number((monthlyTrips * 1.7).toFixed(1));
  return res.json({
    userId: req.params.userId,
    monthlyTrips,
    co2KgSaved,
    summary: `You saved ${co2KgSaved} kg CO2 this month by choosing buses.`
  });
});

app.post('/api/book', (req, res) => {
  const { busId, seats } = req.body;
  const parsedSeats = Number(seats) || 0;
  const bus = buses.find((b) => b.id === Number(busId));

  if (!bus || parsedSeats <= 0 || bus.capacity - bus.occupied < parsedSeats) {
    return res.status(400).json({ error: 'Not enough seats' });
  }

  bus.occupied += parsedSeats;
  bookingCounter += 1;
  const isFreeSeatWave = bookingCounter <= 50;
  const reservationFee = isFreeSeatWave ? 0 : parsedSeats * 2;
  const totalAmount = parsedSeats * 15 + reservationFee;

  return res.json({
    bookingId: `BK${Date.now()}-${bookingCounter}`,
    status: 'pending',
    amount: totalAmount,
    reservationFee,
    freeSeatWaveApplied: isFreeSeatWave,
    paymentOptions: [
      {
        provider: 'razorpay',
        note: 'Cards / UPI / Wallets'
      },
      {
        provider: 'free-upi',
        note: 'ZERO platform fee via direct UPI (Paytm/PhonePe)',
        qrCode: 'https://fake-qr.example.com/freeupi'
      }
    ]
  });
});

io.on('connection', (socket) => {
  console.log('Client connected for live tracking');
  socket.emit('init', { locations: data.locations, routes, buses, alerts: smartAlerts.slice(0, 10) });

  socket.on('disconnect', () => console.log('Client disconnected'));
});

const PORT = 5000;

generateRoutesAndBusesWithGemma2B().finally(() => {
  server.listen(PORT, () => {
    console.log(`Bhubaneswar Bus Tracker Backend running on http://localhost:${PORT}`);
    console.log(`Gemma model target: ${GEMMA_MODEL}`);
    console.log('Simulated live buses updating every 2.5s');
    console.log('Free UPI payment option included');
  });
});
