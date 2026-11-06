// Admin two-step verification — a dedicated full-page screen that mirrors the
// user side's "Verify email" step (BrandedAuthPage): fixed inset-0 canvas,
// back button, Comfortaa, six individual code boxes with auto-advance,
// paste-to-fill and auto-submit on the sixth digit.
import React, { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

export function AdminOtpPage({
    isLight,
    maskedEmail,
    code,
    setCode,
    error,
    clearError,
    busy,          // '' | 'otp' | 'resend'
    resendIn,
    onVerify,      // (code: string) => void
    onResend,
    onBack,
}) {
    const refs = useRef([]);
    const ink = isLight ? 'text-[#0a261a]' : 'text-white';
    const inkSoft = isLight ? 'text-[#0a261a]/50' : 'text-white/40';

    const setAt = (i, ch) => {
        const d = String(ch || '').replace(/\D/g, '').slice(-1);
        const arr = code.split('');
        while (arr.length < 6) arr.push('');
        arr[i] = d;
        const next = arr.join('').slice(0, 6);
        setCode(next);
        clearError();
        if (d && i < 5) refs.current[i + 1]?.focus();
        if (next.length === 6 && !busy) onVerify(next);
    };
    const onKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !code[i] && i > 0) {
            e.preventDefault();
            const arr = code.split('');
            arr[i - 1] = '';
            setCode(arr.join(''));
            refs.current[i - 1]?.focus();
        }
        if (e.key === 'Enter' && code.length === 6 && !busy) onVerify(code);
    };
    const onPaste = (e) => {
        e.preventDefault();
        const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!digits) return;
        setCode(digits);
        clearError();
        refs.current[Math.min(digits.length, 5)]?.focus();
        if (digits.length === 6 && !busy) onVerify(digits);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`fixed inset-0 z-[600] flex flex-col ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={`absolute top-[-12%] right-[-8%] w-[520px] h-[520px] rounded-full blur-[130px] ${isLight ? 'bg-[#0E4D30]/10' : 'bg-[#0E4D30]/8'}`} />
                <div className={`absolute bottom-[-12%] left-[-8%] w-[520px] h-[520px] rounded-full blur-[130px] ${isLight ? 'bg-[#0E4D30]/6' : 'bg-[#0E4D30]/5'}`} />
            </div>

            <div className="flex items-center justify-between px-5 relative z-10" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
                <button
                    onClick={onBack}
                    aria-label="Back"
                    className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 ${isLight ? 'border-gray-200 text-[#0a261a]/60' : 'border-white/10 text-white/60'}`}
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="w-10" aria-hidden="true" />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start px-6 pt-8 pb-8 relative z-10">
                <div className="w-full max-w-md flex flex-col items-center">
                    <div className="flex items-center gap-4 mb-8">
                        <img
                            src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                            alt="15market"
                            className="h-[40px] w-[140px] object-cover object-center flex-none md:h-[46px] md:w-[160px]"
                            style={{ filter: 'drop-shadow(0 0 26px rgba(14,77,48,0.45))' }}
                        />
                        <span className={`w-px h-10 flex-none ${isLight ? 'bg-black/15' : 'bg-white/20'}`} />
                        <span className="text-[11px] font-black uppercase tracking-[0.35em] text-[#0E4D30] flex-none">Admin</span>
                    </div>

                    <h1 className={`text-2xl font-black uppercase tracking-tighter ${ink}`}>Verify email</h1>
                    <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 text-center break-all ${inkSoft}`}>Code sent to {maskedEmail}</p>

                    {error && (
                        <div className="w-full flex items-start gap-2 p-3 mb-4 rounded-2xl bg-red-500/10 text-red-400 text-xs font-bold shadow-[0_0_25px_-12px_rgba(0,0,0,0.5)]">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-2" onPaste={onPaste}>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <input
                                key={i}
                                ref={(el) => { refs.current[i] = el; }}
                                type="text"
                                autoFocus={i === 0}
                                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                                inputMode="numeric"
                                maxLength={1}
                                value={code[i] || ''}
                                onChange={(e) => setAt(i, e.target.value)}
                                onKeyDown={(e) => onKeyDown(i, e)}
                                aria-label={`Digit ${i + 1}`}
                                className={`w-11 h-14 text-center text-xl font-black rounded-2xl border outline-none transition-all ${
                                    isLight
                                        ? 'bg-gray-50 border-gray-200 text-black focus:border-[#0E4D30]'
                                        : 'bg-white/5 border-white/10 text-white focus:border-[#0E4D30]'
                                } ${code[i] ? 'border-[#0E4D30]/60' : ''}`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={() => onVerify(code)}
                        disabled={busy !== '' || code.length !== 6}
                        className="w-full mt-5 py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-[#0E4D30] text-white shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                    >
                        {busy === 'otp' ? <Loader2 size={18} className="animate-spin" /> : 'Verify'}
                    </button>
                    <button
                        onClick={onResend}
                        disabled={resendIn > 0 || busy !== ''}
                        className="text-[11px] font-black uppercase tracking-widest text-[#0E4D30] mt-4 disabled:opacity-40"
                    >
                        {busy === 'resend' ? 'Sending…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
