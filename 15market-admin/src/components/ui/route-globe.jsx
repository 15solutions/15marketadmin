// RouteGlobe — ported to JSX for the admin console (JS codebase).
// A dotted globe with route arcs from one hub. Each route lifts off the
// surface on a great circle; a comet runs along it and the destination
// pulses when it lands. Drag to spin; it turns slowly on its own.
import { useEffect, useRef, useState } from "react";
import { drawGlobe, landDots, rotate, slerp, toVec } from "./route-globe-utils/globe";
import "./route-globe-utils/global.css";

export function RouteGlobe({
    hub,
    places = [],
    theme,
    motion = "full",
    className = "",
    style,
}) {
    const host = useRef(null);
    const canvas = useRef(null);
    const [hover, setHover] = useState(null);

    useEffect(() => {
        const el = host.current, cv = canvas.current;
        if (!el || !cv) return;
        const ctx = cv.getContext("2d");
        const reduced = motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dots = landDots(window.innerWidth < 640 ? 15000 : 30000);
        const hs = hub ? toVec(hub.lon, hub.lat) : null;
        const routes = (places || []).map((p, i) => ({
            p,
            v: toVec(p.lon, p.lat),
            offset: (places.length ? i / places.length : 0),
        }));
        const RAD = Math.PI / 180;
        const st = {
            // center the hub on the viewer, offset a touch for style
            yaw: (hub ? hub.lon : 0) * RAD - Math.PI / 2 + 0.35,
            tilt: 18 * RAD,
            vy: 0, vt: 0, drag: false, px: 0, py: 0, last: 0, idle: 0,
        };
        let W = 0, H = 0, dpr = 1, raf = 0, alive = true, visible = true;
        const t0 = performance.now();
        const pins = [];

        const size = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = el.clientWidth;
            H = el.clientHeight;
            cv.width = Math.round(W * dpr);
            cv.height = Math.round(H * dpr);
        };
        const project = (v, lift, r, cx, cy) => {
            const [x, y, z] = rotate(v, st.yaw, st.tilt);
            return { x: cx + x * r * lift, y: cy - y * r * lift, z };
        };

        const draw = (now) => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            const r = Math.min(W, H) * 0.42, cx = W / 2, cy = H / 2;
            drawGlobe(ctx, dots, { cx, cy, r, yaw: st.yaw, tilt: st.tilt }, theme.land, Math.max(1.4, r / 150), theme.glow);
            const t = (now - t0) / 1000;
            pins.length = 0;
            ctx.lineCap = "round";
            if (hs) for (const rt of routes) {
                const ang = Math.acos(Math.max(-1, Math.min(1, hs[0] * rt.v[0] + hs[1] * rt.v[1] + hs[2] * rt.v[2])));
                const height = 0.06 + ang * 0.12;
                const pts = [];
                for (let k = 0; k <= 48; k++) {
                    const u = k / 48;
                    pts.push(project(slerp(hs, rt.v, u), 1 + Math.sin(Math.PI * u) * height, r, cx, cy));
                }
                // the arc: faint where it passes behind the globe
                ctx.strokeStyle = theme.arc;
                ctx.lineWidth = 1.1;
                for (let k = 0; k < 48; k++) {
                    const a = pts[k], b = pts[k + 1];
                    const hidden = a.z < 0 && Math.hypot(a.x - cx, a.y - cy) < r;
                    ctx.globalAlpha = hidden ? 0.06 : 0.38;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
                // comet head with a fading tail, looping on its own offset
                const cycle = 3.6, ph = reduced ? 0.999 : (t / cycle + rt.offset) % 1;
                const run = Math.min(1, ph / 0.7);
                const head = Math.floor(run * 48);
                for (let k = Math.max(0, head - 10); k < head; k++) {
                    const a = pts[k], b = pts[k + 1];
                    if (a.z < 0 && Math.hypot(a.x - cx, a.y - cy) < r) continue;
                    ctx.globalAlpha = (1 - (head - k) / 10) * 0.95;
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
                const end = pts[48];
                const front = end.z > 0;
                pins.push({ p: rt.p, x: end.x, y: end.y, front });
                if (front) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = theme.arc;
                    ctx.beginPath();
                    ctx.arc(end.x, end.y, 2.6, 0, Math.PI * 2);
                    ctx.fill();
                    if (ph > 0.7) {
                        const k = (ph - 0.7) / 0.3;
                        ctx.globalAlpha = 1 - k;
                        ctx.lineWidth = 1.4;
                        ctx.beginPath();
                        ctx.arc(end.x, end.y, 3 + k * 16, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
            // the hub
            if (hs) {
                const h = project(hs, 1, r, cx, cy);
                if (h.z > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = theme.text;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3);
                    ctx.strokeStyle = theme.text;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, 9, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        };

        const tick = (now) => {
            raf = 0;
            if (!alive || !visible || document.hidden) return;
            const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0.016;
            st.last = now;
            if (!st.drag) {
                st.yaw += st.vy * dt;
                st.tilt += st.vt * dt;
                st.vy *= Math.pow(0.05, dt);
                st.vt *= Math.pow(0.05, dt);
                if (now - st.idle > 2500) st.yaw += dt * 0.08;
                st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + (18 * RAD - st.tilt) * Math.min(1, dt * 0.4)));
            }
            draw(now);
            raf = requestAnimationFrame(tick);
        };
        const start = () => {
            if (reduced) return draw(performance.now());
            if (!raf && alive) { st.last = 0; raf = requestAnimationFrame(tick); }
        };
        const onDown = (e) => {
            try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            st.drag = true;
            st.px = e.clientX; st.py = e.clientY;
            st.vy = st.vt = 0;
            el.dataset.dragging = "";
        };
        const onMove = (e) => {
            if (st.drag) {
                const r = Math.min(W, H) * 0.42;
                const dx = e.clientX - st.px, dy = e.clientY - st.py;
                st.px = e.clientX; st.py = e.clientY;
                st.yaw -= dx / r;
                st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + dy / r));
                st.vy = (-dx / r) * 30;
                st.vt = (dy / r) * 30;
                st.idle = performance.now();
                if (reduced) draw(performance.now());
                setHover(null);
                return;
            }
            const b = cv.getBoundingClientRect();
            const x = e.clientX - b.left, y = e.clientY - b.top;
            const near = pins.filter(p => p.front)
                .map(p => ({ ...p, d: Math.hypot(p.x - x, p.y - y) }))
                .sort((a, b2) => a.d - b2.d)[0];
            setHover(near && near.d < 18 ? { p: near.p, x: near.x, y: near.y } : null);
        };
        const onUp = () => {
            st.drag = false;
            st.idle = performance.now();
            delete el.dataset.dragging;
        };
        cv.addEventListener("pointerdown", onDown);
        cv.addEventListener("pointermove", onMove);
        cv.addEventListener("pointerup", onUp);
        cv.addEventListener("pointercancel", onUp);
        cv.addEventListener("pointerleave", () => setHover(null));
        const ro = new ResizeObserver(() => { size(); draw(performance.now()); });
        ro.observe(el);
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); });
        io.observe(el);
        const onVis = () => !document.hidden && start();
        document.addEventListener("visibilitychange", onVis);
        size();
        start();
        return () => {
            alive = false;
            cancelAnimationFrame(raf);
            ro.disconnect();
            io.disconnect();
            document.removeEventListener("visibilitychange", onVis);
            cv.removeEventListener("pointerdown", onDown);
            cv.removeEventListener("pointermove", onMove);
            cv.removeEventListener("pointerup", onUp);
            cv.removeEventListener("pointercancel", onUp);
        };
    }, [hub, places, theme, motion]);

    return (
        <div
            ref={host}
            className={`rg ${className}`}
            style={{
                background: theme.ground,
                color: theme.text,
                ["--rg-muted"]: theme.muted,
                ["--rg-arc"]: theme.arc,
                ["--rg-ground"]: theme.ground,
                ...style,
            }}
        >
            <canvas
                ref={canvas}
                className="rg__canvas"
                role="img"
                aria-label={hub ? `A globe with ${places.length} routes from ${hub.name}` : "A globe"}
            />
            {hover && (
                <div className="rg__tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
                    <strong>{hover.p.name}</strong>
                    <span>{hover.p.note}</span>
                </div>
            )}
            <ul className="rg__sr">
                {(places || []).map((p) => (
                    <li key={p.name}>{hub ? `${hub.name} to ${p.name}` : p.name}{p.note ? `, ${p.note}` : ""}</li>
                ))}
            </ul>
        </div>
    );
}

export default RouteGlobe;
