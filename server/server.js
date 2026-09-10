const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const GameManager = require('./game/GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Serve static frontend files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Initialize server-authoritative Game Engine
const gameManager = new GameManager(io);

// Broadcast lobby state to anyone currently in lobby
function broadcastLobbyStatus() {
  io.emit('lobby_status', {
    currentPlayers: gameManager.getPlayerCount(),
    maxPlayers: config.MAX_PLAYERS,
  });
}

io.on('connection', (socket) => {
  // Send current lobby status immediately
  socket.emit('lobby_status', {
    currentPlayers: gameManager.getPlayerCount(),
    maxPlayers: config.MAX_PLAYERS,
  });

  // Handle player joining the game
  socket.on('join_game', (data = {}) => {
    // Check if player is already joined
    if (gameManager.players.has(socket.id)) {
      return;
    }

    // Check 10 players limit
    if (gameManager.getPlayerCount() >= config.MAX_PLAYERS) {
      socket.emit('join_error', {
        message: `현재 방 인원이 꽉 찼습니다. (최대 ${config.MAX_PLAYERS}명)`,
      });
      return;
    }

    const nickname = typeof data.nickname === 'string' && data.nickname.trim()
      ? data.nickname.trim().substring(0, 12)
      : `Player_${Math.floor(Math.random() * 900 + 100)}`;

    const color = typeof data.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(data.color)
      ? data.color
      : '#3b82f6';

    const result = gameManager.addPlayer(socket.id, nickname, color);

    if (!result.success) {
      socket.emit('join_error', { message: result.reason });
      return;
    }

    // Respond with initial map and config data
    socket.emit('join_success', {
      playerId: socket.id,
      map: {
        width: gameManager.map.width,
        height: gameManager.map.height,
        safeZone: gameManager.map.safeZone,
        obstacles: gameManager.map.obstacles,
      },
      playerConfig: {
        radius: config.PLAYER.RADIUS,
        maxHp: config.PLAYER.MAX_HP,
        maxStamina: config.PLAYER.MAX_STAMINA,
        attackCooldown: config.PLAYER.ATTACK_COOLDOWN,
        rangedCooldown: config.PLAYER.RANGED_COOLDOWN,
        maxAmmo: config.PLAYER.MAX_AMMO,
      },
    });

    broadcastLobbyStatus();
    console.log(`[Player Joined] ${nickname} (${socket.id}) - Total: ${gameManager.getPlayerCount()}/${config.MAX_PLAYERS}`);
  });

  // Handle movement & aim inputs
  socket.on('player_input', (inputs) => {
    gameManager.handlePlayerInput(socket.id, inputs);
  });

  // Handle weapon switch (1: Melee, 2: Ranged)
  socket.on('switch_weapon', (data = {}) => {
    gameManager.handleSwitchWeapon(socket.id, data.weapon || 1);
  });

  // Handle attack action
  socket.on('player_attack', () => {
    gameManager.handlePlayerAttack(socket.id);
  });

  // Handle chat messages
  socket.on('chat_message', (data = {}) => {
    const player = gameManager.players.get(socket.id);
    if (!player) return;

    const rawText = typeof data.text === 'string' ? data.text.trim() : '';
    if (!rawText || rawText.length === 0) return;

    const text = rawText.substring(0, 70); // Max 70 chars

    // Set synchronized overhead chat bubble on player
    player.setChatMessage(text);

    io.emit('chat_broadcast', {
      playerId: socket.id,
      nickname: player.nickname,
      color: player.color,
      text: text,
      timestamp: Date.now(),
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const removed = gameManager.removePlayer(socket.id);
    if (removed) {
      broadcastLobbyStatus();
      console.log(`[Player Left] (${socket.id}) - Total: ${gameManager.getPlayerCount()}/${config.MAX_PLAYERS}`);
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🎮 Top-Down Multiplayer Action Game Server Running`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`👥 Max Concurrent Players: ${config.MAX_PLAYERS}`);
  console.log(`⏱️ Server Tick Rate: ${config.TICK_RATE} Hz`);
  console.log(`=================================================`);
});
