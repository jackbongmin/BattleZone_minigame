const config = require('../config');

class Projectile {
  constructor(id, x, y, dirAngle, shooterId, shooterType = 'monster', options = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.dirAngle = dirAngle;
    this.shooterId = shooterId;
    this.shooterType = shooterType; // 'monster' or 'player'

    this.radius = options.radius || (shooterType === 'player' ? config.PLAYER.RANGED_RADIUS : config.MONSTER.RANGED.PROJECTILE_RADIUS);
    this.speed = options.speed || (shooterType === 'player' ? config.PLAYER.RANGED_SPEED : config.MONSTER.RANGED.PROJECTILE_SPEED);
    this.damage = options.damage || (shooterType === 'player' ? config.PLAYER.RANGED_DAMAGE : config.MONSTER.RANGED.PROJECTILE_DAMAGE);
    this.color = options.color || (shooterType === 'player' ? '#38bdf8' : '#65a30d');

    this.vx = Math.cos(dirAngle) * this.speed;
    this.vy = Math.sin(dirAngle) * this.speed;

    this.birthTime = Date.now();
    this.lifetime = options.lifetime || (shooterType === 'player' ? config.PLAYER.RANGED_LIFETIME : config.MONSTER.RANGED.PROJECTILE_LIFETIME);
    this.isDead = false;
  }

  update(dt, map) {
    if (this.isDead) return;

    // Check expiration
    if (Date.now() - this.birthTime >= this.lifetime) {
      this.isDead = true;
      return;
    }

    // Move forward
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Check collision with obstacles or map borders
    if (map.checkProjectileObstacleCollision(this.x, this.y, this.radius)) {
      this.isDead = true;
    }
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      radius: this.radius,
      angle: Math.round(this.dirAngle * 1000) / 1000,
      shooterType: this.shooterType,
      color: this.color,
    };
  }
}

module.exports = Projectile;
