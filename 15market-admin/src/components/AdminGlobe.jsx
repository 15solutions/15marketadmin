// Admin Overview geo-globe: the lightswind 3D globe with a green glow.
// Countries where users are registered become glowing pins sized by count;
// live trade/onboarding activity flashes extra pins briefly.
import React, { useMemo } from "react";
import GlobeLightswind from "./lightswind/globe";

// Approximate geographic centers per ISO alpha-2 code (enough to place
// country pins without shipping a full geocoder to the admin bundle).
export const COUNTRY_CENTER = {
    US: [38.9, -77.0], CA: [56.1, -106.3], MX: [23.6, -102.5], GT: [15.5, -90.2], CR: [9.7, -83.7], PA: [8.5, -80.8],
    DO: [18.7, -70.2], CU: [21.5, -77.8], JM: [18.1, -77.3], HN: [15.2, -86.2], NI: [12.9, -85.2], SV: [13.8, -88.9],
    TT: [10.7, -61.2],
    BR: [-14.2, -51.9], AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.1], PE: [-9.2, -75.0], EC: [-1.8, -78.2],
    VE: [6.4, -66.6], BO: [-16.3, -63.6], PY: [-23.4, -58.4], UY: [-32.5, -55.8],
    GB: [55.4, -3.4], IE: [53.4, -8.2], FR: [46.2, -2.2], DE: [51.2, 10.4], NL: [52.1, 5.6], BE: [50.5, 4.5],
    ES: [40.5, -3.7], PT: [39.4, -8.2], IT: [41.9, 12.6], CH: [46.8, 8.2], AT: [47.5, 14.6], PL: [51.9, 19.1],
    CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.5], RO: [45.9, 24.9], BG: [42.7, 25.5], GR: [39.1, 21.8],
    HR: [45.1, 15.2], RS: [44.0, 21.0], SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5], FI: [61.9, 25.7],
    IS: [64.9, -19.0], LT: [55.2, 23.9], LV: [56.9, 24.6], EE: [58.6, 25.0], UA: [48.4, 31.2], BY: [53.7, 27.9],
    MD: [47.4, 28.4], RU: [61.5, 105.3], TR: [38.9, 35.2], CY: [35.1, 33.4],
    NG: [9.1, 8.7], GH: [7.9, -1.0], KE: [0.0, 37.9], TZ: [-6.4, 34.9], UG: [1.4, 32.3], RW: [-1.9, 29.9],
    ZA: [-30.6, 22.9], ZW: [-19.0, 29.2], ZM: [-13.1, 27.8], MW: [-13.3, 34.3], BW: [-22.3, 24.7],
    ET: [9.1, 40.5], EG: [26.8, 30.8], MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5], LY: [26.3, 17.2],
    SN: [14.5, -14.5], CI: [7.5, -5.5], CM: [7.4, 12.4], CD: [-4.0, 21.8], AO: [-11.2, 17.9], MZ: [-18.7, 35.5],
    SD: [12.9, 30.2],
    SA: [23.9, 45.1], AE: [23.4, 53.8], QA: [25.3, 51.2], KW: [29.3, 47.5], BH: [26.1, 50.6], OM: [21.5, 55.9],
    JO: [31.4, 36.2], LB: [33.9, 35.9], IQ: [33.2, 43.7], IR: [32.4, 53.7], IL: [31.1, 35.0],
    IN: [20.6, 78.9], PK: [30.4, 69.3], BD: [23.7, 90.4], LK: [7.9, 80.8], NP: [28.4, 84.1], AF: [33.9, 67.7],
    CN: [35.9, 104.2], HK: [22.3, 114.2], TW: [23.7, 121.0], JP: [36.2, 138.3], KR: [35.9, 127.8],
    MN: [46.9, 103.8], KZ: [48.0, 66.9], UZ: [41.4, 64.6], KG: [41.2, 74.8], TJ: [38.9, 71.3],
    ID: [-0.8, 113.9], MY: [4.2, 102.0], SG: [1.35, 103.8], TH: [15.9, 100.9], VN: [14.1, 108.3],
    PH: [12.9, 121.8], MM: [19.8, 96.1], KH: [12.6, 105.0], LA: [19.9, 102.5],
    AU: [-25.3, 133.8], NZ: [-40.9, 174.9], FJ: [-17.7, 178.0],
};

export function AdminGlobe({ theme = 'dark', countries = {}, pulse = [] }) {
    const isLight = theme === 'light';

    // Registered users per country → permanent pins sized by count.
    const countryMarkers = useMemo(() => (
        Object.entries(countries || {})
            .filter(([iso]) => COUNTRY_CENTER[iso])
            .map(([iso, count]) => ({
                iso,
                count,
                location: COUNTRY_CENTER[iso],
                size: 0.055 + Math.min(count, 50) / 50 * 0.14,
            }))
    ), [countries]);

    // Transient activity flashes → extra pins on top.
    const pulseMarkers = useMemo(() => (
        (pulse || [])
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .slice(0, 6)
            .map(p => ({ location: [p.lat, p.lng], size: 0.14 }))
    ), [pulse]);

    const markers = useMemo(() => [...countryMarkers, ...pulseMarkers], [countryMarkers, pulseMarkers]);

    const topCountries = [...countryMarkers].sort((a, b) => b.count - a.count).slice(0, 6);

    return (
        <div className="relative w-full h-full flex items-stretch">
            {/* Green bloom behind the globe */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75%] aspect-square rounded-full pointer-events-none"
                style={{ background: '#1A6140', filter: 'blur(110px)', opacity: isLight ? 0.13 : 0.22 }}
            />
            <div className="flex-1 relative min-w-0 flex items-center justify-center">
                <GlobeLightswind
                    theta={0.25}
                    dark={isLight ? 0 : 1}
                    scale={isLight ? 1.05 : 1.3}
                    diffuse={isLight ? 1.6 : 1.15}
                    mapSamples={24000}
                    mapBrightness={isLight ? 5.5 : 8.5}
                    baseColor={isLight ? '#203c30' : '#1a1a1a'}
                    markerColor="#3CB371"
                    glowColor={isLight ? '#3c9b6e' : '#1A6140'}
                    markers={markers}
                    markerDiameter={0.28}
                />
                {countryMarkers.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black uppercase tracking-widest opacity-30 pointer-events-none">
                        Waiting for user location data…
                    </div>
                )}
            </div>

            {/* Leaderboard rail: leading countries by users */}
            <div className={`hidden xl:flex w-44 flex-none flex-col gap-2 justify-center pl-3 border-l ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                <div className="text-[8px] font-black uppercase tracking-widest opacity-30 px-1 pb-1">Users per country</div>
                {countryMarkers.length === 0 && (
                    <div className="px-1 text-[9px] font-bold opacity-40">No data yet</div>
                )}
                {topCountries.map(m => (
                    <div key={m.iso} className={`flex items-center justify-between px-2.5 py-2 rounded-xl border ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}>
                        <span className={`text-[10px] font-black tracking-widest ${isLight ? 'text-black' : 'text-white'}`}>{m.iso}</span>
                        <span className="text-[10px] font-black text-[#3CB371]">{m.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
