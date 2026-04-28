// src/native/geofence-manager.js
//
// Geofence vía @capacitor/geolocation con watchPosition y comprobación
// haversine en JS. Es más simple y portable que el GeofencingClient nativo
// y, combinado con el Foreground Service, sigue funcionando con app
// minimizada y bajo Doze (el Foreground Service mantiene el GPS activo).
//
// Si quieres latencia menor, sustituye por el GeofencingClient nativo
// invocado desde GeofenceBleService.kt — la API JS es la misma.

import { Geolocation } from '@capacitor/geolocation';

let watchId = null;
let clients = [];                      // [{ id, name, lat, lng, radiusM }]
let currentZone = null;
let listeners = { enter: [], exit: [] };

export const onEnter = (cb) => listeners.enter.push(cb);
export const onExit  = (cb) => listeners.exit.push(cb);

export async function startGeofence(clientList, defaultRadiusM = 35) {
  clients = clientList
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map(c => ({ ...c, radiusM: c.radiusM || defaultRadiusM }));

  await Geolocation.requestPermissions();

  watchId = await Geolocation.watchPosition(
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    (pos, err) => {
      if (err || !pos) return;
      checkZone(pos.coords.latitude, pos.coords.longitude);
    }
  );
}

export async function stopGeofence() {
  if (watchId) { await Geolocation.clearWatch({ id: watchId }); watchId = null; }
  currentZone = null;
}

function checkZone(lat, lng) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const c of clients) {
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < c.radiusM && d < nearestDist) { nearest = c; nearestDist = d; }
  }

  if (nearest && (!currentZone || currentZone.id !== nearest.id)) {
    if (currentZone) listeners.exit.forEach(fn => fn(currentZone));
    currentZone = nearest;
    listeners.enter.forEach(fn => fn(nearest));
  } else if (!nearest && currentZone) {
    listeners.exit.forEach(fn => fn(currentZone));
    currentZone = null;
  }
}

export const getCurrentZone = () => currentZone;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
