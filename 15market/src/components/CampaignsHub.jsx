import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, Calendar, Users, Clock, Gift, ArrowLeft, Activity, ChevronRight, Zap } from "lucide-react";
import Toast from "./Toast";

export default function CampaignsHub({ campaigns, enrollments, address, theme, onBack, handleEnroll }) {
  const isLight = theme === "light";
  const [enrollingId, setEnrollingId] = useState(null);
  const [toast, setToast] = useState(null);

  const now = Date.now();
  const activeCampaigns = useMemo(() => campaigns.filter(c => now >= c.startTime && now < c.endTime), [campaigns, now]);
  const enrolledActive = useMemo(() => activeCampaigns.find(c => enrollments[c.id]), [activeCampaigns, enrollments]);

  const doEnroll = async (campaignId) => {
    if (!address) { setToast({ message: "Connect wallet to enroll", type: "error" }); return; }
    setEnrollingId(campaignId);
    try {
      await handleEnroll(campaignId);
      setToast({ message: "Enrolled in campaign!", type: "success" });
    } catch {
      setToast({ message: "Enrollment failed", type: "error" });
    }
    setEnrollingId(null);
  };

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isLight ? 'text-black bg-[#CFDCD5]' : 'text-white bg-black'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
      <div className={`absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? '' : 'hidden'}`} />

      {/* HEADER */}
      <div className="flex items-center justify-between px-4 md:px-10 pb-0 flex-none relative z-10 w-full"
           style={typeof window !== 'undefined' && window.innerWidth < 1024 ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : { paddingTop: '1.25rem' }}>
          <div className="flex items-center gap-4">
              <button onClick={onBack} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center hover:-translate-x-1 transition-transform ${isLight ? 'text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)]' : 'text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]'}`}>
                  <ArrowLeft size={16} />
              </button>
              <h1 className={`text-xl font-bold uppercase tracking-widest ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Campaigns</h1>
          </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto w-full px-4 md:px-8 py-8 flex flex-col flex-1 overflow-y-auto no-scrollbar">

        {enrolledActive ? (
          /* State 1: Active enrolled campaign */
          <CampaignCardDetailed campaign={enrolledActive} enrollments={enrollments} theme={theme} />
        ) : activeCampaigns.length > 0 ? (
          /* State 2: List of active campaigns to enroll */
          <div className="flex flex-col gap-4">
            <p className={`text-xs font-black uppercase tracking-widest mb-2 ${isLight ? "text-[#0a261a]/40" : "text-white/30"}`}>
              {activeCampaigns.length} Active Campaign{activeCampaigns.length > 1 ? "s" : ""}
            </p>
            {activeCampaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                enrolled={!!enrollments[c.id]}
                enrolling={enrollingId === c.id}
                onEnroll={() => doEnroll(c.id)}
                theme={theme}
              />
            ))}
          </div>
        ) : (
          /* State 3: No active campaigns */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${isLight ? "bg-[#1A6140]/5 border-[#1A6140]/10" : "bg-white/5 border-white/10"} border`}>
              <Calendar size={36} className="text-[#1A6140]/40" />
            </div>
            <h2 className={`text-2xl font-black uppercase tracking-tight mb-3 ${isLight ? "text-[#0a261a]" : "text-white"}`}>No Active Campaigns</h2>
            <p className={`text-sm font-medium max-w-md ${isLight ? "text-[#0a261a]/40" : "text-white/30"}`}>
              There are no active campaigns right now. Check back later for new challenges and competitions.
            </p>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} theme={theme} />}
    </div>
  );
}

function CampaignCardDetailed({ campaign, theme, enrollments }) {
  const isLight = theme === "light";
  const now = Date.now();
  const timeLeft = campaign.endTime - now;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`${isLight ? "bg-white border-[#1A6140]/10 shadow-xl" : "bg-[#0d0d0d] border-white/5"} border rounded-[32px] p-8 md:p-12 overflow-hidden relative`}>
      <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
        <Trophy size={200} className={isLight ? "text-[#1A6140]" : "text-white"} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/30 flex items-center justify-center">
            <Trophy size={32} className="text-yellow-500" />
          </div>
          <div>
            <h1 className={`text-3xl md:text-4xl font-black uppercase tracking-tight ${isLight ? "text-[#0a261a]" : "text-white"}`}>{campaign.title}</h1>
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-[#1A6140]/20 border border-[#1A6140]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A6140] animate-pulse" />
              <span className="text-[9px] font-black text-[#1A6140] uppercase tracking-widest">Live • Enrolled</span>
            </div>
          </div>
        </div>
        <p className={`text-base ${isLight ? "text-[#0a261a]/50" : "text-white/40"} max-w-2xl mb-8 leading-relaxed`}>{campaign.description}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatBox icon={<Gift />} label="Prize Pool" value={campaign.prize || "TBA"} color="text-yellow-500" theme={theme} />
          <StatBox icon={<Clock />} label="Time Left" value={formatTimeLeft(timeLeft)} color="text-blue-400" theme={theme} />
          <StatBox icon={<Users />} label="Status" value="Active" color="text-[#1A6140]" theme={theme} />
          <StatBox icon={<Zap />} label="Network" value={campaign.network === "general" ? "ALL" : campaign.network} color="text-purple-400" theme={theme} />
        </div>
        <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full ${isLight ? "bg-[#1A6140]/5 border-[#1A6140]/20 text-[#0a261a]/60" : "bg-white/5 border-white/10 text-white/50"} border text-xs font-black uppercase tracking-widest`}>
          <Activity size={14} className="text-[#1A6140]" />
          You are enrolled — trades count toward your ranking
        </div>
      </div>
    </motion.div>
  );
}

function CampaignCard({ campaign, enrolled, enrolling, onEnroll, theme }) {
  const isLight = theme === "light";
  const now = Date.now();
  const timeLeft = campaign.endTime - now;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${isLight ? "bg-white border-[#1A6140]/10 hover:border-[#1A6140]/20" : "bg-white/5 border-white/5 hover:border-white/20"} border rounded-2xl p-6 transition-all group`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/30 flex items-center justify-center shrink-0">
            <Trophy size={24} className="text-yellow-500" />
          </div>
          <div className="min-w-0">
            <h3 className={`text-base font-black uppercase tracking-tight truncate ${isLight ? "text-[#0a261a]" : "text-white"}`}>{campaign.title}</h3>
            <p className={`text-xs mt-1 truncate ${isLight ? "text-[#0a261a]/40" : "text-white/30"}`}>{campaign.description}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? "text-[#0a261a]/20" : "text-white/20"}`}><Gift size={10} className="inline mr-1" />{campaign.prize || "TBA"}</span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? "text-[#0a261a]/20" : "text-white/20"}`}><Clock size={10} className="inline mr-1" />{formatTimeLeft(timeLeft)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onEnroll}
          disabled={enrolled || enrolling}
          className={`shrink-0 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${enrolled ? (isLight ? "bg-[#1A6140]/10 text-[#1A6140] border border-[#1A6140]/20" : "bg-[#1A6140]/20 text-[#1A6140] border border-[#1A6140]/30") : (isLight ? "bg-[#1A6140] text-white hover:bg-[#1A6140]/90" : "bg-white text-black hover:bg-white/90")}`}
        >
          {enrolled ? "Enrolled" : enrolling ? "Enrolling..." : "Join"}
        </button>
      </div>
    </motion.div>
  );
}

function StatBox({ icon, label, value, color, theme }) {
  return (
    <div className={`${theme === "light" ? "bg-[#f0f9f4] border-[#1A6140]/10" : "bg-white/5 border-white/5"} border p-5 rounded-2xl`}>
      <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${theme === "light" ? "text-[#0a261a]/20" : "text-white/20"}`}>{label}</p>
      <p className={`text-lg font-black ${color}`}>{value}</p>
    </div>
  );
}

function formatTimeLeft(ms) {
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}
