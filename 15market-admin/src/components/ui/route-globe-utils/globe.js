// Math + rendering engine for RouteGlobe. The land cloud comes from
// src/assets/landDots.json — 30k lon/lat pairs generated offline from the
// world atlas (rejection-sampled per polygon area, holes respected), so there
// is no runtime work beyond decoding.
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

// Returns up to `count` unit vectors of land, cached process-wide.
export function landDots(count = 30000) {
    if (!landCache) {
        const { ld } = LAND_DATA;
        const pts = [];
        for (let i = 0; i < ld.length; i += 2) {
            pts.push(toVec(ld[i] / 100, ld[i + 1] / 100));
        }
        landCache = pts;
    }
    return count >= landCache.length ? landCache : landCache.slice(0, count);
}

// Sphere shading + rim glow + the front-facing land dot cloud.
export function drawGlobe(ctx, dots, vp, land, dotSize, glow) {
    const { cx, cy, r, yaw, tilt } = vp;
    ctx.globalAlpha = 1;

    // ambient disc so the globe reads as a solid sphere on any background
    const disc = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    disc.addColorStop(0, "rgba(255,255,255,0.045)");
    disc.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // rim glow ring just outside the sphere
    ctx.save();
    const halo = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r * 1.24);
    halo.addColorStop(0, glow);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.24, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();

    // land dots, backface-culled, limb-darkened
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
        ctx.globalAlpha = 0.32 + 0.68 * z2;
        ctx.fillRect(cx + x1 * r, cy - y2 * r, dotSize, dotSize);
    }
    ctx.globalAlpha = 1;
}
