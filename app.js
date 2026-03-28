const { useEffect, useMemo, useState, useCallback } = React;

const tabs = [
  { id: "home", label: "Home" },
  { id: "tracking", label: "Tracking" },
  { id: "schedule", label: "Schedule" }
];

const BACKEND_BASE = "http://localhost:5000";

const DEFAULT_NOTIFICATION_SETTINGS = {
  busNear: true,
  seatHold: true,
  bookingConfirmed: true,
  safety: true,
  smartStop: true
};

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

function rankBusesWithAIModel(buses) {
  return [...buses].sort((a, b) => {
    const scoreA = a.eta * 2.1 + (a.load || 0) * 0.05 - (a.safetyScore || 70) * 0.02 - (a.nexusScore || 70) * 0.01;
    const scoreB = b.eta * 2.1 + (b.load || 0) * 0.05 - (b.safetyScore || 70) * 0.02 - (b.nexusScore || 70) * 0.01;
    return scoreA - scoreB;
  });
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [day, setDay] = useState("Weekday");
  const [notifications, setNotifications] = useState([]);
  const PROFILE_USER_ID = "demo-user";
  const [profileDashboard, setProfileDashboard] = useState(null);
  const [notificationSettings, setNotificationSettings] = useState(() => {
    try {
      const saved = window.localStorage.getItem("nexus-notification-settings");
      if (!saved) return DEFAULT_NOTIFICATION_SETTINGS;
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
    } catch (_error) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  });

  const currentTime = useClock();

  const pushNotification = useCallback((title, message, kind = "info", category = "smartStop") => {
    const categoryMap = {
      busNear: "busNear",
      seatHold: "seatHold",
      bookingConfirmed: "bookingConfirmed",
      safety: "safety",
      smartStop: "smartStop"
    };
    const mappedCategory = categoryMap[category] || "smartStop";
    if (!notificationSettings[mappedCategory]) return;

    const next = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      kind,
      category: mappedCategory,
      createdAt: new Date().toISOString()
    };
    setNotifications((prev) => [next, ...prev].slice(0, 40));
  }, [notificationSettings]);

  useEffect(() => {
    window.localStorage.setItem("nexus-notification-settings", JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  const refreshProfileDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_BASE}/api/profile/${PROFILE_USER_ID}`);
      if (!response.ok) throw new Error("Profile feed unavailable");
      const payload = await response.json();
      setProfileDashboard(payload);
    } catch (_error) {
      setProfileDashboard(null);
    }
  }, [PROFILE_USER_ID]);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshProfileDashboard();
  }, [isAuthenticated, refreshProfileDashboard]);

  const clearNotifications = () => setNotifications([]);

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
          notifications={notifications}
          notificationSettings={notificationSettings}
          profileDashboard={profileDashboard}
          profileUserId={PROFILE_USER_ID}
          onRefreshProfile={refreshProfileDashboard}
          onNotificationSettingChange={(key, value) => {
            setNotificationSettings((prev) => ({ ...prev, [key]: value }));
          }}
          onClearNotifications={clearNotifications}
        />

        <main className="main-flow">
          {activeTab === "home" && <HomeView onRouteClick={() => setActiveTab("auth")} onScheduleClick={() => setActiveTab("auth")} />}
          {activeTab === "tracking" && isAuthenticated && (
            <TrackingView
              currentTime={currentTime}
              onNotify={pushNotification}
              userId={PROFILE_USER_ID}
              onTicketPurchased={refreshProfileDashboard}
            />
          )}
          {activeTab === "schedule" && isAuthenticated && (
            <ScheduleView
              day={day}
              setDay={setDay}
              onMapOpen={() => setActiveTab("tracking")}
              onNotify={pushNotification}
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

function TopNav({
  activeTab,
  onTabChange,
  visibleTabs,
  isAuthenticated,
  notifications,
  notificationSettings,
  profileDashboard,
  profileUserId,
  onRefreshProfile,
  onNotificationSettingChange,
  onClearNotifications
}) {
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleProfileOpen = async () => {
    const next = !isProfileOpen;
    setIsProfileOpen(next);
    if (next) {
      await onRefreshProfile?.();
    }
  };

  const bellCount = notifications.length;

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
        <button
          type="button"
          className="bell-btn"
          aria-label="Notification Center"
          onClick={() => setIsBellOpen((prev) => !prev)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {bellCount > 0 && <span className="bell-badge">{bellCount > 9 ? "9+" : bellCount}</span>}
        </button>

        {isAuthenticated && (
          <button
            type="button"
            className="profile-btn"
            aria-label="Profile Dashboard"
            onClick={handleProfileOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        )}
        {!isAuthenticated ? (
          <button type="button" className="solid-btn" onClick={() => onTabChange("auth")}>Sign In</button>
        ) : (
          <button type="button" className="soft-btn" style={{ fontWeight: 'bold' }}>Signed In</button>
        )}

        {isBellOpen && (
          <div className="notification-drawer glass-card">
            <div className="notification-head">
              <h4>Notifications</h4>
              <button type="button" className="text-btn" onClick={onClearNotifications}>Clear</button>
            </div>
            <div className="notification-settings-grid">
              <label className="notify-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationSettings?.busNear)}
                  onChange={(event) => onNotificationSettingChange?.("busNear", event.target.checked)}
                />
                <span>Bus Near</span>
              </label>
              <label className="notify-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationSettings?.seatHold)}
                  onChange={(event) => onNotificationSettingChange?.("seatHold", event.target.checked)}
                />
                <span>Seat Hold</span>
              </label>
              <label className="notify-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationSettings?.bookingConfirmed)}
                  onChange={(event) => onNotificationSettingChange?.("bookingConfirmed", event.target.checked)}
                />
                <span>Booking Confirmed</span>
              </label>
              <label className="notify-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationSettings?.safety)}
                  onChange={(event) => onNotificationSettingChange?.("safety", event.target.checked)}
                />
                <span>Safety Alerts</span>
              </label>
              <label className="notify-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationSettings?.smartStop)}
                  onChange={(event) => onNotificationSettingChange?.("smartStop", event.target.checked)}
                />
                <span>Smart Stop</span>
              </label>
            </div>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <p className="notification-empty">No alerts yet. We will notify when your bus is near and when seats are confirmed.</p>
              ) : (
                notifications.map((note) => (
                  <article key={note.id} className={`notification-item ${note.kind}`}>
                    <strong>{note.title}</strong>
                    <p>{note.message}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        )}

        {isProfileOpen && isAuthenticated && (
          <div className="profile-drawer glass-card">
            <div className="profile-head">
              <h4>Rider Profile</h4>
              <button type="button" className="text-btn" onClick={() => setIsProfileOpen(false)}>Close</button>
            </div>

            {!profileDashboard ? (
              <p className="profile-empty">Profile loading. Please try again in a moment.</p>
            ) : (
              <>
                <div className="profile-meta">
                  <span>User: {profileUserId}</span>
                  <span>Tier: {profileDashboard.tier}</span>
                </div>

                <div className="profile-stats-grid">
                  <article>
                    <strong>{profileDashboard.ridesCompleted}</strong>
                    <small>Total Rides</small>
                  </article>
                  <article>
                    <strong>{profileDashboard.points}</strong>
                    <small>Gamified Points</small>
                  </article>
                  <article>
                    <strong>Rs {profileDashboard.lifetimeDiscountInr || 0}</strong>
                    <small>Lifetime Savings</small>
                  </article>
                </div>

                <div className="profile-perk-card">
                  <h5>Automated Perks</h5>
                  <p><strong>Ride Counter Rule:</strong> Each successful Buy Ticket adds exactly +1 ride.</p>
                  <p>50 rides: 20% discount on ticket fare.</p>
                  <p>100 rides: 1 free ticket credit automatically applied.</p>
                  <p>Available free ticket credits: <strong>{profileDashboard.freeTicketCredits || 0}</strong></p>
                  <p>Rides to next milestone: <strong>{profileDashboard.perks?.ridesToNextMilestone ?? "--"}</strong></p>
                </div>

                <div className="profile-activity">
                  <h5>Seat Booking History</h5>
                  {Array.isArray(profileDashboard.seatBookings) && profileDashboard.seatBookings.length > 0 ? (
                    profileDashboard.seatBookings.slice(0, 5).map((item) => (
                      <article key={item.bookingId} className="profile-activity-item">
                        <p>
                          {item.busNumber} | Seats: {item.seats} | Paid: Rs {item.amount}
                        </p>
                        <p>
                          {item.freeTicketUsed ? "Free Ticket Used" : `Discount: Rs ${item.discountAmount || 0}`} | {item.paymentProvider || "N/A"}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="profile-empty">No seat bookings yet. Buy a ticket to populate this section.</p>
                  )}
                </div>

                <div className="profile-activity">
                  <h5>Recent Ride Activity</h5>
                  {Array.isArray(profileDashboard.recentActivity) && profileDashboard.recentActivity.length > 0 ? (
                    profileDashboard.recentActivity.slice(0, 5).map((item) => (
                      <article key={`${item.at}-${item.message}`} className="profile-activity-item">
                        <p>{item.message}</p>
                      </article>
                    ))
                  ) : (
                    <p className="profile-empty">No rides yet. Buy a ticket in Tracking to start earning points.</p>
                  )}
                </div>
              </>
            )}
          </div>
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

    const optimizedPath = fastestPath.length > 1 ? fastestPath : shortestPath;

    if (optimizedPath.length > 1) {
      const optimizedLatLng = optimizedPath.map((location) => [location.lat, location.lng]);

      // Route halo improves visibility over busy map tiles.
      L.polyline(optimizedLatLng, {
        color: '#ffffff',
        weight: 11,
        opacity: 0.95,
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);

      const optimizedPolyline = L.polyline(optimizedLatLng, {
        color: '#1d4ed8',
        weight: 7,
        opacity: 0.98,
        lineJoin: 'round',
        pane: 'routePane'
      }).addTo(routeLayerRef.current);

      mapInstance.current.fitBounds(optimizedPolyline.getBounds(), { padding: [60, 60], maxZoom: 14 });
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

function TrackingView({ currentTime, onNotify, userId, onTicketPurchased }) {
  const backendBase = BACKEND_BASE;
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
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [walletBalance, setWalletBalance] = useState(2000);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [bookingMessage, setBookingMessage] = useState("Select a bus and buy ticket instantly.");
  const [selectedBackendBusId, setSelectedBackendBusId] = useState(null);
  const notifiedBusNearRef = React.useRef(new Set());

  const [buses, setBuses] = useState([]);
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
  const nearestFootStops = useMemo(() => {
    if (!userLocation || !locations.length) return [];

    return locations
      .map((location) => ({
        ...location,
        distanceKm: getDistanceKm(userLocation, location)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3)
      .map((item, index) => ({
        ...item,
        walkMeters: Math.round(item.distanceKm * 1000),
        walkMinutes: Math.max(1, Math.round((item.distanceKm / Math.max(1.2, userSpeedKmph)) * 60)),
        tip: index === 0 ? "Best nearby footstop" : index === 1 ? "Backup stop" : "Alternative stop"
      }));
  }, [userLocation, locations, userSpeedKmph]);
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

  const rankedBuses = useMemo(() => rankBusesWithAIModel(buses), [buses]);
  const firstArrivingBus = rankedBuses[0];

  const mapTripBuses = (tripBuses, routeName) =>
    (tripBuses || []).map((bus) => ({
      id: `BUS-${bus.busId}`,
      backendBusId: bus.busId,
      line: bus.number,
      road: routeName,
      eta: bus.etaMinutes,
      load: Math.round(((40 - bus.seatsLeft) / 40) * 100),
      fare: 15,
      nexusScore: bus.nexusScore || 72,
      confidencePercent: bus.confidencePercent || 75,
      boardingAdvice: bus.boardingAdvice || "Stand near MIDDLE door",
      boardingZoneHint: bus.boardingZoneHint || "Middle door, 10m ahead",
      safetyScore: typeof bus.safetyScore === "number" ? bus.safetyScore : bus.isWomenFriendly ? 88 : 72,
      womenPriority: bus.womenPriority || (bus.isWomenFriendly ? "Women & Elderly Priority Bus" : "Standard Bus"),
      isWomenFriendly: Boolean(bus.isWomenFriendly)
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
      setAiSuggestion(payload.aiSuggestion || payload.smartStopAssistant || null);
      setBookingMessage(payload.message || "Live route loaded from backend.");

      if (payload.smartStopAssistant?.status === "guaranteed-seat-bus") {
        onNotify?.(
          "Recommended Bus",
          `${payload.smartStopAssistant.recommendedBusNumber} in ~${payload.guaranteedSeatBus?.etaMinutes || payload.smartStopAssistant.etaMinutes || "--"} mins. ${payload.smartStopAssistant.boardingZoneHint || "Stand near front door."}`,
          "success",
          "smartStop"
        );
      } else if (payload.smartStopAssistant?.status === "walk-alternative-stop" && payload.alternativeStopOption) {
        onNotify?.(
          "Walk To Better Footstop",
          `Walk ${payload.alternativeStopOption.walkMeters}m to ${payload.alternativeStopOption.stopName} for faster pickup.`,
          "warn",
          "smartStop"
        );
      }
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
  }, [locations.length, fromId, toId]);

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
                load: Math.round((update.occupied / update.capacity) * 100)
              }
            : bus
        )
      );

      if (userLocation) {
        const distanceToUserKm = getDistanceKm(userLocation, { lat: update.lat, lng: update.lng });
        if (distanceToUserKm <= 0.45 && !notifiedBusNearRef.current.has(update.busId)) {
          notifiedBusNearRef.current.add(update.busId);
          onNotify?.(
            "Bus Near Your Stop",
            `${update.number} is ${(distanceToUserKm * 1000).toFixed(0)}m away. Move to boarding zone now.`,
            "info",
            "busNear"
          );
        }
      }
    });

    socket.on("booking-update", (payload) => {
      onNotify?.(
        "Booking Confirmed",
        `Booking ${payload.bookingId} confirmed for bus ${payload.busId}.`,
        "success",
        "bookingConfirmed"
      );
    });

    socket.on("booking-expired", (payload) => {
      onNotify?.(
        "Booking Hold Expired",
        `${payload.count} pending bookings expired. Rebook to continue journey.`,
        "warn",
        "seatHold"
      );
    });

    socket.on("safety-alert", (payload) => {
      onNotify?.(
        "Safety Alert",
        payload.message || `Issue reported for bus ${payload.busId}`,
        "danger",
        "safety"
      );
    });

    return () => socket.disconnect();
  }, [onNotify, userLocation]);

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

    const totalFare = chosenBus.fare;
    if (walletBalance < totalFare) {
      setBookingMessage(`Insufficient balance for ${paymentMethod}. Required Rs ${totalFare}.`);
      return;
    }

    try {
      const response = await fetch(`${backendBase}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: chosenBus.backendBusId, seats: 1, userId: userId || "demo-user" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Booking failed");

      setWalletBalance((prev) => prev - totalFare);
      setBuses((prev) =>
        prev.map((bus) =>
          bus.id === chosenBus.id
            ? {
                ...bus,
                load: Math.min(100, bus.load + 3)
              }
            : bus
        )
      );
      const perkText = payload.perkApplied === "100_RIDES_FREE_TICKET"
        ? "Free ticket credit applied"
        : payload.perkApplied === "50_RIDES_DISCOUNT"
          ? "20% loyalty discount applied"
          : "Standard fare";
      setBookingMessage(`Ticket hold ${payload.bookingId} created. Amount: Rs ${payload.amount}. ${perkText}.`);
      onNotify?.(
        "Ticket Hold Created",
        `Ticket hold created for ${chosenBus.line}. Complete payment to confirm.`,
        "info",
        "seatHold"
      );

      const confirmResponse = await fetch(`${backendBase}/api/payment/success`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: payload.bookingId,
          paymentProvider: paymentMethod,
          transactionId: `SIM-${Date.now()}`
        })
      });
      const confirmPayload = await confirmResponse.json();
      if (confirmResponse.ok && confirmPayload.status === "confirmed") {
        const ridesCompleted = confirmPayload.profile?.ridesCompleted;
        const points = confirmPayload.profile?.points;
        const perkApplied = confirmPayload.ticket?.perkApplied;
        const rewardNote = ridesCompleted != null && points != null
          ? `Rides: ${ridesCompleted} | Points: ${points}.`
          : "";
        const perkNote = perkApplied === "100_RIDES_FREE_TICKET"
          ? "100-ride free ticket applied."
          : perkApplied === "50_RIDES_DISCOUNT"
            ? "50-ride discount applied."
            : "";
        setBookingMessage(`Ticket confirmed. Ticket ${confirmPayload.ticket.ticketId} issued. ${perkNote} ${rewardNote}`.trim());
        onNotify?.(
          "Ticket Confirmed",
          `Ticket ${confirmPayload.ticket.ticketId} confirmed for ${chosenBus.line}.`,
          "success",
          "bookingConfirmed"
        );
        onTicketPurchased?.();
      }
    } catch (error) {
      setBookingMessage(`Booking failed: ${error.message}`);
      onNotify?.("Booking Failed", error.message, "danger", "bookingConfirmed");
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
            <button type="button" className="solid-btn wide" onClick={handleSearch}>Search Routes</button>
            <button
              type="button"
              className="ask-ai-btn"
              onClick={() => window.alert("Nexus AI simulated 47 future scenarios. This route saves you 8 minutes vs Mo Bus today.")}
            >
              Ask Nexus AI - What if I leave 10 mins later?
            </button>

            <div className="route-metrics glass-card">
              <p><strong>Live Source:</strong> Nexus Neural Net</p>
              <p><strong>Socket:</strong> {socketConnected ? "Connected" : "Disconnected"}</p>
              <p><strong>AI Confidence:</strong> {nexusAiConfidence}%</p>
              <p><strong>Your Speed:</strong> {userSpeedKmph.toFixed(1)} km/h</p>
              <p><strong>Nearest Stop:</strong> {nearestStopFromUser ? nearestStopFromUser.name : "Locating..."}</p>
              <p><strong>Tracker:</strong> {nearestStopFromUser ? `${guidanceDirection} • ${(nearestStopFromUser.distance * 1000).toFixed(0)} m` : "Enable location permission"}</p>
              <p><strong>Shortest:</strong> {tripDistanceKm > 0 ? `${tripDistanceKm.toFixed(2)} km (Blue)` : "N/A"}</p>
              <p><strong>Optimized:</strong> {tripFastestMin > 0 ? `${tripFastestMin.toFixed(1)} min highlighted route` : "N/A"}</p>
            </div>

            <div className="footstop-cards">
              {nearestFootStops.map((stop) => (
                <article key={stop.id} className="footstop-card glass-card lift-card">
                  <div className="footstop-head">
                    <strong>{stop.name}</strong>
                    <span>{stop.walkMeters}m</span>
                  </div>
                  <p>{stop.tip}</p>
                  <small>{getDirectionText(userLocation || stop, stop)} • {stop.walkMinutes} min walk</small>
                </article>
              ))}
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
                <p className="nexus-ai-score">NEXUS AI SCORE: {firstArrivingBus.nexusScore}/100 • Fastest route confidence</p>
              )}
              <div className="small-tiles">
                <span>Capacity: {firstArrivingBus ? `${firstArrivingBus.load}%` : "--"}</span>
                <span>Distance: {tripDistanceKm.toFixed(2)} km</span>
                <span>AI Suggestion: {firstArrivingBus ? `${firstArrivingBus.line} recommended` : "Awaiting live stream"}</span>
              </div>
            </article>

            <article className="glass-card map-card-right lift-card">
              <h4>Road-Level Bus Options</h4>
              <p>Showing first arrivals with safety and boarding guidance.</p>
              {aiSuggestion && (
                <div className="ai-suggestion-box">
                  <h5>{aiSuggestion.title || "Nexus Smart Stop Insight"}</h5>
                  <p>{aiSuggestion.recommendation || aiSuggestion.message}</p>
                  <small>
                    Condition: {aiSuggestion.routeCondition || "city-traffic"} • Confidence: {aiSuggestion.confidence || nexusAiConfidence}% • Stop: {aiSuggestion.nearestStopName || aiSuggestion.alternativeStop?.stopName || "N/A"}
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
                      <p>{bus.eta} min | Load: {bus.load}%</p>
                      <p>{bus.boardingAdvice} • {bus.boardingZoneHint}</p>
                      <p>{bus.womenPriority} • Safety {bus.safetyScore}/100</p>
                      <p className="nexus-ai-score">NEXUS AI SCORE: {bus.nexusScore}/100</p>
                    </div>
                    <span className={bus.load >= 90 ? "status-pill late" : bus.load >= 70 ? "status-pill warn" : "status-pill good"}>
                      {bus.load >= 90 ? "High Load" : bus.load >= 70 ? "Moderate" : "Smooth"}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="tracking-bottom-panels">
            <article className="glass-card booking-panel">
              <h4>Buy Your Ticket</h4>
              <p>Buy ticket for your preferred bus. Loyalty perks are applied automatically.</p>
              <label>
                <span>Choose Bus</span>
                <select value={selectedBusId} onChange={(event) => setSelectedBusId(event.target.value)}>
                  <option value="">Select bus</option>
                  {rankedBuses.map((bus) => (
                    <option key={bus.id} value={bus.id}>{bus.line} | {bus.eta} min | Load {bus.load}%</option>
                  ))}
                </select>
              </label>
              <button type="button" className="solid-btn wide" onClick={handleBook}>Buy Ticket</button>
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
          </div>
        </section>
      </section>
    </section>
  );
}

function ScheduleView({ day, setDay, onMapOpen, onNotify }) {
  const [searchText, setSearchText] = useState("");
  const [scheduleRowsLive, setScheduleRowsLive] = useState(scheduleRows);
  const [routesCount, setRoutesCount] = useState(0);
  const [womenFriendlyCount, setWomenFriendlyCount] = useState(0);
  const [avgWomenSeats, setAvgWomenSeats] = useState(0);
  const [rapidBusId, setRapidBusId] = useState("");
  const [rapidSeatType, setRapidSeatType] = useState("general");
  const [rapidSeats, setRapidSeats] = useState(1);
  const [rapidPaymentMethod, setRapidPaymentMethod] = useState("UPI");
  const [rapidWallet, setRapidWallet] = useState(1600);
  const [rapidMessage, setRapidMessage] = useState("Rapid booking ready. Choose bus and seat type.");
  const [isRapidWindowOpen, setIsRapidWindowOpen] = useState(false);
  const [lastVacancyCheck, setLastVacancyCheck] = useState("Not checked");
  const [isVacancyRefreshing, setIsVacancyRefreshing] = useState(false);

  const loadScheduleData = useCallback(async () => {
    const [routesRes, busesRes, safetyRes] = await Promise.all([
      fetch(`${BACKEND_BASE}/api/routes`),
      fetch(`${BACKEND_BASE}/api/buses`),
      fetch(`${BACKEND_BASE}/api/buses/safety`)
    ]);

    if (!routesRes.ok || !busesRes.ok || !safetyRes.ok) {
      throw new Error("Failed to fetch schedule feeds");
    }

    const routes = await routesRes.json();
    const buses = await busesRes.json();
    const safetyList = await safetyRes.json();

    const safetyByBusId = new Map(
      safetyList.map((item) => [Number(item.busId), item])
    );

    setRoutesCount(routes.length);

    const womenFriendly = safetyList.filter((item) => Number(item.womenSeatsMarked || 0) >= 6).length;
    setWomenFriendlyCount(womenFriendly);
    const avgSeats = safetyList.length
      ? Math.round(safetyList.reduce((sum, item) => sum + Number(item.womenSeatsMarked || 0), 0) / safetyList.length)
      : 0;
    setAvgWomenSeats(avgSeats);

    const rows = buses.map((bus, idx) => {
      const route = routes.find((r) => Number(r.id) === Number(bus.routeId));
      const safety = safetyByBusId.get(Number(bus.id));
      const capacity = Math.max(1, Number(bus.capacity || 40));
      const seatsLeft = Math.max(0, capacity - Number(bus.occupied || 0));
      const load = Math.min(100, Math.round((Number(bus.occupied || 0) / capacity) * 100));
      const etaMinutes = Math.max(1, Math.round(3 + ((Number(bus.currentIndex || 0) + Number(bus.progress || 0)) * 4) + idx % 6));
      const hh = String(7 + Math.floor((idx % 8) / 2)).padStart(2, "0");
      const mm = String((idx * 7) % 60).padStart(2, "0");

      return {
        id: Number(bus.id),
        backendBusId: Number(bus.id),
        code: `N${String(Number(bus.id)).padStart(2, "0")}`,
        name: route?.name || bus.number || `Line ${Number(bus.routeId)}`,
        load,
        time: `${hh}:${mm}`,
        status: load > 90 ? `Crowded | ETA ${etaMinutes}m` : `On Time | ETA ${etaMinutes}m`,
        statusKind: load > 90 ? "late" : "good",
        seatsLeft,
        capacity,
        womenSeats: Number(safety?.womenSeatsMarked || 0),
        panicSupport: Boolean(safety?.panicSupport),
        cleanlinessScore: Number(safety?.cleanlinessScore || 0),
        driverRating: Number(safety?.driverRating || 0),
        safetyTag: Number(safety?.womenSeatsMarked || 0) >= 6 ? "Women Priority" : "Standard"
      };
    });

    setScheduleRowsLive(rows);
    setRapidBusId((current) => {
      if (current && rows.some((item) => String(item.backendBusId) === String(current))) {
        return current;
      }
      return rows.length ? String(rows[0].backendBusId) : "";
    });
    setLastVacancyCheck(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadScheduleData();
      } catch (error) {
        setRapidMessage(`Live schedule fallback in use: ${error.message}`);
      }
    };

    bootstrap();
  }, [loadScheduleData]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return scheduleRowsLive;
    return scheduleRowsLive.filter((item) =>
      item.name.toLowerCase().includes(query)
      || item.code.toLowerCase().includes(query)
      || item.status.toLowerCase().includes(query)
    );
  }, [scheduleRowsLive, searchText]);

  const selectedRapidBus = scheduleRowsLive.find((item) => String(item.backendBusId) === String(rapidBusId));
  const womenSeatVacancy = selectedRapidBus ? Math.min(selectedRapidBus.seatsLeft, selectedRapidBus.womenSeats) : 0;
  const liveVacancyRatio = selectedRapidBus ? Math.round((selectedRapidBus.seatsLeft / Math.max(1, selectedRapidBus.capacity || 1)) * 100) : 0;
  const availabilityStatus = !selectedRapidBus
    ? "No Bus Selected"
    : selectedRapidBus.seatsLeft === 0
      ? "Sold Out"
      : selectedRapidBus.seatsLeft <= 5
        ? "Filling Fast"
        : "Available";
  const seatTypeMultiplier = rapidSeatType === "women_priority" ? 1.2 : rapidSeatType === "elderly_priority" ? 1.15 : rapidSeatType === "window" ? 1.08 : 1.0;
  const rapidFare = selectedRapidBus ? Math.round((18 + selectedRapidBus.load * 0.1) * seatTypeMultiplier * rapidSeats) : 0;

  const handleLiveVacancyCheck = async () => {
    setIsVacancyRefreshing(true);
    try {
      await loadScheduleData();
      if (selectedRapidBus) {
        setRapidMessage(`Live vacancy refreshed for ${selectedRapidBus.code}.`);
      } else {
        setRapidMessage("Live vacancy refreshed.");
      }
    } catch (error) {
      setRapidMessage(`Vacancy refresh failed: ${error.message}`);
    } finally {
      setIsVacancyRefreshing(false);
    }
  };

  const handleRapidBooking = async () => {
    if (!selectedRapidBus) {
      setRapidMessage("Select a live bus for rapid booking.");
      return;
    }

    if (selectedRapidBus.seatsLeft < rapidSeats) {
      setRapidMessage(`Only ${selectedRapidBus.seatsLeft} seats left on this bus.`);
      return;
    }

    if (rapidWallet < rapidFare) {
      setRapidMessage(`Insufficient wallet balance. Need Rs ${rapidFare}.`);
      return;
    }

    try {
      const holdRes = await fetch(`${BACKEND_BASE}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: selectedRapidBus.backendBusId, seats: rapidSeats })
      });
      const holdPayload = await holdRes.json();
      if (!holdRes.ok) throw new Error(holdPayload.error || "Rapid hold failed");

      const paymentRes = await fetch(`${BACKEND_BASE}/api/payment/success`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: holdPayload.bookingId,
          paymentProvider: rapidPaymentMethod,
          transactionId: `RAPID-${Date.now()}`
        })
      });
      const paymentPayload = await paymentRes.json();

      if (!paymentRes.ok || paymentPayload.status !== "confirmed") {
        throw new Error(paymentPayload.error || "Rapid confirmation failed");
      }

      setRapidWallet((prev) => prev - rapidFare);
      setScheduleRowsLive((prevRows) => prevRows.map((row) => {
        if (row.backendBusId !== selectedRapidBus.backendBusId) return row;
        const nextSeatsLeft = Math.max(0, row.seatsLeft - rapidSeats);
        const nextWomenSeats = rapidSeatType === "women_priority"
          ? Math.max(0, row.womenSeats - rapidSeats)
          : row.womenSeats;
        const nextLoad = Math.min(100, Math.round(((row.capacity - nextSeatsLeft) / Math.max(1, row.capacity)) * 100));
        return {
          ...row,
          seatsLeft: nextSeatsLeft,
          womenSeats: nextWomenSeats,
          load: nextLoad,
          status: nextLoad > 90 ? row.status.replace("On Time", "Crowded") : row.status
        };
      }));
      const projectedSeatsLeft = Math.max(0, selectedRapidBus.seatsLeft - rapidSeats);
      const projectedWomenVacancy = rapidSeatType === "women_priority"
        ? Math.max(0, womenSeatVacancy - rapidSeats)
        : womenSeatVacancy;
      setRapidMessage(`Rapid booking confirmed. Ticket ${paymentPayload.ticket.ticketId} issued. Live seats now ${projectedSeatsLeft}. Women seats now ${projectedWomenVacancy}.`);
      onNotify?.(
        "Rapid Booking Confirmed",
        `Ticket ${paymentPayload.ticket.ticketId} confirmed with ${rapidSeatType.replace("_", " ")} seating.`,
        "success",
        "bookingConfirmed"
      );
      await loadScheduleData();
    } catch (error) {
      setRapidMessage(`Rapid booking failed: ${error.message}`);
      onNotify?.("Rapid Booking Failed", error.message, "danger", "bookingConfirmed");
    }
  };

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

          <article className="schedule-quick-book glass-card">
            <h4>Book Seat</h4>
            <p>Open quick booking window with live seat, women-seat, and payment details.</p>
            <button type="button" className="solid-btn wide" onClick={() => setIsRapidWindowOpen(true)}>Open Booking Window</button>
          </article>

        </aside>

        <section className="schedule-main">
          <div className="top-copy">
            <p className="eyebrow">Network Status: Operational</p>
            <h2>
              Timetable & <span>Schedules</span>
            </h2>
            <p>Live JSON schedule with women safety, seating intelligence, security controls, and monetized rapid booking.</p>
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
            <input
              type="text"
              placeholder="Search by route name, station, or vehicle ID..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <button type="button" className="solid-btn">Find</button>
          </div>

          <div className="schedule-grid">
            <article className="hub-table">
              <header>
                <div>
                  <h3>Main Terminal Hub</h3>
                  <p>{routesCount} active routes | {filteredRows.length} live buses in schedule stream</p>
                </div>
                <span className="tag-ok">Live Updates</span>
              </header>

              <div className="rows-wrap">
                {filteredRows.slice(0, 12).map((item) => (
                  <article className="row-item lift-card" key={`${item.code}-${item.id}`}>
                    <span className="code-pill">{item.code}</span>
                    <div className="row-data">
                      <h4>{item.name}</h4>
                      <div className="load-line">
                        <span>{item.load}% full</span>
                        <div className="load-track">
                          <div className="load-fill" style={{ width: `${item.load}%` }} />
                        </div>
                      </div>
                      <p className="row-meta">Seats left: {item.seatsLeft} | Women seats: {item.womenSeats} | Panic support: {item.panicSupport ? "Yes" : "No"}</p>
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
              <h3>Safety & Seating Intelligence</h3>
              <div className="int-row">
                <p>Women-Friendly Fleet</p>
                <strong>{womenFriendlyCount} buses</strong>
                <div className="int-track"><span style={{ width: `${Math.min(100, womenFriendlyCount * 8)}%` }} /></div>
              </div>
              <div className="int-row">
                <p>Avg Reserved Women Seats</p>
                <strong>{avgWomenSeats} seats</strong>
                <div className="int-track"><span style={{ width: `${Math.min(100, avgWomenSeats * 9)}%` }} /></div>
              </div>

              <article className="demand-card">
                <h4>Security Options Active</h4>
                <p>SOS trigger, panic support buses, women priority seats, elderly-priority boarding, and live issue reporting are enabled.</p>
              </article>
            </aside>
          </div>

          {isRapidWindowOpen && (
            <div className="rapid-modal-backdrop" onClick={() => setIsRapidWindowOpen(false)}>
              <article className="rapid-modal-window demand-card" onClick={(event) => event.stopPropagation()}>
                <div className="rapid-modal-head">
                  <h4>Rapid Booking & Monetization</h4>
                  <button type="button" className="text-btn" onClick={() => setIsRapidWindowOpen(false)}>Close</button>
                </div>
                <div className="rapid-booking-grid">
                  <label>
                    <span>Bus</span>
                    <select value={rapidBusId} onChange={(event) => setRapidBusId(event.target.value)}>
                      <option value="">Select live bus</option>
                      {scheduleRowsLive.map((item) => (
                        <option key={`rapid-${item.backendBusId}`} value={item.backendBusId}>
                          {item.code} | Seats {item.seatsLeft} | {item.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Seating Option</span>
                    <select value={rapidSeatType} onChange={(event) => setRapidSeatType(event.target.value)}>
                      <option value="general">General Seat</option>
                      <option value="window">Window Seat</option>
                      <option value="women_priority">Women Priority Seat</option>
                      <option value="elderly_priority">Elderly Priority Seat</option>
                    </select>
                  </label>

                  <label>
                    <span>Seats</span>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={rapidSeats}
                      onChange={(event) => setRapidSeats(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>

                  <label>
                    <span>Payment</span>
                    <select value={rapidPaymentMethod} onChange={(event) => setRapidPaymentMethod(event.target.value)}>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                      <option value="Transit Wallet">Transit Wallet</option>
                    </select>
                  </label>
                </div>

                <p className="rapid-wallet">Wallet Balance: Rs {rapidWallet} | Rapid Fare: Rs {rapidFare}</p>
                <div className="rapid-facility-strip">
                  <span className="rapid-chip">Women Seats: {womenSeatVacancy} live</span>
                  <span className="rapid-chip">Live Vacancy: {selectedRapidBus ? `${selectedRapidBus.seatsLeft}/${selectedRapidBus.capacity}` : "--"}</span>
                  <span className={`rapid-chip status ${availabilityStatus === "Available" ? "ok" : availabilityStatus === "Filling Fast" ? "warn" : "danger"}`}>{availabilityStatus}</span>
                </div>
                <p className="rapid-vacancy-meta">Last vacancy check: {lastVacancyCheck} | Live vacancy: {liveVacancyRatio}%</p>
                <button type="button" className="soft-btn wide" onClick={handleLiveVacancyCheck} disabled={isVacancyRefreshing}>
                  {isVacancyRefreshing ? "Refreshing Vacancy..." : "Check Current Live Vacancy Status"}
                </button>
                <button type="button" className="solid-btn wide" onClick={handleRapidBooking}>Confirm Rapid Booking</button>
                <p className="rapid-booking-status">{rapidMessage}</p>
              </article>
            </div>
          )}

          <article className="visual-nav-banner lift-card" style={{ position: "relative", overflow: "hidden" }}>
            <img src="assets/visual_nav_bg.png" alt="Network map visual" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
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