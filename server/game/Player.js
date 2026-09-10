const config = require('../config');

class Player {
  constructor(id, nickname, color, spawnPos) {
    this.id = id;
    this.nickname = (nickname || 'Warrior').trim().substring(0, 14);
    this.color = color || '#3b82f6';

    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.angle = 0; // facing direction in radians
    this.radius = config.PLAYER.RADIUS;

    // Health & Stamina
    this.hp = config.PLAYER.MAX_HP;
    this.maxHp = config.PLAYER.MAX_HP;
    this.stamina = config.PLAYER.MAX_STAMINA;
    this.maxStamina = config.PLAYER.MAX_STAMINA;

    // State flags
    this.isDead = false;
    this.deathTime = 0;
    this.score = 0;
    this.kills = 0;
    this.inSafeZone = false;

    // Active Buffs { atkSpeed: ms, moveSpeed: ms, attackBoost: ms }
    this.buffs = {
      atkSpeed: 0,
      moveSpeed: 0,
      attackBoost: 0,
    };

    // Persistent overhead chat bubble { text, time, expireTime }
    this.chatMessage = null;

    // Weapon & Ammo System (1: Melee Sword, 2: Ranged Weapon)
    this.selectedWeapon = 1;
    this.ammo = config.PLAYER.INITIAL_AMMO;
    this.maxAmmo = config.PLAYER.MAX_AMMO;
    this.lastRangedAttackTime = 0;

    // Movement inputs from client (Spacebar is sprint)
    this.inputs = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
      shift: false,
      angle: 0,
    };

    this.isRunning = false;
    this.lastAttackTime = 0;
    this.isAttacking = false;
    this.attackAnimTimer = 0;

    this.updateRadius();
  }

  getScale() {
    const s = Math.max(0, this.score ?? 0);
    // Balanced scaling: Starts at 1.0, reaches ~1.27 at 500, ~1.38 at 1000, ~1.54 at 2000, max 1.65
    return Math.min(1.65, 1.0 + Math.sqrt(s) * 0.012);
  }

  updateRadius() {
    this.radius = Math.round(config.PLAYER.RADIUS * this.getScale() * 10) / 10;
  }

  setChatMessage(text) {
    this.chatMessage = {
      text,
      time: Date.now(),
      expireTime: Date.now() + 5000,
    };
  }

  applyItem(type) {
    if (type === 'health') {
      const heal = config.ITEMS.HEALTH.HEAL_AMOUNT;
      this.hp = Math.min(this.maxHp, this.hp + heal);
      return { type, text: `+${heal} HP 회복!` };
    } else if (type === 'atk_speed') {
      this.buffs.atkSpeed = config.ITEMS.ATK_SPEED.DURATION; // 5000ms
      return { type, text: `⚡ 5초간 공격 속도 2배!` };
    } else if (type === 'move_speed') {
      this.buffs.moveSpeed = config.ITEMS.MOVE_SPEED.DURATION; // 3000ms
      return { type, text: `💨 3초간 이동 속도 1.7배!` };
    }
    return null;
  }

  updateInput(inputs) {
    if (this.isDead) return;
    this.inputs = {
      up: !!inputs.up,
      down: !!inputs.down,
      left: !!inputs.left,
      right: !!inputs.right,
      space: !!inputs.space,
      angle: typeof inputs.angle === 'number' ? inputs.angle : this.angle,
    };
    if (inputs.selectedWeapon === 1 || inputs.selectedWeapon === 2) {
      this.selectedWeapon = inputs.selectedWeapon;
    }
    this.angle = this.inputs.angle;
  }

  switchWeapon(weaponId) {
    this.selectedWeapon = weaponId === 2 ? 2 : 1;
  }

  canAttack() {
    if (this.isDead) return false;
    const cooldown = this.buffs.atkSpeed > 0
      ? config.PLAYER.ATTACK_COOLDOWN * config.ITEMS.ATK_SPEED.COOLDOWN_RATIO
      : config.PLAYER.ATTACK_COOLDOWN;
    return Date.now() - this.lastAttackTime >= cooldown;
  }

  triggerAttack() {
    if (!this.canAttack()) return false;
    this.lastAttackTime = Date.now();
    this.isAttacking = true;
    this.attackAnimTimer = 0.22;
    return true;
  }

  canAttackRanged() {
    if (this.isDead || this.ammo <= 0) return false;
    const cooldown = this.buffs.atkSpeed > 0
      ? config.PLAYER.RANGED_COOLDOWN * config.ITEMS.ATK_SPEED.COOLDOWN_RATIO
      : config.PLAYER.RANGED_COOLDOWN;
    return Date.now() - this.lastRangedAttackTime >= cooldown;
  }

  triggerRangedAttack() {
    if (!this.canAttackRanged()) return false;
    this.lastRangedAttackTime = Date.now();
    this.ammo -= 1;
    this.isAttacking = true;
    this.attackAnimTimer = 0.18;
    return true;
  }

  addAmmo(amount) {
    if (this.ammo >= this.maxAmmo) return false;
    this.ammo = Math.min(this.maxAmmo, this.ammo + amount);
    return true;
  }

  getDamageMultiplier() {
    return this.buffs.attackBoost > 0 ? (config.MONSTER_DROPS ? config.MONSTER_DROPS.BUFF_ATTACK_MULTIPLIER : 1.5) : 1.0;
  }

  takeDamage(amount, attackerId = null) {
    if (this.isDead || this.inSafeZone) return { died: false, actualDamage: 0 };

    const actualDamage = Math.min(this.hp, amount);
    this.hp -= actualDamage;

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      this.deathTime = Date.now();
      this.score = 0;
      this.buffs.atkSpeed = 0;
      this.buffs.moveSpeed = 0;
      this.buffs.attackBoost = 0;
      return { died: true, actualDamage, killerId: attackerId };
    }

    return { died: false, actualDamage };
  }

  respawn(spawnPos) {
    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.score = 0;
    this.isDead = false;
    this.deathTime = 0;
    this.isRunning = false;
    this.isAttacking = false;
    this.buffs.atkSpeed = 0;
    this.buffs.moveSpeed = 0;
    this.buffs.attackBoost = 0;
    this.ammo = config.PLAYER.INITIAL_AMMO;
    this.selectedWeapon = 1;
    this.updateRadius();
  }

  update(dt, map) {
    this.updateRadius();

    // Attack animation decay
    if (this.isAttacking) {
      this.attackAnimTimer -= dt;
      if (this.attackAnimTimer <= 0) {
        this.isAttacking = false;
      }
    }

    // Buff durations decay
    if (this.buffs.atkSpeed > 0) {
      this.buffs.atkSpeed = Math.max(0, this.buffs.atkSpeed - dt * 1000);
    }
    if (this.buffs.moveSpeed > 0) {
      this.buffs.moveSpeed = Math.max(0, this.buffs.moveSpeed - dt * 1000);
    }
    if (this.buffs.attackBoost > 0) {
      this.buffs.attackBoost = Math.max(0, this.buffs.attackBoost - dt * 1000);
    }

    // Check safe zone status
    this.inSafeZone = map.isInSafeZone(this.x, this.y);

    // Handle dead state
    if (this.isDead) {
      const elapsed = Date.now() - this.deathTime;
      if (elapsed >= config.PLAYER.RESPAWN_TIME) {
        const newSpawn = map.getRandomSpawnPosition(this.radius, { forSafeZone: true });
        this.respawn(newSpawn);
      }
      return;
    }

    // Movement vector calculation
    let moveX = 0;
    let moveY = 0;

    if (this.inputs.up) moveY -= 1;
    if (this.inputs.down) moveY += 1;
    if (this.inputs.left) moveX -= 1;
    if (this.inputs.right) moveX += 1;

    const isMoving = moveX !== 0 || moveY !== 0;

    // Stamina drain and sprint logic (Spacebar is sprint)
    if (isMoving && this.inputs.space && this.stamina > 0) {
      this.isRunning = true;
      this.stamina = Math.max(0, this.stamina - config.PLAYER.STAMINA_DRAIN_PER_SEC * dt);
    } else {
      this.isRunning = false;
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + config.PLAYER.STAMINA_REGEN_PER_SEC * dt
      );
    }

    // Apply movement with speed buffs
    if (isMoving) {
      const length = Math.sqrt(moveX * moveX + moveY * moveY);
      const dirX = moveX / length;
      const dirY = moveY / length;

      let currentSpeed = this.isRunning
        ? config.PLAYER.BASE_SPEED * config.PLAYER.RUN_MULTIPLIER
        : config.PLAYER.BASE_SPEED;

      // Apply 1.7x move speed buff if active
      if (this.buffs.moveSpeed > 0) {
        currentSpeed *= config.ITEMS.MOVE_SPEED.MULTIPLIER;
      }

      const nextX = this.x + dirX * currentSpeed * dt;
      const nextY = this.y + dirY * currentSpeed * dt;

      const resolved = map.resolveObstacleCollision(nextX, nextY, this.radius, false);
      this.x = resolved.x;
      this.y = resolved.y;
    }
  }

  getRemainingRespawnSeconds() {
    if (!this.isDead) return 0;
    const elapsed = Date.now() - this.deathTime;
    const remaining = Math.max(0, Math.ceil((config.PLAYER.RESPAWN_TIME - elapsed) / 1000));
    return remaining;
  }

  serialize() {
    const scale = Math.round(this.getScale() * 100) / 100;
    return {
      id: this.id,
      nickname: this.nickname,
      color: this.color,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 1000) / 1000,
      radius: this.radius,
      scale: scale,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      isDead: this.isDead,
      isRunning: this.isRunning,
      isAttacking: this.isAttacking,
      inSafeZone: this.inSafeZone,
      selectedWeapon: this.selectedWeapon,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      buffs: {
        atkSpeed: Math.max(0, Math.ceil(this.buffs.atkSpeed / 1000)),
        moveSpeed: Math.max(0, Math.ceil(this.buffs.moveSpeed / 1000)),
        attackBoost: Math.max(0, Math.ceil((this.buffs.attackBoost || 0) / 1000)),
      },
      respawnCountdown: this.getRemainingRespawnSeconds(),
      score: this.score ?? 0,
      kills: this.kills ?? 0,
      chatMessage:
        this.chatMessage && Date.now() < this.chatMessage.expireTime
          ? { text: this.chatMessage.text, time: this.chatMessage.time }
          : null,
    };
  }
}

module.exports = Player;
