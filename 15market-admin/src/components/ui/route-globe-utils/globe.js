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

// Returns up to `count` unit vectors of land, cached process-wide. The lattice
// is ordered, so slicing the first N keeps an even sub-sampling.
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

// Sphere rendering: rim glow + front-facing land dot cloud. Dots are their
// brightest dead-center and fall off toward the limb like real optics.
export function drawGlobe(ctx, dots, vp, land, grain, glow) {
    const { cx, cy, r, yaw, tilt } = vp;
    ctx.globalAlpha = 1;

    // atmospheric rim glow — a ring just outside the sphere
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
