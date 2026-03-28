// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const data = require('./data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

const GEMMA_MODEL = process.env.GEMMA_MODEL || 'gemma:3b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';

let routes = JSON.parse(JSON.stringify(data.routes));
let buses = JSON.parse(JSON.stringify(data.buses));
let smartAlerts = [];
let waitlist = [];
let savedCommutes = [];
let bookingLedger = [];
const userProfiles = new Map();
let bookingCounter = 0;
let reportCounter = 0;
let waitlistCounter = 0;
const BOOKING_HOLD_MS = 5 * 60 * 1000;
const PROFILE_POINTS_PER_RIDE = 10;

const profileTierFromRides = (ridesCompleted) => {
  if (ridesCompleted >= 100) return 'Platinum Rider';
  if (ridesCompleted >= 50) return 'Gold Rider';
  if (ridesCompleted >= 20) return 'Silver Rider';
  return 'Starter Rider';
};

const getOrCreateUserProfile = (userId = 'demo-user') => {
  const safeUserId = String(userId || 'demo-user');
  if (!userProfiles.has(safeUserId)) {
    userProfiles.set(safeUserId, {
      userId: safeUserId,
      ridesCompleted: 0,
      points: 0,
      freeTicketCredits: 0,
      freeTicketsRedeemed: 0,
      lifetimeDiscountInr: 0,
      tier: profileTierFromRides(0),
      lastRideAt: null,
      recentActivity: []
    });
  }
  return userProfiles.get(safeUserId);
};

const resetUserProfile = (userId = 'demo-user') => {
  const safeUserId = String(userId || 'demo-user');
  const profile = {
    userId: safeUserId,
    ridesCompleted: 0,
    points: 0,
    freeTicketCredits: 0,
    freeTicketsRedeemed: 0,
    lifetimeDiscountInr: 0,
    tier: profileTierFromRides(0),
    lastRideAt: null,
    recentActivity: []
  };
  userProfiles.set(safeUserId, profile);
  return profile;
};

const pushProfileActivity = (profile, message) => {
  profile.recentActivity.unshift({ message, at: new Date().toISOString() });
  profile.recentActivity = profile.recentActivity.slice(0, 12);
};

const perksForProfile = (profile) => ({
  discountUnlocked: profile.ridesCompleted >= 50,
  discountPercent: profile.ridesCompleted >= 50 ? 20 : 0,
  freeTicketCredits: profile.freeTicketCredits,
  nextMilestone: profile.ridesCompleted < 50 ? 50 : profile.ridesCompleted < 100 ? 100 : (Math.floor(profile.ridesCompleted / 100) + 1) * 100,
  ridesToNextMilestone:
    profile.ridesCompleted < 50
      ? 50 - profile.ridesCompleted
      : profile.ridesCompleted < 100
        ? 100 - profile.ridesCompleted
        : ((Math.floor(profile.ridesCompleted / 100) + 1) * 100) - profile.ridesCompleted
});

const recentSeatBookingsForUser = (userId, limit = 6) => bookingLedger
  .filter((booking) => booking.userId === userId && booking.status === 'confirmed')
  .map((booking) => ({
    bookingId: booking.bookingId,
    busId: booking.busId,
    busNumber: booking.number || `Bus ${booking.busId}`,
    seats: booking.seats,
    amount: booking.amount,
    discountAmount: booking.discountAmount || 0,
    freeTicketUsed: Boolean(booking.freeTicketUsed),
    perkApplied: booking.perkApplied || 'none',
    paymentProvider: booking.paymentProvider,
    confirmedAt: booking.confirmedAt
  }))
  .slice(0, limit);

const buildProfileDashboard = (profile) => ({
  userId: profile.userId,
  ridesCompleted: profile.ridesCompleted,
  points: profile.points,
  rideCounterRule: 'Each successful ticket purchase adds exactly +1 ride.',
  tier: profileTierFromRides(profile.ridesCompleted),
  lifetimeDiscountInr: profile.lifetimeDiscountInr,
  freeTicketCredits: profile.freeTicketCredits,
  freeTicketsRedeemed: profile.freeTicketsRedeemed,
  lastRideAt: profile.lastRideAt,
  perks: perksForProfile(profile),
  milestones: {
    discountAt50: {
      target: 50,
      reached: profile.ridesCompleted >= 50,
      ridesRemaining: Math.max(0, 50 - profile.ridesCompleted)
    },
    freeTicketAt100: {
      target: 100,
      reached: profile.ridesCompleted >= 100,
      ridesRemaining: Math.max(0, 100 - profile.ridesCompleted)
    }
  },
  seatBookings: recentSeatBookingsForUser(profile.userId, 8),
  recentActivity: profile.recentActivity
});

const awardRideRewards = (profile, booking) => {
  const previousRides = profile.ridesCompleted;
  const nextRides = previousRides + 1;

  profile.ridesCompleted = nextRides;
  profile.points += PROFILE_POINTS_PER_RIDE;
  profile.tier = profileTierFromRides(nextRides);
  profile.lastRideAt = new Date().toISOString();

  if (previousRides < 50 && nextRides >= 50) {
    pushProfileActivity(profile, 'Milestone unlocked: 20% ticket discount is now active after 50 rides.');
  }

  if (Math.floor(previousRides / 100) < Math.floor(nextRides / 100) && nextRides >= 100) {
    profile.freeTicketCredits += 1;
    pushProfileActivity(profile, 'Milestone unlocked: You earned 1 free ticket credit after 100 rides.');
  }

  pushProfileActivity(profile, `Ride completed on ${booking.number || 'Nexus bus'} | +${PROFILE_POINTS_PER_RIDE} points`);
};

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

  const targetFleetSize = Math.max(24, fallbackRoutes.length * 3);
  const fallbackBuses = ensureBusCoverage(fallbackRoutes, safeBuses, 2, targetFleetSize);
  return { routes: fallbackRoutes, buses: fallbackBuses };
};

const makeSeedBus = (route, idCounter, seed) => {
  const routePoints = route.points || [];
  const maxIndex = Math.max(0, routePoints.length - 2);
  const capacity = 40;
  const occupied = Math.max(3, Math.min(36, 8 + (seed % 27)));

  return {
    id: idCounter,
    number: `OD 01 NX ${String(100 + idCounter).padStart(3, '0')}`,
    routeId: route.id,
    capacity,
    occupied,
    currentIndex: maxIndex ? (seed % (maxIndex + 1)) : 0,
    progress: Number((((seed % 85) + 10) / 100).toFixed(2)),
    speed: 24 + (seed % 18),
    direction: seed % 3 === 0 ? -1 : 1
  };
};

const buildFallbackFleet = (activeRoutes, targetCount = 12) => {
  const result = [];
  let idCounter = 1;

  while (result.length < targetCount) {
    activeRoutes.forEach((route) => {
      if (result.length >= targetCount) return;
      const seed = idCounter * 17;
      result.push(makeSeedBus(route, idCounter, seed));
      idCounter += 1;
    });
  }

  return result;
};

const ensureBusCoverage = (activeRoutes, seededBuses, minPerRoute = 2, targetCount = 24) => {
  if (!Array.isArray(activeRoutes) || activeRoutes.length === 0) return [];

  const validRouteIds = new Set(activeRoutes.map((route) => route.id));
  const result = (Array.isArray(seededBuses) ? seededBuses : [])
    .filter((bus) => validRouteIds.has(bus.routeId))
    .map((bus, idx) => ({ ...bus, id: idx + 1 }));

  let nextId = result.length + 1;
  const routeCounts = new Map(activeRoutes.map((route) => [route.id, 0]));
  result.forEach((bus) => {
    routeCounts.set(bus.routeId, (routeCounts.get(bus.routeId) || 0) + 1);
  });

  const expandedTarget = Math.max(targetCount, activeRoutes.length * minPerRoute);

  const pushBusForRoute = (route, salt) => {
    const seed = nextId * 17 + salt;
    result.push(makeSeedBus(route, nextId, seed));
    routeCounts.set(route.id, (routeCounts.get(route.id) || 0) + 1);
    nextId += 1;
  };

  activeRoutes.forEach((route, idx) => {
    while ((routeCounts.get(route.id) || 0) < minPerRoute) {
      pushBusForRoute(route, idx * 23);
    }
  });

  while (result.length < expandedTarget) {
    activeRoutes.forEach((route, idx) => {
      if (result.length >= expandedTarget) return;
      pushBusForRoute(route, idx * 31);
    });
  }

  return result;
};

const generateRoutesAndBusesWithGemma2B = async () => {
  const prompt = `You are a transit planner for Bhubaneswar. Generate JSON only with keys routes and buses.

rules:
- routes: 8 to 12 items
- each route has: name, stopIds (existing location ids only)
- ensure every location id appears in at least one route
- use this location list: ${JSON.stringify(data.locations.map((loc) => ({ id: loc.id, name: loc.name })))}
- buses: 24 to 40 items
- each bus has: number, routeId (1-based route index), capacity, occupied, currentIndex, progress, speed, direction
- ensure each route has at least 2 buses
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
    buses = buildFallbackFleet(routes, Math.max(24, routes.length * 3));
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

const buildFastestPathVariant = (shortestPath) => {
  if (!Array.isArray(shortestPath) || shortestPath.length < 2) return shortestPath || [];

  if (shortestPath.length === 2) {
    const [start, end] = shortestPath;
    const mid = {
      lat: Number((((start.lat + end.lat) / 2) + 0.0012).toFixed(6)),
      lng: Number((((start.lng + end.lng) / 2) - 0.001).toFixed(6))
    };
    return [start, mid, end];
  }

  return shortestPath.map((point, index) => {
    if (index === 0 || index === shortestPath.length - 1) return point;

    const direction = index % 2 === 0 ? 1 : -1;
    return {
      lat: Number((point.lat + direction * 0.0014).toFixed(6)),
      lng: Number((point.lng + direction * 0.0011).toFixed(6))
    };
  });
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const stepsBeforeStop = (totalStops, currentStopIndex, targetStopIndex, direction) => {
  if (totalStops <= 1) return 0;
  const current = clamp(currentStopIndex, 0, totalStops - 1);
  const target = clamp(targetStopIndex, 0, totalStops - 1);

  if (direction === -1) {
    return target <= current
      ? current - target
      : current + (totalStops - 1 - target);
  }

  return target >= current
    ? target - current
    : (totalStops - current) + target;
};

const resolveStopIndexOnRoute = (route, stopLocation) => {
  if (!route || !stopLocation) return 0;
  const routeStops = Array.isArray(route.stops) ? route.stops : [];
  if (!routeStops.length) return 0;

  const exactIndex = routeStops.indexOf(stopLocation.id);
  if (exactIndex >= 0) return exactIndex;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  routeStops.forEach((stopId, idx) => {
    const stopLoc = locationById(stopId);
    if (!stopLoc) return;
    const d = calculateDistance(stopLoc, stopLocation);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = idx;
    }
  });
  return bestIndex;
};

const predictSeatsAtStop = (bus, route, stopLocation) => {
  const currentSeatsLeft = Math.max(0, bus.capacity - bus.occupied);
  if (!route || !stopLocation) {
    return {
      currentSeatsLeft,
      predictedSeatsAtYourStop: currentSeatsLeft,
      boardingAdvice: 'Stand near MIDDLE door',
      boardingZoneHint: 'Middle door, 10m ahead',
      boardingOffsetMeters: 10,
      safetyScore: 72,
      isWomenFriendly: bus.id % 2 === 0,
      womenPriority: bus.id % 2 === 0 ? 'Women & Elderly Priority Bus' : 'Standard Bus',
      predictedOccupancyAtYourStop: bus.occupied
    };
  }

  const routeStops = Array.isArray(route.stops) && route.stops.length ? route.stops : [stopLocation.id];
  const totalStops = routeStops.length;
  const userStopIndex = resolveStopIndexOnRoute(route, stopLocation);
  const currentStopIndex = clamp(Math.round(bus.currentIndex), 0, Math.max(0, totalStops - 1));
  const stopsBeforeUser = stepsBeforeStop(totalStops, currentStopIndex, userStopIndex, bus.direction === -1 ? -1 : 1);

  const timeWindow = getTimeWindowFactor();
  const peakMultiplier = timeWindow.label === 'Peak' ? 1.2 : timeWindow.label === 'Midday' ? 1.08 : 1.0;
  let simulatedOccupancy = clamp(Math.round(bus.occupied), 0, bus.capacity);

  for (let hop = 0; hop < stopsBeforeUser; hop += 1) {
    const idx = bus.direction === -1
      ? (currentStopIndex - (hop + 1) + totalStops) % totalStops
      : (currentStopIndex + hop + 1) % totalStops;
    const stopMeta = locationById(routeStops[idx]);
    const isMajorHub = stopMeta?.type === 'major_hub';
    const seed = (bus.id * 29 + idx * 11 + stopLocation.id * 7 + hop * 13) % 100;

    const alightRate = (0.08 + (seed % 16) / 220) * (isMajorHub ? 1.38 : 1.0);
    const boardRate = (0.05 + ((seed + 9) % 18) / 240) * peakMultiplier * (isMajorHub ? 1.2 : 1.0);

    simulatedOccupancy = clamp(
      Math.round(simulatedOccupancy - (bus.capacity * alightRate) + (bus.capacity * boardRate)),
      0,
      bus.capacity
    );
  }

  const predictedSeatsAtYourStop = clamp(bus.capacity - simulatedOccupancy, 0, bus.capacity);
  const crowdRatio = simulatedOccupancy / Math.max(1, bus.capacity);
  const safetyBaseline = bus.id % 2 === 0 ? 90 : 76;
  const safetyScore = clamp(Math.round(safetyBaseline - (crowdRatio * 32)), 52, 98);
  const isWomenFriendly = safetyScore >= 84 || bus.id % 2 === 0;

  const boardingAdvice = predictedSeatsAtYourStop >= 10
    ? 'Stand near FRONT door'
    : predictedSeatsAtYourStop >= 5
      ? 'Stand near MIDDLE door'
      : predictedSeatsAtYourStop > 0
        ? 'Stand near REAR door and board quickly'
        : 'Bus may be full - consider next bus or alternate stop';

  const boardingZoneHint = predictedSeatsAtYourStop >= 10
    ? 'Front door, 30m ahead'
    : predictedSeatsAtYourStop >= 5
      ? 'Middle door, 10m ahead'
      : predictedSeatsAtYourStop > 0
        ? 'Rear door, 12m behind'
        : 'Avoid crowd gate, wait near stop marker';

  const boardingOffsetMeters = predictedSeatsAtYourStop >= 10
    ? 30
    : predictedSeatsAtYourStop >= 5
      ? 10
      : predictedSeatsAtYourStop > 0
        ? -12
        : 0;

  return {
    currentSeatsLeft,
    predictedSeatsAtYourStop,
    boardingAdvice,
    boardingZoneHint,
    boardingOffsetMeters,
    safetyScore,
    isWomenFriendly,
    womenPriority: isWomenFriendly ? 'Women & Elderly Priority Bus' : 'Standard Bus',
    predictedOccupancyAtYourStop: simulatedOccupancy
  };
};

const suggestAlternativeStopForSeats = (from, to, liveBuses) => {
  let best = null;

  data.locations.forEach((candidate) => {
    if (candidate.id === from.id || candidate.id === to.id) return;

    const walkMeters = Math.round(calculateDistance(from, candidate));
    if (walkMeters < 120 || walkMeters > 1200) return;

    let bestPredictedSeats = -1;
    let bestEta = Number.POSITIVE_INFINITY;
    let bestBusNumber = null;

    liveBuses.forEach((bus) => {
      const route = routes.find((r) => r.id === bus.routeId);
      if (!route) return;

      const seatPrediction = predictSeatsAtStop(bus, route, candidate);
      const etaToCandidate = calculateETA(bus, candidate.lat, candidate.lng);

      if (
        seatPrediction.predictedSeatsAtYourStop > bestPredictedSeats
        || (
          seatPrediction.predictedSeatsAtYourStop === bestPredictedSeats
          && etaToCandidate < bestEta
        )
      ) {
        bestPredictedSeats = seatPrediction.predictedSeatsAtYourStop;
        bestEta = etaToCandidate;
        bestBusNumber = bus.number;
      }
    });

    if (bestPredictedSeats < 6) return;

    const score = (bestPredictedSeats * 6) - (walkMeters / 70) - (bestEta * 0.9);
    if (!best || score > best.score) {
      best = {
        stopId: candidate.id,
        stopName: candidate.name,
        walkMeters,
        bestPredictedSeats,
        bestBusEtaMinutes: Math.round(bestEta),
        bestBusNumber,
        score
      };
    }
  });

  if (!best) return null;
  return {
    stopId: best.stopId,
    stopName: best.stopName,
    walkMeters: best.walkMeters,
    seatsLikely: best.bestPredictedSeats,
    busEtaMinutes: best.bestBusEtaMinutes,
    busNumber: best.bestBusNumber
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

const nowMs = () => Date.now();

const makeId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const isPendingActive = (booking) => booking.status === 'pending' && booking.expiresAtMs > nowMs();

const seatsOnHoldForBus = (busId) => bookingLedger
  .filter((booking) => booking.busId === busId && isPendingActive(booking))
  .reduce((sum, booking) => sum + booking.seats, 0);

const seatsAvailableForBus = (bus) => Math.max(0, bus.capacity - bus.occupied - seatsOnHoldForBus(bus.id));

const bookingPublicView = (booking) => ({
  bookingId: booking.bookingId,
  userId: booking.userId,
  busId: booking.busId,
  seats: booking.seats,
  baseAmount: booking.baseAmount,
  discountAmount: booking.discountAmount,
  amount: booking.amount,
  reservationFee: booking.reservationFee,
  perkApplied: booking.perkApplied,
  freeTicketUsed: Boolean(booking.freeTicketUsed),
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  paymentProvider: booking.paymentProvider,
  transactionId: booking.transactionId || null,
  createdAt: booking.createdAt,
  expiresAt: booking.expiresAt,
  confirmedAt: booking.confirmedAt || null,
  failedAt: booking.failedAt || null,
  failureReason: booking.failureReason || null
});

const nearestLocationToPoint = (point) => {
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
  let nearest = null;
  let best = Number.POSITIVE_INFINITY;
  data.locations.forEach((loc) => {
    const d = calculateDistance(point, loc);
    if (d < best) {
      best = d;
      nearest = loc;
    }
  });
  if (!nearest) return null;
  return { ...nearest, distanceMeters: Math.round(best) };
};

const buildAiSuggestion = ({ from, to, userPoint, userSpeedKmph, rankedBuses, trafficWindow, alerts }) => {
  const topBus = rankedBuses.find((bus) => bus.seatsLeft > 0) || rankedBuses[0] || null;
  const nearestStop = nearestLocationToPoint(userPoint);
  const severeAlerts = alerts.filter((alert) => alert.severity >= 4).length;
  const routeCondition = severeAlerts > 0 ? 'heavy_disruption' : trafficWindow === 'Peak' ? 'moderate_traffic' : 'smooth';

  if (!topBus) {
    return {
      title: 'No active buses found',
      recommendation: `Use alternate mode from ${from.name} to ${to.name} for now.`,
      recommendedBusId: null,
      recommendedBusNumber: null,
      nearestStopName: nearestStop ? nearestStop.name : null,
      nearestStopDistanceMeters: nearestStop ? nearestStop.distanceMeters : null,
      userSpeedKmph,
      routeCondition,
      confidence: 52,
      factors: {
        userLocationUsed: Boolean(userPoint),
        userSpeedUsed: typeof userSpeedKmph === 'number',
        trafficWindow,
        vacancyConsidered: false,
        alertCount: alerts.length
      }
    };
  }

  const walkingMinutes = nearestStop ? Math.max(1, Math.round((nearestStop.distanceMeters / 80) / Math.max(0.8, userSpeedKmph / 5))) : 0;
  const waitMinutes = topBus.etaMinutes;
  const crowdAdvice = topBus.seatsLeft <= 5 ? 'Bus almost full, board quickly.' : 'Seats available comfortably.';
  const confidenceBase = topBus.confidencePercent || 70;
  const confidence = Math.max(45, Math.min(98, confidenceBase - severeAlerts * 8 + (topBus.seatsLeft > 0 ? 6 : -10)));

  return {
    title: 'Nexus AI Trip Suggestion',
    recommendation: `Walk ${walkingMinutes} min to ${nearestStop ? nearestStop.name : from.name}, take ${topBus.number} in ~${waitMinutes} min. ${crowdAdvice}`,
    recommendedBusId: topBus.busId,
    recommendedBusNumber: topBus.number,
    nearestStopName: nearestStop ? nearestStop.name : null,
    nearestStopDistanceMeters: nearestStop ? nearestStop.distanceMeters : null,
    userSpeedKmph,
    routeCondition,
    confidence,
    factors: {
      userLocationUsed: Boolean(userPoint),
      userSpeedUsed: typeof userSpeedKmph === 'number',
      trafficWindow,
      vacancyConsidered: true,
      alertCount: alerts.length
    }
  };
};

setInterval(() => {
  buses.forEach((bus) => {
    const route = routes.find((r) => r.id === bus.routeId);
    if (!route || route.points.length < 2) return;

    // Add slight random speed variation for more realistic live movement.
    bus.speed = Math.max(18, 30 + Math.random() * 15);

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

app.get('/api/booking/:bookingId', (req, res) => {
  const booking = bookingLedger.find((item) => item.bookingId === req.params.bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  return res.json(bookingPublicView(booking));
});

app.get('/api/buses/safety', (req, res) => {
  const payload = buses.map((bus) => ({
    busId: bus.id,
    number: bus.number,
    ...buildBusSafetyMeta(bus)
  }));
  return res.json(payload);
});

app.get('/api/profile/:userId', (req, res) => {
  const profile = getOrCreateUserProfile(req.params.userId);
  return res.json(buildProfileDashboard(profile));
});

app.post('/api/profile/:userId/reset', (req, res) => {
  const profile = resetUserProfile(req.params.userId);
  pushProfileActivity(profile, 'Profile reset requested. Ride counter starts from 0.');
  return res.json({ status: 'reset', profile: buildProfileDashboard(profile) });
});

app.get('/api/profile/:userId/rides', (req, res) => {
  const userId = String(req.params.userId);
  const rides = bookingLedger
    .filter((booking) => booking.userId === userId && booking.status === 'confirmed')
    .map((booking) => ({
      bookingId: booking.bookingId,
      busId: booking.busId,
      amount: booking.amount,
      discountAmount: booking.discountAmount,
      freeTicketUsed: Boolean(booking.freeTicketUsed),
      confirmedAt: booking.confirmedAt,
      paymentProvider: booking.paymentProvider
    }))
    .slice(0, 80);
  return res.json({ userId, rides });
});

app.post('/api/gemma/regenerate', async (req, res) => {
  await generateRoutesAndBusesWithGemma2B();
  return res.json({ routes: routes.length, buses: buses.length, model: GEMMA_MODEL });
});

app.post('/api/plan-trip', (req, res) => {
  const { fromId, toId, userLat, userLng, userSpeedKmph } = req.body;
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
      const seatPrediction = predictSeatsAtStop(bus, route, from);
      const seatsLeft = seatPrediction.currentSeatsLeft;
      const crowdLevel = bus.occupied / Math.max(1, bus.capacity);
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
        nexusScore: Math.max(20, Math.round(100 - ((bus.occupied / bus.capacity) * 70) - Math.min(25, distanceToShortestPath / 80))),
        nexusAIScore: Math.max(70, Math.round(98 - (crowdLevel * 45) + (predictive.predictedEtaMinutes < 6 ? 12 : 0))),
        crowdPrediction: crowdLevel > 0.75 ? 'Likely crowded at KIIT/Rasulgarh' : crowdLevel > 0.5 ? 'Moderate crowd expected' : 'Good seats likely',
        delayProbability: predictive.predictedEtaMinutes > 10 ? 'High delay risk (peak traffic)' : 'Low delay risk',
        currentSeatsLeft: seatPrediction.currentSeatsLeft,
        predictedSeatsAtYourStop: seatPrediction.predictedSeatsAtYourStop,
        predictedOccupancyAtYourStop: seatPrediction.predictedOccupancyAtYourStop,
        boardingAdvice: seatPrediction.boardingAdvice,
        boardingZoneHint: seatPrediction.boardingZoneHint,
        boardingOffsetMeters: seatPrediction.boardingOffsetMeters,
        safetyScore: seatPrediction.safetyScore,
        isWomenFriendly: seatPrediction.isWomenFriendly,
        womenPriority: seatPrediction.womenPriority,
        seatsLeft,
        status: seatsLeft > 8 ? 'Vacant' : seatsLeft > 0 ? 'Filling Fast' : 'Full',
        distanceToPathMeters: Math.round(distanceToShortestPath),
        safety: buildBusSafetyMeta(bus)
      };
    })
    .filter(Boolean)
    .filter((bus) => bus.distanceToPathMeters <= corridorThresholdMeters)
    .sort((a, b) => {
      if (a.isWomenFriendly !== b.isWomenFriendly) return b.isWomenFriendly ? 1 : -1;
      return (b.predictedSeatsAtYourStop - a.predictedSeatsAtYourStop)
        || (a.etaMinutes - b.etaMinutes)
        || (a.distanceToPathMeters - b.distanceToPathMeters);
    });

  const fallbackBuses = busOptions.length
    ? busOptions
    : buses
        .map((bus) => ({
          ...calculatePredictiveEtaMeta(bus, from),
          busId: bus.id,
          number: bus.number,
          routeId: bus.routeId,
          etaMinutes: calculateETA(bus, from.lat, from.lng),
          nexusScore: Math.max(20, Math.round(100 - ((bus.occupied / bus.capacity) * 70))),
          nexusAIScore: Math.max(70, Math.round(98 - ((bus.occupied / Math.max(1, bus.capacity)) * 45))),
          crowdPrediction: (bus.occupied / Math.max(1, bus.capacity)) > 0.75 ? 'Likely crowded at KIIT/Rasulgarh' : (bus.occupied / Math.max(1, bus.capacity)) > 0.5 ? 'Moderate crowd expected' : 'Good seats likely',
          delayProbability: calculateETA(bus, from.lat, from.lng) > 10 ? 'High delay risk (peak traffic)' : 'Low delay risk',
          ...(() => {
            const route = routes.find((r) => r.id === bus.routeId);
            return predictSeatsAtStop(bus, route, from);
          })(),
          seatsLeft: Math.max(0, bus.capacity - bus.occupied),
          status: (bus.capacity - bus.occupied) > 8 ? 'Vacant' : (bus.capacity - bus.occupied) > 0 ? 'Filling Fast' : 'Full',
          distanceToPathMeters: -1,
          safety: buildBusSafetyMeta(bus)
        }))
        .sort((a, b) => {
          if (a.isWomenFriendly !== b.isWomenFriendly) return b.isWomenFriendly ? 1 : -1;
          return (b.predictedSeatsAtYourStop - a.predictedSeatsAtYourStop) || (a.etaMinutes - b.etaMinutes);
        });

  const nextThree = fallbackBuses.slice(0, 3);
  const nextAvailable = fallbackBuses.find((bus) => bus.seatsLeft > 0) || null;
  const nextGuaranteedSeatBus = fallbackBuses.find((bus) => bus.predictedSeatsAtYourStop >= 6) || null;
  const alternativeStopOption = nextGuaranteedSeatBus ? null : suggestAlternativeStopForSeats(from, to, buses);
  const pathDistanceMeters = calcPathDistanceMeters(pathPoints);
  const activeRouteAlerts = smartAlerts.filter(
    (alert) => alert.routeId === null || fallbackBuses.some((bus) => bus.routeId === alert.routeId)
  );

  const modal = buildMultimodalComparison(pathDistanceMeters, nextThree[0] ? nextThree[0].etaMinutes : 12);
  const fastestPath = buildFastestPathVariant(pathPoints);
  const fastestTimeMin = nextThree[0] ? nextThree[0].etaMinutes : Math.max(2, Math.round((pathDistanceMeters / 1000) * 2.8));
  const userPoint = (typeof userLat === 'number' && typeof userLng === 'number') ? { lat: userLat, lng: userLng } : null;
  const trafficWindow = nextThree[0]?.trafficWindow || getTimeWindowFactor().label;
  const aiSuggestion = buildAiSuggestion({
    from,
    to,
    userPoint,
    userSpeedKmph: typeof userSpeedKmph === 'number' ? userSpeedKmph : 4.5,
    rankedBuses: fallbackBuses,
    trafficWindow,
    alerts: activeRouteAlerts
  });

  return res.json({
    routeName: `Smart Corridor: ${from.name} -> ${to.name}`,
    path: pathPoints,
    shortestPath: pathPoints,
    fastestPath,
    pathLocationIds: shortest.path,
    shortestDistanceMeters: Math.round(shortest.distanceMeters),
    shortestDistanceKm: Number((pathDistanceMeters / 1000).toFixed(2)),
    distanceKm: Number((pathDistanceMeters / 1000).toFixed(2)),
    fastestTimeMin,
    nexusConfidence: Math.max(60, Math.round((nextThree.reduce((sum, bus) => sum + (bus.confidencePercent || 70), 0) / Math.max(1, nextThree.length)) || 72)),
    aiInsight: nextThree[0]
      ? `Nexus AI recommends ${nextThree[0].number} - best speed + seats balance right now.`
      : 'Nexus AI suggests waiting for the next active vehicle on this corridor.',
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
    aiSuggestion,
    smartStopAssistant: nextGuaranteedSeatBus
      ? {
          status: 'guaranteed-seat-bus',
          message: `Next bus with strong seat chance: ${nextGuaranteedSeatBus.number} in ~${nextGuaranteedSeatBus.etaMinutes} min`,
          recommendedBusId: nextGuaranteedSeatBus.busId,
          recommendedBusNumber: nextGuaranteedSeatBus.number,
          predictedSeatsAtYourStop: nextGuaranteedSeatBus.predictedSeatsAtYourStop,
          boardingAdvice: nextGuaranteedSeatBus.boardingAdvice,
          boardingZoneHint: nextGuaranteedSeatBus.boardingZoneHint
        }
      : alternativeStopOption
        ? {
            status: 'walk-alternative-stop',
            message: `Walk ${alternativeStopOption.walkMeters}m to ${alternativeStopOption.stopName} for better seat chance`,
            alternativeStop: alternativeStopOption
          }
        : {
            status: 'wait-next-cycle',
            message: 'All buses likely full at your stop right now. Next refresh may unlock seats.'
          },
    guaranteedSeatBus: nextGuaranteedSeatBus
      ? {
          busId: nextGuaranteedSeatBus.busId,
          number: nextGuaranteedSeatBus.number,
          etaMinutes: nextGuaranteedSeatBus.etaMinutes,
          predictedSeatsAtYourStop: nextGuaranteedSeatBus.predictedSeatsAtYourStop,
          boardingAdvice: nextGuaranteedSeatBus.boardingAdvice,
          safetyScore: nextGuaranteedSeatBus.safetyScore
        }
      : null,
    alternativeStopOption,
    nexusAiConfidence: Math.max(55, Math.round((nextThree.reduce((sum, bus) => sum + (bus.confidencePercent || 70), 0) / Math.max(1, nextThree.length)) || 72)),
    message: busOptions.length
      ? 'Nexus AI selected the smartest route for you'
      : 'No buses near shortest route now, showing nearest upcoming buses instead'
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

// Compatibility endpoint requested for hackathon demos.
app.post('/api/report-alert', (req, res) => {
  const { busId, type, message, lat, lng } = req.body || {};
  const payload = {
    busId: busId || 'All',
    type: type || 'general',
    message: message || 'User reported issue on this route',
    timestamp: new Date().toLocaleTimeString('en-IN'),
    location: {
      lat: typeof lat === 'number' ? lat : 20.27,
      lng: typeof lng === 'number' ? lng : 85.82
    }
  };

  io.emit('new-alert', payload);

  smartAlerts.unshift({
    id: `ALR-${Date.now()}-${++reportCounter}`,
    routeId: null,
    busId: Number.isFinite(Number(busId)) ? Number(busId) : null,
    type: payload.type,
    severity: 3,
    message: payload.message,
    userId: 'community',
    createdAt: new Date().toISOString()
  });
  smartAlerts = smartAlerts.slice(0, 120);

  return res.json({ success: true, message: 'Alert broadcast to community', payload });
});

app.post('/api/report-boarding-issue', (req, res) => {
  const { busId, issue } = req.body || {};
  const normalizedIssue = ['full', 'stopped_far', 'rash_driving', 'harassment', 'door_not_opened'].includes(issue)
    ? issue
    : 'full';
  const safetyPayload = {
    busId: Number.isFinite(Number(busId)) ? Number(busId) : 'All',
    issue: normalizedIssue,
    message: `SAFETY ALERT: ${normalizedIssue.toUpperCase()} reported on bus ${busId || 'All'}`,
    timestamp: new Date().toISOString()
  };

  io.emit('safety-alert', safetyPayload);
  return res.json({ success: true, payload: safetyPayload });
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
  const { busId, seats, userId } = req.body;
  const profile = getOrCreateUserProfile(userId || 'demo-user');
  const parsedSeats = Number(seats) || 0;
  const bus = buses.find((b) => b.id === Number(busId));
  const availableSeats = bus ? seatsAvailableForBus(bus) : 0;

  if (!bus || parsedSeats <= 0 || availableSeats < parsedSeats) {
    return res.status(400).json({ error: 'Not enough seats' });
  }

  bookingCounter += 1;
  const isFreeSeatWave = bookingCounter <= 50;
  const reservationFee = isFreeSeatWave ? 0 : parsedSeats * 2;
  const baseAmount = parsedSeats * 15 + reservationFee;
  let discountAmount = 0;
  let perkApplied = 'none';
  let freeTicketUsed = false;

  if (profile.freeTicketCredits > 0) {
    freeTicketUsed = true;
    perkApplied = '100_RIDES_FREE_TICKET';
    discountAmount = baseAmount;
  } else if (profile.ridesCompleted >= 50) {
    perkApplied = '50_RIDES_DISCOUNT';
    discountAmount = Math.round(baseAmount * 0.2);
  }

  const totalAmount = Math.max(0, baseAmount - discountAmount);
  const bookingId = makeId('BK');
  const createdAtMs = nowMs();
  const expiresAtMs = createdAtMs + BOOKING_HOLD_MS;
  const razorpayOrderId = makeId('order');

  const booking = {
    bookingId,
    userId: profile.userId,
    number: bus.number,
    busId: bus.id,
    seats: parsedSeats,
    baseAmount,
    discountAmount,
    amount: totalAmount,
    reservationFee,
    perkApplied,
    freeTicketUsed,
    status: 'pending',
    paymentStatus: 'awaiting_payment',
    paymentProvider: null,
    transactionId: null,
    freeSeatWaveApplied: isFreeSeatWave,
    createdAtMs,
    expiresAtMs,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    confirmedAt: null,
    failedAt: null,
    failureReason: null,
    razorpayOrderId
  };

  bookingLedger.unshift(booking);
  bookingLedger = bookingLedger.slice(0, 2000);

  return res.json({
    bookingId,
    userId: profile.userId,
    status: 'pending',
    baseAmount,
    discountAmount,
    amount: totalAmount,
    reservationFee,
    perkApplied,
    freeTicketUsed,
    freeSeatWaveApplied: isFreeSeatWave,
    expiresAt: booking.expiresAt,
    holdWindowSeconds: Math.floor(BOOKING_HOLD_MS / 1000),
    seatsHeld: parsedSeats,
    seatsRemainingAfterHold: availableSeats - parsedSeats,
    profilePreview: buildProfileDashboard(profile),
    paymentOptions: [
      {
        provider: 'razorpay',
        note: 'Cards / UPI / Wallets',
        razorpayOrderId,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'
      },
      {
        provider: 'free-upi',
        note: 'ZERO platform fee via direct UPI (Paytm/PhonePe)',
        qrCode: 'https://fake-qr.example.com/freeupi',
        upiIntent: 'upi://pay?pa=nexustransit@upi&pn=Nexus%20Transit&cu=INR'
      }
    ]
  });
});

app.post('/api/payment/success', (req, res) => {
  const { bookingId, paymentProvider, transactionId } = req.body;
  const booking = bookingLedger.find((item) => item.bookingId === bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (!isPendingActive(booking)) {
    booking.status = 'expired';
    booking.paymentStatus = 'not_collected';
    booking.failureReason = 'Booking hold expired';
    return res.status(400).json({ error: 'Booking hold expired. Please book again.' });
  }

  if (booking.status === 'confirmed') {
    return res.json({ status: 'already_confirmed', booking: bookingPublicView(booking) });
  }

  const bus = buses.find((item) => item.id === booking.busId);
  if (!bus) {
    return res.status(400).json({ error: 'Bus not found for booking' });
  }

  const profile = getOrCreateUserProfile(booking.userId || 'demo-user');

  bus.occupied = Math.min(bus.capacity, bus.occupied + booking.seats);
  booking.status = 'confirmed';
  booking.paymentStatus = 'paid';
  booking.paymentProvider = paymentProvider || 'unknown';
  booking.transactionId = transactionId || makeId('TXN');
  booking.confirmedAt = new Date().toISOString();

  if (booking.freeTicketUsed && profile.freeTicketCredits > 0) {
    profile.freeTicketCredits -= 1;
    profile.freeTicketsRedeemed += 1;
    pushProfileActivity(profile, 'Free ticket credit redeemed automatically on this booking.');
  }

  profile.lifetimeDiscountInr += booking.discountAmount || 0;
  awardRideRewards(profile, booking);

  io.emit('booking-update', {
    bookingId: booking.bookingId,
    status: booking.status,
    busId: booking.busId,
    seats: booking.seats,
    transactionId: booking.transactionId,
    userId: booking.userId,
    ridesCompleted: profile.ridesCompleted,
    points: profile.points
  });

  return res.json({
    status: 'confirmed',
    ticket: {
      ticketId: makeId('TKT'),
      bookingId: booking.bookingId,
      userId: booking.userId,
      busId: booking.busId,
      seats: booking.seats,
      baseAmount: booking.baseAmount,
      discountAmount: booking.discountAmount,
      amount: booking.amount,
      perkApplied: booking.perkApplied,
      freeTicketUsed: booking.freeTicketUsed,
      paymentProvider: booking.paymentProvider,
      transactionId: booking.transactionId,
      confirmedAt: booking.confirmedAt
    },
    booking: bookingPublicView(booking),
    profile: buildProfileDashboard(profile)
  });
});

app.post('/api/payment/fail', (req, res) => {
  const { bookingId, reason } = req.body;
  const booking = bookingLedger.find((item) => item.bookingId === bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status === 'confirmed') {
    return res.status(400).json({ error: 'Booking already confirmed, cannot mark failed' });
  }

  booking.status = 'failed';
  booking.paymentStatus = 'failed';
  booking.failedAt = new Date().toISOString();
  booking.failureReason = reason || 'Payment failed';

  return res.json({ status: 'failed', booking: bookingPublicView(booking) });
});

app.post('/api/payment/webhook/razorpay', (req, res) => {
  // Hackathon-safe placeholder for webhook integration.
  // In production, verify HMAC signature with RAZORPAY_WEBHOOK_SECRET.
  const event = req.body?.event || 'unknown';
  return res.json({ status: 'received', event, note: 'Implement signature verification for production' });
});

setInterval(() => {
  const now = nowMs();
  let expiredCount = 0;
  bookingLedger.forEach((booking) => {
    if (booking.status === 'pending' && booking.expiresAtMs <= now) {
      booking.status = 'expired';
      booking.paymentStatus = 'not_collected';
      booking.failureReason = 'Booking hold expired';
      expiredCount += 1;
    }
  });

  if (expiredCount > 0) {
    io.emit('booking-expired', { count: expiredCount, at: new Date().toISOString() });
  }
}, 10000);

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
