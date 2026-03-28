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
  { id: 1, name: "Master Canteen", lat: 20.2647, lng: 85.8078 },
  { id: 2, name: "Baramunda ISBT", lat: 20.2805, lng: 85.7802 },
  { id: 3, name: "KIIT Square", lat: 20.3528, lng: 85.8192 },
  { id: 4, name: "Khandagiri Square", lat: 20.2635, lng: 85.785 },
  { id: 5, name: "Rasulgarh Square", lat: 20.278, lng: 85.82 },
  { id: 6, name: "Bhubaneswar Railway Station", lat: 20.2658, lng: 85.8415 },
  { id: 7, name: "AIIMS Bhubaneswar", lat: 20.28, lng: 85.82 },
  { id: 8, name: "Biju Patnaik Airport", lat: 20.2444, lng: 85.8178 },
  { id: 9, name: "Lingaraj Temple Area", lat: 20.2382, lng: 85.8315 },
  { id: 10, name: "Patia Square", lat: 20.36, lng: 85.81 },
  { id: 11, name: "Jaydev Vihar", lat: 20.31, lng: 85.82 },
  { id: 12, name: "Sailashree Vihar", lat: 20.34, lng: 85.83 }
];

const routes = [
  {
    id: 1,
    name: "Route 101 - Master Canteen ↔ KIIT",
    points: [
      { lat: 20.2647, lng: 85.8078 },
      { lat: 20.27, lng: 85.812 },
      { lat: 20.278, lng: 85.82 },
      { lat: 20.3, lng: 85.8195 },
      { lat: 20.33, lng: 85.819 },
      { lat: 20.3528, lng: 85.8192 }
    ],
    stops: [1, 5, 3]
  }
];

const buses = [
  {
    id: 1,
    number: "OD 01 AB 101",
    routeId: 1,
    capacity: 40,
    occupied: 12,
    currentIndex: 0,
    progress: 0,
    speed: 35,
    direction: 1
  },
  {
    id: 2,
    number: "OD 01 CD 202",
    routeId: 1,
    capacity: 40,
    occupied: 28,
    currentIndex: 2,
    progress: 0.6,
    speed: 32,
    direction: 1
  },
  {
    id: 3,
    number: "OD 01 EF 303",
    routeId: 1,
    capacity: 40,
    occupied: 5,
    currentIndex: 4,
    progress: 0.3,
    speed: 40,
    direction: -1
  }
];

module.exports = {
  haversine,
  locations,
  routes,
  buses
};
