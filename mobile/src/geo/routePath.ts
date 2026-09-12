/** Street-route helpers shared with the web follow camera. */

export type Coord = { latitude: number; longitude: number };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function metersBetween(a: Coord, b: Coord): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x = Math.sin(dLng) * Math.cos(p2);
  const y = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLng);
  return (Math.atan2(x, y) * (180 / Math.PI) + 360) % 360;
}

export function lerpAngleDegrees(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export function interpolateAlong(
  path: Coord[],
  t: number,
): { latitude: number; longitude: number; heading: number } {
  const clamped = Math.min(1, Math.max(0, t));
  if (path.length === 0) return { latitude: 0, longitude: 0, heading: 0 };
  if (path.length === 1) return { latitude: path[0].latitude, longitude: path[0].longitude, heading: 0 };

  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.max(metersBetween(path[i], path[i + 1]), 0.01);
    segs.push(d);
    total += d;
  }

  const target = clamped * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i];
    if (acc + d >= target) {
      const local = (target - acc) / d;
      return {
        latitude: path[i].latitude + (path[i + 1].latitude - path[i].latitude) * local,
        longitude: path[i].longitude + (path[i + 1].longitude - path[i].longitude) * local,
        heading: bearingDegrees(path[i].latitude, path[i].longitude, path[i + 1].latitude, path[i + 1].longitude),
      };
    }
    acc += d;
  }

  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  return {
    latitude: last.latitude,
    longitude: last.longitude,
    heading: bearingDegrees(prev.latitude, prev.longitude, last.latitude, last.longitude),
  };
}

/** Project a GPS fix onto the polyline so the chevron stays on the street. */
export function snapToPath(
  path: Coord[],
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number; heading: number; progress: number } {
  if (path.length === 0) return { latitude, longitude, heading: 0, progress: 0 };
  if (path.length === 1) {
    return { latitude: path[0].latitude, longitude: path[0].longitude, heading: 0, progress: 0 };
  }

  let bestDist = Infinity;
  let bestLat = path[0].latitude;
  let bestLng = path[0].longitude;
  let bestHeading = 0;
  let bestAlong = 0;
  let total = 0;
  const segs: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.max(metersBetween(path[i], path[i + 1]), 0.01);
    segs.push(d);
    total += d;
  }

  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b.longitude - a.longitude;
    const vy = b.latitude - a.latitude;
    const wx = longitude - a.longitude;
    const wy = latitude - a.latitude;
    const len2 = vx * vx + vy * vy || 1e-12;
    const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2));
    const plng = a.longitude + vx * t;
    const plat = a.latitude + vy * t;
    const dist = haversineKm(latitude, longitude, plat, plng);
    if (dist < bestDist) {
      bestDist = dist;
      bestLat = plat;
      bestLng = plng;
      bestHeading = bearingDegrees(a.latitude, a.longitude, b.latitude, b.longitude);
      bestAlong = acc + segs[i] * t;
    }
    acc += segs[i];
  }

  return {
    latitude: bestLat,
    longitude: bestLng,
    heading: bestHeading,
    progress: total > 0 ? bestAlong / total : 0,
  };
}
