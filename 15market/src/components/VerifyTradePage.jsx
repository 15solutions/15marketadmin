import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import TradeShareCard from './TradeShareCard';
import { KEEPER_URL_ARC } from '../constants';

/**
 * GET /verify/:tradeId
 *
 * Landing page for the QR printed on every win/lose share card. It resolves the
 * trade through the public GET /trade/:id endpoint and renders that trade's card
 * so a scan opens the same artifact the sharer saw.
 *
 * Deliberately outside every auth gate: the card is a public social artifact and
 * the QR must resolve for someone with no wallet, no session and no login. The
 * endpoint projects only card-relevant fields, so nothing private is reachable
 * from here.
 */

const STATE = { LOADING: 'loading', READY: 'ready', NOT_FOUND: 'not_found', ERROR: 'error' };

export default function VerifyTradePage() {
  const { tradeId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(STATE.LOADING);
  const [trade, setTrade] = useState(null);
  const [detail, setDetail] = useState('');

  const lookup = useCallback(async (id, signal) => {
    setState(STATE.LOADING);
    setTrade(null);
    setDetail('');
    try {
      // Bounded so a wedged backend shows an error instead of spinning forever.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });

      try {
        const res = await fetch(`${KEEPER_URL_ARC}/trade/${encodeURIComponent(id)}`, {
          signal: controller.signal
        });
        if (res.status === 404) {
          setState(STATE.NOT_FOUND);
          setDetail('No trade matches that ID. Double-check the code on the card.');
          return;
        }
        if (!res.ok) {
          setState(STATE.ERROR);
          setDetail(`The server could not look up that trade (HTTP ${res.status}).`);
          return;
        }
        const data = await res.json();
        const found = data?.trade || data;
        if (!found || found.error) {
          setState(STATE.NOT_FOUND);
          setDetail(found?.error || 'No trade matches that ID.');
          return;
        }
        setTrade(found);
        setState(STATE.READY);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setState(STATE.ERROR);
        setDetail('The lookup timed out. The backend may be unreachable right now.');
        return;
      }
      setState(STATE.ERROR);
      setDetail('Could not reach the 15market API.');
    }
  }, []);

  useEffect(() => {
    if (!tradeId) {
      setState(STATE.NOT_FOUND);
      setDetail('No trade ID in the link.');
      return;
    }
    const ac = new AbortController();
    lookup(tradeId, ac.signal);
    return () => ac.abort();
  }, [tradeId, lookup]);

  const heading = {
    [STATE.LOADING]: 'Loading trade…',
    [STATE.NOT_FOUND]: 'Trade not found',
    [STATE.ERROR]: 'Could not load trade'
  }[state];

  return (
    <div className="min-h-[100dvh] max-h-[100dvh] w-full flex flex-col items-center justify-center gap-6 px-4 py-10 overflow-y-auto bg-[#050505] text-white font-['Comfortaa',cursive]">
      {state === STATE.READY && trade && (
        <TradeShareCard
          isOpen
          trade={trade}
          userProfile={{ username: trade.username || 'Trader' }}
          onClose={() => navigate('/')}
        />
      )}

      {state !== STATE.READY && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 text-center"
        >
          <img src="/gowlogo.png" alt="15market" className="h-16 w-auto mx-auto mb-6 opacity-90" />

          {state === STATE.LOADING && (
            <div className="flex justify-center mb-5">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
          )}

          <h1 className="text-lg font-bold uppercase tracking-widest mb-2">{heading}</h1>
          {detail && <p className="text-xs text-white/60 leading-relaxed">{detail}</p>}

          <Link
            to="/"
            className="inline-flex items-center justify-center mt-7 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Go to 15market
          </Link>
        </motion.div>
      )}
    </div>
  );
}
