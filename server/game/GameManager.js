const config = require('../config');
const GameMap = require('./Map');
const Player = require('./Player');
const Monster = require('./Monster');
const ItemManager = require('./ItemManager');
const Projectile = require('./Projectile');

class GameManager {
  constructor(io) {
    this.io = io;
    this.map = new GameMap();
    this.players = new Map(); // socketId -> Player
    this.monsters = [];
    this.projectiles = [];
    this.itemManager = new ItemManager(this.map);
    this.projIdCounter = 1;

    // Frame events to broadcast
    this.events = [];

    this.lastTickTime = Date.now();
    this.initMonsters();
    this.startLoop();
  }

  initMonsters() {
    // Spawn Melee Monsters (Wild Boar) outside safe zone
    for (let i = 0; i < config.MONSTER.MELEE_COUNT; i++) {
      const pos = this.map.getRandomSpawnPosition(config.MONSTER.MELEE.RADIUS, { outsideSafeZone: true });
      this.monsters.push(new Monster('melee', pos));
    }

    // Spawn Ranged Monsters (Thorn Flower) outside safe zone
    for (let i = 0; i < config.MONSTER.RANGED_COUNT; i++) {
      const pos = this.map.getRandomSpawnPosition(config.MONSTER.RANGED.RADIUS, { outsideSafeZone: true });
      this.monsters.push(new Monster('ranged', pos));
    }
  }

  getPlayerCount() {
    return this.players.size;
  }

  addPlayer(socketId, nickname, color) {
    if (this.players.size >= config.MAX_PLAYERS) {
      return { success: false, reason: '서버 정원(10명)이 초과되었습니다.' };
    }

    // Spawn players inside peaceful Safe Zone Sanctuary
    const spawnPos = this.map.getRandomSpawnPosition(config.PLAYER.RADIUS, { forSafeZone: true });
    const player = new Player(socketId, nickname, color, spawnPos);
    this.players.set(socketId, player);

    return { success: true, player };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.events.push({
        type: 'player_leave',
        message: `${player.nickname} 님이 퇴장했습니다.`,
      });
      return true;
    }
    return false;
  }

  handlePlayerInput(socketId, inputs) {
    const player = this.players.get(socketId);
    if (player) {
      player.updateInput(inputs);
    }
  }

  handleSwitchWeapon(socketId, weaponId) {
    const player = this.players.get(socketId);
    if (player && !player.isDead) {
      player.switchWeapon(weaponId);
    }
  }

  handleMonsterKill(killer, monster) {
    const scoreBonus = monster.conf ? monster.conf.SCORE : (monster.score || 10);
    if (killer) {
      killer.score = (killer.score ?? 0) + scoreBonus;
      killer.kills = (killer.kills ?? 0) + 1;
      this.events.push({
        type: 'kill',
        killerNickname: killer.nickname,
        victimNickname: monster.name,
        scoreBonus: scoreBonus,
        message: `🎯 [${killer.nickname}] 님이 [${monster.name}] 처치! (+${scoreBonus}점)`,
      });
    }

    // 몬스터 처치 보상 드롭 시스템 (Server-Authoritative 확률 계산 및 스폰)
    const drop = this.itemManager.spawnMonsterDrop(monster.x, monster.y);
    if (drop) {
      this.events.push({
        type: 'monster_drop_spawn',
        x: drop.x,
        y: drop.y,
        dropType: drop.dropType,
        subType: drop.subType,
        name: drop.name,
      });
    }
  }

  handlePlayerAttack(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.isDead) return;

    const dmgMultiplier = player.getDamageMultiplier ? player.getDamageMultiplier() : 1.0;

    if (player.selectedWeapon === 2) {
      // ===== RANGED WEAPON (BOW / GUN - Consumes 1 Ammo) =====
      if (player.ammo <= 0) return;
      if (!player.triggerRangedAttack()) return;

      // Attacks originating from inside the Safe Zone deal NO damage and don't shoot
      if (player.inSafeZone) return;

      const scale = player.getScale ? player.getScale() : 1.0;
      const spawnDist = player.radius + 12;
      const spawnX = player.x + Math.cos(player.angle) * spawnDist;
      const spawnY = player.y + Math.sin(player.angle) * spawnDist;

      const rangedDamage = Math.round(config.PLAYER.RANGED_DAMAGE * dmgMultiplier);
      const projRadius = Math.round(config.PLAYER.RANGED_RADIUS * scale * 10) / 10;

      const playerProj = new Projectile(
        `pp_${this.projIdCounter++}`,
        spawnX,
        spawnY,
        player.angle,
        player.id,
        'player',
        {
          color: player.color,
          damage: rangedDamage,
          speed: config.PLAYER.RANGED_SPEED,
          radius: projRadius,
          lifetime: config.PLAYER.RANGED_LIFETIME,
        }
      );
      this.projectiles.push(playerProj);

      this.events.push({
        type: 'player_shot',
        shooterId: player.id,
        x: spawnX,
        y: spawnY,
        angle: player.angle,
        color: player.color,
        radius: projRadius,
      });
      return;
    }

    // ===== MELEE WEAPON (SWORD) =====
    if (!player.triggerAttack()) return;

    const scale = player.getScale ? player.getScale() : 1.0;
    const attackRange = Math.round(config.PLAYER.ATTACK_RANGE * scale); // Range scales proportionally with score
    const halfArc = config.PLAYER.ATTACK_ARC / 2;

    // Broadcast slash animation event with matching range
    this.events.push({
      type: 'slash',
      sourceId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      color: player.color,
      range: attackRange,
    });

    // Attacks originating from inside the Safe Zone deal NO damage!
    if (player.inSafeZone) {
      return;
    }

    const pvpDamage = Math.round(config.PLAYER.PVP_DAMAGE * dmgMultiplier);
    const monsterDamage = Math.round(config.PLAYER.MONSTER_DAMAGE * dmgMultiplier);

    // 1. Check PvP damage on other alive players (who are NOT in Safe Zone)
    for (const [otherId, target] of this.players.entries()) {
      if (otherId === socketId || target.isDead || target.inSafeZone) continue;

      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= attackRange + target.radius) {
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = Math.abs(targetAngle - player.angle);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        if (angleDiff <= halfArc + 0.3) {
          const dmgResult = target.takeDamage(pvpDamage, player.id);
          this.events.push({
            type: 'hit',
            attackerId: player.id,
            targetType: 'player',
            targetId: target.id,
            x: target.x,
            y: target.y,
            damage: pvpDamage,
          });

          if (dmgResult.died) {
            player.score = (player.score ?? 0) + config.PLAYER.KILL_SCORE;
            player.kills = (player.kills ?? 0) + 1;
            this.events.push({
              type: 'kill',
              killerNickname: player.nickname,
              victimNickname: target.nickname,
              scoreBonus: config.PLAYER.KILL_SCORE,
              message: `⚔️ [${player.nickname}] 님이 [${target.nickname}] 님을 처치했습니다! (+${config.PLAYER.KILL_SCORE}점)`,
            });
          }
        }
      }
    }

    // 2. Check damage on monsters
    for (const monster of this.monsters) {
      if (monster.isDead) continue;

      const dx = monster.x - player.x;
      const dy = monster.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= attackRange + monster.radius) {
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = Math.abs(targetAngle - player.angle);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        if (angleDiff <= halfArc + 0.3) {
          const dmgResult = monster.takeDamage(monsterDamage, player.id);
          this.events.push({
            type: 'hit',
            attackerId: player.id,
            targetType: 'monster',
            targetId: monster.id,
            x: monster.x,
            y: monster.y,
            damage: monsterDamage,
          });

          if (dmgResult.died) {
            this.handleMonsterKill(player, monster);
          }
        }
      }
    }
  }

  startLoop() {
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => {
      this.tick();
    }, config.TICK_INTERVAL);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;

    // 1. Update players
    for (const player of this.players.values()) {
      player.update(dt, this.map);
    }

    // 2. Update items (check pickups & 20s respawn)
    this.itemManager.update(this.players, this.events);

    // 3. Update monsters
    for (const monster of this.monsters) {
      monster.update(dt, this.players, this.map, (newProj) => {
        this.projectiles.push(newProj);
        this.events.push({
          type: 'projectile_spawn',
          x: newProj.x,
          y: newProj.y,
          angle: newProj.dirAngle,
        });
      });
    }

    // 4. Update projectiles & handle collisions (Safe zone entities immune)
    for (const proj of this.projectiles) {
      proj.update(dt, this.map);
      if (proj.isDead) continue;

      if (proj.shooterType === 'monster') {
        // Monster projectile -> hits players (outside safe zone)
        for (const player of this.players.values()) {
          if (player.isDead || player.inSafeZone) continue;

          const dx = player.x - proj.x;
          const dy = player.y - proj.y;
          const distSq = dx * dx + dy * dy;
          const hitRadius = player.radius + proj.radius;

          if (distSq <= hitRadius * hitRadius) {
            proj.isDead = true;
            player.takeDamage(proj.damage, proj.shooterId);
            this.events.push({
              type: 'hit',
              attackerId: proj.shooterId,
              targetType: 'player',
              targetId: player.id,
              x: player.x,
              y: player.y,
              damage: proj.damage,
            });
            break;
          }
        }
      } else if (proj.shooterType === 'player') {
        // Player projectile -> hits monsters and other players
        const shooter = this.players.get(proj.shooterId);

        // a) Check monsters
        for (const monster of this.monsters) {
          if (monster.isDead) continue;

          const dx = monster.x - proj.x;
          const dy = monster.y - proj.y;
          const distSq = dx * dx + dy * dy;
          const hitRadius = monster.radius + proj.radius;

          if (distSq <= hitRadius * hitRadius) {
            proj.isDead = true;
            const died = monster.takeDamage(proj.damage, proj.shooterId);
            this.events.push({
              type: 'hit',
              attackerId: proj.shooterId,
              targetType: 'monster',
              targetId: monster.id,
              x: monster.x,
              y: monster.y,
              damage: proj.damage,
            });

            if (died) {
              this.handleMonsterKill(shooter, monster);
            }
            break;
          }
        }

        if (proj.isDead) continue;

        // b) Check PvP players (cannot hit self or safe zone players)
        for (const [otherId, target] of this.players.entries()) {
          if (otherId === proj.shooterId || target.isDead || target.inSafeZone) continue;

          const dx = target.x - proj.x;
          const dy = target.y - proj.y;
          const distSq = dx * dx + dy * dy;
          const hitRadius = target.radius + proj.radius;

          if (distSq <= hitRadius * hitRadius) {
            proj.isDead = true;
            const dmgResult = target.takeDamage(proj.damage, proj.shooterId);
            this.events.push({
              type: 'hit',
              attackerId: proj.shooterId,
              targetType: 'player',
              targetId: target.id,
              x: target.x,
              y: target.y,
              damage: proj.damage,
            });

            if (dmgResult.died && shooter) {
              shooter.score = (shooter.score ?? 0) + config.PLAYER.KILL_SCORE;
              shooter.kills = (shooter.kills ?? 0) + 1;
              this.events.push({
                type: 'kill',
                killerNickname: shooter.nickname,
                victimNickname: target.nickname,
                scoreBonus: config.PLAYER.KILL_SCORE,
                message: `🎯 [${shooter.nickname}] 님이 [${target.nickname}] 님을 저격 처치했습니다! (+${config.PLAYER.KILL_SCORE}점)`,
              });
            }
            break;
          }
        }
      }
    }

    // Filter out expired / dead projectiles
    this.projectiles = this.projectiles.filter((p) => !p.isDead);

    // 5. Generate Leaderboard (Sorted by score desc) with strict null-checking & fallback defaults
    const leaderboard = Array.from(this.players.values())
      .filter((p) => p && p.id)
      .map((p) => ({
        id: p.id,
        nickname: (p.nickname && typeof p.nickname === 'string') ? p.nickname : 'Player',
        color: p.color || '#3b82f6',
        score: (typeof p.score === 'number' && !isNaN(p.score)) ? p.score : 0,
        kills: (typeof p.kills === 'number' && !isNaN(p.kills)) ? p.kills : 0,
        isDead: !!p.isDead,
        inSafeZone: !!p.inSafeZone,
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const leaderPlayerId = (leaderboard.length > 0 && (leaderboard[0].score ?? 0) > 0)
      ? leaderboard[0].id
      : null;

    // 6. Broadcast game snapshot to all clients
    const payload = {
      timestamp: now,
      safeZone: this.map.safeZone,
      players: Array.from(this.players.values()).map((p) => p.serialize()),
      items: this.itemManager.serialize(),
      ammoDrops: this.itemManager.serializeAmmoDrops(),
      monsterDrops: this.itemManager.serializeMonsterDrops(),
      monsters: this.monsters.map((m) => m.serialize()),
      projectiles: this.projectiles.map((p) => p.serialize()),
      leaderboard,
      leaderPlayerId,
      events: this.events,
    };

    this.io.emit('gameState', payload);

    // Clear events for next tick
    this.events = [];
  }

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

module.exports = GameManager;
