// lightswind Globe — cobe-powered 3D dotted globe.
//   import Globe from '@/components/lightswind/globe';
//
//   <Globe />                      // defaults: slow auto-rotate, brand colors
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

const DEFAULT_MARKERS = [];

export default function Globe({
    theta = 0.25,
    dark = 1,
    scale = 1,
    diffuse = 1.2,
    mapSamples = 17000,
    mapBrightness = 6.5,
    baseColor = [0.16, 0.3, 0.23],
    markerColor = [0.35, 0.94, 0.58],
    glowColor = [0.08, 0.3, 0.2],
    markers = DEFAULT_MARKERS,
    markerDiameter = 0.011,
    offset = [0, 0],
    autoRotate = true,
    rotateSpeed = 0.0045,
    pointerInteractions = true,
    className = "",
    ...props
}) {
    const canvasRef = useRef();
    const pointerInteracting = useRef(null);
    const pointerInteractionMovement = useRef(0);
    const rotation = useRef(theta);
    const [phi, setPhi] = useState(4.05);
    const [width, setWidth] = useState(0);

    // Fit the canvas to its container.
    useEffect(() => {
        const onResize = () => canvasRef.current && setWidth(canvasRef.current.offsetWidth);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        let destroyed = false;
        const base = toRGB(baseColor);
        const marker = toRGB(markerColor);
        const glow = toRGB(glowColor);
        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: width * 2,
            height: width * 2,
            phi: phi,
            theta: rotation.current,
            dark: dark,
            diffuse: diffuse,
            mapSamples: mapSamples,
            mapBrightness: mapBrightness,
            baseColor: base,
            markerColor: marker,
            glowColor: glow,
            markers: markers,
            markerDiameter: markerDiameter,
            offset: offset,
            opacity: 1,
            onRender: (state) => {
                if (destroyed) return;
                // Idle spin + inertia from pointer drags.
                if (autoRotate && pointerInteracting.current === null) {
                    state.phi = phi + rotateSpeed;
                } else if (pointerInteracting.current !== null && !pointerInteracting.current.destroyed) {
                    state.phi = phi + pointerInteractionMovement.current / 2800;
                }
                if (!state || destroyed) return;
                setPhi(state.phi);
            },
        });

        return () => {
            destroyed = true;
            globe.destroy();
        };
    }, [width, markers]); // rebuilt on resize or marker change

    const lastPointerX = useRef(null);

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 800,
                aspectRatio: "1 / 1",
                margin: "auto",
                position: "relative",
            }}
            className={`relative overflow-hidden ${className}`}
            {...props}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: "100%",
                    height: "100%",
                    contain: "layout paint size",
                    touchAction: pointerInteractions ? "none" : undefined,
                    opacity: width ? 1 : 0,
                    transition: "opacity 0.4s ease",
                    cursor: pointerInteractions ? "grab" : undefined,
                }}
                onPointerDown={(e) => {
                    if (!pointerInteractions) return;
                    pointerInteracting.current = { destroyed: false };
                    lastPointerX.current = e.clientX;
                    canvasRef.current.style.cursor = "grabbing";
                }}
                onPointerUp={() => {
                    pointerInteracting.current = null;
                    canvasRef.current.style.cursor = "grab";
                }}
                onPointerOut={() => {
                    pointerInteracting.current = null;
                    canvasRef.current.style.cursor = "grab";
                }}
                onMouseMove={(e) => {
                    if (pointerInteracting.current === null || lastPointerX.current == null) return;
                    const delta = e.clientX - lastPointerX.current;
                    lastPointerX.current = e.clientX;
                    pointerInteractionMovement.current += delta;
                }}
            />
        </div>
    );
}
