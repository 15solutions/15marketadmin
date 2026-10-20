import React, { useEffect, useRef } from 'react';

/**
 * MobileAssetPicker — lightweight DOM-driven infinite wheel built to the spec.
 * Renders into a portal-like stage and emits a `asset-select` CustomEvent
 * on window when the ACTIVE asset toggles. Does not use external libraries.
 */
export default function MobileAssetPicker({ tokens = [], initialActive = null, onClose }) {
  const stageRef = useRef(null);
  const activeRef = useRef(initialActive);

  useEffect(() => {
    const A = (tokens.length ? tokens : [
      { s: 'BTC', c: '#f7931a', g: '₿' },
      { s: 'ETH', c: '#627eea', g: '◆' },
      { s: 'SOL', c: '#9945ff', g: '≡' },
      { s: 'AVAX', c: '#e84142', g: '▲' },
      { s: 'MON', c: '#836ef9', g: 'M' },
    ]).map(t => ({ s: t.symbol || t.s, c: t.color || t.c || '#fff', g: t.g || (t.symbol ? t.symbol[0] : '?') }));

    const container = stageRef.current;
    if (!container) return;

    // Inject styles scoped to the stage (so we don't rely on global CSS)
    const style = document.createElement('style');
    style.innerHTML = `:root{--green2:#1A6140}
html,body{margin:0}
#mobile-asset-stage{position:relative;height:100vh;background:#050807;overflow:hidden}
#mobile-asset-stage #anchor{position:absolute;left:50%;top:50%;width:0;height:0;touch-action:none}
#mobile-asset-stage .item{position:absolute;left:-60px;top:-22px;width:120px;height:44px;display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;background:none;border:0;cursor:pointer;will-change:transform,opacity;transform-origin:center;user-select:none}
#mobile-asset-stage .item small{font-size:15px;color:var(--c);filter:brightness(1.4)}
#mobile-asset-stage .item em{font-style:normal;font-weight:800;font-size:15px;letter-spacing:.06em}
#mobile-asset-stage .item.active em{color:var(--green2);text-shadow:0 0 18px #1A6140cc}
#mobile-asset-stage .item.active::after{content:"";position:absolute;bottom:-4px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--green2);box-shadow:0 0 10px var(--green2)}
`;
    container.appendChild(style);

    const N = A.length; const SP = 72;
    let pos = 1, active = typeof initialActive === 'number' ? initialActive : -1, justDragged = false, raf = null, drag = null;
    const mod = v => ((v % N) + N) % N;

    const anchor = document.createElement('div');
    anchor.id = 'anchor';
    container.appendChild(anchor);

    const els = A.map((a, i) => {
      const e = document.createElement('div');
      e.className = 'item';
      e.style.setProperty('--c', a.c);
      e.innerHTML = `<small>${a.g}</small><em>${a.s}</em>`;
      e.onclick = () => {
        if (justDragged) return;
        if (i === mod(Math.round(pos))) {
          active = active === i ? -1 : i;
          renderActive();
          window.dispatchEvent(new CustomEvent('asset-select', { detail: { symbol: A[i].s, active: active === i } }));
        } else snapTo(i);
      };
      anchor.appendChild(e);
      return e;
    });

    function renderActive() { els.forEach((e,k)=>e.classList.toggle('active', k===active)); }

    function layout() {
      els.forEach((e,i)=>{
        let d = i - pos; d = ((d + N/2) % N + N) % N - N/2;
        const ad = Math.abs(d);
        const sc = ad < 1 ? 1.6 - ad * .75 : .85 - Math.min(ad - 1, 1) * .15;
        e.style.transform = `translateY(${d*SP}px) scale(${sc})`;
        e.style.opacity = ad <= 1 ? 1 - .4 * ad : Math.max(0, .6 - (ad - 1) * .5);
        e.style.zIndex = 10 - Math.round(ad);
      });
    }

    function snapTo(i) {
      cancelAnimationFrame(raf);
      let d = i - pos; d = ((d + N/2) % N + N) % N - N/2;
      const from = pos, to = pos + d, t0 = performance.now();
      (function f(n){
        const k = Math.min(1, (n - t0) / 280), e = 1 - Math.pow(1 - k, 3);
        pos = from + (to - from) * e; layout();
        if (k < 1) raf = requestAnimationFrame(f); else pos = mod(to);
      })(t0);
    }

    function onPointerDown(e) { drag = { y: e.clientY, p: pos, moved: false }; cancelAnimationFrame(raf); }
    function onPointerMove(e) {
      if (!drag) return;
      const dy = e.clientY - drag.y; if (Math.abs(dy) > 4) drag.moved = true;
      pos = drag.p - dy / SP; layout();
    }
    function onPointerUp() {
      if (!drag) return; const m = drag.moved; drag = null; if (m) { justDragged = true; setTimeout(()=>justDragged=false, 60); snapTo(mod(Math.round(pos))); }
    }

    function onWheel(e) { e.preventDefault(); snapTo(mod(Math.round(pos + Math.sign(e.deltaY)))); }

    // Attach pointer and wheel listeners to container (which fills stage)
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', layout);

    layout(); renderActive();

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', layout);
      try { container.removeChild(anchor); } catch (e) {}
      try { container.removeChild(style); } catch (e) {}
    };
  }, [tokens, initialActive]);

  return (
    <div id="mobile-asset-stage" ref={stageRef} style={{ position: 'relative', height: '100vh', background: '#050807', overflow: 'hidden' }} onClick={onClose} />
  );
}
