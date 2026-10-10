// ============================================================
// nexus-core/src/price-frontend.js
// DIRECT RELAY: Price Stream Proxy (Port 3012)
// ============================================================
// Routes price updates from the backend's concurrent WebSocket feeds
// DIRECTLY to connected clients with zero buffering or batching.
// Redis relay removed — introduces latency and message loss under load.
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6,
  upgradeTimeout: 10000,
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Cache latest prices to send on connection
const priceCache = { btc: 0, eth: 0, sol: 0, xrp: 0, jup: 0, avax: 0, mon: 0, ts: {} };
let lastUpdate = Date.now();

/**
 * receivePrice(data)
 * Called directly from the backend's priceService.start(io).
 * Broadcasts immediately to all connected clients with zero latency.
 */
function receivePrice(data) {
  if (!data || !data.key || !data.price) return;

  priceCache[data.key] = data.price;
  priceCache.ts[data.key] = data.ts || Date.now();
  lastUpdate = Date.now();

  io.emit('price', {
    key: data.key,
    price: data.price,
    ts: priceCache.ts[data.key],
    source: 'backend'
  });
}

setInterval(() => {
  const activeClients = io.engine.clientsCount;
  console.log(`[Price-Frontend] Active clients: ${activeClients}, Last update: ${new Date(lastUpdate).toLocaleTimeString()}`);
}, 30000);

io.on('connection', (socket) => {
  console.log(`[Price-Frontend] Client connected: ${socket.id}`);

  for (const [key, price] of Object.entries(priceCache)) {
    if (key === 'ts') continue;
    if (price > 0) {
      socket.emit('price', { key, price, ts: priceCache.ts[key], source: 'cache' });
    }
  }

  socket.on('disconnect', () => {
    console.log(`[Price-Frontend] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PRICE_FRONTEND_PORT || 3012;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Price Stream Relay listening on port ${PORT}`);
});

module.exports = { server, io, receivePrice };
