import React, { useMemo } from 'react';
import { Info } from 'lucide-react';

function SentimentGauge({ yesPct = 62, noPct = 38 }) {
  const svgWidth = 160;
  const svgHeight = 90;
  const cx = svgWidth / 2;
  const cy = 80;
  const radius = 62;
  const strokeWidth = 10;

  const startAngle = -180;
  const endAngle = 0;
  const totalAngle = 180;
  const yesAngle = (yesPct / 100) * totalAngle;

  const polarToCartesian = (angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (startAng, endAng) => {
    const start = polarToCartesian(endAng);
    const end = polarToCartesian(startAng);
    const largeArc = endAng - startAng <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[160px] h-[90px] flex items-center justify-center">
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          {/* Background arc - green side */}
          <path d={describeArc(startAngle, startAngle + yesAngle)} fill="none" stroke="#1A6140" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.1" />
          {/* Background arc - red side */}
          <path d={describeArc(startAngle + yesAngle, endAngle)} fill="none" stroke="#E13E27" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.1" />
          {/* Active green arc */}
          <path d={describeArc(startAngle, startAngle + yesAngle)} fill="none" stroke="#1A6140" strokeWidth={strokeWidth} strokeLinecap="round" />
          {/* Active red arc */}
          <path d={describeArc(startAngle + yesAngle, endAngle)} fill="none" stroke="#E13E27" strokeWidth={strokeWidth} strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex items-center justify-between w-full px-2 mt-1">
        <div className="text-center flex-1">
          <div className="text-[#1A6140] text-[15px] font-black leading-none">{yesPct}%</div>
          <div className="text-[9px] font-black text-[#1A6140] tracking-[0.15em] uppercase mt-0.5">YES</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-[#E13E27] text-[15px] font-black leading-none">{noPct}%</div>
          <div className="text-[9px] font-black text-[#E13E27] tracking-[0.15em] uppercase mt-0.5">NO</div>
        </div>
      </div>
    </div>
  );
}

const newlyAddedData = [
  { symbol: 'XRP', color: '#8B8B8B', icon: '✕' },
  { symbol: 'BNB', color: '#F3BA2F', icon: '◆' },
  { symbol: 'DOGE', color: '#C2A633', icon: 'Ð' },
  { symbol: 'MON', color: '#8B5CF6', icon: '●' },
  { symbol: 'AVAX', color: '#E84142', icon: '▲' },
];

export default function RightSidebar({
  price,
  activeMarket,
  activeTrades,
  tradeHistory,
  theme,
  isSmallScreen,
}) {
  const sentiment = useMemo(() => {
    if (!tradeHistory || tradeHistory.length === 0) return { yes: 62, no: 38 };
    const recent = tradeHistory.slice(0, 20);
    const yesCount = recent.filter(t => t.direction === 'UP' || t.direction === 'YES' || t.won).length;
    const total = recent.length || 1;
    return { yes: Math.round((yesCount / total) * 100), no: Math.round(((total - yesCount) / total) * 100) };
  }, [tradeHistory]);

  const stats = useMemo(() => {
    const currentPrice = parseFloat(price) || 1880.89;
    const change24h = activeMarket?.change || 2.41;
    const high24h = currentPrice * 1.0215;
    const low24h = currentPrice * 0.9767;
    return {
      price: currentPrice,
      change: change24h,
      high: high24h,
      low: low24h,
      volume: 2.45,
      totalVolume: 12430.59,
      activeTradeCount: activeTrades?.length || 256,
    };
  }, [price, activeMarket, activeTrades]);

  if (isSmallScreen) return null;

  return (
    <div className="w-[230px] min-w-[230px] h-full flex flex-col gap-3 overflow-y-auto pl-1 pr-1 pb-4 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {/* Market Sentiment Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-gray-500">
            MARKET SENTIMENT <span className="text-gray-400 font-medium">(15S)</span>
          </div>
          <Info size={12} className="text-gray-300 cursor-pointer hover:text-gray-400 transition-colors" />
        </div>
        <SentimentGauge yesPct={sentiment.yes} noPct={sentiment.no} />
        <div className="mt-4 pt-3 border-t border-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Volume</span>
            <span className="text-[11px] font-black text-gray-800">${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Trades</span>
            <span className="text-[11px] font-black text-gray-800">{stats.activeTradeCount}</span>
          </div>
        </div>
      </div>

      {/* Market Stats Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-gray-500">
            MARKET STATS
          </div>
          <Info size={12} className="text-gray-300 cursor-pointer hover:text-gray-400 transition-colors" />
        </div>
        <div className="space-y-2">
          {[
            { label: 'Current Price', value: `$${stats.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: '24h Change', value: `${stats.change >= 0 ? '+' : ''}${stats.change.toFixed(2)}%`, color: stats.change >= 0 ? 'text-[#1A6140]' : 'text-[#E13E27]' },
            { label: '24h High', value: `$${stats.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: '24h Low', value: `$${stats.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: '24h Volume', value: `$${stats.volume.toFixed(2)}M` },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.label}</span>
              <span className={`text-[11px] font-black ${item.color || 'text-gray-800'}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Newly Added Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-gray-500 flex items-center gap-1.5">
            NEWLY ADDED
            <span className="px-1.5 py-[2px] bg-[#0A3A25] text-white text-[7px] font-black uppercase rounded tracking-wider">
              NEW
            </span>
          </div>
        </div>
        <div className="space-y-0.5">
          {newlyAddedData.map((m) => (
            <div key={m.symbol} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ backgroundColor: m.color + '15', color: m.color }}
                >
                  {m.icon}
                </div>
                <span className="text-[11px] font-black text-gray-700">{m.symbol}</span>
              </div>
              <span className="px-2 py-[1.5px] border border-[#1A6140]/25 text-[7px] font-black text-[#1A6140] uppercase rounded tracking-wider bg-[#1A6140]/5">
                NEW
              </span>
            </div>
          ))}
        </div>
        <button className="w-full mt-3 pt-2.5 border-t border-gray-50 flex items-center justify-center gap-1 text-[10px] font-bold text-gray-400 hover:text-[#1A6140] transition-colors uppercase tracking-wider">
          View All New Markets
          <span className="text-[12px] font-bold">›</span>
        </button>
      </div>
    </div>
  );
}
