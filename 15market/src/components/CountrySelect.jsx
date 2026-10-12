import React, { useState } from 'react';
import { ChevronDown, Check, Globe } from 'lucide-react';
import { COUNTRY_LIST } from '../constants';

const flagUrl = (code) => `https://flagcdn.com/w40/${String(code || '').toLowerCase()}.png`;

/**
 * CountrySelect — branded country picker with flags.
 *
 * A native <select> renders OS chrome and cannot show flags, so this is a
 * custom dropdown: a brand-styled button showing the selected flag + name
 * (or the placeholder), opening a scrollable options list with a flag per
 * country. Shared by the signup wizard and the legacy onboarding step.
 */
export function CountrySelect({ theme, value, onChange, placeholder = 'Select your country' }) {
    const isLight = theme === 'light';
    const [open, setOpen] = useState(false);
    const selected = COUNTRY_LIST.find((c) => c.code === value) || null;

    const pick = (code) => {
        onChange?.(code);
        setOpen(false);
    };

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={`w-full py-4 pl-5 pr-5 rounded-2xl border outline-none transition-all flex items-center gap-3 cursor-pointer ${
                    isLight
                        ? 'bg-gray-50 border-gray-200 text-black focus:border-[#17A364]'
                        : 'bg-white/5 border-white/10 text-white focus:border-[#17A364]'
                } ${!selected ? (isLight ? 'text-black/40' : 'text-white/40') : ''}`}
            >
                {selected ? (
                    <>
                        <img src={flagUrl(selected.code)} alt={selected.code} className="w-6 h-4 object-cover rounded-[3px] shrink-0" loading="lazy" />
                        <span className="text-base font-black flex-1 text-left">{selected.name}</span>
                    </>
                ) : (
                    <>
                        <Globe size={18} className="opacity-40 shrink-0" />
                        <span className="text-base font-black flex-1 text-left">{placeholder}</span>
                    </>
                )}
                <ChevronDown size={18} className={`opacity-50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div
                        role="listbox"
                        className={`absolute left-0 right-0 top-full mt-2 z-20 max-h-56 overflow-y-auto rounded-2xl border shadow-2xl ${
                            isLight ? 'bg-white border-gray-200' : 'bg-[#0d0d0d] border-white/10'
                        }`}
                    >
                        {COUNTRY_LIST.map((c) => {
                            const active = c.code === value;
                            return (
                                <button
                                    key={c.code}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => pick(c.code)}
                                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                                        active
                                            ? 'bg-[#17A364]/15'
                                            : (isLight ? 'hover:bg-black/5' : 'hover:bg-white/5')
                                    }`}
                                >
                                    <img src={flagUrl(c.code)} alt={c.code} className="w-6 h-4 object-cover rounded-[3px] shrink-0" loading="lazy" />
                                    <span className={`text-sm font-black flex-1 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                        {c.name}
                                    </span>
                                    {active && <Check size={16} className="text-[#17A364] shrink-0" strokeWidth={3} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default CountrySelect;
