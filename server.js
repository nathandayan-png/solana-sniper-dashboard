const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// État global du bot
const botState = {
  running: false,
  positions: [],
  closedTrades: [], // NOUVEAU: Historique des trades fermés
  stats: {
    totalTrades: 0,
    winningTrades: 0,
    totalPnL: 0,
    winRate: 0
  },
  recentEvents: [],
  config: {},
  walletBalance: 0
};

const ACCESS_PASSWORD = process.env.WEBAPP_PASSWORD || 'sniper123';
console.log('🔐 MOT DE PASSE:', ACCESS_PASSWORD);

// Auth
app.post('/api/auth', async (req, res) => {
  const { password } = req.body;
  if (password === ACCESS_PASSWORD) {
    res.json({ success: true, token: 'authenticated' });
  } else {
    res.json({ success: false, error: 'Mot de passe incorrect' });
  }
});

// API: Status
app.get('/api/status', (req, res) => {
  res.json({
    running: botState.running,
    uptime: process.uptime(),
    positions: botState.positions.length,
    balance: botState.walletBalance
  });
});

// API: Stats
app.get('/api/stats', (req, res) => {
  res.json(botState.stats);
});

// API: Positions ouvertes
app.get('/api/positions', (req, res) => {
  res.json(botState.positions);
});

// API: Historique des trades fermés
app.get('/api/trades/closed', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(botState.closedTrades.slice(-limit).reverse());
});

// API: Événements
app.get('/api/events', (req, res) => {
  res.json(botState.recentEvents.slice(-50));
});

// API: Config
app.get('/api/config', (req, res) => {
  res.json(botState.config);
});

app.post('/api/config', (req, res) => {
  const { key, value } = req.body;
  botState.config[key] = value;
  io.emit('config-updated', { key, value });
  res.json({ success: true });
});

// API: Contrôle
app.post('/api/control/:action', (req, res) => {
  const { action } = req.params;
  
  switch (action) {
    case 'start':
      botState.running = true;
      io.emit('bot-status', { running: true });
      res.json({ success: true, message: 'Bot démarré' });
      break;
      
    case 'stop':
      botState.running = false;
      io.emit('bot-status', { running: false });
      res.json({ success: true, message: 'Bot arrêté' });
      break;
      
    case 'restart':
      botState.running = false;
      setTimeout(() => {
        botState.running = true;
        io.emit('bot-status', { running: true });
      }, 2000);
      res.json({ success: true, message: 'Bot en cours de redémarrage' });
      break;
      
    default:
      res.status(400).json({ success: false, error: 'Action inconnue' });
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);
  
  // Envoyer état initial
  socket.emit('initial-state', {
    ...botState,
    closedTrades: botState.closedTrades.slice(-50)
  });
  
  // Handler: Événements
  socket.on('event', (event) => {
    console.log('📥 Event:', event.type);
    botState.recentEvents.push(event);
    if (botState.recentEvents.length > 100) {
      botState.recentEvents.shift();
    }
    io.emit('event', event);
  });
  
  // Handler: Status bot
  socket.on('bot-status', (data) => {
    console.log('📥 Bot status:', data.running);
    botState.running = data.running;
    io.emit('bot-status', data);
  });
  
  // Handler: Position unique
  socket.on('position-update', (position) => {
    console.log('📥 Position update:', position.symbol);
    const index = botState.positions.findIndex(p => p.id === position.id);
    if (index >= 0) {
      botState.positions[index] = position;
    } else {
      botState.positions.push(position);
    }
    io.emit('position-update', position);
  });
  
  // Handler: Positions (array)
  socket.on('positions-update', (data) => {
    console.log('📥 Positions update:', data.positions?.length || 0);
    botState.positions = data.positions || [];
    io.emit('positions-update', data);
  });
  
  // Handler: Trade fermé (NOUVEAU)
  socket.on('trade-closed', (trade) => {
    console.log('📥 Trade closed:', trade.symbol, trade.pnl);
    
    // Ajouter à l'historique
    botState.closedTrades.push({
      ...trade,
      closedAt: new Date()
    });
    
    // Limiter à 500 trades max
    if (botState.closedTrades.length > 500) {
      botState.closedTrades.shift();
    }
    
    // Retirer des positions ouvertes si présent
    botState.positions = botState.positions.filter(p => p.address !== trade.address);
    
    // Broadcast
    io.emit('trade-closed', trade);
    io.emit('positions-update', { positions: botState.positions });
  });
  
  // Handler: Stats
  socket.on('stats-update', (stats) => {
    console.log('📥 Stats update');
    botState.stats = { ...botState.stats, ...stats };
    io.emit('stats-update', botState.stats);
  });
  
  // Handler: Wallet
  socket.on('wallet-update', (data) => {
    console.log('📥 Wallet:', data.balance);
    botState.walletBalance = data.balance;
    io.emit('wallet-update', data);
  });
  
  // Handler: Trade (buy/sell)
  socket.on('trade', (data) => {
    console.log('📥 Trade:', data.type, data.data?.symbol);
    io.emit('trade', data);
  });
  
  socket.on('disconnect', () => {
    console.log('⚠️  Client déconnecté:', socket.id);
  });
});

// Fonctions pour le bot
function emitEvent(type, data) {
  const event = { type, data, timestamp: new Date() };
  botState.recentEvents.push(event);
  if (botState.recentEvents.length > 100) {
    botState.recentEvents.shift();
  }
  io.emit('event', event);
}

function updatePosition(position) {
  const index = botState.positions.findIndex(p => p.id === position.id);
  if (index >= 0) {
    botState.positions[index] = position;
  } else {
    botState.positions.push(position);
  }
  io.emit('position-update', position);
}

function updateStats(stats) {
  botState.stats = { ...botState.stats, ...stats };
  io.emit('stats-update', botState.stats);
}

function updateWalletBalance(balance) {
  botState.walletBalance = balance;
  io.emit('wallet-update', { balance });
}

global.webappEmit = emitEvent;
global.webappUpdatePosition = updatePosition;
global.webappUpdateStats = updateStats;
global.webappUpdateWallet = updateWalletBalance;

const PORT = process.env.WEBAPP_PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Web App: http://localhost:${PORT}`);
  console.log(`🔒 Mot de passe: ${ACCESS_PASSWORD}\n`);
});
