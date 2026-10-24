// Math + rendering engine for RouteGlobe, matching the reference design:
// a sphere of fine slate land dots over a near-black ground, wrapped in a
// soft blue rim glow, with no filler disc. The land cloud comes from
// src/assets/landDots.json — lon/lat pairs generated offline from the world
// atlas, so there is no runtime geocoding work beyond decoding.
import LAND_DATA from "../../../assets/landDots.json";

const RAD = Math.PI / 180;

export function toVec(lon, lat) {
    const cl = Math.cos(lat * RAD), lo = lon * RAD;
    return [cl * Math.cos(lo), Math.sin(lat * RAD), cl * Math.sin(lo)];
}

// yaw rotates around the screen-up axis (Y), then tilt around X (toward the
// viewer). z > 0 after both rotations means "front-facing".
export function rotate(v, yaw, tilt) {
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const x1 = v[0] * cY + v[2] * sY;
    const z1 = -v[0] * sY + v[2] * cY;
    const cT = Math.cos(tilt), sT = Math.sin(tilt);
    return [x1, v[1] * cT - z1 * sT, v[1] * sT + z1 * cT];
}

export function slerp(a, b, t) {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const ang = Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot);
    if (ang < 1e-6) return a;
    const s = Math.sin(ang);
    const wa = Math.sin((1 - t) * ang) / s;
    const wb = Math.sin(t * ang) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

let landCache = null;
const subsampleCache = new Map();

// Returns `count` unit vectors of land, evenly sub-sampled from the lattice
// and cached process-wide. Stride-sampling (never slicing!) keeps the full
// latitude/longitude coverage — a slice of an ordered lattice drops entire
// latitude bands, which reads as "countries missing from the map".
export function landDots(count = 30000) {
    if (!landCache) {
        const { ld } = LAND_DATA;
        const pts = [];
        for (let i = 0; i < ld.length; i += 2) {
            pts.push(toVec(ld[i] / 100, ld[i + 1] / 100));
        }
        landCache = pts;
    }
    if (count >= landCache.length) return landCache;
    const key = count | 0;
    let out = subsampleCache.get(key);
    if (!out) {
        const step = landCache.length / count;
        out = new Array(count);
        for (let i = 0; i < count; i++) {
            out[i] = landCache[Math.min(landCache.length - 1, Math.floor(i * step))];
        }
        subsampleCache.set(key, out);
    }
    return out;
}

// Sphere rendering: tight limb bloom + green land dot cloud. The ball itself
// stays black (transparent over the page canvas) — only the countries and
// the hair-thin glow at the edge carry color.
export function drawGlobe(ctx, dots, vp, land, grain, glow) {
    const { cx, cy, r, yaw, tilt } = vp;
    ctx.globalAlpha = 1;

    // Limb bloom — a whisper-thin band of glow riding right on the edge,
    // gone by ~1.12r. No interior fill: the ball reads black.
    ctx.save();
    const bloom = ctx.createRadialGradient(cx, cy, r * 0.99, cx, cy, r * 1.12);
    bloom.addColorStop(0, glow);
    bloom.addColorStop(0.35, glow);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // land dots — front hemisphere only, quad-squared falloff so the limb
    // reads dim and the face reads solid
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cT = Math.cos(tilt), sT = Math.sin(tilt);
    ctx.fillStyle = land;
    for (let i = 0; i < dots.length; i++) {
        const v = dots[i];
        const x1 = v[0] * cY + v[2] * sY;
        const z1 = -v[0] * sY + v[2] * cY;
        const y1 = v[1];
        const z2 = y1 * sT + z1 * cT;
        if (z2 < 0) continue;
        const y2 = y1 * cT - z1 * sT;
        ctx.globalAlpha = 0.3 + 0.7 * z2 * z2;
        ctx.fillRect(cx + x1 * r, cy - y2 * r, grain, grain);
    }
    ctx.globalAlpha = 1;
}
