// lightswind Globe — cobe-powered 3D dotted globe.
//   import Globe from '@/components/lightswind/globe';
//
//   <Globe />                      // defaults: continuous auto-rotate, brand colors
//   <Globe
//     theta={0.2}                  // initial tilt
//     dark={1}
//     scale={1.2}
//     diffuse={1.5}
//     baseColor="#1a1a1a"
//     markerColor="#ff0000"
//     glowColor="#444444"
//     markers={[{ location: [37.75, -122.4], size: 0.1 }]}  // optional pins
//   />
import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

// Accept both "#rrggbb" strings and [r,g,b] tuples — cobe wants float triples.
function toRGB(color, fallback = [0.1, 0.35, 0.25]) {
    if (Array.isArray(color) && color.length === 3) return color;
    if (typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
        const hex = color.slice(1);
        const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
        const n = parseInt(full, 16);
        return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
    return fallback;
}

export default function Globe({
    theta = 0.25,
    dark = 1,
    scale = 1,
    diffuse = 1.2,
    mapSamples = 24000,
    mapBrightness = 6.5,
    baseColor = [0.16, 0.3, 0.23],
    markerColor = [0.35, 0.94, 0.58],
    glowColor = [0.08, 0.3, 0.2],
    markers = [],
    markerDiameter = 0.011,
    offset = [0, 0],
    autoRotate = true,
    rotateSpeed = 0.0035,
    pointerInteractions = true,
    className = "",
    ...props
}) {
    const wrapperRef = useRef();
    const canvasRef = useRef();
    const dragging = useRef(false);
    const lastPointerX = useRef(null);
    const dragOffset = useRef(0);   // user drag deformation of the spin
    const phiRef = useRef(4.05);    // continuous spin accumulator
    const [size, setSize] = useState(0);

    // Square side fits whichever box dimension is smaller, so the whole
    // globe is always fully visible (no clipped poles).
    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const measure = () => setSize(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("resize", measure);
        return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    }, []);

    // Rebuild only when something structural changes; the spin lives in
    // refs so a re-render never resets the rotation.
    const markersKey = JSON.stringify(markers);
    useEffect(() => {
        let destroyed = false;
        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: size * 2,
            height: size * 2,
            phi: phiRef.current,
            theta: theta,
            dark: dark,
            diffuse: diffuse,
            scale: scale,
            mapSamples: mapSamples,
            mapBrightness: mapBrightness,
            baseColor: toRGB(baseColor),
            markerColor: toRGB(markerColor),
            glowColor: toRGB(glowColor),
            markers: JSON.parse(markersKey),
            markerDiameter: markerDiameter,
            offset: offset,
            opacity: 1,
            onRender: (state) => {
                if (destroyed) return;
                // The globe always turns; the user's drag adds on top.
                if (autoRotate && !dragging.current) phiRef.current += rotateSpeed;
                state.phi = phiRef.current + dragOffset.current;
            },
        });
        return () => {
            destroyed = true;
            globe.destroy();
        };
    }, [size, markersKey]);

    return (
        <div
            ref={wrapperRef}
            style={{ width: "100%", height: "100%", position: "relative" }}
            className={`relative overflow-hidden ${className}`}
            {...props}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: `${size || 0}px`,
                    height: `${size || 0}px`,
                    contain: "layout paint size",
                    touchAction: pointerInteractions ? "none" : undefined,
                    opacity: size ? 1 : 0,
                    transition: "opacity 0.4s ease",
                    cursor: pointerInteractions ? "grab" : undefined,
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                }}
                onPointerDown={(e) => {
                    if (!pointerInteractions) return;
                    dragging.current = true;
                    lastPointerX.current = e.clientX;
                    canvasRef.current.style.cursor = "grabbing";
                }}
                onPointerUp={() => {
                    dragging.current = false;
                    lastPointerX.current = null;
                    canvasRef.current.style.cursor = "grab";
                }}
                onPointerLeave={() => {
                    dragging.current = false;
                    lastPointerX.current = null;
                    canvasRef.current.style.cursor = "grab";
                }}
                onMouseMove={(e) => {
                    if (!dragging.current || lastPointerX.current == null) return;
                    dragOffset.current += (e.clientX - lastPointerX.current) / 220;
                    lastPointerX.current = e.clientX;
                }}
            />
        </div>
    );
}
