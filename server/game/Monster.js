const config = require('../config');
const Projectile = require('./Projectile');

let monsterIdCounter = 1;
let projectileIdCounter = 1;

class Monster {
  constructor(type, spawnPos) {
    this.id = `monster_${type}_${monsterIdCounter++}`;
    this.type = type; // 'melee' (Wild Boar) or 'ranged' (Thorn Flower)
    this.conf = type === 'melee' ? config.MONSTER.MELEE : config.MONSTER.RANGED;

    this.name = this.conf.NAME;
    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.radius = this.conf.RADIUS;
    this.speed = this.conf.SPEED;

    this.maxHp = this.conf.MAX_HP;
    this.hp = this.maxHp;

    this.angle = Math.random() * Math.PI * 2;
    this.isDead = false;
    this.deathTime = 0;
    this.respawnDelay = this.conf.RESPAWN_DELAY;

    // AI states
    this.targetPlayer = null;
    this.lastAttackTime = 0;

    // Wander state
    this.wanderAngle = this.angle;
    this.wanderTimer = 0;
  }

  takeDamage(amount, attackerId = null) {
    if (this.isDead) return { died: false, actualDamage: 0 };

    const actualDamage = Math.min(this.hp, amount);
    this.hp -= actualDamage;

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      this.deathTime = Date.now();
      return { died: true, actualDamage, killerId: attackerId, score: this.conf.SCORE };
    }

    return { died: false, actualDamage };
  }

  respawn(spawnPos) {
    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.hp = this.maxHp;
    this.isDead = false;
    this.deathTime = 0;
    this.targetPlayer = null;
    this.lastAttackTime = Date.now();
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
  }

  update(dt, players, map, spawnProjectileCallback) {
    // Respawn handling outside safe zone
    if (this.isDead) {
      if (Date.now() - this.deathTime >= this.respawnDelay) {
        const newSpawn = map.getRandomSpawnPosition(this.radius, { outsideSafeZone: true });
        this.respawn(newSpawn);
      }
      return;
    }

    // Find closest alive player within aggro range WHO IS NOT IN SAFE ZONE
    let closestPlayer = null;
    let closestDistSq = Infinity;
    const aggroRangeSq = this.conf.AGGRO_RANGE * this.conf.AGGRO_RANGE;

    for (const player of players.values()) {
      if (player.isDead || player.inSafeZone) continue;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= aggroRangeSq && distSq < closestDistSq) {
        closestDistSq = distSq;
        closestPlayer = player;
      }
    }

    this.targetPlayer = closestPlayer;

    if (this.type === 'melee') {
      this.updateMeleeAI(dt, map, closestPlayer, closestDistSq);
    } else {
      this.updateRangedAI(dt, map, closestPlayer, closestDistSq, spawnProjectileCallback);
    }
  }

  updateMeleeAI(dt, map, player, distSq) {
    const now = Date.now();

    if (player && !player.inSafeZone) {
      // Chase player with wild boar aggression
      const dist = Math.sqrt(distSq);
      this.angle = Math.atan2(player.y - this.y, player.x - this.x);

      // Check contact damage
      const hitDist = this.radius + player.radius + 6;
      if (dist <= hitDist) {
        if (now - this.lastAttackTime >= this.conf.ATTACK_COOLDOWN) {
          this.lastAttackTime = now;
          player.takeDamage(this.conf.DAMAGE, this.id);
        }
      }

      // Move toward player
      const moveX = (player.x - this.x) / (dist || 1);
      const moveY = (player.y - this.y) / (dist || 1);

      const nextX = this.x + moveX * this.speed * dt;
      const nextY = this.y + moveY * this.speed * dt;
      const resolved = map.resolveObstacleCollision(nextX, nextY, this.radius, true);
      this.x = resolved.x;
      this.y = resolved.y;
    } else {
      // Wander peacefully in the meadow
      this.wander(dt, map);
    }
  }

  updateRangedAI(dt, map, player, distSq, spawnProjectileCallback) {
    const now = Date.now();

    if (player && !player.inSafeZone) {
      const dist = Math.sqrt(distSq);
      this.angle = Math.atan2(player.y - this.y, player.x - this.x);

      // Kite logic
      if (dist < this.conf.KITE_DISTANCE) {
        const moveX = -(player.x - this.x) / dist;
        const moveY = -(player.y - this.y) / dist;

        const nextX = this.x + moveX * this.speed * dt;
        const nextY = this.y + moveY * this.speed * dt;
        const resolved = map.resolveObstacleCollision(nextX, nextY, this.radius, true);
        this.x = resolved.x;
        this.y = resolved.y;
      } else if (dist > this.conf.ATTACK_RANGE) {
        const moveX = (player.x - this.x) / dist;
        const moveY = (player.y - this.y) / dist;

        const nextX = this.x + moveX * this.speed * dt;
        const nextY = this.y + moveY * this.speed * dt;
        const resolved = map.resolveObstacleCollision(nextX, nextY, this.radius, true);
        this.x = resolved.x;
        this.y = resolved.y;
      }

      // Shoot thorn projectile if player not in safe zone
      if (dist <= this.conf.ATTACK_RANGE && now - this.lastAttackTime >= this.conf.ATTACK_COOLDOWN) {
        this.lastAttackTime = now;
        if (spawnProjectileCallback && !map.isInSafeZone(player.x, player.y)) {
          const spawnX = this.x + Math.cos(this.angle) * (this.radius + 10);
          const spawnY = this.y + Math.sin(this.angle) * (this.radius + 10);
          const proj = new Projectile(`proj_${projectileIdCounter++}`, spawnX, spawnY, this.angle, this.id);
          spawnProjectileCallback(proj);
        }
      }
    } else {
      this.wander(dt, map);
    }
  }

  wander(dt, map) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderAngle = Math.random() * Math.PI * 2;
      this.wanderTimer = 2.5 + Math.random() * 3.5;
    }

    this.angle = this.wanderAngle;
    const wanderSpeed = this.speed * 0.45;
    const nextX = this.x + Math.cos(this.wanderAngle) * wanderSpeed * dt;
    const nextY = this.y + Math.sin(this.wanderAngle) * wanderSpeed * dt;

    const resolved = map.resolveObstacleCollision(nextX, nextY, this.radius, true);
    if (Math.abs(resolved.x - nextX) > 0.1 || Math.abs(resolved.y - nextY) > 0.1) {
      this.wanderAngle = (this.wanderAngle + Math.PI * 0.7) % (Math.PI * 2);
    }
    this.x = resolved.x;
    this.y = resolved.y;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 1000) / 1000,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      radius: this.radius,
      isDead: this.isDead,
    };
  }
}

module.exports = Monster;
