# 🚀 Solana Memecoin Sniper - Web Dashboard

Dashboard web temps réel pour contrôler et monitorer le bot de snipe Solana.

## 🌟 Fonctionnalités

- 📊 Dashboard temps réel (WebSocket)
- 💰 Suivi des positions et P&L
- 🎛️ Contrôles Start/Stop/Restart du bot
- 🔔 Feed d'événements live
- 📱 Responsive (mobile-friendly)
- 🔐 Authentification par mot de passe

## 🚄 Déploiement sur Railway

### Méthode Rapide (Recommandée)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Clique sur le bouton ci-dessus
2. Configure les variables d'environnement :
   - `WEBAPP_PASSWORD` : Ton mot de passe (défaut: `sniper123`)
   - `PORT` : `8080` (ou laisse vide)
3. Deploy !

### Méthode Manuelle

1. Va sur [Railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub**
3. Connecte ton compte GitHub (si pas déjà fait)
4. Sélectionne ce repository
5. Railway détecte automatiquement Node.js
6. Ajoute les variables d'environnement (voir ci-dessous)
7. Deploy !

## ⚙️ Variables d'Environnement

```env
WEBAPP_PASSWORD=sniper123
PORT=8080
NODE_ENV=production
```

## 🔐 Accès

Une fois déployé :
- Railway te donne une URL publique (ex: `https://xxx.railway.app`)
- Ouvre-la dans ton navigateur
- Entre le mot de passe configuré
- Profite du dashboard ! 🎉

## 📋 Prérequis

- Node.js 18+
- npm

## 🛠️ Développement Local

```bash
npm install
node server.js
```

Le serveur démarre sur `http://localhost:8080`

## 📊 Stack Technique

- **Backend** : Node.js + Express
- **WebSocket** : Socket.IO
- **Frontend** : Vanilla JS + Tailwind CSS
- **Auth** : Simple password protection

## 🔒 Sécurité

- Utilise HTTPS en production (Railway le fait automatiquement)
- Change le mot de passe par défaut
- Le dashboard communique avec le bot via WebSocket sécurisé

## 📝 License

MIT

---

**Créé pour le Solana Memecoin Sniper Bot** 🚀
