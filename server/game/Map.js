const config = require('../config');

class GameMap {
  constructor() {
    this.width = config.MAP.WIDTH;
    this.height = config.MAP.HEIGHT;
    this.safeZone = config.MAP.SAFE_ZONE; // { X: 1600, Y: 1600, RADIUS: 240 }

    // Natural Grassland Obstacles (Trees, Water Ponds, Mossy Rocks)
    // Rectangles/Circles: { x, y, width, height, type, color, name }
    this.obstacles = [
      // Central Sanctuary Shrine Monument in Safe Zone (Aesthetic only or small central altar)
      { x: 1575, y: 1575, width: 50, height: 50, type: 'altar', color: '#fef08a' },

      // Water Ponds (Non-passable water features)
      { x: 600, y: 700, width: 220, height: 160, type: 'pond', color: '#0284c7' },
      { x: 2300, y: 650, width: 260, height: 180, type: 'pond', color: '#0284c7' },
      { x: 750, y: 2200, width: 240, height: 170, type: 'pond', color: '#0284c7' },
      { x: 2250, y: 2350, width: 280, height: 190, type: 'pond', color: '#0284c7' },

      // Large Oak & Pine Tree Groves (Solid forest clumps)
      { x: 400, y: 350, width: 150, height: 150, type: 'tree_clump', color: '#166534' },
      { x: 1100, y: 450, width: 140, height: 140, type: 'tree_clump', color: '#166534' },
      { x: 1950, y: 380, width: 160, height: 140, type: 'tree_clump', color: '#166534' },
      { x: 2650, y: 420, width: 180, height: 160, type: 'tree_clump', color: '#166534' },

      { x: 320, y: 1200, width: 150, height: 150, type: 'tree_clump', color: '#166534' },
      { x: 2750, y: 1250, width: 170, height: 150, type: 'tree_clump', color: '#166534' },

      { x: 450, y: 1750, width: 160, height: 140, type: 'tree_clump', color: '#166534' },
      { x: 2650, y: 1800, width: 160, height: 160, type: 'tree_clump', color: '#166534' },

      { x: 420, y: 2650, width: 170, height: 150, type: 'tree_clump', color: '#166534' },
      { x: 1200, y: 2600, width: 150, height: 150, type: 'tree_clump', color: '#166534' },
      { x: 1950, y: 2650, width: 160, height: 150, type: 'tree_clump', color: '#166534' },
      { x: 2600, y: 2550, width: 170, height: 160, type: 'tree_clump', color: '#166534' },

      // Mossy Natural Boulders (Ancient rocks)
      { x: 950, y: 1050, width: 110, height: 90, type: 'rock', color: '#475569' },
      { x: 2150, y: 1100, width: 100, height: 95, type: 'rock', color: '#475569' },
      { x: 1050, y: 2050, width: 110, height: 90, type: 'rock', color: '#475569' },
      { x: 2100, y: 2050, width: 120, height: 100, type: 'rock', color: '#475569' },
      { x: 1400, y: 800, width: 90, height: 85, type: 'rock', color: '#475569' },
      { x: 1750, y: 2350, width: 95, height: 90, type: 'rock', color: '#475569' },
    ];
  }

  /**
   * Check if given coordinates are inside the Safe Zone
   */
  isInSafeZone(x, y, padding = 0) {
    const dx = x - this.safeZone.X;
    const dy = y - this.safeZone.Y;
    const effectiveRadius = this.safeZone.RADIUS + padding;
    return dx * dx + dy * dy <= effectiveRadius * effectiveRadius;
  }

  /**
   * Clamp an entity within world boundaries taking radius into account
   */
  clampToBounds(x, y, radius) {
    const minX = radius + 30; // 30px padding from forest outer border
    const maxX = this.width - radius - 30;
    const minY = radius + 30;
    const maxY = this.height - radius - 30;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  /**
   * Circle vs AABB collision check and resolution
   */
  resolveObstacleCollision(x, y, radius, isMonster = false) {
    let resolvedX = x;
    let resolvedY = y;

    // Monsters cannot enter the Safe Zone! (Barrier bounce)
    if (isMonster && this.isInSafeZone(resolvedX, resolvedY, radius + 10)) {
      const dx = resolvedX - this.safeZone.X;
      const dy = resolvedY - this.safeZone.Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const pushDist = this.safeZone.RADIUS + radius + 12;
        resolvedX = this.safeZone.X + (dx / dist) * pushDist;
        resolvedY = this.safeZone.Y + (dy / dist) * pushDist;
      }
    }

    for (const obs of this.obstacles) {
      const closestX = Math.max(obs.x, Math.min(resolvedX, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(resolvedY, obs.y + obs.height));

      const distX = resolvedX - closestX;
      const distY = resolvedY - closestY;
      const distanceSquared = distX * distX + distY * distY;

      if (distanceSquared < radius * radius) {
        const dist = Math.sqrt(distanceSquared);
        if (dist === 0) {
          resolvedX += radius;
        } else {
          const overlap = radius - dist;
          const normalX = distX / dist;
          const normalY = distY / dist;
          resolvedX += normalX * overlap;
          resolvedY += normalY * overlap;
        }
      }
    }

    return this.clampToBounds(resolvedX, resolvedY, radius);
  }

  /**
   * Check if a circle collides with any obstacle or out of bounds
   */
  isPositionBlocked(x, y, radius) {
    if (
      x - radius < 30 ||
      x + radius > this.width - 30 ||
      y - radius < 30 ||
      y + radius > this.height - 30
    ) {
      return true;
    }

    for (const obs of this.obstacles) {
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));
      const distX = x - closestX;
      const distY = y - closestY;
      if (distX * distX + distY * distY < radius * radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a projectile hits any obstacle or safe zone boundary
   */
  checkProjectileObstacleCollision(x, y, radius) {
    // Projectiles cannot penetrate Safe Zone
    if (this.isInSafeZone(x, y, radius)) {
      return true;
    }

    // Check map borders
    if (x - radius <= 20 || x + radius >= this.width - 20 || y - radius <= 20 || y + radius >= this.height - 20) {
      return true;
    }

    for (const obs of this.obstacles) {
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));
      const distX = x - closestX;
      const distY = y - closestY;
      if (distX * distX + distY * distY <= radius * radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate spawn position.
   * If forSafeZone=true, spawn inside sanctuary.
   * If outsideSafeZone=true, ensure spawn is well outside safe zone (for monsters).
   */
  getRandomSpawnPosition(radius = 25, options = {}) {
    const { forSafeZone = false, outsideSafeZone = false } = options;

    if (forSafeZone) {
      // Spawn inside safe zone
      for (let i = 0; i < 50; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * (this.safeZone.RADIUS - 70);
        const x = this.safeZone.X + Math.cos(ang) * dist;
        const y = this.safeZone.Y + Math.sin(ang) * dist;
        if (!this.isPositionBlocked(x, y, radius)) {
          return { x, y };
        }
      }
      return { x: this.safeZone.X + 50, y: this.safeZone.Y + 50 };
    }

    let attempts = 0;
    while (attempts < 150) {
      attempts++;
      const x = 120 + Math.random() * (this.width - 240);
      const y = 120 + Math.random() * (this.height - 240);

      if (outsideSafeZone && this.isInSafeZone(x, y, 100)) {
        continue;
      }

      if (!this.isPositionBlocked(x, y, radius + 15)) {
        return { x, y };
      }
    }
    return { x: 500, y: 500 };
  }
}

module.exports = GameMap;
