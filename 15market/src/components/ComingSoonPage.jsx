import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Rocket } from 'lucide-react';

export default function ComingSoonPage({ onBack, theme }) {
  const isLight = theme === 'light';
  return (
    <div className={`w-full h-screen overflow-hidden relative ${isLight ? 'text-black bg-[#CFDCD5]' : 'text-white bg-black'} flex flex-col`} style={{ fontFamily: '"Comfortaa", cursive' }}>
      {/* Subtle texture overlay for light mode */}
      <div className={`absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? '' : 'hidden'}`} />
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-[#1A6140]/10 rounded-full blur-[120px] mix-blend-screen opacity-30" />
          <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-[#1A6140]/5 rounded-full blur-[100px] mix-blend-screen opacity-30" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 w-full h-full">
        {/* Back button */}
        <button
          onClick={onBack}
          className={`absolute left-4 p-2 rounded-full ${isLight ? 'bg-white/40 hover:bg-white/80 border border-[#1A6140]/20 shadow-sm' : 'bg-white/5 hover:bg-white/10 border border-white/5 shadow-md'} transition-all`}
          style={{ top: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'calc(env(safe-area-inset-top) + 16px)' : '16px' }}
          title="Back"
        >
          <ArrowLeft size={24} className={isLight ? 'text-black' : 'text-white'} />
        </button>

      {/* Icon */}
      <motion.div
        className={`w-32 h-32 mb-8 rounded-full flex items-center justify-center ${isLight ? 'bg-[#1A6140]/10 shadow-[0_0_40px_rgba(26, 97, 64,0.2)]' : 'bg-[#1A6140]/20 shadow-[0_0_40px_rgba(26, 97, 64,0.4)]'}`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, y: [0, -10, 0] }}
        transition={{ 
            y: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            scale: { duration: 0.5 },
            opacity: { duration: 0.5 }
        }}
      >
        <Rocket size={64} className="text-[#1A6140]" />
      </motion.div>

      {/* Message */}
      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-wider mb-4 text-center">
        Coming Soon
      </h1>
      <p className={`text-center ${isLight ? 'text-black/70' : 'text-white/70'} max-w-md`}>We’re working hard to bring this feature to life. Stay tuned!</p>
      </div>
    </div>
  );
}
