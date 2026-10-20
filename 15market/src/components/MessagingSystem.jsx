import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    User,
    MessageSquare,
    X,
    ShieldCheck,
    Hammer,
    Check
} from 'lucide-react';

const ROLES = {
    ADMIN: '15market admin',
    MODERATOR: '15market Mod',
    LISTER: '15listers'
};

function MessagingSystem({ wallet, connection, isOpen, onClose, isAdminView = false, adminRole = null, embedded = false, userProfile = null, theme }) {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const messagesEndRef = useRef(null);

    const isLight = theme === 'light';

    // Current User Identity
    const myAddress = isAdminView && adminRole ? adminRole : (wallet?.address || 'GUEST_' + Math.floor(Math.random() * 1000));
    const myDisplayName = userProfile?.username || (isAdminView ? 'Admin' : (myAddress && typeof myAddress === 'string' ? myAddress.slice(0, 8) : 'Guest'));

    // Persistence Key
    const STORAGE_KEY = '15market_global_chat_v1';

    // Load Messages
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setMessages(parsed);
            } catch (e) {
                console.error("Failed to parse chat messages", e);
            }
        }
    }, []);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!inputMessage.trim()) return;

        const newMessage = {
            sender: myAddress,
            senderName: myDisplayName,
            text: inputMessage,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9)
        };

        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedMessages));
        setInputMessage('');
    };

    const formatAddress = (addr) => {
        if (!addr || typeof addr !== 'string') return "Unknown";
        if (Object.values(ROLES).includes(addr)) return addr;
        if (addr.length < 10) return addr;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const getRoleColor = (addr) => {
        if (addr === ROLES.ADMIN) return 'text-[#1A6140]';
        if (addr === ROLES.MODERATOR) return 'text-[#6366f1]';
        if (addr === ROLES.LISTER) return 'text-[#FF8C00]';
        return isLight ? 'text-[#0a261a]' : 'text-white';
    };

    const getRoleIcon = (addr) => {
        if (addr === ROLES.ADMIN) return <ShieldCheck size={14} className="text-[#1A6140]" />;
        if (addr === ROLES.MODERATOR) return <Hammer size={14} className="text-[#6366f1]" />;
        if (addr === ROLES.LISTER) return <Hammer size={14} className="text-[#FF8C00]" />;
        return <User size={14} className={isLight ? 'text-[#0a261a]/20' : 'text-white/40'} />;
    };

    const content = (
        <div className={embedded
            ? `w-full h-full ${isLight ? 'bg-[#f0f9f4] border-[#1A6140]/20' : 'bg-[#0D0D0D] border-white/10'} border rounded-[32px] flex flex-col overflow-hidden backdrop-blur-md`
            : `w-[450px] h-[650px] ${isLight ? 'bg-[#f0f9f4] border-[#1A6140]/20' : 'bg-[#0D0D0D] border-white/10'} border rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden backdrop-blur-2xl`
        }>
            {/* Header */}
            <div className={`p-6 border-b ${isLight ? 'border-[#1A6140]/10' : 'border-white/5'} flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#1A6140]/10 border border-[#1A6140]/20 rounded-lg text-[#1A6140]">
                        <MessageSquare size={16} />
                    </div>
                    <div>
                        <h3 className={`text-sm font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>Lobby</h3>
                        <p className={`text-[9px] ${isLight ? 'text-black/30' : 'text-white/20'} font-bold uppercase tracking-tighter`}>Public Protocol Discussion</p>
                    </div>
                </div>
                {!embedded && (
                    <button onClick={onClose} className={`p-2 ${isLight ? 'hover:bg-black/5 text-black/20 hover:text-black' : 'hover:bg-white/5 text-white/20 hover:text-white'} rounded-full transition-all`}>
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Chat Messages */}
            <div className={`flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar ${isLight ? 'bg-[#1A6140]/5' : 'bg-black/20'}`}>
                {messages.length === 0 ? (
                    <div className={`h-full flex flex-col items-center justify-center text-center ${isLight ? 'opacity-10' : 'opacity-20'}`}>
                        <MessageSquare size={48} className="mb-4" />
                        <p className="text-xs font-black uppercase tracking-widest">No transmissions found</p>
                        <p className="text-[9px] font-bold">Start the conversation</p>
                    </div>
                ) : (
                    messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.sender === myAddress ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[11px] font-bold shadow-xl ${m.sender === myAddress
                                ? 'bg-[#1A6140] text-white rounded-tr-none'
                                : (isLight ? 'bg-[#f8fdfb] text-[#0a261a] border border-[#1A6140]/10 rounded-tl-none' : 'bg-white/5 text-white/80 border border-white/5 rounded-tl-none')
                                }`}>
                                {m.text}
                            </div>
                            <div className="flex items-center gap-1 mt-1.5 px-1">
                                <span className={`text-[7px] uppercase font-black tracking-widest ${getRoleColor(m.sender)}`}>
                                    {m.senderName || formatAddress(m.sender)} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {m.sender === myAddress && <Check size={8} className="text-[#1A6140]" />}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className={`p-6 ${isLight ? 'bg-[#f0f9f4] border-[#1A6140]/10' : 'bg-black/40 border-white/5'} border-t`}>
                <div className="flex gap-3">
                    <input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Broadcast to lobby..."
                        className={`flex-1 ${isLight ? 'bg-[#1A6140]/5 border-[#1A6140]/10 text-[#0a261a] placeholder:text-[#0a261a]/30' : 'bg-white/5 border-white/10 text-white'} border rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#1A6140]/40`}
                    />
                    <button
                        type="submit"
                        className="p-3 bg-[#1A6140] text-white rounded-xl shadow-[0_10px_20px_rgba(26, 97, 64,0.3)] hover:scale-105 transition-all active:scale-95"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );

    if (embedded) return content;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    className="fixed bottom-10 right-10 z-[500]"
                >
                    {content}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default MessagingSystem;
