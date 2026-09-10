/**
 * HTML5 Canvas 2D Game Renderer
 * Natural Grassland Terrain, Distinct Visual Safe Zone Sanctuary,
 * Nature Monsters (Wild Boar & Thorn Flower), Humanoid Characters,
 * 3 Item Drops (Health, Atk Speed, Move Speed), Smooth Entity Interpolation, and Overhead Chat Bubbles.
 */

function drawRoundedRect(ctx, x, y, width, height, radius = 5) {
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    radius = Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, radius);
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');

    this.mapData = null;
    this.walkCycles = new Map();
    this.animTime = 0;

    // Smooth Entity Position Interpolation Map (id -> { x, y, angle })
    this.smoothPos = new Map();
    this.lastFrameTime = performance.now();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (window.camera) {
      window.camera.resize(this.canvas.width, this.canvas.height);
    }
  }

  setMapData(mapData) {
    this.mapData = mapData;
  }

  /**
   * Smoothly interpolate entity position across frame intervals (eliminates 30Hz jitter)
   */
  getSmoothPosition(id, targetX, targetY, targetAngle, dt, isDead = false) {
    let entry = this.smoothPos.get(id);
    if (!entry) {
      entry = { x: targetX, y: targetY, angle: targetAngle };
      this.smoothPos.set(id, entry);
      return entry;
    }

    if (isDead) {
      entry.x = targetX;
      entry.y = targetY;
      entry.angle = targetAngle;
      return entry;
    }

    const distSq = (targetX - entry.x) ** 2 + (targetY - entry.y) ** 2;
    // Teleport if too far (e.g. respawn)
    if (distSq > 160 * 160) {
      entry.x = targetX;
      entry.y = targetY;
    } else {
      // Responsive linear interpolation (factor ~0.35 at 60Hz)
      const factor = Math.min(1, dt * 22);
      entry.x += (targetX - entry.x) * factor;
      entry.y += (targetY - entry.y) * factor;
    }

    // Smooth angle interpolation
    let diff = targetAngle - entry.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    entry.angle += diff * Math.min(1, dt * 25);

    return entry;
  }

  render(gameState, localPlayerId) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    this.animTime = now / 1000;

    // Clear Canvas
    ctx.clearRect(0, 0, width, height);

    if (!this.mapData || !gameState) return;

    if (gameState.safeZone) {
      this.mapData.safeZone = gameState.safeZone;
    }

    // Find and smooth local player position
    const rawLocalPlayer = gameState.players ? gameState.players.find((p) => p.id === localPlayerId) : null;
    let localPlayer = null;
    if (rawLocalPlayer) {
      const smoothed = this.getSmoothPosition(
        rawLocalPlayer.id,
        rawLocalPlayer.x,
        rawLocalPlayer.y,
        rawLocalPlayer.angle,
        dt,
        rawLocalPlayer.isDead
      );
      localPlayer = Object.assign({}, rawLocalPlayer, {
        x: smoothed.x,
        y: smoothed.y,
        angle: smoothed.angle,
      });
      window.camera.setTarget(localPlayer);
    }

    window.camera.update(this.mapData.width, this.mapData.height);
    window.camera.begin(ctx);

    // 1. Grassland Terrain & Wildflowers
    this.drawGrasslandTerrain(ctx);

    // 2. Safe Zone Sanctuary
    if (this.mapData.safeZone) {
      this.drawSafeZoneSanctuary(ctx, this.mapData.safeZone);
    }

    // 3. Obstacles (Ponds, Trees, Rocks)
    this.drawObstacles(ctx);

    // 4. Item Pickups (Health, Atk Speed, Move Speed)
    if (gameState.items) {
      this.drawItems(ctx, gameState.items);
    }

    // 4.1 Ammo Drops (+6 Bullets, Max 30)
    if (gameState.ammoDrops) {
      this.drawAmmoDrops(ctx, gameState.ammoDrops);
    }

    // 4.2 Monster Kill Drop Rewards (Ammo, Buffs, Heal)
    if (gameState.monsterDrops) {
      this.drawMonsterDrops(ctx, gameState.monsterDrops);
    }

    // 5. Nature Monsters (Wild Boar & Thorn Flower) with smooth interpolation
    if (gameState.monsters) {
      for (const monster of gameState.monsters) {
        if (!monster.isDead) {
          const sm = this.getSmoothPosition(monster.id, monster.x, monster.y, monster.angle, dt, monster.isDead);
          const smMonster = Object.assign({}, monster, { x: sm.x, y: sm.y, angle: sm.angle });
          this.drawNatureMonster(ctx, smMonster);
        }
      }
    }

    // 6. Projectiles (Player bullets & Monster thorns)
    if (gameState.projectiles) {
      for (const proj of gameState.projectiles) {
        if (proj.shooterType === 'player') {
          this.drawPlayerBullet(ctx, proj);
        } else {
          this.drawThornProjectile(ctx, proj);
        }
      }
    }

    // 7. Other Players with smooth interpolation
    if (gameState.players) {
      for (const player of gameState.players) {
        if (player.id !== localPlayerId) {
          const sm = this.getSmoothPosition(player.id, player.x, player.y, player.angle, dt, player.isDead);
          const smPlayer = Object.assign({}, player, { x: sm.x, y: sm.y, angle: sm.angle });
          this.drawHumanoidPlayer(ctx, smPlayer, false);
        }
      }
    }

    // 8. Local Player on Top
    if (localPlayer) {
      this.drawHumanoidPlayer(ctx, localPlayer, true);
    }

    // 9. Visual FX & Particles
    if (window.particleSystem) {
      window.particleSystem.draw(ctx);
    }

    window.camera.end(ctx);

    // 10. Minimap
    this.renderMinimap(gameState, localPlayerId);
  }

  /**
   * 1. Grassland Terrain & Flowers
   */
  drawGrasslandTerrain(ctx) {
    const mapW = this.mapData.width;
    const mapH = this.mapData.height;

    // Base lush grass
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, mapW, mapH);

    // Alternating meadow tiles
    const tileSize = 100;
    ctx.fillStyle = '#34662e';
    for (let x = 0; x < mapW; x += tileSize) {
      for (let y = 0; y < mapH; y += tileSize) {
        if ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0) {
          ctx.fillRect(x, y, tileSize, tileSize);
        }
      }
    }

    // Soft grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= mapW; x += tileSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapH);
    }
    for (let y = 0; y <= mapH; y += tileSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(mapW, y);
    }
    ctx.stroke();

    // Flowers
    const flowerSpacing = 160;
    for (let x = 80; x < mapW; x += flowerSpacing) {
      for (let y = 80; y < mapH; y += flowerSpacing) {
        const fx = x + Math.sin(x * 12 + y) * 45;
        const fy = y + Math.cos(y * 15 + x) * 45;

        if (this.mapData.safeZone) {
          const dx = fx - this.mapData.safeZone.X;
          const dy = fy - this.mapData.safeZone.Y;
          if (dx * dx + dy * dy < 250 * 250) continue;
        }

        const flowerType = Math.abs(Math.floor(x + y)) % 3;
        ctx.fillStyle = flowerType === 0 ? '#facc15' : flowerType === 1 ? '#f87171' : '#f8fafc';
        ctx.beginPath();
        ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.arc(fx - 3, fy + 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Boundary walls
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, mapW, mapH);
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, mapW, mapH);
  }

  /**
   * 2. Safe Zone Sanctuary
   */
  drawSafeZoneSanctuary(ctx, sz) {
    const cx = sz.X;
    const cy = sz.Y;
    const r = sz.RADIUS;
    const t = this.animTime;

    ctx.save();

    // Cobblestone Circle
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Runic Circles
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating rays
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.15);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r * 0.3), Math.sin(ang) * (r * 0.3));
      ctx.lineTo(Math.cos(ang) * (r * 0.9), Math.sin(ang) * (r * 0.9));
      ctx.stroke();
    }
    ctx.restore();

    // Center Altar
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Floating Crystal
    const floatY = Math.sin(t * 3) * 5;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18 + floatY);
    ctx.lineTo(cx + 10, cy + floatY);
    ctx.lineTo(cx, cy + 18 + floatY);
    ctx.lineTo(cx - 10, cy + floatY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing Barrier Dome
    const pulse = 0.88 + Math.sin(t * 2.5) * 0.12;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    grad.addColorStop(0, 'rgba(251, 191, 36, 0.03)');
    grad.addColorStop(0.8, 'rgba(251, 191, 36, 0.18)');
    grad.addColorStop(1, `rgba(245, 158, 11, ${0.45 * pulse})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(254, 240, 138, ${0.85 * pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Safe Zone Label
    ctx.font = '800 18px Rajdhani, Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#78350f';
    ctx.fillText('🛡️ SANCTUARY • SAFE ZONE 🛡️', cx, cy - r * 0.55);
    ctx.font = '700 13px Pretendard, sans-serif';
    ctx.fillStyle = '#92400e';
    ctx.fillText('(평화 구역 - 전투 및 데미지 무효)', cx, cy + r * 0.6);

    ctx.restore();
  }

  /**
   * 3. Obstacles (Ponds, Trees, Rocks)
   */
  drawObstacles(ctx) {
    const t = this.animTime;

    for (const obs of this.mapData.obstacles) {
      if (obs.type === 'pond') {
        ctx.fillStyle = '#a16207';
        drawRoundedRect(ctx, obs.x - 4, obs.y - 4, obs.width + 8, obs.height + 8, 26);
        ctx.fill();

        const waterGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
        waterGrad.addColorStop(0, '#0284c7');
        waterGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = waterGrad;
        drawRoundedRect(ctx, obs.x, obs.y, obs.width, obs.height, 22);
        ctx.fill();

        const rippleX = obs.x + obs.width * 0.5 + Math.sin(t * 1.5) * 15;
        const rippleY = obs.y + obs.height * 0.5 + Math.cos(t * 1.5) * 10;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(rippleX, rippleY, 20 + Math.sin(t * 2) * 5, 8 + Math.cos(t * 2) * 3, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#15803d';
        ctx.fillRect(obs.x + 12, obs.y + 8, 4, 14);
        ctx.fillRect(obs.x + 18, obs.y + 12, 3, 10);
      } else if (obs.type === 'tree_clump') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.ellipse(obs.x + obs.width * 0.5 + 8, obs.y + obs.height * 0.5 + 14, obs.width * 0.5, obs.height * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#78350f';
        drawRoundedRect(ctx, obs.x + obs.width * 0.5 - 12, obs.y + obs.height * 0.5 + 6, 24, 28, 4);
        ctx.fill();

        const cx = obs.x + obs.width * 0.5;
        const cy = obs.y + obs.height * 0.5 - 6;
        const cr = obs.width * 0.45;

        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(cx, cy + 4, cr, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(cx - 10, cy - 6, cr * 0.75, 0, Math.PI * 2);
        ctx.arc(cx + 10, cy - 6, cr * 0.75, 0, Math.PI * 2);
        ctx.arc(cx, cy - 14, cr * 0.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx - 6, cy - 16, cr * 0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obs.type === 'rock') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(obs.x + obs.width * 0.5 + 6, obs.y + obs.height * 0.5 + 6, obs.width * 0.5, obs.height * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#64748b';
        drawRoundedRect(ctx, obs.x, obs.y, obs.width, obs.height, 16);
        ctx.fill();

        ctx.fillStyle = '#4ade80';
        drawRoundedRect(ctx, obs.x + 6, obs.y + 4, obs.width - 12, obs.height * 0.4, 10);
        ctx.fill();

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        drawRoundedRect(ctx, obs.x, obs.y, obs.width, obs.height, 16);
        ctx.stroke();
      }
    }
  }

  /**
   * 4. Item Pickups (Health, Attack Speed, Movement Speed)
   */
  drawItems(ctx, items) {
    const t = this.animTime;

    for (const item of items) {
      const floatY = Math.sin(t * 3.5 + item.x) * 5;
      const iy = item.y + floatY;

      ctx.save();
      ctx.translate(item.x, iy);

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, item.radius * 0.8 - floatY, item.radius * 0.9, item.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing Glowing Aura Ring
      const auraPulse = 0.8 + Math.sin(t * 4) * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + 6, 0, Math.PI * 2);

      if (item.type === 'health') {
        // --- 1) HEALTH POTION ---
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 * auraPulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Bottle Body
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 2, 13, 0, Math.PI * 2);
        ctx.fill();

        // Bottle Neck & Cork
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(-4, -14, 8, 6);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(-5, -17, 10, 4);

        // White Heart / Cross Icon on bottle
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, -3, 4, 10);
        ctx.fillRect(-5, 0, 10, 4);

        // Overhead tag
        ctx.font = '800 11px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fca5a5';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText('+40 HP', 0, -22);
        ctx.fillText('+40 HP', 0, -22);
      } else if (item.type === 'atk_speed') {
        // --- 2) ATTACK SPEED POTION (5s Boost) ---
        ctx.strokeStyle = `rgba(245, 158, 11, ${0.7 * auraPulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Blazing Orange Bottle
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(0, 2, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#c2410c';
        ctx.fillRect(-4, -14, 8, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-5, -17, 10, 4);

        // Sword / Lightning Bolt Icon
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 3);
        ctx.lineTo(3, 10);
        ctx.lineTo(-3, 2);
        ctx.lineTo(0, -1);
        ctx.closePath();
        ctx.fill();

        // Overhead tag
        ctx.font = '800 11px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText('⚡ 공속 2배', 0, -22);
        ctx.fillText('⚡ 공속 2배', 0, -22);
      } else if (item.type === 'move_speed') {
        // --- 3) MOVEMENT SPEED POTION (3s 1.7x Boost) ---
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.7 * auraPulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Cyan Wind Bottle
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(0, 2, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0e7490';
        ctx.fillRect(-4, -14, 8, 6);
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(-5, -17, 10, 4);

        // Wing / Wind Icon
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-6, 2);
        ctx.quadraticCurveTo(0, -7, 7, -2);
        ctx.quadraticCurveTo(2, 4, -6, 2);
        ctx.fill();

        // Overhead tag
        ctx.font = '800 11px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#67e8f9';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText('💨 이속 1.7배', 0, -22);
        ctx.fillText('💨 이속 1.7배', 0, -22);
      }

      ctx.restore();
    }
  }

  /**
   * 4.1 Ammo Drops (+6 Bullets, Max 30)
   */
  drawAmmoDrops(ctx, ammoDrops) {
    const t = this.animTime;

    for (const drop of ammoDrops) {
      const floatY = Math.sin(t * 3.8 + drop.x * 0.05) * 4.5;
      const dy = drop.y + floatY;

      ctx.save();
      ctx.translate(drop.x, dy);

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, drop.radius * 0.7 - floatY, drop.radius * 0.85, drop.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing Aura Ring (Golden Yellow)
      const auraPulse = 0.8 + Math.sin(t * 4.5 + drop.y) * 0.2;
      ctx.strokeStyle = `rgba(234, 179, 8, ${0.65 * auraPulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, drop.radius + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Ammo Box Body (Military Green / Bronze Metal Crate)
      const bw = 24;
      const bh = 18;
      ctx.fillStyle = '#3f6212';
      drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
      ctx.fill();

      // Crate Border
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
      ctx.stroke();

      // Metal Latch / Yellow Stripe
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-bw / 2 + 3, -2, bw - 6, 4);

      // 3 Golden Bullet Tips sticking on top
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-6, -bh / 2 - 4, 3, 5);
      ctx.fillRect(-1.5, -bh / 2 - 5, 3, 6);
      ctx.fillRect(3, -bh / 2 - 4, 3, 5);

      // Overhead tag
      ctx.font = '800 11px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeText('+6 탄약', 0, -18);
      ctx.fillText('+6 탄약', 0, -18);

      ctx.restore();
    }
  }

  /**
   * 4.2 Monster Kill Drop Rewards (Ammo 2/6, Buffs, Heal)
   */
  drawMonsterDrops(ctx, monsterDrops) {
    const t = this.animTime;

    for (const drop of monsterDrops) {
      const floatY = Math.sin(t * 4.2 + drop.x * 0.08) * 4.5;
      const dy = drop.y + floatY;

      ctx.save();
      ctx.translate(drop.x, dy);

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, drop.radius * 0.7 - floatY, drop.radius * 0.85, drop.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing Aura Ring
      const auraPulse = 0.8 + Math.sin(t * 5 + drop.y) * 0.2;

      if (drop.dropType === 'ammo') {
        // ===== AMMO DROP (+2 or +6) =====
        const isBig = drop.subType === 'ammo_6';
        const auraColor = isBig ? `rgba(245, 158, 11, ${0.75 * auraPulse})` : `rgba(234, 179, 8, ${0.6 * auraPulse})`;
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = isBig ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, drop.radius + (isBig ? 5 : 3), 0, Math.PI * 2);
        ctx.stroke();

        if (isBig) {
          // Large Golden Ammo Crate (+6)
          const bw = 24;
          const bh = 18;
          ctx.fillStyle = '#b45309';
          drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
          ctx.fill();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.5;
          drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
          ctx.stroke();

          // Golden Band
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-bw / 2 + 2, -2, bw - 4, 4);

          // 3 Big Bullets
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-6, -bh / 2 - 4, 3, 5);
          ctx.fillRect(-1.5, -bh / 2 - 5, 3, 6);
          ctx.fillRect(3, -bh / 2 - 4, 3, 5);
        } else {
          // Compact Ammo Pouch (+2)
          const bw = 18;
          const bh = 14;
          ctx.fillStyle = '#78350f';
          drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 3);
          ctx.fill();

          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 3);
          ctx.stroke();

          // 2 Golden Bullets
          ctx.fillStyle = '#fde047';
          ctx.fillRect(-4, -bh / 2 - 3, 3, 5);
          ctx.fillRect(1, -bh / 2 - 3, 3, 5);
        }

        // Tag
        ctx.font = '800 11px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isBig ? '#fde047' : '#fef08a';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText(isBig ? '📦 +6 탄약' : '🎒 +2 탄약', 0, -18);
        ctx.fillText(isBig ? '📦 +6 탄약' : '🎒 +2 탄약', 0, -18);

      } else if (drop.dropType === 'heal') {
        // ===== HEAL DROP (+35 HP) =====
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.75 * auraPulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, drop.radius + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Emerald Heart Crystal Body
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(-10, -2);
        ctx.quadraticCurveTo(-10, -10, -4, -10);
        ctx.quadraticCurveTo(0, -7, 0, -3);
        ctx.quadraticCurveTo(0, -7, 4, -10);
        ctx.quadraticCurveTo(10, -10, 10, -2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#a7f3d0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // White cross center
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1.5, -4, 3, 7);
        ctx.fillRect(-3.5, -2, 7, 3);

        // Tag
        ctx.font = '800 11px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6ee7b7';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText('💚 +35 HP', 0, -18);
        ctx.fillText('💚 +35 HP', 0, -18);

      } else if (drop.dropType === 'buff') {
        if (drop.subType === 'move_speed') {
          // ===== SPEED BUFF (Cyan Wind Orb) =====
          ctx.strokeStyle = `rgba(6, 182, 212, ${0.75 * auraPulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, drop.radius + 4, 0, Math.PI * 2);
          ctx.stroke();

          // Cyan Orb
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#a5f3fc';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Wind wings icon
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(-5, 2);
          ctx.quadraticCurveTo(0, -6, 6, -2);
          ctx.quadraticCurveTo(2, 3, -5, 2);
          ctx.fill();

          // Tag
          ctx.font = '800 11px Pretendard, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#67e8f9';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.strokeText('💨 신속 (이속)', 0, -18);
          ctx.fillText('💨 신속 (이속)', 0, -18);

        } else {
          // ===== ATTACK BUFF (Ruby Fire Blade / Flame Orb) =====
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.75 * auraPulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, drop.radius + 4, 0, Math.PI * 2);
          ctx.stroke();

          // Flame Orb
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Flame Sword icon
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(4, 0);
          ctx.lineTo(1, 1);
          ctx.lineTo(1, 6);
          ctx.lineTo(-1, 6);
          ctx.lineTo(-1, 1);
          ctx.lineTo(-4, 0);
          ctx.closePath();
          ctx.fill();

          // Tag
          ctx.font = '800 11px Pretendard, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fde047';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.strokeText('🔥 분노 (공격력)', 0, -18);
          ctx.fillText('🔥 분노 (공격력)', 0, -18);
        }
      }

      ctx.restore();
    }
  }

  /**
   * 5. Nature Monsters (Wild Boar & Thorn Flower)
   */
  drawNatureMonster(ctx, monster) {
    ctx.save();
    ctx.translate(monster.x, monster.y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, monster.radius * 0.7, monster.radius * 1.05, monster.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    if (monster.type === 'melee') {
      // ===== WILD BOAR =====
      ctx.save();
      ctx.rotate(monster.angle);

      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.ellipse(0, 0, monster.radius * 1.15, monster.radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.ellipse(-4, 0, monster.radius * 0.7, monster.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.ellipse(monster.radius * 0.95, 0, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#831843';
      ctx.beginPath();
      ctx.arc(monster.radius * 0.95, -3, 1.8, 0, Math.PI * 2);
      ctx.arc(monster.radius * 0.95, 3, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Sharp White Tusks
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(monster.radius * 0.7, -9);
      ctx.lineTo(monster.radius * 1.25, -14);
      ctx.lineTo(monster.radius * 0.8, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(monster.radius * 0.7, 9);
      ctx.lineTo(monster.radius * 1.25, 14);
      ctx.lineTo(monster.radius * 0.8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Boar Ears
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(-monster.radius * 0.3, -monster.radius * 0.8, 5, 8, -0.4, 0, Math.PI * 2);
      ctx.ellipse(-monster.radius * 0.3, monster.radius * 0.8, 5, 8, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Red Angry Eyes
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(monster.radius * 0.4, -6, 3, 0, Math.PI * 2);
      ctx.arc(monster.radius * 0.4, 6, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(monster.radius * 0.4 + 1, -6, 1, 0, Math.PI * 2);
      ctx.arc(monster.radius * 0.4 + 1, 6, 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#291003';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, monster.radius * 1.15, monster.radius * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    } else {
      // ===== THORN FLOWER =====
      const t = this.animTime;

      ctx.fillStyle = '#15803d';
      for (let i = 0; i < 5; i++) {
        const leafAng = (i * Math.PI * 2) / 5 + Math.sin(t * 2) * 0.08;
        ctx.beginPath();
        ctx.ellipse(Math.cos(leafAng) * 14, Math.sin(leafAng) * 14, 10, 6, leafAng, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#c026d3';
      for (let i = 0; i < 6; i++) {
        const petalAng = (i * Math.PI * 2) / 6 + t * 0.5;
        ctx.beginPath();
        ctx.ellipse(Math.cos(petalAng) * 12, Math.sin(petalAng) * 12, 8, 5, petalAng, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#831843';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.rotate(monster.angle);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(4, -4);
      ctx.lineTo(15, 0);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overhead Tag & HP Bar
    const barW = 44;
    const barH = 5;
    const barX = -barW / 2;
    const barY = -monster.radius - 14;

    ctx.font = '700 11px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(monster.name, 0, barY - 4);
    ctx.fillText(monster.name, 0, barY - 4);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 2);
    ctx.fill();

    const hpRatio = Math.max(0, monster.hp / monster.maxHp);
    ctx.fillStyle = '#ef4444';
    if (barW * hpRatio > 0) {
      drawRoundedRect(ctx, barX, barY, Math.max(2, barW * hpRatio), barH, 1.5);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 6. Thorn Projectile
   */
  drawThornProjectile(ctx, proj) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.angle);

    ctx.fillStyle = 'rgba(163, 230, 53, 0.4)';
    ctx.beginPath();
    ctx.arc(-6, 0, proj.radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#65a30d';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-proj.radius * 1.2, -proj.radius * 0.6);
    ctx.lineTo(proj.radius * 1.5, 0);
    ctx.lineTo(-proj.radius * 1.2, proj.radius * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 6.1 Player Projectile (Tracer Bullet / Energy Bolt)
   */
  drawPlayerBullet(ctx, proj) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.angle);

    const bulletColor = proj.color || '#38bdf8';

    // Outer Glow / Tracer Trail
    ctx.fillStyle = bulletColor;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 16, proj.radius * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner Bullet Core (Elongated Sharp Tracer)
    ctx.globalAlpha = 1;
    ctx.fillStyle = bulletColor;
    ctx.beginPath();
    ctx.moveTo(-10, -proj.radius);
    ctx.lineTo(8, -proj.radius * 0.6);
    ctx.lineTo(14, 0);
    ctx.lineTo(8, proj.radius * 0.6);
    ctx.lineTo(-10, proj.radius);
    ctx.closePath();
    ctx.fill();

    // Bright White Hot Tip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(3, 0, 7, proj.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * 7 & 8. Humanoid Character with Buff Auras and Chat Bubbles
   */
  drawHumanoidPlayer(ctx, player, isLocal = false) {
    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.isDead) {
      this.drawTombstone(ctx, player);
      ctx.restore();
      return;
    }

    // Walking animation cycle
    let walkCycle = this.walkCycles.get(player.id) || 0;
    const isMoving = player.isRunning || (player.inputs && (player.inputs.up || player.inputs.down || player.inputs.left || player.inputs.right));
    if (isMoving) {
      walkCycle += player.isRunning ? 0.35 : 0.22;
      this.walkCycles.set(player.id, walkCycle);
    }

    // --- Active Buff Aura Rings ---
    const t = this.animTime;
    if (player.buffs) {
      // 1) Movement Speed Buff Aura (Cyan Wind Trails)
      if (player.buffs.moveSpeed > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 10, player.radius * 1.4, player.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2) Attack Speed Buff Aura (Blazing Golden Flame Ring)
      if (player.buffs.atkSpeed > 0) {
        ctx.save();
        ctx.rotate(t * 3);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 1) Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 10, player.radius * 1.1, player.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2) Humanoid Body rotated toward player.angle
    ctx.save();
    ctx.rotate(player.angle);

    // Boots
    const footSwing = isMoving ? Math.sin(walkCycle) * 7 : 0;
    ctx.fillStyle = '#1e293b';
    drawRoundedRect(ctx, -8 + footSwing, -player.radius * 0.75, 12, 6, 3);
    ctx.fill();
    drawRoundedRect(ctx, -8 - footSwing, player.radius * 0.45, 12, 6, 3);
    ctx.fill();

    // Torso / Armor
    const torsoW = 20;
    const torsoH = 26;
    ctx.fillStyle = player.color || '#3b82f6';
    drawRoundedRect(ctx, -torsoW / 2 - 2, -torsoH / 2, torsoW, torsoH, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    drawRoundedRect(ctx, -torsoW / 2 - 2, -torsoH / 2, torsoW * 0.45, torsoH, 4);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, -torsoW / 2 - 2, -torsoH / 2, torsoW, torsoH, 6);
    ctx.stroke();

    // Belt
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-torsoW / 2, -torsoH / 2 + 4);
    ctx.lineTo(torsoW / 2 - 4, torsoH / 2 - 4);
    ctx.stroke();

    // Left Arm & Hand
    ctx.fillStyle = player.color;
    drawRoundedRect(ctx, -2, -torsoH / 2 - 5, 10, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(8, -torsoH / 2 - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Right Arm & Longsword
    const attackSwingOffset = player.isAttacking ? 12 : 0;
    ctx.fillStyle = player.color;
    drawRoundedRect(ctx, 2 + attackSwingOffset, torsoH / 2 - 1, 10, 6, 3);
    ctx.fill();

    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(12 + attackSwingOffset, torsoH / 2 + 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Weapon Rendering (1: Longsword, 2: Ranged Rifle)
    if (player.selectedWeapon === 2) {
      // ===== RANGED WEAPON =====
      ctx.save();
      const recoilOffset = player.isAttacking ? -3 : 0;
      ctx.translate(14 + recoilOffset, torsoH / 2 + 1);

      // Wooden Gun Stock
      ctx.fillStyle = '#78350f';
      drawRoundedRect(ctx, -8, -2, 10, 5, 2);
      ctx.fill();

      // Gun Receiver Frame
      ctx.fillStyle = '#475569';
      drawRoundedRect(ctx, 2, -2.5, 14, 5, 1.5);
      ctx.fill();

      // Long Metallic Barrel
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(16, -1.5, 15, 3);

      // Optical Scope
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(6, -5, 7, 2.5);

      // Metallic Muzzle Tip
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(31, -2, 3, 4);

      ctx.restore();
    } else {
      // ===== MELEE LONGSWORD =====
      ctx.save();
      ctx.translate(14 + attackSwingOffset, torsoH / 2 + 2);
      if (player.isAttacking) {
        ctx.rotate(-0.4);
      }
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-2, -4, 4, 8);
      ctx.beginPath();
      ctx.arc(-4, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Blade
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, -2.5);
      ctx.lineTo(28, -2.5);
      ctx.lineTo(34, 0);
      ctx.lineTo(28, 2.5);
      ctx.lineTo(2, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Head
    const headRadius = 10;
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(-2, 0, headRadius, Math.PI * 0.45, Math.PI * 1.55);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -3.5, 2.5, 0, Math.PI * 2);
    ctx.arc(4, 3.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5, -3.5, 1.2, 0, Math.PI * 2);
    ctx.arc(5, 3.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3) Overhead Nameplate, Buff Status, HP/Stamina Bars, and Chat Bubble
    this.drawPlayerOverhead(ctx, player, isLocal);

    ctx.restore();
  }

  drawPlayerOverhead(ctx, player, isLocal) {
    const barW = 58;
    const barH = 7;
    const barX = -barW / 2;
    const barY = -player.radius - 22;

    // --- 1. Overhead Nickname ---
    ctx.font = '800 13px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(player.nickname, 0, barY - 5);

    ctx.fillStyle = isLocal ? '#38bdf8' : '#ffffff';
    ctx.fillText(player.nickname, 0, barY - 5);

    // --- 2. Overhead Buff Badges ---
    let badgeY = barY - 20;
    if (player.buffs && (player.buffs.atkSpeed > 0 || player.buffs.moveSpeed > 0)) {
      ctx.font = '800 11px Pretendard, sans-serif';
      let buffText = '';
      if (player.buffs.atkSpeed > 0) buffText += `⚡공속(${player.buffs.atkSpeed}s) `;
      if (player.buffs.moveSpeed > 0) buffText += `💨이속(${player.buffs.moveSpeed}s)`;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeText(buffText, 0, badgeY);
      ctx.fillText(buffText, 0, badgeY);
      badgeY -= 14;
    }

    // Safe Zone Shield Icon
    if (player.inSafeZone) {
      ctx.font = '700 11px Pretendard, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeText('🛡️ SAFE', 0, badgeY);
      ctx.fillText('🛡️ SAFE', 0, badgeY);
      badgeY -= 14;
    }

    // --- 3. HP Bar ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 3);
    ctx.fill();

    const hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
    if (barW * hpRatio > 0) {
      drawRoundedRect(ctx, barX, barY, Math.max(3, barW * hpRatio), barH, 2);
      ctx.fill();
    }

    // --- 4. Stamina Bar ---
    const stamH = 4;
    const stamY = barY + barH + 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, barX - 1, stamY - 1, barW + 2, stamH + 2, 2);
    ctx.fill();

    const stamRatio = Math.max(0, player.stamina / player.maxStamina);
    ctx.fillStyle = '#06b6d4';
    if (barW * stamRatio > 0) {
      drawRoundedRect(ctx, barX, stamY, Math.max(2, barW * stamRatio), stamH, 1.5);
      ctx.fill();
    }

    // --- 5. Overhead Chat Bubble ---
    const chatData = player.chatMessage;
    if (chatData && chatData.text) {
      const now = Date.now();
      const elapsed = now - chatData.time;
      const duration = 5000;

      if (elapsed < duration) {
        const remaining = duration - elapsed;
        const alpha = remaining < 1000 ? remaining / 1000 : 1;
        this.drawChatBubble(ctx, chatData.text, 0, badgeY - 6, alpha);
      }
    }
  }

  /**
   * Comic Style Chat Bubble with tail above character
   */
  drawChatBubble(ctx, text, x, y, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = '700 12px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(text).width;
    const padX = 12;
    const bubbleW = Math.max(52, textWidth + padX * 2);
    const bubbleH = 26;
    const bubbleX = x - bubbleW / 2;
    const bubbleY = y - bubbleH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    drawRoundedRect(ctx, bubbleX + 2, bubbleY + 2, bubbleW, bubbleH, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 8);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleY + bubbleH - 1);
    ctx.lineTo(x, bubbleY + bubbleH + 7);
    ctx.lineTo(x + 6, bubbleY + bubbleH - 1);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleY + bubbleH);
    ctx.lineTo(x, bubbleY + bubbleH + 7);
    ctx.lineTo(x + 6, bubbleY + bubbleH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillText(text, x, bubbleY + bubbleH / 2);

    ctx.restore();
  }

  drawTombstone(ctx, player) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, -18, -28, 36, 38, { tl: 16, tr: 16, bl: 2, br: 2 });
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('R.I.P', 0, -14);
    ctx.font = '700 9px sans-serif';
    ctx.fillText(player.nickname, 0, 1);

    const cd = player.respawnCountdown || 0;
    ctx.font = '800 14px Rajdhani, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const cdText = `${cd}s`;
    ctx.strokeText(cdText, 0, -38);
    ctx.fillText(cdText, 0, -38);
  }

  renderMinimap(gameState, localPlayerId) {
    const mCtx = this.minimapCtx;
    const mW = this.minimapCanvas.width;
    const mH = this.minimapCanvas.height;
    const mapW = this.mapData.width;
    const mapH = this.mapData.height;

    const scaleX = mW / mapW;
    const scaleY = mH / mapH;

    mCtx.clearRect(0, 0, mW, mH);

    // Meadow Background
    mCtx.fillStyle = '#1e3a1d';
    mCtx.fillRect(0, 0, mW, mH);

    // Safe Zone Sanctuary on Minimap
    if (this.mapData.safeZone) {
      const szX = this.mapData.safeZone.X * scaleX;
      const szY = this.mapData.safeZone.Y * scaleY;
      const szR = this.mapData.safeZone.RADIUS * scaleX;

      mCtx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      mCtx.beginPath();
      mCtx.arc(szX, szY, szR, 0, Math.PI * 2);
      mCtx.fill();

      mCtx.strokeStyle = '#f59e0b';
      mCtx.lineWidth = 1.5;
      mCtx.stroke();
    }

    // Obstacles
    mCtx.fillStyle = 'rgba(74, 222, 128, 0.4)';
    for (const obs of this.mapData.obstacles) {
      mCtx.fillRect(obs.x * scaleX, obs.y * scaleY, obs.width * scaleX, obs.height * scaleY);
    }

    // Items on Minimap (Sparkling dots)
    if (gameState.items) {
      for (const item of gameState.items) {
        mCtx.fillStyle = item.type === 'health' ? '#ef4444' : item.type === 'atk_speed' ? '#f59e0b' : '#06b6d4';
        mCtx.beginPath();
        mCtx.arc(item.x * scaleX, item.y * scaleY, 3, 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    // Ammo Drops on Minimap (Gold dots)
    if (gameState.ammoDrops) {
      mCtx.fillStyle = '#facc15';
      for (const drop of gameState.ammoDrops) {
        mCtx.beginPath();
        mCtx.arc(drop.x * scaleX, drop.y * scaleY, 2.5, 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    // Monster Drops on Minimap (Loot reward dots)
    if (gameState.monsterDrops) {
      for (const drop of gameState.monsterDrops) {
        mCtx.fillStyle = drop.dropType === 'ammo'
          ? '#fbbf24'
          : drop.dropType === 'heal'
          ? '#10b981'
          : drop.subType === 'move_speed'
          ? '#06b6d4'
          : '#f97316';
        mCtx.beginPath();
        mCtx.arc(drop.x * scaleX, drop.y * scaleY, 2.5, 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    // Monsters
    if (gameState.monsters) {
      mCtx.fillStyle = '#ef4444';
      for (const monster of gameState.monsters) {
        if (!monster.isDead) {
          mCtx.beginPath();
          mCtx.arc(monster.x * scaleX, monster.y * scaleY, 2.5, 0, Math.PI * 2);
          mCtx.fill();
        }
      }
    }

    // Other Players
    if (gameState.players) {
      for (const player of gameState.players) {
        if (player.id !== localPlayerId && !player.isDead) {
          mCtx.fillStyle = player.color || '#f59e0b';
          mCtx.beginPath();
          mCtx.arc(player.x * scaleX, player.y * scaleY, 3.5, 0, Math.PI * 2);
          mCtx.fill();
        }
      }
    }

    // Local Player
    const localPlayer = gameState.players ? gameState.players.find((p) => p.id === localPlayerId) : null;
    if (localPlayer) {
      const px = localPlayer.x * scaleX;
      const py = localPlayer.y * scaleY;

      mCtx.fillStyle = '#22c55e';
      mCtx.beginPath();
      mCtx.arc(px, py, 4.5, 0, Math.PI * 2);
      mCtx.fill();

      mCtx.strokeStyle = '#ffffff';
      mCtx.lineWidth = 1.5;
      mCtx.beginPath();
      mCtx.arc(px, py, 6.5, 0, Math.PI * 2);
      mCtx.stroke();
    }
  }
}

window.Renderer = Renderer;
