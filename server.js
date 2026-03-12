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

// État global du bot (partagé avec le sniper)
const botState = {
  running: false,
  positions: [],
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

// Mot de passe pour accéder (changeable dans .env)
const ACCESS_PASSWORD = process.env.WEBAPP_PASSWORD || 'sniper123';

// Debug: afficher le mot de passe au démarrage
console.log('🔐 MOT DE PASSE ACTUEL:', ACCESS_PASSWORD);

// Auth simple
app.post('/api/auth', async (req, res) => {
  const { password } = req.body;
  
  if (password === ACCESS_PASSWORD) {
    res.json({ success: true, token: 'authenticated' });
  } else {
    res.json({ success: false, error: 'Mot de passe incorrect' });
  }
});

// API: Status du bot
app.get('/api/status', (req, res) => {
  res.json({
    running: botState.running,
    uptime: process.uptime(),
    positions: botState.positions.length,
    balance: botState.walletBalance
  });
});

// API: Statistiques
app.get('/api/stats', (req, res) => {
  res.json(botState.stats);
});

// API: Positions
app.get('/api/positions', (req, res) => {
  res.json(botState.positions);
});

// API: Événements récents
app.get('/api/events', (req, res) => {
  res.json(botState.recentEvents.slice(-50)); // 50 derniers
});

// API: Configuration
app.get('/api/config', (req, res) => {
  res.json(botState.config);
});

// API: Mettre à jour config
app.post('/api/config', (req, res) => {
  const { key, value } = req.body;
  
  // TODO: Mettre à jour le .env et redémarrer le bot
  botState.config[key] = value;
  
  io.emit('config-updated', { key, value });
  res.json({ success: true });
});

// API: Contrôle du bot
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

// API: Fermer une position manuellement
app.post('/api/positions/:id/close', (req, res) => {
  const { id } = req.params;
  
  const position = botState.positions.find(p => p.id === id);
  if (position) {
    position.status = 'CLOSED';
    position.closeReason = 'MANUAL';
    position.closeTime = new Date();
    
    io.emit('position-closed', position);
    res.json({ success: true, position });
  } else {
    res.status(404).json({ success: false, error: 'Position non trouvée' });
  }
});

// WebSocket: Connexion client
io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);
  
  // Envoyer l'état initial
  socket.emit('initial-state', botState);
  
  // Handler: Événements du bot
  socket.on('event', (event) => {
    console.log('📥 Événement reçu:', event.type);
    
    // Ajouter à l'historique
    botState.recentEvents.push(event);
    
    // Limiter à 100 événements max
    if (botState.recentEvents.length > 100) {
      botState.recentEvents.shift();
    }
    
    // Broadcast à tous les clients connectés
    io.emit('event', event);
  });
  
  // Handler: Status du bot
  socket.on('bot-status', (data) => {
    console.log('📥 Status bot:', data.running);
    botState.running = data.running;
    io.emit('bot-status', data);
  });
  
  // Handler: Mise à jour position
  socket.on('position-update', (position) => {
    console.log('📥 Position mise à jour:', position.symbol);
    
    const index = botState.positions.findIndex(p => p.id === position.id);
    if (index >= 0) {
      botState.positions[index] = position;
    } else {
      botState.positions.push(position);
    }
    
    io.emit('position-update', position);
  });
  
  // Handler: Stats
  socket.on('stats-update', (stats) => {
    console.log('📥 Stats mises à jour');
    botState.stats = { ...botState.stats, ...stats };
    io.emit('stats-update', botState.stats);
  });
  
  // Handler: Wallet
  // Handler: Positions (array)
  socket.on("positions-update", (data) => {
    console.log("📥 Positions mises à jour:", data.positions.length);
    botState.positions = data.positions || [];
    io.emit("positions-update", data);
  });

  socket.on('wallet-update', (data) => {
    console.log('📥 Wallet mis à jour:', data.balance);
    botState.walletBalance = data.balance;
    io.emit('wallet-update', data);
  });
  
  socket.on('disconnect', () => {
    console.log('⚠️  Client déconnecté:', socket.id);
  });
});

// Fonctions pour le bot principal (à appeler depuis sniper.ts)
function emitEvent(type, data) {
  const event = {
    type,
    data,
    timestamp: new Date()
  };
  
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

// Exporter pour utilisation dans le bot principal
global.webappEmit = emitEvent;
global.webappUpdatePosition = updatePosition;
global.webappUpdateStats = updateStats;
global.webappUpdateWallet = updateWalletBalance;

// Démarrer le serveur
const PORT = process.env.WEBAPP_PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Web App disponible sur:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://0.0.0.0:${PORT}`);
  console.log(`\n🔒 Mot de passe: ${ACCESS_PASSWORD}`);
  console.log(`   (Changeable via WEBAPP_PASSWORD dans .env)\n`);
});
