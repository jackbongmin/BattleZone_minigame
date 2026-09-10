/**
 * Main Client Game Orchestrator
 */
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elements - Lobby
  const lobbyScreen = document.getElementById('lobbyScreen');
  const loginForm = document.getElementById('loginForm');
  const nicknameInput = document.getElementById('nicknameInput');
  const colorPalette = document.getElementById('colorPalette');
  const customColorInput = document.getElementById('customColorInput');
  const joinBtn = document.getElementById('joinBtn');
  const lobbyError = document.getElementById('lobbyError');
  const playerCountDisplay = document.getElementById('playerCountDisplay');

  // DOM Elements - In-Game HUD
  const gameHud = document.getElementById('gameHud');
  const hudAvatarDot = document.getElementById('hudAvatarDot');
  const hudNickname = document.getElementById('hudNickname');
  const hudKills = document.getElementById('hudKills');
  const hudHpText = document.getElementById('hudHpText');
  const hudHpFill = document.getElementById('hudHpFill');
  const hudStaminaText = document.getElementById('hudStaminaText');
  const hudStaminaFill = document.getElementById('hudStaminaFill');
  const cooldownDot = document.getElementById('cooldownDot');
  const slotWeapon1 = document.getElementById('slotWeapon1');
  const slotWeapon2 = document.getElementById('slotWeapon2');
  const hudAmmoText = document.getElementById('hudAmmoText');
  const hudAmmoBadge = document.getElementById('hudAmmoBadge');
  const safeZoneBadge = document.getElementById('safeZoneBadge');
  const hudBuffsContainer = document.getElementById('hudBuffsContainer');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const leaderboardPlayerCount = document.getElementById('leaderboardPlayerCount');
  const killFeed = document.getElementById('killFeed');
  const respawnOverlay = document.getElementById('respawnOverlay');
  const respawnCountdownText = document.getElementById('respawnCountdownText');
  const respawnBarFill = document.getElementById('respawnBarFill');
  const soundToggleBtn = document.getElementById('soundToggleBtn');

  // DOM Elements - Chat Box
  const chatContainer = document.getElementById('chatContainer');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');

  // Canvas
  const gameCanvas = document.getElementById('gameCanvas');
  const minimapCanvas = document.getElementById('minimapCanvas');
  const renderer = new Renderer(gameCanvas, minimapCanvas);

  // State
  let myPlayerId = null;
  let selectedColor = '#3b82f6';
  let latestGameState = null;
  let lastAttackSentTime = 0;
  let currentSelectedWeapon = 1; // 1: Sword, 2: Ranged
  let meleeCooldownDuration = 750; // 0.75s heavier attack cooldown
  let rangedCooldownDuration = 420; // 0.42s ranged shot cooldown
  let lastDryClickTime = 0;
  let inGame = false;
  let lastTimestamp = performance.now();
  let lastChatSentTime = 0;

  // Persistent chat bubbles map (playerId -> { text, startTime, duration })
  const chatBubbles = new Map();
  window.chatBubbles = chatBubbles;

  // 1. Color Palette Selection
  const colorBtns = colorPalette.querySelectorAll('.color-btn');
  colorBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      colorBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
      customColorInput.value = selectedColor;
    });
  });

  customColorInput.addEventListener('input', (e) => {
    selectedColor = e.target.value;
    colorBtns.forEach((b) => b.classList.remove('active'));
  });

  // 2. Sound Toggle
  soundToggleBtn.addEventListener('click', () => {
    const isMuted = window.soundManager.toggleMute();
    soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
  });

  // 3. Lobby Status Updates
  socket.on('lobby_status', (data) => {
    const current = data.currentPlayers;
    const max = data.maxPlayers;
    playerCountDisplay.textContent = `${current} / ${max}명`;

    const indicator = document.querySelector('.status-indicator');
    if (current >= max) {
      if (indicator) indicator.classList.add('full');
      joinBtn.disabled = true;
      joinBtn.querySelector('span').textContent = '정원 초과 (FULL)';
    } else {
      if (indicator) indicator.classList.remove('full');
      joinBtn.disabled = false;
      joinBtn.querySelector('span').textContent = '입장하기 (ENTER ARENA)';
    }
  });

  // 4. Join Game Form Submission
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      showLobbyError('닉네임을 입력해주세요.');
      return;
    }

    lobbyError.style.display = 'none';
    joinBtn.disabled = true;
    joinBtn.querySelector('span').textContent = '입장 중...';

    // Request to join server
    socket.emit('join_game', {
      nickname,
      color: selectedColor,
    });
  });

  function showLobbyError(msg) {
    lobbyError.textContent = msg;
    lobbyError.style.display = 'block';
    joinBtn.disabled = false;
    joinBtn.querySelector('span').textContent = '입장하기 (ENTER ARENA)';
  }

  function selectWeapon(weaponId) {
    const target = weaponId === 2 ? 2 : 1;
    currentSelectedWeapon = target;
    window.inputHandler.selectedWeapon = target;
    socket.emit('switch_weapon', { weapon: currentSelectedWeapon });

    if (currentSelectedWeapon === 1) {
      if (slotWeapon1) slotWeapon1.classList.add('active');
      if (slotWeapon2) slotWeapon2.classList.remove('active');
    } else {
      if (slotWeapon1) slotWeapon1.classList.remove('active');
      if (slotWeapon2) slotWeapon2.classList.add('active');
    }
  }

  function tryAttack() {
    if (!inGame || !myPlayerId || !latestGameState) return;
    const me = latestGameState.players.find((p) => p.id === myPlayerId);
    if (!me || me.isDead) return;

    const isRanged = currentSelectedWeapon === 2;
    let baseCooldown = isRanged ? rangedCooldownDuration : meleeCooldownDuration;
    if (me.buffs && me.buffs.atkSpeed > 0) {
      baseCooldown = Math.round(baseCooldown * 0.5);
    }

    const now = Date.now();
    if (now - lastAttackSentTime < baseCooldown) return;

    // Check ammo if ranged weapon
    if (isRanged && (me.ammo === undefined ? 0 : me.ammo) <= 0) {
      if (now - lastDryClickTime > 350) {
        lastDryClickTime = now;
        window.soundManager.playEmptyClick();
        window.particleSystem.spawnFloatingText(me.x, me.y - 30, '탄약 부족! (0/30)', '#ef4444');
      }
      return;
    }

    lastAttackSentTime = now;

    // Send attack to server
    socket.emit('player_attack');

    // Client-side prediction & visual/sound FX
    if (isRanged) {
      window.soundManager.playRangedShoot();
      window.particleSystem.spawnMuzzleFlash(
        me.x + Math.cos(window.inputHandler.angle) * 28,
        me.y + Math.sin(window.inputHandler.angle) * 28,
        window.inputHandler.angle
      );
    } else {
      window.soundManager.playSlash();
      me.isAttacking = true;
      window.particleSystem.spawnSlash(me.x, me.y, window.inputHandler.angle, me.color, 94);
    }
  }

  // 5. Server response on join
  socket.on('join_error', (data) => {
    showLobbyError(data.message || '입장에 실패했습니다.');
  });

  socket.on('join_success', (data) => {
    myPlayerId = data.playerId;
    meleeCooldownDuration = data.playerConfig.attackCooldown || 750;
    rangedCooldownDuration = data.playerConfig.rangedCooldown || 420;
    renderer.setMapData(data.map);

    // Transition UI from Lobby to Game
    lobbyScreen.style.display = 'none';
    gameHud.style.display = 'block';
    inGame = true;

    // Set Avatar UI
    hudAvatarDot.style.backgroundColor = selectedColor;
    hudNickname.textContent = nicknameInput.value.trim();

    // Reset leaderboard cleanly on connection
    updateLeaderboard([]);

    // Setup weapon slot buttons & key switching
    if (slotWeapon1) slotWeapon1.addEventListener('click', () => selectWeapon(1));
    if (slotWeapon2) slotWeapon2.addEventListener('click', () => selectWeapon(2));
    window.inputHandler.onWeaponSwitch((w) => selectWeapon(w));

    // Enable inputs
    window.inputHandler.enable();
    window.soundManager.ensureContext();

    // Setup Attack trigger with Client-Side Prediction & Auto-repeat on mouse hold
    window.inputHandler.onAttack(() => {
      tryAttack();
    });

    // Setup Enter key handling for Chat
    window.inputHandler.onEnter((e) => {
      if (document.activeElement === chatInput) {
        sendChat();
      } else {
        e.preventDefault();
        chatInput.focus();
        window.inputHandler.setChatting(true);
      }
    });

    // Chat form submit
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat();
    });

    // Chat input key handling (Escape to cancel)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        chatInput.value = '';
        chatInput.blur();
        window.inputHandler.setChatting(false);
      }
    });

    chatInput.addEventListener('focus', () => {
      window.inputHandler.setChatting(true);
      if (chatContainer) chatContainer.classList.add('active');
    });

    chatInput.addEventListener('blur', () => {
      window.inputHandler.setChatting(false);
      if (chatContainer) chatContainer.classList.remove('active');
    });

    // Start 30Hz input sending loop
    setInterval(() => {
      if (inGame && window.inputHandler.enabled) {
        socket.emit('player_input', window.inputHandler.getPayload());
      }
    }, 1000 / 30);
  });

  function sendChat() {
    const now = Date.now();
    if (now - lastChatSentTime < 150) return; // Prevent double trigger
    lastChatSentTime = now;

    const text = chatInput.value.trim();
    if (text.length > 0) {
      socket.emit('chat_message', { text });

      // Immediate local chat bubble display on local player
      const bubble = {
        text,
        startTime: performance.now(),
        duration: 5000,
      };
      chatBubbles.set(myPlayerId, bubble);

      if (latestGameState && latestGameState.players) {
        const me = latestGameState.players.find((p) => p.id === myPlayerId);
        if (me) {
          me.chatBubble = bubble;
          me.chatMessage = bubble;
        }
      }

      chatInput.value = '';
    }

    chatInput.blur();
    window.inputHandler.setChatting(false);
  }

  // 6. Handle Incoming Chat Broadcast
  socket.on('chat_broadcast', (msg) => {
    // 1. Add to chat log
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'chat-sender';
    senderSpan.style.color = msg.color || '#38bdf8';
    senderSpan.textContent = `[${msg.nickname}]:`;

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = ` ${msg.text}`;

    msgEl.appendChild(senderSpan);
    msgEl.appendChild(textSpan);
    chatMessages.appendChild(msgEl);

    // Auto scroll
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 2. Set chat bubble on player with monotonic local performance.now()
    const bubble = {
      text: msg.text,
      startTime: performance.now(),
      duration: 5000,
    };
    chatBubbles.set(msg.playerId, bubble);

    if (latestGameState && latestGameState.players) {
      const targetP = latestGameState.players.find((p) => p.id === msg.playerId);
      if (targetP) {
        targetP.chatBubble = bubble;
        targetP.chatMessage = bubble;
      }
    }
  });

  // 7. Handle Server Game State Snapshot Broadcast
  socket.on('gameState', (state) => {
    latestGameState = state;

    // Sync persistent chat bubbles onto players using client-controlled monotonic timer
    if (state.players) {
      const nowPerf = performance.now();
      for (const p of state.players) {
        // If server sent a chatMessage text and we don't have it tracked, register it locally
        if (p.chatMessage && p.chatMessage.text) {
          const existing = chatBubbles.get(p.id);
          if (!existing || existing.text !== p.chatMessage.text) {
            chatBubbles.set(p.id, {
              text: p.chatMessage.text,
              startTime: nowPerf,
              duration: 5000,
            });
          }
        }

        const bubble = chatBubbles.get(p.id);
        if (bubble) {
          const elapsed = nowPerf - bubble.startTime;
          if (elapsed < bubble.duration) {
            p.chatBubble = bubble;
            p.chatMessage = bubble;
          } else {
            chatBubbles.delete(p.id);
            p.chatBubble = null;
            p.chatMessage = null;
          }
        }
      }
    }

    // Process events (sounds, damage numbers, sparks, slashes, item/ammo pickups, monster drop pickups, kill messages)
    if (state.events && state.events.length > 0) {
      for (const ev of state.events) {
        if (ev.type === 'slash') {
          if (ev.sourceId !== myPlayerId) {
            window.particleSystem.spawnSlash(ev.x, ev.y, ev.angle, ev.color, ev.range);
          }
        } else if (ev.type === 'hit') {
          const isRelatedToMe = (ev.attackerId === myPlayerId || ev.targetId === myPlayerId);
          const isCrit = (ev.damage > 25);

          if (window.particleSystem) {
            window.particleSystem.triggerHit(ev.targetId, ev.x, ev.y, ev.damage, isCrit);
            // If hit wasn't done by or to local player, reduce camera shake slightly
            if (!isRelatedToMe) {
              window.particleSystem.screenShake = Math.max(window.particleSystem.screenShake - 4, 0);
            }
          }

          // Trigger heavy hit punch & crunch sound whenever player hits or gets hit
          if (window.soundManager && isRelatedToMe) {
            window.soundManager.playHit(isCrit);
          }
        } else if (ev.type === 'item_pickup') {
          if (window.particleSystem) {
            const effectColor =
              ev.itemType === 'health'
                ? '#10b981'
                : ev.itemType === 'atk_speed'
                ? '#f59e0b'
                : '#06b6d4';
            window.particleSystem.spawnItemEffect(ev.x, ev.y, ev.text, effectColor);
          }
          if (ev.playerId === myPlayerId) {
            window.soundManager.playItemPickup();
          }
        } else if (ev.type === 'ammo_pickup') {
          if (window.particleSystem) {
            window.particleSystem.spawnItemEffect(ev.x, ev.y, ev.text, '#fbbf24');
          }
          if (ev.playerId === myPlayerId) {
            window.soundManager.playAmmoPickup();
          }
        } else if (ev.type === 'monster_drop_pickup') {
          if (window.particleSystem) {
            let effectColor = '#fbbf24';
            if (ev.dropType === 'heal') effectColor = '#10b981';
            else if (ev.subType === 'move_speed') effectColor = '#06b6d4';
            else if (ev.subType === 'attack_boost') effectColor = '#f59e0b';
            window.particleSystem.spawnItemEffect(ev.x, ev.y, ev.text, effectColor);
          }
          if (ev.playerId === myPlayerId) {
            if (ev.dropType === 'ammo') {
              window.soundManager.playAmmoPickup();
            } else {
              window.soundManager.playItemPickup();
            }
          }
        } else if (ev.type === 'monster_drop_spawn') {
          if (window.particleSystem) {
            window.particleSystem.spawnDust(ev.x, ev.y);
          }
        } else if (ev.type === 'player_shot') {
          if (window.particleSystem) {
            window.particleSystem.spawnMuzzleFlash(ev.x, ev.y, ev.angle, '#fef08a');
          }
          if (ev.shooterId !== myPlayerId) {
            window.soundManager.playRangedShoot();
          }
        } else if (ev.type === 'projectile_spawn') {
          window.soundManager.playShoot();
        } else if (ev.type === 'kill') {
          addKillFeedItem(ev.message);
          if (ev.killerNickname === nicknameInput.value.trim()) {
            window.soundManager.playKill();
          }
        }
      }
    }

    if (!inGame || !myPlayerId) return;

    // Update Local Player HUD (Minimal HUD style)
    const myPlayer = state.players.find((p) => p.id === myPlayerId);
    if (myPlayer) {
      // HP Bar
      const hpPct = Math.max(0, (myPlayer.hp / myPlayer.maxHp) * 100);
      hudHpFill.style.width = `${hpPct}%`;
      hudHpText.textContent = `${myPlayer.hp}`;
      hudHpText.title = `체력: ${myPlayer.hp} / ${myPlayer.maxHp}`;
      if (hpPct <= 25) {
        hudHpFill.classList.add('low');
      } else {
        hudHpFill.classList.remove('low');
      }

      // Stamina Bar
      const staminaPct = Math.max(0, (myPlayer.stamina / myPlayer.maxStamina) * 100);
      hudStaminaFill.style.width = `${staminaPct}%`;
      hudStaminaText.textContent = `${myPlayer.stamina}`;
      hudStaminaText.title = `스태미나: ${myPlayer.stamina} / ${myPlayer.maxStamina}`;

      // Ammo & Weapon slots UI
      const currentAmmoVal = myPlayer.ammo !== undefined ? myPlayer.ammo : 18;
      const maxAmmoVal = myPlayer.maxAmmo || 30;
      if (hudAmmoText) {
        hudAmmoText.textContent = `${currentAmmoVal}/${maxAmmoVal}`;
      }
      if (hudAmmoBadge) {
        if (currentAmmoVal <= 0) {
          hudAmmoBadge.classList.add('empty');
        } else {
          hudAmmoBadge.classList.remove('empty');
        }
      }

      // Sync active weapon slot selection if needed
      if (myPlayer.selectedWeapon && myPlayer.selectedWeapon !== currentSelectedWeapon) {
        currentSelectedWeapon = myPlayer.selectedWeapon;
        if (currentSelectedWeapon === 1) {
          if (slotWeapon1) slotWeapon1.classList.add('active');
          if (slotWeapon2) slotWeapon2.classList.remove('active');
        } else {
          if (slotWeapon1) slotWeapon1.classList.remove('active');
          if (slotWeapon2) slotWeapon2.classList.add('active');
        }
      }

      // Kills badge
      hudKills.textContent = myPlayer.kills ?? 0;

      // Safe Zone Indicator
      if (myPlayer.inSafeZone) {
        safeZoneBadge.style.display = 'block';
      } else {
        safeZoneBadge.style.display = 'none';
      }

      // Active Buff Badges
      if (hudBuffsContainer) {
        let buffsHtml = '';
        if (myPlayer.buffs) {
          if (myPlayer.buffs.atkSpeed > 0) {
            const sec = Math.ceil(myPlayer.buffs.atkSpeed);
            buffsHtml += `<div class="hud-buff-pill hud-buff-atk"><span>⚡ 질풍 (공속 2배)</span><span>${sec}s</span></div>`;
          }
          if (myPlayer.buffs.moveSpeed > 0) {
            const sec = Math.ceil(myPlayer.buffs.moveSpeed);
            buffsHtml += `<div class="hud-buff-pill hud-buff-spd"><span>💨 신속 (이속 1.7배)</span><span>${sec}s</span></div>`;
          }
          if (myPlayer.buffs.attackBoost > 0) {
            const sec = Math.ceil(myPlayer.buffs.attackBoost);
            buffsHtml += `<div class="hud-buff-pill hud-buff-dmg"><span>🔥 분노 (공격 1.5배)</span><span>${sec}s</span></div>`;
          }
        }
        hudBuffsContainer.innerHTML = buffsHtml;
      }

      // Running dust effect
      if (myPlayer.isRunning) {
        window.particleSystem.spawnDust(myPlayer.x, myPlayer.y);
      }

      // Death & Respawn overlay
      if (myPlayer.isDead) {
        respawnOverlay.style.display = 'flex';
        respawnCountdownText.textContent = myPlayer.respawnCountdown ?? 0;
        const totalRespawnSec = 10;
        const ratio = Math.max(0, (myPlayer.respawnCountdown ?? 0) / totalRespawnSec);
        respawnBarFill.style.width = `${ratio * 100}%`;
      } else {
        respawnOverlay.style.display = 'none';
      }
    }

    // Cooldown indicator (adapts dynamically to active weapon & attack speed buff)
    const now = Date.now();
    const isRanged = currentSelectedWeapon === 2;
    let currentCooldown = isRanged ? rangedCooldownDuration : meleeCooldownDuration;
    if (myPlayer && myPlayer.buffs && myPlayer.buffs.atkSpeed > 0) {
      currentCooldown = Math.round(currentCooldown * 0.5);
    }
    if (now - lastAttackSentTime < currentCooldown) {
      cooldownDot.className = 'cooldown-dot cooling';
      cooldownDot.textContent = 'WAIT';
    } else {
      cooldownDot.className = 'cooldown-dot ready';
      cooldownDot.textContent = 'READY';
    }

    // Leaderboard update with guaranteed null safety
    updateLeaderboard(state.leaderboard || []);
  });

  function updateLeaderboard(list = []) {
    if (!Array.isArray(list)) list = [];
    const validList = list.filter((item) => item && typeof item === 'object');
    leaderboardPlayerCount.textContent = `${validList.length}/10`;
    leaderboardBody.innerHTML = '';

    validList.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      if (entry.id === myPlayerId) {
        tr.classList.add('me');
      }

      let rankDisplay = `#${idx + 1}`;
      if (idx === 0) rankDisplay = '👑 1';
      else if (idx === 1) rankDisplay = '🥈 2';
      else if (idx === 2) rankDisplay = '🥉 3';

      const deadTag = entry.isDead ? ' <span style="opacity: 0.6">🪦</span>' : '';
      const safeTag = entry.inSafeZone ? ' <span style="font-size:0.7rem; color:#facc15;">🛡️</span>' : '';

      const nickname = (entry.nickname != null && typeof entry.nickname === 'string' && entry.nickname.trim() !== '')
        ? entry.nickname.trim()
        : 'Player';
      const score = (typeof entry.score === 'number' && !isNaN(entry.score)) ? entry.score : 0;
      const color = (entry.color && typeof entry.color === 'string') ? entry.color : '#3b82f6';

      // XSS safe display
      const tempDiv = document.createElement('div');
      tempDiv.textContent = nickname;
      const safeNickname = tempDiv.innerHTML;

      tr.innerHTML = `
        <td><span class="rank-badge ${idx === 0 ? 'gold' : ''}">${rankDisplay}</span></td>
        <td>
          <div class="nick-cell">
            <span class="player-tag-dot" style="background-color: ${color}"></span>
            <span>${safeNickname}${safeTag}${deadTag}</span>
          </div>
        </td>
        <td class="text-right"><strong>${score}</strong></td>
      `;
      leaderboardBody.appendChild(tr);
    });
  }

  function addKillFeedItem(text) {
    const item = document.createElement('div');
    item.className = 'killfeed-item';
    item.innerHTML = text;
    killFeed.appendChild(item);

    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 500);
    }, 4500);
  }

  // 8. Client Render Loop
  function gameLoop(currentTimestamp) {
    const dt = Math.min((currentTimestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = currentTimestamp;

    // Continuous attack while left mouse button is held down
    if (inGame && window.inputHandler && window.inputHandler.mouse && window.inputHandler.mouse.isDown) {
      tryAttack();
    }

    if (window.particleSystem) {
      window.particleSystem.update(dt);
    }

    if (latestGameState) {
      renderer.render(latestGameState, myPlayerId);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
