// data.js
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // meters
};

const locations = [
  { id: 1, name: "Master Canteen", lat: 20.2647, lng: 85.8078, type: "major_hub" },
  { id: 2, name: "Baramunda ISBT", lat: 20.2805, lng: 85.7802 },
  { id: 3, name: "KIIT Square", lat: 20.3528, lng: 85.8192 },
  { id: 4, name: "Khandagiri Square", lat: 20.2635, lng: 85.7850 },
  { id: 5, name: "Rasulgarh Square", lat: 20.2780, lng: 85.8200 },
  { id: 6, name: "Bhubaneswar Railway Station", lat: 20.2658, lng: 85.8415 },
  { id: 7, name: "AIIMS Bhubaneswar", lat: 20.2800, lng: 85.8200 },
  { id: 8, name: "Biju Patnaik Airport", lat: 20.2444, lng: 85.8178 },
  { id: 9, name: "Lingaraj Temple Area", lat: 20.2382, lng: 85.8315 },
  { id: 10, name: "Patia Square", lat: 20.3600, lng: 85.8100 },
  { id: 11, name: "Jaydev Vihar", lat: 20.3100, lng: 85.8200 },
  { id: 12, name: "Sailashree Vihar", lat: 20.3400, lng: 85.8300 },
  { id: 13, name: "Acharya Vihar Square", lat: 20.2950, lng: 85.8150 },
  { id: 14, name: "Kalpana Square", lat: 20.2700, lng: 85.8400 },
  { id: 15, name: "Nandankanan Road", lat: 20.3950, lng: 85.8200 }
];

const routeBlueprints = [
  { id: 1, name: "Route 101 - Master Canteen ↔ KIIT ↔ Nandankanan", stops: [1, 5, 11, 3, 15] },
  { id: 2, name: "Route 102 - Baramunda ↔ Airport ↔ Railway", stops: [2, 4, 8, 9, 14, 6] },
  { id: 3, name: "Route 103 - AIIMS ↔ Rasulgarh ↔ Railway", stops: [7, 5, 1, 14, 6] },
  { id: 4, name: "Route 104 - Patia ↔ Sailashree ↔ Master Canteen", stops: [10, 12, 3, 11, 13, 1] },
  { id: 5, name: "Route 105 - Nandankanan ↔ KIIT ↔ Rasulgarh ↔ Railway", stops: [15, 10, 3, 13, 5, 6] },
  { id: 6, name: "Route 106 - Airport ↔ Lingaraj ↔ Baramunda", stops: [8, 9, 14, 1, 4, 2] },
  { id: 7, name: "Route 107 - AIIMS ↔ Acharya Vihar ↔ Sailashree", stops: [7, 5, 13, 11, 12] },
  { id: 8, name: "Route 108 - Railway ↔ Rasulgarh ↔ KIIT ↔ Patia", stops: [6, 14, 5, 11, 3, 10] },
  { id: 9, name: "Route 109 - Baramunda ↔ Khandagiri ↔ Jaydev Vihar", stops: [2, 4, 1, 13, 11] },
  { id: 10, name: "Route 110 - Lingaraj ↔ Railway ↔ KIIT ↔ Sailashree", stops: [9, 6, 5, 3, 12] }
];

const routes = routeBlueprints.map((route) => ({
  ...route,
  points: route.stops
    .map((stopId) => {
      const stop = locations.find((loc) => loc.id === stopId);
      return stop ? { lat: stop.lat, lng: stop.lng } : null;
    })
    .filter(Boolean)
}));

const buses = [];
let busId = 1;

routes.forEach((route) => {
  const maxIndex = Math.max(0, route.points.length - 2);
  for (let lane = 0; lane < 3; lane += 1) {
    const seed = busId * 19;
    const capacity = 40;
    const occupied = Math.max(5, Math.min(36, 7 + (seed % 29)));
    buses.push({
      id: busId,
      number: `OD 01 MB ${String(100 + busId).padStart(3, '0')}`,
      routeId: route.id,
      capacity,
      occupied,
      currentIndex: maxIndex ? (seed % (maxIndex + 1)) : 0,
      progress: Number((((seed % 80) + 10) / 100).toFixed(2)),
      speed: 24 + (seed % 18),
      direction: lane % 2 === 0 ? 1 : -1
    });
    busId += 1;
  }
});

module.exports = {
  haversine,
  locations,
  routes,
  buses
};
