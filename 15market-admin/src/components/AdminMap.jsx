// Admin flat world map ("reference dashboard" style): dot-matrix world on the
// background, brand-tinted blobs over countries with registered users, ISO
// badge pins sized by user count, glass info cards for the top countries,
// animated arcs and live-trade pulse rings.
//
// Built on the bundled dotted-map landmass dataset (no network, no assets):
// its projection is x = (lng + 180) / 360 * COLS with a curved latitude axis,
// inverted below through a runtime lookup table so every land dot knows its own
// lat/lng (needed to tint countries without per-country polygon data).
import { useMemo } from "react";
import DottedMap from "dotted-map";

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

const HEIGHT = 56;          // lattice rows of the dot matrix
const COLS = 118;           // lattice columns (dotted-map at height 56)
const VB_W = COLS + 2;      // viewBox width (1 unit padding each side)
const VB_H = HEIGHT + 2;    // viewBox height

// Binned color strengths for user-country blobs (closer = stronger).
export function AdminMap({ theme = 'dark', countries = {}, pulse = [] }) {
    const isLight = theme === 'light';
    const accent = isLight ? '#1A6140' : '#3CB371';

    // One dotted-map instance + inverted projection: every land dot gets its
    // own lat/lng so registered countries can be tinted precisely.
    const world = useMemo(() => {
        const map = new DottedMap({ height: HEIGHT });
        // Piecewise y -> lat table built from the lib's own projection.
        const yToLat = new Map();
        for (let lat = -60; lat <= 85.001; lat += 0.25) {
            const y = map.getPin({ lat, lng: 0 }).y;
            if (!yToLat.has(y)) yToLat.set(y, []);
            yToLat.get(y).push(lat);
        }
        const invert = (y) => {
            const list = yToLat.get(y);
            if (!list || !list.length) return null;
            return list[Math.floor(list.length / 2)];
        };
        const dots = map.getPoints().map((p) => {
            const lat = invert(p.y);
            return { x: p.x + 1, y: p.y + 1, lat, lng: ((p.x / COLS) * 360) - 180 };
        }).filter(d => d.lat != null);
        return { dots };
    }, []);

    // Active countries (users per ISO) projected onto the lattice.
    const actives = useMemo(() => {
        return Object.entries(countries || {})
            .filter(([iso]) => COUNTRY_CENTER[iso])
            .sort((a, b) => b[1] - a[1])
            .map(([iso, count]) => {
                const [lat, lng] = COUNTRY_CENTER[iso];
                const x = ((lng + 180) / 360) * COLS + 1;
                const y = latToY(lat);
                return { iso, count: Number(count) || 0, x, y, lat, lng };
            });
    }, [countries, world]);

    // Match the dots to their nearest active country -> tinted blob.
    const shaded = useMemo(() => {
        const byIso = {};
        if (!actives.length) return { byIso, defaultDots: world.dots };
        const defaultDots = [];
        for (const dot of world.dots) {
            let best = null, bestScore = Infinity;
            for (const a of actives) {
                const dxi = (dot.lng - a.lng) * Math.cos((dot.lat + a.lat) / 2 * Math.PI / 180);
                const dyi = dot.lat - a.lat;
                const dist = Math.sqrt(dxi * dxi + dyi * dyi);
                if (dist < bestScore) { bestScore = dist; best = a; }
            }
            // ~3.2 lattice units of influence (lattice ≈ 3° lng per column at the equator)
            if (best && bestScore <= 3.4) {
                const strength = Math.max(0, 1 - bestScore / 3.4);
                (byIso[best.iso] = byIso[best.iso] || []).push({ ...dot, strength });
            } else {
                defaultDots.push(dot);
            }
        }
        return { byIso, defaultDots };
    }, [actives, world]);

    // Live-trade pulses projected for the rings.
    const pulsePins = useMemo(() => {
        return (pulse || [])
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .slice(0, 6)
            .map((p, i) => ({
                id: p.id || `p${i}`,
                x: ((p.lng + 180) / 360) * COLS + 1,
                y: latToY(p.lat),
                delay: i * 0.5,
                first: i === 0,
            }));
    }, [JSON.stringify(pulse || [])]);

    // Top countries get the reference-style glass info cards.
    const topCards = actives.filter(a => a.count > 0).slice(0, 3);
    const cardPos = (a) => {
        let cx = a.x + 4.5, cy = a.y - 4.5;
        cx = Math.min(Math.max(cx, 8), VB_W - 12);
        cy = Math.min(Math.max(cy, 6.5), VB_H - 6);
        return { cx, cy };
    };

    const dotBase = isLight ? '#B7C4BB' : '#22382E';
    const dotActive = isLight ? '#1A6140' : '#3CB371';
    const cardBg = isLight ? 'rgba(255,255,255,0.88)' : 'rgba(6,18,12,0.78)';
    const cardBorder = isLight ? 'rgba(26,97,64,0.35)' : 'rgba(60,179,113,0.35)';
    const cardText = isLight ? '#0A261A' : '#FFFFFF';

    const arcPairs = useMemo(() => {
        const tops = actives.filter(a => a.count > 0).slice(0, 4);
        const out = [];
        for (let i = 0; i < tops.length - 1 && out.length < 3; i++) {
            const a = tops[i], b = tops[i + 1];
            const mx = (a.x + b.x) / 2;
            // lift the arc toward the top of the map (lat curves up)
            const lift = Math.min(10, Math.abs(b.x - a.x) * 0.16 + 2);
            out.push({ d: `M ${a.x} ${a.y} Q ${mx} ${Math.max(a.y, b.y) - lift} ${b.x} ${b.y}`, key: `${a.iso}-${b.iso}` });
        }
        return out;
    }, [actives]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <style>{`
                @keyframes admin-map-ring {
                    0%   { transform: scale(0.35); opacity: 0.9; }
                    100% { transform: scale(2.1); opacity: 0; }
                }
                @keyframes admin-map-dash {
                    to { stroke-dashoffset: -26; }
                }
            `}</style>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: '100%', display: 'block' }}>

                {/* soft drop shadow under the "floating island" like the reference */}
                <ellipse cx={VB_W / 2} cy={VB_H - 1.2} rx={VB_W / 2.6} ry={2.4}
                    fill={isLight ? 'rgba(26,97,64,0.10)' : 'rgba(60,179,113,0.07)'} style={{ filter: 'blur(3px)' }} />

                {/* default land dots */}
                <g>
                    {shaded.defaultDots.map((d, i) => (
                        <circle key={i} cx={d.x} cy={d.y} r={0.42} fill={dotBase} opacity={isLight ? 0.75 : 0.5} />
                    ))}
                </g>

                {/* active-country blobs: brand-tinted dots, brighter near the center */}
                {Object.entries(shaded.byIso).map(([iso, dots]) => (
                    <g key={iso}>
                        {dots.map((d, i) => (
                            <circle key={i} cx={d.x} cy={d.y} r={0.46} fill={dotActive}
                                opacity={0.28 + d.strength * 0.72}
                                style={{ filter: d.strength > 0.6 ? 'saturate(1.2)' : 'none' }} />
                        ))}
                    </g>
                ))}

                {/* animated arcs between the strongest user countries */}
                {arcPairs.map((a, i) => (
                    <path key={a.key} d={a.d} fill="none" stroke={dotActive} strokeOpacity={0.4}
                        strokeWidth={0.16} strokeDasharray="1.2 1.4"
                        style={{ animation: `admin-map-dash ${3 + i}s linear infinite` }} />
                ))}

                {/* live-trade pulse rings (dotted, like the reference) */}
                {pulsePins.map((p) => (
                    <g key={p.id} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
                        <circle r={1.05} fill="none" stroke={p.first ? '#F59E0B' : dotActive} strokeWidth={0.16}
                            strokeDasharray="0.18 0.42" strokeLinecap="round"
                            style={{ transformOrigin: 'center', transformBox: 'fill-box', animation: `admin-map-ring 2.4s ease-out infinite ${p.delay}s` }} />
                        <circle r={0.34} fill={p.first ? '#F59E0B' : dotActive} opacity={0.9} />
                    </g>
                ))}

                {/* country pins: ISO badge sized by user count */}
                {actives.filter(a => a.count > 0).map((a) => {
                    const r = 1.0 + Math.min(a.count, 60) / 60 * 0.9;
                    return (
                        <g key={a.iso} style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>
                            <circle r={r + 0.45} fill={isLight ? '#FFFFFF' : '#04140C'} stroke={dotActive} strokeWidth={0.18} opacity={0.9} />
                            <circle r={r} fill={dotActive} />
                            <text textAnchor="middle" dominantBaseline="central" y={0.04}
                                style={{ fontSize: Math.min(1.05, r * 0.78), fontWeight: 900, letterSpacing: 0.02, fill: isLight ? '#FFFFFF' : '#04140C', fontFamily: 'Comfortaa, sans-serif' }}>
                                {a.iso}
                            </text>
                        </g>
                    );
                })}

                {/* leader lines + glass cards for the top countries */}
                {topCards.map((a) => {
                    const { cx, cy } = cardPos(a);
                    const cardW = 7.6, cardH = 3.4;
                    return (
                        <g key={a.iso}>
                            <line x1={a.x} y1={a.y} x2={cx} y2={cy + cardH / 2}
                                stroke={dotActive} strokeOpacity={0.5} strokeWidth={0.12} />
                            <rect x={cx - cardW / 2} y={cy - cardH / 2} width={cardW} height={cardH} rx={0.8}
                                fill={cardBg} stroke={cardBorder} strokeWidth={0.12} />
                            <rect x={cx - cardW / 2} y={cy - cardH / 2} width={cardW} height={1.0} rx={0.8}
                                fill={dotActive} opacity={0.16} />
                            <text x={cx - cardW / 2 + 0.55} y={cy - cardH / 2 + 0.7}
                                style={{ fontSize: 0.55, fontWeight: 800, letterSpacing: 0.06, fill: cardText, opacity: 0.6, fontFamily: 'Comfortaa, sans-serif' }}>
                                {a.iso} · USERS
                            </text>
                            <text x={cx - cardW / 2 + 0.5} y={cy + cardH / 2 - 0.55}
                                style={{ fontSize: 1.25, fontWeight: 900, fill: cardText, fontFamily: 'Comfortaa, sans-serif' }}>
                                {a.count.toLocaleString()}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// Latitude -> lattice row along dotted-map's curved axis, cached per instance
// height. Probed against getPin so the curve is exact, not approximated.
let latCurve = null;
function latToY(lat) {
    if (!latCurve) {
        const map = new DottedMap({ height: HEIGHT });
        const pts = [];
        for (let l = -60; l <= 85.001; l += 0.5) pts.push([l, map.getPin({ lat: l, lng: 0 }).y]);
        latCurve = pts;
    }
    // find the segment containing this lat (monotonic descending y with lat)
    for (let i = 1; i < latCurve.length; i++) {
        const [l1, y1] = latCurve[i - 1];
        const [l2, y2] = latCurve[i];
        if (lat <= l1 && lat >= l2) {
            const t = l1 === l2 ? 0 : (l1 - lat) / (l1 - l2);
            return y1 + (y2 - y1) * t + 1;
        }
    }
    return lat > 0 ? 2 : VB_H - 2;
}
