const { useEffect, useMemo, useRef, useState } = React;

const tabs = [
  { id: "home", label: "Home" },
  { id: "routes", label: "Routes" },
  { id: "tracking", label: "Tracking" },
  { id: "schedule", label: "Schedule" }
];

const corridorRoutes = [
  {
    name: "Airport Express",
    route: "Route 10A",
    origin: "Biju Patnaik Airport",
    destination: "Master Canteen Hub",
    status: "Medium Crowding",
    statusKind: "warn",
    next: "12:05"
  },
  {
    name: "Tech Corridor Rapid",
    route: "Route 11",
    origin: "Master Canteen Hub",
    destination: "KIIT Campus",
    status: "On Time",
    statusKind: "good",
    next: "12:14"
  },
  {
    name: "Heritage Shuttle",
    route: "Route 16",
    origin: "Khandagiri",
    destination: "Rasulgarh Square",
    status: "Delayed +4m",
    statusKind: "late",
    next: "12:28"
  }
];

const scheduleRows = [
  {
    code: "X1",
    name: "Tech District Express",
    load: 45,
    time: "08:14",
    status: "On Time",
    statusKind: "good"
  },
  {
    code: "M4",
    name: "Khandagiri Circuit",
    load: 88,
    time: "08:22",
    status: "+4 Min Delay",
    statusKind: "late"
  },
  {
    code: "N2",
    name: "Airport Shuttle",
    load: 12,
    time: "08:35",
    status: "On Time",
    statusKind: "good"
  }
];

const BHUBANESWAR_BASE_LOCATIONS = [
  { id: "airport", name: "Biju Patnaik Airport", lat: 20.2444, lng: 85.8178 },
  { id: "master_canteen", name: "Master Canteen", lat: 20.2666, lng: 85.8436 },
  { id: "jayadev_vihar", name: "Jayadev Vihar", lat: 20.2982, lng: 85.817 },
  { id: "patia", name: "Patia", lat: 20.3392, lng: 85.8188 },
  { id: "kiit_square", name: "KIIT Square", lat: 20.3533, lng: 85.8165 },
  { id: "vani_vihar", name: "Vani Vihar", lat: 20.2944, lng: 85.8433 },
  { id: "rasulgarh", name: "Rasulgarh", lat: 20.2989, lng: 85.858 },
  { id: "khandagiri", name: "Khandagiri", lat: 20.2589, lng: 85.7836 },
  { id: "kalpana_square", name: "Kalpana Square", lat: 20.255, lng: 85.835 },
  { id: "baramunda", name: "Baramunda", lat: 20.2818, lng: 85.7873 },
  { id: "crp_square", name: "CRP Square", lat: 20.3001, lng: 85.8046 },
  { id: "acharya_vihar", name: "Acharya Vihar", lat: 20.299, lng: 85.8272 },
  { id: "saheed_nagar", name: "Saheed Nagar", lat: 20.2869, lng: 85.8425 },
  { id: "rupali", name: "Rupali Square", lat: 20.2718, lng: 85.8365 },
  { id: "nicco_park", name: "Nicco Park", lat: 20.3156, lng: 85.8518 },
  { id: "mancheswar", name: "Mancheswar", lat: 20.3258, lng: 85.8714 },
  { id: "infocity", name: "Infocity", lat: 20.3474, lng: 85.8215 },
  { id: "sum_hospital", name: "SUM Hospital", lat: 20.3015, lng: 85.7691 },
  { id: "nandankanan", name: "Nandankanan", lat: 20.3974, lng: 85.8191 },
  { id: "railway_station", name: "Bhubaneswar Railway Station", lat: 20.2714, lng: 85.84 }
];

function generateBhubaneswarLocationsWithGemma3B() {
  // Placeholder for Gemma 3B integration. Replace with your model endpoint response.
  return BHUBANESWAR_BASE_LOCATIONS.map((location, index) => ({
    ...location,
    aiTag: index % 3 === 0 ? "high-demand" : index % 3 === 1 ? "rapid-connector" : "feeder"
  }));
}

function getDistanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const term1 = Math.sin(dLat / 2) * Math.sin(dLat / 2);
  const term2 = Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.sqrt(term1 + term2));
}

function getDirectionText(from, to) {
  if (!from || !to) return "Direction unavailable";
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;

  if (bearing >= 337.5 || bearing < 22.5) return "Head North";
  if (bearing < 67.5) return "Head North-East";
  if (bearing < 112.5) return "Head East";
  if (bearing < 157.5) return "Head South-East";
  if (bearing < 202.5) return "Head South";
  if (bearing < 247.5) return "Head South-West";
  if (bearing < 292.5) return "Head West";
  return "Head North-West";
}

function getTrafficMultiplier() {
  const hour = new Date().getHours();
  if ((hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 20)) return 1.38;
  if (hour >= 12 && hour <= 15) return 1.16;
  return 1.0;
}

function buildRoadGraph(locations) {
  const graph = Object.fromEntries(locations.map((loc) => [loc.id, []]));
  const trafficMultiplier = getTrafficMultiplier();
  const addEdge = (fromId, toId, distance, time) => {
    const exists = graph[fromId].some((edge) => edge.to === toId);
    if (exists) return;
    graph[fromId].push({ to: toId, distance, time });
  };

  for (let i = 0; i < locations.length; i += 1) {
    const source = locations[i];
    const closest = locations
      .filter((target) => target.id !== source.id)
      .map((target) => ({ target, distance: getDistanceKm(source, target) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    closest.forEach(({ target, distance }) => {
      const avgSpeedKmph = 26;
      const travelMinutes = (distance / avgSpeedKmph) * 60 * trafficMultiplier;
      // Add bidirectional connectivity so Dijkstra remains stable for all location pairs.
      addEdge(source.id, target.id, distance, travelMinutes);
      addEdge(target.id, source.id, distance, travelMinutes);
    });
  }

  // Add a lightweight ring backbone to guarantee global reachability.
  for (let i = 0; i < locations.length; i += 1) {
    const source = locations[i];
    const target = locations[(i + 1) % locations.length];
    const distance = getDistanceKm(source, target);
    const travelMinutes = (distance / 24) * 60 * trafficMultiplier;
    addEdge(source.id, target.id, distance, travelMinutes);
    addEdge(target.id, source.id, distance, travelMinutes);
  }

  return graph;
}

function runDijkstra(graph, startId, endId, weightKey) {
  const distances = {};
  const previous = {};
  const pending = new Set(Object.keys(graph));

  Object.keys(graph).forEach((node) => {
    distances[node] = Number.POSITIVE_INFINITY;
    previous[node] = null;
  });
  distances[startId] = 0;

  while (pending.size > 0) {
    let current = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    pending.forEach((node) => {
      if (distances[node] < bestDistance) {
        bestDistance = distances[node];
        current = node;
      }
    });

    if (!current) break;
    if (current === endId) break;

    pending.delete(current);

    graph[current].forEach((edge) => {
      if (!pending.has(edge.to)) return;
      const candidate = distances[current] + edge[weightKey];
      if (candidate < distances[edge.to]) {
        distances[edge.to] = candidate;
        previous[edge.to] = current;
      }
    });
  }

  const path = [];
  let step = endId;
  while (step) {
    path.unshift(step);
    step = previous[step];
  }

  if (path[0] !== startId) {
    return { path: [startId, endId], cost: Number.POSITIVE_INFINITY };
  }

  return { path, cost: distances[endId] };
}

function getNearestLocation(point, locations) {
  return locations.reduce((nearest, location) => {
    const distance = getDistanceKm(point, location);
    if (!nearest || distance < nearest.distance) {
      return { ...location, distance };
    }
    return nearest;
  }, null);
}

function createSimulatedLiveLocation(locations) {
  const timeSeed = Math.floor(Date.now() / 12000);
  const indexA = timeSeed % locations.length;
  const indexB = (indexA + 1) % locations.length;
  const from = locations[indexA];
  const to = locations[indexB];
  const ratio = (Date.now() % 12000) / 12000;
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio
  };
}

function getPathDistance(graph, path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const edge = graph[path[i]].find((entry) => entry.to === path[i + 1]);
    total += edge ? edge.distance : 0;
  }
  return total;
}

function createLiveBuses(path, locations, liveAnchorId) {
  const routeLabel = path.slice(0, 3).map((id) => id.toUpperCase().slice(0, 3)).join("-");
  const baseEta = [3, 5, 8, 11, 14, 18];
  const firstNode = locations.find((loc) => loc.id === path[0]);
  const lastNode = locations.find((loc) => loc.id === path[path.length - 1]);

  return baseEta.map((eta, index) => {
    const seatCount = Math.max(0, 34 - index * 6 - ((new Date().getMinutes() + index) % 5));
    const isFull = seatCount === 0;
    const load = Math.min(98, 100 - seatCount * 2);
    return {
      id: `BUS-${routeLabel}-${index + 1}`,
      line: `Line ${11 + index}`,
      road: `${firstNode ? firstNode.name : "Origin"} to ${lastNode ? lastNode.name : "Destination"}`,
      eta,
      seats: seatCount,
      isFull,
      load,
      isNearLiveLocation: index === 0 && Boolean(liveAnchorId),
      fare: 22 + index * 4
    };
  });
}

function rankBusesWithAIModel(buses, options = {}) {
  const optimizeFor = options.optimizeFor || "balanced";
  const userType = options.userType || "general";

  return [...buses].sort((a, b) => {
    const seatsA = Number.isFinite(a.predictedSeatsAtYourStop) ? a.predictedSeatsAtYourStop : a.seats;
    const seatsB = Number.isFinite(b.predictedSeatsAtYourStop) ? b.predictedSeatsAtYourStop : b.seats;
    const safetyA = Number.isFinite(a.safetyScore) ? a.safetyScore : 70;
    const safetyB = Number.isFinite(b.safetyScore) ? b.safetyScore : 70;

    let scoreA = a.eta * 2.2 + (a.isFull ? 15 : 0) - seatsA * 0.55 + a.load * 0.02;
    let scoreB = b.eta * 2.2 + (b.isFull ? 15 : 0) - seatsB * 0.55 + b.load * 0.02;

    if (optimizeFor === "seat-guarantee") {
      scoreA -= seatsA * 0.7;
      scoreB -= seatsB * 0.7;
    }
    if (optimizeFor === "fastest") {
      scoreA += a.eta * 0.6;
      scoreB += b.eta * 0.6;
    }
    if (optimizeFor === "women-safety" || userType === "woman" || userType === "elderly") {
      scoreA -= (a.isWomenFriendly ? 8 : 0) + (safetyA * 0.06);
      scoreB -= (b.isWomenFriendly ? 8 : 0) + (safetyB * 0.06);
    }

    return scoreA - scoreB;
  });
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [day, setDay] = useState("Weekday");

  const currentTime = useClock();

  const visibleTabs = tabs.filter(t => isAuthenticated || t.id === "home");

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setActiveTab("tracking");
  };

  return (
    <>
      <div className="site-shell">
        <TopNav 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          visibleTabs={visibleTabs} 
          isAuthenticated={isAuthenticated} 
        />

        <main className="main-flow">
          {activeTab === "home" && <HomeView onRouteClick={() => setActiveTab("auth")} onScheduleClick={() => setActiveTab("auth")} />}
          {activeTab === "tracking" && isAuthenticated && <TrackingView currentTime={currentTime} />}
          {activeTab === "schedule" && isAuthenticated && (
            <ScheduleView
              day={day}
              setDay={setDay}
              onMapOpen={() => setActiveTab("tracking")}
            />
          )}
          {activeTab === "auth" && <AuthView onLoginSuccess={handleLoginSuccess} />}
        </main>
      </div>

      <footer className="app-footer">
        <div className="footer-top">
          <div className="brand-wrap">
            <h2 style={{color: '#fff', fontSize: '1.2rem'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', verticalAlign: 'middle', color: '#0d5fd3'}}>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Nexus Transit
            </h2>
            <p>Engineering the future of urban movement<br/>through Kinetic Precision and Fluid Navigation.</p>
          </div>
          <div className="footer-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Accessibility</a>
            <a href="#">Support</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 NEXUS TRANSIT SYSTEMS. KINETIC PRECISION ENGINEERING.</p>
          <div className="social-icons">
            <button aria-label="Share">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
            </button>
            <button aria-label="Language">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}

function TopNav({ activeTab, onTabChange, visibleTabs, isAuthenticated }) {
  return (
    <header className="top-nav">
      <div className="brand-wrap">
        <h1>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', verticalAlign: 'middle', color: '#0d5fd3'}}>
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Nexus Transit
        </h1>
      </div>

      <nav>
        <ul className="tab-list">
          {visibleTabs.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                className={activeTab === tab.id ? "tab-btn active" : "tab-btn"}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nav-actions">
        <button type="button" className="text-btn">Emergency Alerts</button>
        {!isAuthenticated ? (
          <button type="button" className="solid-btn" onClick={() => onTabChange("auth")}>Sign In</button>
        ) : (
          <button type="button" className="soft-btn" style={{ fontWeight: 'bold' }}>Signed In</button>
        )}
      </div>
    </header>
  );
}

function HomeView({ onRouteClick, onScheduleClick }) {
  return (
    <section className="view-wrap fade-in">
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-glow hero-glow-a" aria-hidden="true" />
        <div className="hero-glow hero-glow-b" aria-hidden="true" />
        
        <div className="overlapping-bus" aria-hidden="true">
          <img src="https://i.postimg.cc/8PnvY73Y/bus-isolate.png" alt="Bus overlap illustration" className="slide-bus" />
        </div>

        <div className="hero-grid page-grid">
          <div className="hero-copy reveal" style={{ animationDelay: "0.08s" }}>
            <span className="live-chip">
              <span className="dot-pulse" /> Live System Status: Optimal
            </span>
            <h2>
              Your City, <br />
              <span>Synchronized.</span>
            </h2>
            <p>
              Experience the rhythm of urban mobility through kinetic precision. Real-time intelligence meeting fluid navigation across the subcontinent.
            </p>
            <div className="hero-actions">
              <button type="button" className="solid-btn hero-btn" onClick={onRouteClick}>Start Your Journey →</button>
              <button type="button" className="soft-btn hero-btn" onClick={onScheduleClick}>View Routes</button>
            </div>
          </div>

          <div className="hero-floats reveal" style={{ animationDelay: "0.2s" }}>
            <article className="glass-card lift-card arrival-card">
              <header>
                <h3>Line 402</h3>
                <span className="tag-ok">Live</span>
              </header>
              <p className="label">Arrival In</p>
              <p className="time">04:12</p>
              <p className="muted">New Delhi Main Terminal</p>
            </article>

            <article className="glass-card lift-card health-card">
              <p className="label">System Health</p>
              <p className="precision">99.8% Precision</p>
            </article>
          </div>
        </div>
      </section>

      <section className="philosophy page-grid">
        <div className="text-block reveal" style={{ animationDelay: "0.1s" }}>
          <p className="eyebrow">The Nexus Philosophy</p>
          <h3>
            The Kinetic Precision <br />
            <span>of Urban Flow.</span>
          </h3>
          <p>
            Transit is not just moving from A to B. It is the heartbeat of the city. We engineered Nexus Transit to feel like an extension of natural motion.
          </p>
          <p>
            By leveraging fluid navigation, we reduce scheduling friction and keep motion continuous with real-time spatial intelligence.
          </p>
          <div className="stat-row">
            <article>
              <strong>24ms</strong>
              <small>Sync Latency</small>
            </article>
            <article>
              <strong>14k</strong>
              <small>Active Nodes</small>
            </article>
          </div>
        </div>

        <div className="visual-block reveal" style={{ animationDelay: "0.18s" }}>
          <div className="visual-large">
            <img src="assets/visual_nav_bg.png" alt="Transit operation visual" />
            <span>Kinetic Engineering</span>
          </div>
          <div className="visual-mini-wrap">
            <article className="visual-mini quote">A journey that feels invisible is a journey perfected.</article>
            <article className="visual-mini blue">Global Standards</article>
          </div>
        </div>
      </section>

      <section className="corridor-zone page-grid">
        <div className="zone-head reveal" style={{ animationDelay: "0.1s" }}>
          <div>
            <h3>Live Corridors</h3>
            <p>Currently optimizing 124 urban veins with millisecond precision.</p>
          </div>
          <button type="button" className="text-btn">View All Schedules →</button>
        </div>

        <div className="corridor-grid">
          {corridorRoutes.map((route, index) => (
            <article className="route-card lift-card reveal" key={route.route} style={{ animationDelay: `${0.14 + index * 0.08}s` }}>
              <div className="route-top">
                <div>
                  <h4>{route.name}</h4>
                  <p>{route.route}</p>
                </div>
                <strong>{route.next}</strong>
              </div>

              <div className="route-io">
                <div>
                  <small>Origin</small>
                  <p>{route.origin}</p>
                </div>
                <div>
                  <small>Destination</small>
                  <p>{route.destination}</p>
                </div>
              </div>

              <span className={`status-pill ${route.statusKind}`}>{route.status}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function TrackingMap({
  locations,
  shortestPath,
  fastestPath,
  livePoint,
  nearestLocationName,
  busPositions,
  selectedBackendBusId,
  userLocation,
  departureLocation,
  destinationLocation,
  nearestStopLocation,
  guidancePath
}) {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);
  const markersLayerRef = React.useRef(null);
  const routeLayerRef = React.useRef(null);
  const liveMarkerRef = React.useRef(null);
  const busLayerRef = React.useRef(null);
  const userMarkerRef = React.useRef(null);
  const departureMarkerRef = React.useRef(null);
  const destinationMarkerRef = React.useRef(null);
  const nearestStopMarkerRef = React.useRef(null);
  const guidanceLineRef = React.useRef(null);

  React.useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView([20.296, 85.824], 13);
    mapInstance.current = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

    if (!map.getPane('routePane')) {
      map.createPane('routePane');
      map.getPane('routePane').style.zIndex = 420;
      map.getPane('routePane').style.pointerEvents = 'none';
    }

    markersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    busLayerRef.current = L.layerGroup().addTo(map);

    window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapInstance.current = null;
      markersLayerRef.current = null;
      routeLayerRef.current = null;
      liveMarkerRef.current = null;
      busLayerRef.current = null;
      userMarkerRef.current = null;
      departureMarkerRef.current = null;
      destinationMarkerRef.current = null;
      nearestStopMarkerRef.current = null;
      guidanceLineRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!mapInstance.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    locations.forEach((location) => {
      L.circleMarker([location.lat, location.lng], {
        radius: 5,
        fillColor: "#ffffff",
        color: "#64748b",
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(markersLayerRef.current).bindPopup(`<b>${location.name}</b>`);
    });
  }, [locations]);

  React.useEffect(() => {
    if (!mapInstance.current || !routeLayerRef.current) return;

    routeLayerRef.current.clearLayers();

    if (shortestPath.length > 1) {
      const shortestLatLng = shortestPath.map((location) => [location.lat, location.lng]);
      L.polyline(shortestLatLng, {
        color: '#60a5fa',
        weight: 14,
        opacity: 0.24,
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);

      const shortestPolyline = L.polyline(shortestLatLng, {
        color: '#2563eb',
        weight: 7,
        opacity: 0.98,
        lineJoin: 'round',
        dashArray: '10, 8',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);

      mapInstance.current.fitBounds(shortestPolyline.getBounds(), { padding: [50, 50], maxZoom: 14 });
    }

    if (fastestPath.length > 1) {
      const fastestLatLng = fastestPath.map((location) => [location.lat, location.lng]);
      L.polyline(fastestLatLng, {
        color: '#34d399',
        weight: 12,
        opacity: 0.22,
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);

      L.polyline(fastestLatLng, {
        color: '#059669',
        weight: 6,
        opacity: 0.96,
        lineJoin: 'round',
        dashArray: '4, 7',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);
    }

    if (liveMarkerRef.current) {
      mapInstance.current.removeLayer(liveMarkerRef.current);
      liveMarkerRef.current = null;
    }

    if (livePoint) {
      const liveIcon = L.divIcon({
        className: 'custom-live-marker',
        html: `<div style="background:#0d5fd3; width:20px;height:20px;border-radius:50%;border:4px solid white;box-shadow:0 0 10px rgba(0,0,0,0.2);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      liveMarkerRef.current = L.marker([livePoint.lat, livePoint.lng], { icon: liveIcon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>Live Position</b><br/>Nearest: ${nearestLocationName}`);
    }

    if (busLayerRef.current) {
      busLayerRef.current.clearLayers();
      busPositions.forEach((bus) => {
        const isSelected = selectedBackendBusId != null && Number(bus.busId) === Number(selectedBackendBusId);
        const busIcon = L.divIcon({
          className: 'custom-bus-marker',
          html: `<div style="background:${isSelected ? '#f59e0b' : '#111f34'};color:#fff;padding:3px 6px;border-radius:10px;font-size:10px;font-weight:700;box-shadow:${isSelected ? '0 0 0 3px rgba(245,158,11,0.35), 0 0 16px rgba(245,158,11,0.75)' : '0 4px 10px rgba(0,0,0,0.2)'}">${bus.number.split(' ').slice(-1)[0]}</div>`,
          iconSize: [30, 18],
          iconAnchor: [15, 9]
        });
        L.marker([bus.lat, bus.lng], { icon: busIcon })
          .addTo(busLayerRef.current)
          .bindPopup(`<b>${bus.number}</b><br/>Occupancy: ${bus.occupied}/${bus.capacity}<br/>ETA next: ${bus.etaToNextStop} min`);
      });
    }
  }, [shortestPath, fastestPath, livePoint, nearestLocationName, busPositions, selectedBackendBusId]);

  React.useEffect(() => {
    if (!mapInstance.current || !routeLayerRef.current) return;

    if (userMarkerRef.current) {
      mapInstance.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (departureMarkerRef.current) {
      mapInstance.current.removeLayer(departureMarkerRef.current);
      departureMarkerRef.current = null;
    }
    if (destinationMarkerRef.current) {
      mapInstance.current.removeLayer(destinationMarkerRef.current);
      destinationMarkerRef.current = null;
    }
    if (nearestStopMarkerRef.current) {
      mapInstance.current.removeLayer(nearestStopMarkerRef.current);
      nearestStopMarkerRef.current = null;
    }
    if (guidanceLineRef.current) {
      routeLayerRef.current.removeLayer(guidanceLineRef.current);
      guidanceLineRef.current = null;
    }

    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'tracker-marker',
        html: '<div style="background:#7c3aed;color:#fff;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;box-shadow:0 0 0 3px rgba(124,58,237,0.25)">YOU</div>',
        iconSize: [42, 24],
        iconAnchor: [21, 12]
      });
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(mapInstance.current)
        .bindPopup('<b>Your Current Location</b>');
    }

    if (departureLocation) {
      const depIcon = L.divIcon({
        className: 'tracker-marker',
        html: '<div style="background:#f59e0b;color:#111;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;box-shadow:0 0 0 3px rgba(245,158,11,0.28)">START</div>',
        iconSize: [52, 24],
        iconAnchor: [26, 12]
      });
      departureMarkerRef.current = L.marker([departureLocation.lat, departureLocation.lng], { icon: depIcon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>Departure:</b> ${departureLocation.name}`);
    }

    if (destinationLocation) {
      const destIcon = L.divIcon({
        className: 'tracker-marker',
        html: '<div style="background:#dc2626;color:#fff;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;box-shadow:0 0 0 3px rgba(220,38,38,0.22)">DEST</div>',
        iconSize: [48, 24],
        iconAnchor: [24, 12]
      });
      destinationMarkerRef.current = L.marker([destinationLocation.lat, destinationLocation.lng], { icon: destIcon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>Destination:</b> ${destinationLocation.name}`);
    }

    if (nearestStopLocation) {
      const stopIcon = L.divIcon({
        className: 'tracker-marker',
        html: '<div style="background:#0ea5e9;color:#fff;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;box-shadow:0 0 0 3px rgba(14,165,233,0.22)">NEAR STOP</div>',
        iconSize: [70, 24],
        iconAnchor: [35, 12]
      });
      nearestStopMarkerRef.current = L.marker([nearestStopLocation.lat, nearestStopLocation.lng], { icon: stopIcon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>Nearest Stop:</b> ${nearestStopLocation.name}`);
    }

    if (guidancePath && guidancePath.length > 1) {
      guidanceLineRef.current = L.polyline(
        guidancePath.map((point) => [point.lat, point.lng]),
        {
          color: '#f59e0b',
          weight: 5,
          opacity: 0.95,
          dashArray: '6, 10',
          pane: 'routePane'
        }
      ).addTo(routeLayerRef.current);
    }
  }, [userLocation, departureLocation, destinationLocation, nearestStopLocation, guidancePath]);

  React.useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.invalidateSize();
  }, [shortestPath.length, fastestPath.length]);

  return <div className="map-surface" ref={mapRef} style={{ zIndex: 0 }} />;
}

function TrackingView({ currentTime }) {
  const backendBase = "http://localhost:5000";
  const [locations, setLocations] = useState([]);
  const [fromId, setFromId] = useState(1);
  const [toId, setToId] = useState(3);
  const [geoSource, setGeoSource] = useState("backend-socket");
  const [socketConnected, setSocketConnected] = useState(false);
  const [livePoint, setLivePoint] = useState(null);
  const [busPositions, setBusPositions] = useState([]);
  const [shortestPath, setShortestPath] = useState([]);
  const [fastestPath, setFastestPath] = useState([]);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);
  const [tripFastestMin, setTripFastestMin] = useState(0);
  const [nexusAiConfidence, setNexusAiConfidence] = useState(98);
  const [userLocation, setUserLocation] = useState(null);
  const [userSpeedKmph, setUserSpeedKmph] = useState(4.5);
  const [userType, setUserType] = useState("general");
  const [optimizeFor, setOptimizeFor] = useState("balanced");
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [smartStopAssistant, setSmartStopAssistant] = useState(null);
  const [guaranteedSeatBus, setGuaranteedSeatBus] = useState(null);
  const [alternativeStopOption, setAlternativeStopOption] = useState(null);
  const [walletBalance, setWalletBalance] = useState(2000);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [seatsToBook, setSeatsToBook] = useState(1);
  const [bookingMessage, setBookingMessage] = useState("Select a bus to reserve seat and pay instantly.");
  const [selectedBackendBusId, setSelectedBackendBusId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const [buses, setBuses] = useState([]);
  const arrivalAlertRef = useRef(new Set());
  const nearestLiveLocation = useMemo(
    () => (livePoint && locations.length ? getNearestLocation(livePoint, locations) : null),
    [livePoint, locations]
  );
  const departureLocation = useMemo(
    () => locations.find((location) => Number(location.id) === Number(fromId)) || null,
    [locations, fromId]
  );
  const destinationLocation = useMemo(
    () => locations.find((location) => Number(location.id) === Number(toId)) || null,
    [locations, toId]
  );
  const nearestStopFromUser = useMemo(
    () => (userLocation && locations.length ? getNearestLocation(userLocation, locations) : null),
    [userLocation, locations]
  );
  const guidancePath = useMemo(() => {
    if (!userLocation || !nearestStopFromUser) return [];
    const points = [
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: nearestStopFromUser.lat, lng: nearestStopFromUser.lng }
    ];
    if (departureLocation && Number(departureLocation.id) !== Number(nearestStopFromUser.id)) {
      points.push({ lat: departureLocation.lat, lng: departureLocation.lng });
    }
    return points;
  }, [userLocation, nearestStopFromUser, departureLocation]);
  const guidanceDirection = useMemo(
    () => (userLocation && nearestStopFromUser ? getDirectionText(userLocation, nearestStopFromUser) : "Direction unavailable"),
    [userLocation, nearestStopFromUser]
  );

  const rankedBuses = useMemo(
    () => rankBusesWithAIModel(buses, { optimizeFor, userType }),
    [buses, optimizeFor, userType]
  );
  const firstArrivingBus = rankedBuses[0];
  const firstVacantBus = rankedBuses.find((bus) => !bus.isFull && bus.seats > 0);

  const addNotification = (title, message, kind = "info") => {
    setNotifications((prev) => {
      const item = {
        id: `NTF-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title,
        message,
        kind,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      return [item, ...prev].slice(0, 12);
    });
  };

  const mapTripBuses = (tripBuses, routeName) =>
    (tripBuses || []).map((bus) => ({
      id: `BUS-${bus.busId}`,
      backendBusId: bus.busId,
      line: bus.number,
      road: routeName,
      eta: bus.etaMinutes,
      seats: bus.seatsLeft,
      isFull: bus.seatsLeft <= 0,
      load: Math.round(((40 - bus.seatsLeft) / 40) * 100),
      fare: 15,
      nexusScore: bus.nexusScore || 72,
      confidencePercent: bus.confidencePercent || 75,
      predictedSeatsAtYourStop: Number.isFinite(bus.predictedSeatsAtYourStop) ? bus.predictedSeatsAtYourStop : bus.seatsLeft,
      boardingAdvice: bus.boardingAdvice || "Stand near MIDDLE door",
      boardingZoneHint: bus.boardingZoneHint || "Middle door, 10m ahead",
      safetyScore: Number.isFinite(bus.safetyScore) ? bus.safetyScore : 70,
      isWomenFriendly: Boolean(bus.isWomenFriendly),
      womenPriority: bus.womenPriority || "Standard Bus"
    }));

  const fetchLocations = async () => {
    try {
      const response = await fetch(`${backendBase}/api/locations`);
      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length === 0) throw new Error("No locations");
      setLocations(payload);

      const master = payload.find((item) => item.name.toLowerCase().includes("master canteen"));
      const kiit = payload.find((item) => item.name.toLowerCase().includes("kiit"));
      setFromId(master ? master.id : payload[0].id);
      setToId(kiit ? kiit.id : payload[Math.min(1, payload.length - 1)].id);
    } catch (error) {
      const fallback = generateBhubaneswarLocationsWithGemma3B().map((item, idx) => ({ ...item, id: idx + 1 }));
      setLocations(fallback);
      setFromId(fallback[0].id);
      setToId(fallback[Math.min(1, fallback.length - 1)].id);
      setBookingMessage("Backend locations unavailable. Loaded local fallback locations.");
    }
  };

  const handleSearch = async () => {
    if (Number(fromId) === Number(toId)) {
      setBookingMessage("Source and destination are the same. Choose a different destination.");
      return;
    }

    try {
      const response = await fetch(`${backendBase}/api/plan-trip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromId: Number(fromId),
          toId: Number(toId),
          userType,
          optimizeFor,
          userLat: userLocation ? Number(userLocation.lat) : undefined,
          userLng: userLocation ? Number(userLocation.lng) : undefined,
          userSpeedKmph: Number(userSpeedKmph)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to fetch trip plan");

      const shortest = payload.shortestPath || payload.path || [];
      const fastest = payload.fastestPath || shortest;
      setShortestPath(shortest);
      setFastestPath(fastest);
      setBuses(mapTripBuses(payload.buses, payload.routeName));

      if (typeof payload.distanceKm === "number") {
        setTripDistanceKm(payload.distanceKm);
      } else {
        let totalKm = 0;
        for (let i = 0; i < shortest.length - 1; i += 1) {
          totalKm += getDistanceKm(shortest[i], shortest[i + 1]);
        }
        setTripDistanceKm(totalKm);
      }

      if (typeof payload.fastestTimeMin === "number") {
        setTripFastestMin(payload.fastestTimeMin);
      } else {
        setTripFastestMin(payload.buses && payload.buses[0] ? payload.buses[0].etaMinutes : 0);
      }

      setNexusAiConfidence(payload.nexusAiConfidence || 98);
      setAiSuggestion(payload.aiSuggestion || null);
      setSmartStopAssistant(payload.smartStopAssistant || null);
      setGuaranteedSeatBus(payload.guaranteedSeatBus || null);
      setAlternativeStopOption(payload.alternativeStopOption || null);
      setBookingMessage(payload.message || "Live route loaded from backend.");
    } catch (error) {
      setBookingMessage(`Trip planning failed: ${error.message}`);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (!locations.length) return;
    handleSearch();
  }, [locations.length, fromId, toId, userType, optimizeFor]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        const speed = position.coords.speed;
        if (typeof speed === "number" && Number.isFinite(speed) && speed >= 0) {
          setUserSpeedKmph(Number((speed * 3.6).toFixed(1)));
        }
      },
      () => {
        // keep existing location if permission denied
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 6000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!window.io) {
      setBookingMessage("Socket.IO client not loaded in frontend.");
      return undefined;
    }

    const socket = window.io(backendBase, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      setSocketConnected(true);
      setGeoSource("backend-socket");
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("bus-update", (update) => {
      setLivePoint({ lat: update.lat, lng: update.lng });
      setBusPositions((prev) => {
        const filtered = prev.filter((bus) => bus.busId !== update.busId);
        return [...filtered, update];
      });

      setBuses((prev) =>
        prev.map((bus) =>
          bus.backendBusId === update.busId
            ? {
                ...bus,
                eta: update.etaToNextStop,
                seats: Math.max(0, update.capacity - update.occupied),
                isFull: update.capacity - update.occupied <= 0,
                load: Math.round((update.occupied / update.capacity) * 100)
              }
            : bus
        )
      );
    });

    socket.on("booking-update", (payload) => {
      addNotification(
        "Seat Booked",
        `Booking ${payload.bookingId} confirmed for Bus ${payload.busId} (${payload.seats} seat${payload.seats > 1 ? "s" : ""}).`,
        "success"
      );
    });

    socket.on("booking-expired", (payload) => {
      addNotification("Booking Hold Expired", `${payload.count} pending hold${payload.count > 1 ? "s" : ""} expired.`, "warn");
    });

    socket.on("new-alert", (payload) => {
      addNotification("Community Alert", payload.message || "A new transit alert was reported.", "warn");
    });

    socket.on("safety-alert", (payload) => {
      addNotification("Safety Alert", payload.message || "Safety issue reported by commuters.", "alert");
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedBackendBusId || !departureLocation) return;
    const trackedBus = busPositions.find((bus) => Number(bus.busId) === Number(selectedBackendBusId));
    if (!trackedBus) return;

    const key = `${trackedBus.busId}-${trackedBus.etaToNextStop}`;
    if (trackedBus.etaToNextStop <= 2 && !arrivalAlertRef.current.has(key)) {
      arrivalAlertRef.current.add(key);
      addNotification(
        "Bus Arriving",
        `${trackedBus.number} is arriving near ${departureLocation.name} in ~${trackedBus.etaToNextStop} min. Get ready to board.`,
        "info"
      );
    }
  }, [busPositions, selectedBackendBusId, departureLocation]);

  const handleBook = async () => {
    if (!selectedBusId) {
      setBookingMessage("Pick a bus before booking.");
      return;
    }

    const chosenBus = rankedBuses.find((bus) => bus.id === selectedBusId);
    if (!chosenBus) {
      setBookingMessage("Selected bus is no longer in active feed.");
      return;
    }

    if (chosenBus.seats < seatsToBook || chosenBus.isFull) {
      const alternative = rankedBuses.find((bus) => !bus.isFull && bus.seats >= seatsToBook);
      setBookingMessage(
        alternative
          ? `Selected bus is full. Next vacant option: ${alternative.line} (${alternative.eta} min).`
          : "No bus currently has required vacant seats. You can still track full incoming buses below."
      );
      return;
    }

    const totalFare = chosenBus.fare * seatsToBook;
    if (walletBalance < totalFare) {
      setBookingMessage(`Insufficient balance for ${paymentMethod}. Required Rs ${totalFare}.`);
      return;
    }

    try {
      const response = await fetch(`${backendBase}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: chosenBus.backendBusId, seats: seatsToBook })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Booking failed");

      const paymentResponse = await fetch(`${backendBase}/api/payment/success`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: payload.bookingId,
          paymentProvider: paymentMethod,
          transactionId: `NX-${Date.now()}`
        })
      });
      const paymentPayload = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(paymentPayload.error || "Payment confirmation failed");

      const finalAmount = paymentPayload?.booking?.amount || payload.amount || totalFare;

      setWalletBalance((prev) => Math.max(0, prev - finalAmount));
      setBuses((prev) =>
        prev.map((bus) =>
          bus.id === chosenBus.id
            ? {
                ...bus,
                seats: Math.max(0, bus.seats - seatsToBook),
                isFull: bus.seats - seatsToBook <= 0,
                load: Math.min(100, bus.load + seatsToBook * 3)
              }
            : bus
        )
      );
      setBookingMessage(`Seat booked successfully. Booking ${payload.bookingId} | Paid Rs ${finalAmount}.`);
      addNotification(
        "Seat Booked",
        `${chosenBus.line} confirmed with ${seatsToBook} seat${seatsToBook > 1 ? "s" : ""}. Txn ${paymentPayload?.ticket?.transactionId || "N/A"}`,
        "success"
      );
    } catch (error) {
      setBookingMessage(`Booking failed: ${error.message}`);
      addNotification("Booking Failed", error.message, "alert");
    }
  };

  useEffect(() => {
    const found = rankedBuses.find((bus) => bus.id === selectedBusId);
    const backendId = found ? found.backendBusId : null;
    setSelectedBackendBusId(backendId);
  }, [selectedBusId, rankedBuses]);

  return (
    <section className="view-wrap fade-in">
      <section className="tracking-layout">
        <aside className="tracking-sidebar">
          <div>
            <h3>Nexus Navigator</h3>
            <p>Precision Transit Tracking</p>
          </div>

          <div className="search-stack">
            <label>
              <span>Departure</span>
              <select value={fromId} onChange={(event) => setFromId(event.target.value)}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Arrival</span>
              <select value={toId} onChange={(event) => setToId(event.target.value)}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>User Profile</span>
              <select value={userType} onChange={(event) => setUserType(event.target.value)}>
                <option value="general">General</option>
                <option value="woman">Woman</option>
                <option value="elderly">Elderly</option>
                <option value="student">Student</option>
              </select>
            </label>
            <label>
              <span>Optimize For</span>
              <select value={optimizeFor} onChange={(event) => setOptimizeFor(event.target.value)}>
                <option value="balanced">Balanced ETA + Seats</option>
                <option value="seat-guarantee">Seat Guarantee</option>
                <option value="fastest">Fastest Arrival</option>
                <option value="women-safety">Women Safety Priority</option>
              </select>
            </label>
            <button type="button" className="solid-btn wide" onClick={handleSearch}>Search Routes</button>
            <button
              type="button"
              className="ask-ai-btn"
              onClick={() => window.alert("Nexus AI simulated 47 future scenarios. This route saves you 8 minutes vs Mo Bus today.")}
            >
              Ask Nexus AI - What if I leave 10 mins later?
            </button>

            <div className="route-metrics glass-card">
              <div className="metric-grid">
                <article>
                  <span>Signal</span>
                  <strong>{socketConnected ? "Live" : "Offline"}</strong>
                </article>
                <article>
                  <span>AI Confidence</span>
                  <strong>{nexusAiConfidence}%</strong>
                </article>
                <article>
                  <span>Your Speed</span>
                  <strong>{userSpeedKmph.toFixed(1)} km/h</strong>
                </article>
                <article>
                  <span>Nearest Stop</span>
                  <strong>{nearestStopFromUser ? nearestStopFromUser.name : "Locating"}</strong>
                </article>
              </div>
              <p className="tracker-line">
                <strong>Tracker:</strong> {nearestStopFromUser ? `${guidanceDirection} • ${(nearestStopFromUser.distance * 1000).toFixed(0)} m` : "Enable location permission"}
              </p>
              <div className="route-strip">
                <span>Shortest: {tripDistanceKm > 0 ? `${tripDistanceKm.toFixed(2)} km` : "N/A"}</span>
                <span>Fastest: {tripFastestMin > 0 ? `${tripFastestMin.toFixed(1)} min` : "N/A"}</span>
              </div>
            </div>
          </div>

          <ul className="side-links">
            <li className="active">Search Routes</li>
            <li>Live Map</li>
            <li>Saved Stops</li>
            <li>System Health</li>
          </ul>
        </aside>

        <section className="tracking-stage">
          <div className="map-zone">
            <div className="map-header glass-card">
              <div><span className="dot-pulse" /> System Status: All Routes Normal</div>
              <div>{currentTime} PM | 68F</div>
            </div>

            <TrackingMap
              locations={locations}
              shortestPath={shortestPath}
              fastestPath={fastestPath}
              livePoint={livePoint}
              nearestLocationName={nearestLiveLocation ? nearestLiveLocation.name : "Unknown"}
              busPositions={busPositions}
              selectedBackendBusId={selectedBackendBusId}
              userLocation={userLocation}
              departureLocation={departureLocation}
              destinationLocation={destinationLocation}
              nearestStopLocation={nearestStopFromUser}
              guidancePath={guidancePath}
            />
          </div>

          <div className="map-cards">
            <article className="glass-card map-card-left lift-card">
              <div className="mini-head">
                <span className="mini-tag">Fastest Route</span>
                <span>Arriving in <strong>{firstArrivingBus ? `${firstArrivingBus.eta} Min` : "--"}</strong></span>
              </div>
              <h4>{firstArrivingBus ? `${firstArrivingBus.line} - Express` : "No Bus"}</h4>
              <p>{firstArrivingBus ? firstArrivingBus.road : "No active corridor"}</p>
              {firstArrivingBus && (
                <p className="nexus-ai-score">NEXUS AI SCORE: {firstArrivingBus.nexusScore}/100 • Fastest + best seats</p>
              )}
              {smartStopAssistant && (
                <div className="smart-stop-highlight">
                  <h5>Smart Stop Assistant</h5>
                  <p>{smartStopAssistant.message}</p>
                  {guaranteedSeatBus && (
                    <small>
                      {guaranteedSeatBus.number} • Predicted Seats: {guaranteedSeatBus.predictedSeatsAtYourStop} • {guaranteedSeatBus.boardingAdvice}
                    </small>
                  )}
                  {!guaranteedSeatBus && alternativeStopOption && (
                    <small>
                      Walk {alternativeStopOption.walkMeters}m to {alternativeStopOption.stopName} for ~{alternativeStopOption.seatsLikely} seats.
                    </small>
                  )}
                </div>
              )}
              <div className="small-tiles">
                <span>Capacity: {firstArrivingBus ? `${firstArrivingBus.load}%` : "--"}</span>
                <span>Distance: {tripDistanceKm.toFixed(2)} km</span>
                <span>AI Suggestion: {firstVacantBus ? `${firstVacantBus.line} (vacant)` : "All incoming buses full"}</span>
              </div>
            </article>

            <article className="glass-card map-card-right lift-card">
              <h4>Road-Level Bus Options</h4>
              <p>Showing first arrivals, including full buses and next vacant bus.</p>
              {aiSuggestion && (
                <div className="ai-suggestion-box">
                  <h5>{aiSuggestion.title}</h5>
                  <p>{aiSuggestion.recommendation}</p>
                  <small>
                    Condition: {aiSuggestion.routeCondition} • Confidence: {aiSuggestion.confidence}% • Stop: {aiSuggestion.nearestStopName || "N/A"}
                  </small>
                </div>
              )}
              <div className="progress-track">
                <div className="progress-fill" />
              </div>
              <div className="bus-list">
                {rankedBuses.slice(0, 4).map((bus) => (
                  <div key={bus.id} className="bus-row">
                    <div>
                      <strong>{bus.line}</strong>
                      <p>{bus.eta} min | Seats: {bus.seats}</p>
                      <p>Predicted at your stop: {bus.predictedSeatsAtYourStop} • {bus.boardingAdvice}</p>
                      <p>{bus.womenPriority} • Safety {bus.safetyScore}/100</p>
                      <p className="nexus-ai-score">NEXUS AI SCORE: {bus.nexusScore}/100</p>
                    </div>
                    <span className={bus.isFull ? "status-pill late" : "status-pill good"}>
                      {bus.isFull ? "Full" : "Vacant"}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="tracking-bottom-panels">
            <article className="glass-card booking-panel">
              <h4>Book Your Bus</h4>
              <p>Reserve seat based on AI-ranked route arrivals.</p>
              <label>
                <span>Choose Bus</span>
                <select value={selectedBusId} onChange={(event) => setSelectedBusId(event.target.value)}>
                  <option value="">Select bus</option>
                  {rankedBuses.map((bus) => (
                    <option key={bus.id} value={bus.id}>{bus.line} | {bus.eta} min | Seats {bus.seats}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Seats</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={seatsToBook}
                  onChange={(event) => setSeatsToBook(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <button type="button" className="solid-btn wide" onClick={handleBook}>Book Now</button>
            </article>

            <article className="glass-card monetization-panel">
              <h4>Monetization & Payment</h4>
              <p>Secure transfer and instant booking confirmation.</p>
              <div className="wallet-badge">Wallet Balance: Rs {walletBalance}</div>
              <label>
                <span>Payment Method</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Transit Wallet">Transit Wallet</option>
                </select>
              </label>
              <p className="booking-status">{bookingMessage}</p>
            </article>

            <article className="glass-card notification-panel">
              <div className="notification-head">
                <h4>Live Notifications</h4>
                <span>{notifications.length} Active</span>
              </div>
              <p>Get instant updates when your bus arrives and when seats are booked.</p>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-item empty">No notifications yet. Track or book a bus to see live updates.</div>
                ) : (
                  notifications.map((item) => (
                    <article key={item.id} className={`notification-item ${item.kind}`}>
                      <div className="notification-top">
                        <strong>{item.title}</strong>
                        <small>{item.time}</small>
                      </div>
                      <p>{item.message}</p>
                    </article>
                  ))
                )}
              </div>
            </article>
          </div>
        </section>
      </section>
    </section>
  );
}

function ScheduleView({ day, setDay, onMapOpen }) {
  return (
    <section className="view-wrap fade-in">
      <section className="schedule-layout">
        <aside className="schedule-sidebar">
          <h3>Nexus Navigator</h3>
          <p>Precision Transit Tracking</p>

          <ul className="side-links">
            <li>Search Routes</li>
            <li>Live Map</li>
            <li>Saved Stops</li>
            <li>System Health</li>
          </ul>

          <button type="button" className="solid-btn wide">Book Rapid Seat</button>
        </aside>

        <section className="schedule-main">
          <div className="top-copy">
            <p className="eyebrow">Network Status: Operational</p>
            <h2>
              Timetable & <span>Schedules</span>
            </h2>
            <p>Dynamic route planning with real-time congestion mapping and precision timing.</p>
          </div>

          <div className="day-switcher">
            {["Weekday", "Saturday", "Sunday"].map((name) => (
              <button
                key={name}
                type="button"
                className={day === name ? "active" : ""}
                onClick={() => setDay(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="search-line">
            <input type="text" placeholder="Search by route name, station, or vehicle ID..." />
            <button type="button" className="solid-btn">Find</button>
          </div>

          <div className="schedule-grid">
            <article className="hub-table">
              <header>
                <div>
                  <h3>Main Terminal Hub</h3>
                  <p>Northbound & Cross-City Services</p>
                </div>
                <span className="tag-ok">Live Updates</span>
              </header>

              <div className="rows-wrap">
                {scheduleRows.map((item) => (
                  <article className="row-item lift-card" key={item.code}>
                    <span className="code-pill">{item.code}</span>
                    <div className="row-data">
                      <h4>{item.name}</h4>
                      <div className="load-line">
                        <span>{item.load}% full</span>
                        <div className="load-track">
                          <div className="load-fill" style={{ width: `${item.load}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="time-col">
                      <strong>{item.time}</strong>
                      <small className={item.statusKind === "late" ? "late" : "good"}>{item.status}</small>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <aside className="intensity-panel">
              <h3>Service Intensity</h3>
              <div className="int-row">
                <p>Peak (07:00-08:30)</p>
                <strong>Every 6m</strong>
                <div className="int-track"><span style={{ width: "88%" }} /></div>
              </div>
              <div className="int-row">
                <p>Off-Peak (10:00-15:00)</p>
                <strong>Every 15m</strong>
                <div className="int-track"><span style={{ width: "40%" }} /></div>
              </div>

              <article className="demand-card">
                <h4>Kinetic Demand Flow</h4>
                <p>
                  System is adjusting frequencies to match an unexpected passenger surge at Patia Square.
                </p>
              </article>
            </aside>
          </div>

          <article className="visual-nav-banner lift-card" style={{position: 'relative', overflow: 'hidden'}}>
            <img src="assets/visual_nav_bg.png" alt="Network map visual" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', zIndex: -1}} />
            <div style={{position: 'relative', zIndex: 1}}>
              <h3>Visual Navigator</h3>
              <p>Real-time GPS tracking for all active units across the metro grid.</p>
            </div>
            <button type="button" className="soft-btn" onClick={onMapOpen}>Open Live Map</button>
          </article>
        </section>
      </section>
    </section>
  );
}

function useClock() {
  const [time, setTime] = useState(formatTime());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTime(formatTime());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  return time;
}

function formatTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  hours = hours % 12 || 12;
  return `${hours}:${minutes}`;
}

function AuthView({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <section className="view-wrap fade-in auth-view">
      <div className="auth-card glass-card lift-card">
        <div className="auth-header">
          <h2>{isLogin ? "Welcome Back" : "Create Account"}</h2>
          <p>{isLogin ? "Sign in to access personalized mobility features." : "Join Nexus Transit for a seamless journey."}</p>
        </div>

        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (onLoginSuccess) onLoginSuccess(); }}>
          {!isLogin && (
            <label className="input-group">
              <span>Full Name</span>
              <input type="text" placeholder="John Doe" required />
            </label>
          )}
          <label className="input-group">
            <span>Email Address</span>
            <input type="email" placeholder="you@example.com" required />
          </label>
          <label className="input-group">
            <span>Password</span>
            <input type="password" placeholder="••••••••" required />
          </label>
          
          <button type="submit" className="solid-btn wide mt-4">
            {isLogin ? "Sign In" : "Register"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="text-btn toggle-auth" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Register" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);