// GlobePulse — cobe-powered animated globe with pulsing activity pins.
//   import { GlobePulse } from "@/components/ui/component";
//
//   <GlobePulse
//     markers={[{ id: "US", location: [38.9, -77.0], delay: 0 }]}   // id powers the halo CSS anchors
//     visibleCount={2}                                              // how many pins pulse at full size
//     light={false}                                                 // false = dark scheme, true = light scheme
//   />
import { useEffect, useRef, useCallback, useState } from "react";
import createGlobe from "cobe";

// Fitting the canvas: side = min(box width, box height) via ResizeObserver
// so the full sphere is always visible — never clipped, with or without pins.
function useFittedSize(wrapperRef) {
    const [side, setSide] = useState(0);
    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const measure = () => setSide(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    }, []);
    return side;
}

// The cobe configuration the dots are proven to render with (VIGIL-sourced
// structure): dark sphere, mapBrightness 6, diffuse 1.5 — brighter bases or
// higher brightness values kill the landmask shading. The dot color drives
// from baseColor, so the brand green lives there (dots saturate to a bright
// mint near the center and stay clearly green toward the rim).
const SCHEMES = {
    dark: {
        cobe: {
            dark: 1,
            diffuse: 1.5,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.24, 0.7, 0.44],        // #3CB371 — brand mint dots
            markerColor: [0.24, 0.7, 0.44],
            glowColor: [0.02, 0.1, 0.06],        // deep green rim glow
            opacity: 0.85,
        },
        theta: 0.2,
        baseTilt: 0.2,
        halo: "#3CB371",
        haloRing: "#0A0A0F",
    },
    light: {
        cobe: {
            dark: 0,
            diffuse: 1.2,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.72, 0.9, 0.78],        // pale mint sphere, darker green land
            markerColor: [0.1, 0.38, 0.25],
            glowColor: [0.55, 0.75, 0.6],
            opacity: 0.85,
        },
        theta: 0.2,
        baseTilt: 0.2,
        halo: "#1A6140",
        haloRing: "#F4F7F5",
    },
};

export function GlobePulse({
    markers = [],
    visibleCount,
    light = false,
    className = "",
    maxSide = 320,
}) {
    const wrapperRef = useRef(null);
    const canvasRef = useRef(null);
    const globeRef = useRef(null);
    const phiRef = useRef(0);
    const pointerInteracting = useRef(null);
    const dragOffset = useRef({ phi: 0, theta: 0 });
    const phiOffsetRef = useRef(0);
    const thetaOffsetRef = useRef(0);
    const isPausedRef = useRef(false);
    const side = useFittedSize(wrapperRef);
    const scheme = SCHEMES[light ? "light" : "dark"];
    const visible = visibleCount == null ? markers.length : visibleCount;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    const handlePointerDown = useCallback((e) => {
        pointerInteracting.current = { x: e.clientX, y: e.clientY };
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        isPausedRef.current = true;
    }, []);

    const handlePointerUp = useCallback(() => {
        if (pointerInteracting.current !== null) {
            phiOffsetRef.current += dragOffset.current.phi;
            thetaOffsetRef.current += dragOffset.current.theta;
            dragOffset.current = { phi: 0, theta: 0 };
        }
        pointerInteracting.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        isPausedRef.current = false;
    }, []);

    useEffect(() => {
        const onMove = (e) => {
            if (pointerInteracting.current !== null) {
                dragOffset.current = {
                    phi: (e.clientX - pointerInteracting.current.x) / 300,
                    theta: (e.clientY - pointerInteracting.current.y) / 1000,
                };
            }
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerup", handlePointerUp, { passive: true });
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [handlePointerUp]);

    // One cobe instance; rotation and marker sets are pushed through update().
    // Marker identity is stable (id-keyed), so spins/pulses survive pushes.
    const markersKey = JSON.stringify(markers || []);
    useEffect(() => {
        if (!canvasRef.current || !side) return;
        const canvas = canvasRef.current;
        const parsed = JSON.parse(markersKey);

        const globe = createGlobe(canvas, {
            ...scheme.cobe,
            devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            width: side * 2,
            height: side * 2,
            context: { preserveDrawingBuffer: true },
            phi: phiRef.current,
            theta: scheme.baseTilt,
            markers: parsed.map((m, i) => ({
                location: m.location,
                size: m.size != null ? m.size : (i < visibleRef.current ? 0.03 : 0),
                id: m.id,
            })),
        });
        globeRef.current = globe;

        let animationId;
        function animate() {
            if (!isPausedRef.current) phiRef.current += 0.003;   // the globe always turns
            globe.update({
                phi: phiRef.current + phiOffsetRef.current + dragOffset.current.phi,
                theta: scheme.baseTilt + thetaOffsetRef.current + dragOffset.current.theta,
            });
            animationId = requestAnimationFrame(animate);
        }
        animate();

        return () => {
            cancelAnimationFrame(animationId);
            globe.destroy();
            globeRef.current = null;
        };
    }, [side, markersKey]);

    // Marker set changes (new country, live flash) don't rebuild the globe.
    useEffect(() => {
        if (!globeRef.current) return;
        globeRef.current.update({
            markers: (markers || []).map((m, i) => ({
                location: m.location,
                size: m.size != null ? m.size : (i < visible ? 0.03 : 0),
                id: m.id,
            })),
        });
    }, [markersKey, visible]);

    const shown = (markers || []).slice(0, visible);

    return (
        <div
            ref={wrapperRef}
            className={`relative aspect-square select-none ${className}`}
            style={{ width: side || maxSide, height: side || maxSide, maxWidth: "100%" }}
        >
            <style>{`
                @keyframes globe-pulse-ring {
                    0% { transform: scale(0.3); opacity: 0.8; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `}</style>
            <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                style={{
                    width: "100%",
                    height: "100%",
                    cursor: "grab",
                    contain: "layout paint size",
                    touchAction: "none",
                }}
            />
            {shown.map((m) => (
                <div
                    key={m.id}
                    style={{
                        positionAnchor: `--cobe-${m.id}`,
                        bottom: "anchor(center)",
                        left: "anchor(center)",
                        translate: "-50% 50%",
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        opacity: `var(--cobe-visible-${m.id}, 0)`,
                        filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 8px))`,
                        transition: "opacity 0.4s, filter 0.4s",
                    }}
                >
                    <span
                        style={{
                            position: "absolute",
                            inset: 0,
                            border: `2px solid ${scheme.halo}`,
                            borderRadius: "50%",
                            opacity: 0,
                            animation: `globe-pulse-ring 2s ease-out infinite ${m.delay || 0}s`,
                        }}
                    />
                    <span
                        style={{
                            position: "absolute",
                            inset: 0,
                            border: `2px solid ${scheme.halo}`,
                            borderRadius: "50%",
                            opacity: 0,
                            animation: `globe-pulse-ring 2s ease-out infinite ${(m.delay || 0) + 0.5}s`,
                        }}
                    />
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            background: scheme.halo,
                            borderRadius: "50%",
                            boxShadow: `0 0 0 2px ${scheme.haloRing}, 0 0 0 4px ${scheme.halo}`,
                        }}
                    />
                </div>
            ))}
        </div>
    );
}
