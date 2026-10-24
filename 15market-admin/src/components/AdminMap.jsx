// Admin flat world map, reference-dashboard style: SOLID extruded continents
// (floating-island 3D look), glowing along the coastlines, biome-shaded by
// latitude like the reference (lush tropics, dry mid-belt, cold poles).
// Countries with registered users glow brand green; ISO badge pins, glass info
// cards, animated arcs and live-trade pulse rings sit on top.
//
// The geometry is preprojected offline into src/assets/worldPaths.json
// (equirectangular 360x140 viewbox, keyed by ISO-2) — zero network at runtime.
import { useMemo } from "react";
import WORLD from "../assets/worldPaths.json";

// Approximate geographic centers per ISO alpha-2 code (enough to pin
// countries without shipping a full geocoder to the admin bundle).
export const COUNTRY_CENTER = {
    US: [38.9, -77.0], CA: [56.1, -106.3], MX: [23.6, -102.5], GT: [15.5, -90.2], CR: [9.7, -83.7], PA: [8.5, -80.8],
    DO: [18.7, -70.2], CU: [21.5, -77.8], JM: [18.1, -77.3], HN: [15.2, -86.2], NI: [12.9, -85.2], SV: [13.8, -88.9],
    TT: [10.7, -61.3],
    BR: [-14.2, -51.9], AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.1], PE: [-9.2, -75.0], EC: [-1.8, -78.2],
    VE: [6.4, -66.4], BO: [-16.3, -63.6], PY: [-23.4, -58.4], UY: [-32.5, -55.8],
    GB: [55.4, -3.4], IE: [53.4, -8.2], FR: [46.2, -2.2], DE: [51.2, 10.4], NL: [52.1, 5.3], BE: [50.5, 4.5],
    ES: [40.3, -3.7], PT: [39.4, -8.2], IT: [41.9, 12.6], CH: [46.8, 8.2], AT: [47.5, 14.5], PL: [51.9, 19.1],
    CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.5], RO: [45.9, 24.9], BG: [42.7, 25.8], GR: [39.1, 21.8],
    HR: [45.1, 15.2], RS: [44.0, 21.0], SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5], FI: [61.9, 25.7],
    IS: [64.9, -19.0], LT: [55.2, 23.9], LV: [56.9, 24.6], EE: [58.7, 25.0], UA: [48.4, 31.2], BY: [53.7, 27.9],
    MD: [47.4, 28.4], RU: [61.1, 105.3], TR: [38.9, 35.2], CY: [35.1, 33.4],
    NG: [9.1, 8.7], GH: [7.9, -1.0], KE: [0.2, 37.9], TZ: [-6.4, 34.9], UG: [1.4, 32.3], RW: [-1.9, 29.9],
    ZA: [-30.6, 22.9], ZW: [-19.0, 29.2], ZM: [-13.1, 27.9], MW: [-13.3, 34.3], BW: [-22.3, 24.7],
    ET: [9.1, 40.5], EG: [26.8, 30.8], MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5], LY: [26.3, 17.1],
    SN: [14.5, -14.5], CI: [7.5, -5.5], CM: [7.4, 12.4], CD: [-4.0, 21.8], AO: [-11.2, 17.9], MZ: [-18.7, 35.5],
    SD: [12.9, 30.2],
    SA: [23.9, 45.1], AE: [23.4, 53.8], QA: [25.3, 51.2], KW: [29.3, 47.5], BH: [26.1, 50.5], OM: [21.5, 55.9],
    JO: [31.4, 36.5], LB: [33.9, 35.9], IQ: [33.2, 43.7], IR: [32.4, 53.7], IL: [31.1, 35.1],
    IN: [20.6, 78.9], PK: [30.4, 69.3], BD: [23.7, 90.4], LK: [7.9, 80.8], NP: [28.4, 84.1], AF: [33.9, 67.7],
    CN: [35.9, 104.2], HK: [22.3, 114.2], TW: [23.7, 121.0], JP: [36.2, 138.3], KR: [35.9, 127.8],
    MN: [46.9, 103.8], KZ: [48.0, 66.9], UZ: [41.4, 64.6], KG: [41.2, 74.8], TJ: [38.9, 71.3],
    ID: [-0.8, 113.9], MY: [4.2, 102.0], SG: [1.35, 103.8], TH: [15.9, 100.9], VN: [14.1, 108.3],
    PH: [12.9, 121.8], MM: [19.8, 96.1], KH: [12.6, 105.0], LA: [19.9, 102.5],
    AU: [-25.3, 133.8], NZ: [-40.9, 174.9], FJ: [-17.7, 178.0],
};

const { vbW: VMW, vbH: VMH } = WORLD;

// Equirectangular projection matching the prebuilt asset: x = lon + 180, y = 84 - lat.
export function project(lon, lat) {
    return { x: lon + 180, y: 84 - lat };
}

function mix(c1, c2, t) {
    const a = [parseInt(c1.slice(1, 3), 16), parseInt(c1.slice(3, 5), 16), parseInt(c1.slice(5, 7), 16)];
    const b = [parseInt(c2.slice(1, 3), 16), parseInt(c2.slice(3, 5), 16), parseInt(c2.slice(5, 7), 16)];
    const r = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${r[0]},${r[1]},${r[2]})`;
}

export function AdminMap({ theme = 'dark', countries = {}, pulse = [] }) {
    const isLight = theme === 'light';

    const active = useMemo(() => {
        const m = {};
        Object.entries(countries || {}).forEach(([iso, count]) => {
            if (COUNTRY_CENTER[iso] && count > 0) m[iso] = count;
        });
        return m;
    }, [JSON.stringify(countries || {})]);

    // Biome fill by absolute latitude, like the reference's terrain shades.
    const biomeFill = (item) => {
        const a = Math.min(Math.abs(item.lat), 60);
        if (isLight) {
            if (a < 12) return mix('#7DBB8F', '#A8CFAe'.slice(0, 7), a / 12);
            if (a < 33) return mix('#CFCf9B'.slice(0, 7), '#D9BB7F', (a - 12) / 21);
            return mix('#DFE7EE', '#CFD8E4', Math.min(1, (a - 33) / 40));
        }
        if (a < 12) return mix('#1C5638', '#27744A', a / 12);
        if (a < 33) return mix('#2F3B29', '#3D4030', (a - 12) / 21);
        return mix('#22303C'.slice(0, 7), '#2A364A', Math.min(1, (a - 33) / 40));
    };

    const activeList = Object.keys(active);
    const topISOs = activeList
        .map(iso => ({ iso, count: Number(active[iso]) || 0 }))
        .sort((a, b) => b.count - a.count);

    const pins = topISOs.map((t) => {
        const [lat, lon] = COUNTRY_CENTER[t.iso];
        const c = project(lon, lat);
        return { ...t, x: c.x, y: c.y };
    });

    const pulses = (pulse || [])
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .slice(0, 6)
        .map((p, i) => {
            const c = project(p.lng, p.lat);
            return { id: p.id || `p${i}`, x: c.x, y: c.y, delay: i * 0.5, first: i === 0 };
        });

    const arcs = useMemo(() => {
        const out = [];
        for (let i = 0; i < Math.min(4, pins.length - 1) && out.length < 3; i++) {
            const a = pins[i], b = pins[i + 1];
            const mx = (a.x + b.x) / 2;
            const lift = Math.min(34, Math.abs(b.x - a.x) * 0.16 + 8);
            out.push({ d: `M ${a.x} ${a.y} Q ${mx} ${Math.max(a.y, b.y) - lift} ${b.x} ${b.y}`, i });
        }
        return out;
    }, [active]);

    const infoCards = pins.slice(0, 3);
    const cardBox = (p) => {
        const w = 64, h = 27;
        let x = p.x + 24, y = p.y - 34;
        x = Math.min(Math.max(x, 66), VMW - w - 6);
        y = Math.min(Math.max(y, 10), VMH - h - 4);
        return { x, y, w, h };
    };

    const accent = isLight ? '#1A6140' : '#3CB371';
    const sideFill = isLight ? '#93A69D' : '#06130D';
    const cardBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(6,18,12,0.85)';
    const cardBorder = isLight ? 'rgba(26,97,64,0.4)' : 'rgba(60,179,113,0.4)';
    const cardText = isLight ? '#0A261A' : '#FFFFFF';
    const strokeTop = isLight ? 'rgba(255,255,255,0.22)' : 'rgba(140,255,190,0.12)';

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <style>{`
                @keyframes admin-map-ring {
                    0%   { transform: scale(0.35); opacity: 0.9; }
                    100% { transform: scale(2.1); opacity: 0; }
                }
                @keyframes admin-map-dash {
                    to { stroke-dashoffset: -36; }
                }
                @keyframes admin-map-glow {
                    0%, 100% { opacity: 0.45; }
                    50%      { opacity: 0.85; }
                }
            `}</style>
            <svg viewBox={`0 0 ${VMW} ${VMH}`} preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: '100%', display: 'block' }}>
                <defs>
                    {/* one glow filter for the whole landmass group — cheap */}
                    <filter id="mapGlow" x="-6%" y="-18%" width="112%" height="136%">
                        <feGaussianBlur stdDeviation="2.6" />
                    </filter>
                    <linearGradient id="mapFace" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#FFFFFF" stopOpacity={isLight ? 0.32 : 0.14} />
                        <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
                        <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
                    </linearGradient>
                    <radialGradient id="mapUserGlow" cx="0.5" cy="0.42" r="0.62">
                        <stop offset="0" stopColor={isLight ? '#5FBF8F' : '#7BFFC4'} stopOpacity="0.95" />
                        <stop offset="1" stopColor={isLight ? '#1A6140' : '#1F8F5F'} stopOpacity="0.6" />
                    </radialGradient>
                </defs>

                {/* soft shadow under the floating island */}
                <ellipse cx={VMW / 2} cy={VMH + 1.2} rx={VMW / 2.7} ry={3.4}
                    fill={isLight ? 'rgba(26,97,64,0.14)' : 'rgba(60,179,113,0.10)'} style={{ filter: 'blur(4px)' }} />

                {/* breathing glow around every landmass */}
                <g filter="url(#mapGlow)" style={{ animation: 'admin-map-glow 5s ease-in-out infinite' }}>
                    {WORLD.countries.map((c) => (
                        <path key={c.iso2} d={c.d} fill={active[c.iso2] ? accent : isLight ? 'rgba(60,179,113,0.4)' : 'rgba(60,179,113,0.28)'} stroke={accent} strokeWidth={1.1} strokeOpacity={0.55} />
                    ))}
                </g>

                {/* extruded sides (the 2.5D depth of the floating island) */}
                <g transform="translate(0, 2.8)">
                    {WORLD.countries.map((c) => (
                        <path key={c.iso2} d={c.d} fill={sideFill} />
                    ))}
                </g>

                {/* top faces: biome shading; user countries glow brand green */}
                <g>
                    {WORLD.countries.map((c) => {
                        const isActive = !!active[c.iso2];
                        return (
                            <g key={c.iso2}>
                                <path d={c.d}
                                    fill={isActive ? 'url(#mapUserGlow)' : biomeFill(c)}
                                    stroke={isActive ? '#7BFFC4' : strokeTop} strokeWidth={0.8} />
                            </g>
                        );
                    })}
                </g>

                {/* subtle top-edge lighting over the whole landmass */}
                <g style={{ pointerEvents: 'none' }}>
                    {WORLD.countries.map((c) => (
                        <path key={c.iso2} d={c.d} fill="url(#mapFace)" />
                    ))}
                </g>

                {/* animated arcs between the strongest user countries */}
                {arcs.map((a) => (
                    <path key={a.i} d={a.d} fill="none" stroke={accent} strokeOpacity={0.5}
                        strokeWidth={0.8} strokeDasharray="5 7" strokeLinecap="round"
                        style={{ animation: `admin-map-dash ${3 + a.i}s linear infinite` }} />
                ))}

                {/* live-trade pulse rings (dotted, like the reference) */}
                {pulses.map((p) => (
                    <g key={p.id} transform={`translate(${p.x},${p.y})`}>
                        <circle r={5} fill="none" stroke={p.first ? '#F59E0B' : accent} strokeWidth={0.9}
                            strokeDasharray="1 2.4" strokeLinecap="round"
                            style={{ transformOrigin: 'center', transformBox: 'fill-box', animation: `admin-map-ring 2.4s ease-out infinite ${p.delay}s` }} />
                        <circle r={1.6} fill={p.first ? '#F59E0B' : accent} opacity={0.9} />
                    </g>
                ))}

                {/* country pins: ISO badge sized by user count */}
                {pins.map((p) => {
                    const r = 9 + Math.min(p.count, 80) / 80 * 5;
                    return (
                        <g key={p.iso} transform={`translate(${p.x},${p.y})`}>
                            <circle r={r + 2.4} fill={isLight ? '#FFFFFF' : '#04140C'} stroke={accent} strokeWidth={1.1} opacity={0.92} />
                            <circle r={r} fill={accent} />
                            <text textAnchor="middle" dominantBaseline="central" y={0.3}
                                style={{ fontSize: r * 0.82, fontWeight: 900, letterSpacing: 0.6, fill: isLight ? '#FFFFFF' : '#04140C', fontFamily: 'Comfortaa, sans-serif' }}>
                                {p.iso}
                            </text>
                        </g>
                    );
                })}

                {/* leader lines + glass cards for the top countries */}
                {infoCards.map((p) => {
                    const { x, y, w, h } = cardBox(p);
                    return (
                        <g key={p.iso}>
                            <line x1={p.x} y1={p.y} x2={x + w / 2} y2={y + h} stroke={accent} strokeOpacity={0.55} strokeWidth={0.7} />
                            <rect x={x} y={y} width={w} height={h} rx={4} fill={cardBg} stroke={cardBorder} strokeWidth={0.7} />
                            <rect x={x} y={y} width={w} height={7.5} rx={4} fill={accent} opacity={0.16} />
                            <text x={x + 4} y={y + 5.4} style={{ fontSize: 4.4, fontWeight: 800, letterSpacing: 0.4, fill: cardText, opacity: 0.62, fontFamily: 'Comfortaa, sans-serif' }}>
                                {p.iso} · USERS
                            </text>
                            <text x={x + 3.4} y={y + h - 3.4} style={{ fontSize: 10, fontWeight: 900, fill: cardText, fontFamily: 'Comfortaa, sans-serif' }}>
                                {p.count.toLocaleString()}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
