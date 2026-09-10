const config = require('../config');

let itemIdCounter = 1;

class ItemManager {
  constructor(map) {
    this.map = map;

    // 3 distinct item slots: health, atk_speed, move_speed
    this.slots = {
      health: {
        type: 'health',
        name: '생명의 물약 (+40 HP)',
        active: null,
        respawnAt: 0,
      },
      atk_speed: {
        type: 'atk_speed',
        name: '질풍의 비약 (5초간 공속 2배)',
        active: null,
        respawnAt: 0,
      },
      move_speed: {
        type: 'move_speed',
        name: '신속의 비약 (3초간 이속 1.7배)',
        active: null,
        respawnAt: 0,
      },
    };

    // Ammo Drops on map (User requirement: max limit, +6 bullets per pickup)
    this.ammoDrops = [];
    this.maxAmmoDrops = config.AMMO_DROP.MAX_COUNT || 7;
    this.ammoSpawnInterval = config.AMMO_DROP.SPAWN_INTERVAL || 4000;
    this.lastAmmoSpawnTime = Date.now();

    // Initial spawn for all 3 items
    this.spawnItem('health');
    this.spawnItem('atk_speed');
    this.spawnItem('move_speed');

    // Initial ammo drops (spawn 4 on map right away)
    for (let i = 0; i < 4; i++) {
      this.spawnAmmoDrop();
    }
  }

  spawnItem(type) {
    const slot = this.slots[type];
    if (!slot || slot.active) return; // Cannot spawn if already exists on map

    const spawnPos = this.map.getRandomSpawnPosition(20, { outsideSafeZone: true });
    slot.active = {
      id: `item_${type}_${itemIdCounter++}`,
      type: type,
      x: Math.round(spawnPos.x),
      y: Math.round(spawnPos.y),
      radius: config.ITEMS.PICKUP_RADIUS || 28,
    };
    slot.respawnAt = 0;
  }

  spawnAmmoDrop() {
    if (this.ammoDrops.length >= this.maxAmmoDrops) return;
    const spawnPos = this.map.getRandomSpawnPosition(20, { outsideSafeZone: true });
    this.ammoDrops.push({
      id: `ammo_${itemIdCounter++}`,
      x: Math.round(spawnPos.x),
      y: Math.round(spawnPos.y),
      radius: config.AMMO_DROP.PICKUP_RADIUS || 24,
      amount: config.PLAYER.AMMO_PICKUP_AMOUNT || 6,
    });
  }

  update(players, events) {
    const now = Date.now();

    // 1. Check potion respawn timers (20 seconds after being consumed)
    for (const type of ['health', 'atk_speed', 'move_speed']) {
      const slot = this.slots[type];
      if (!slot.active && slot.respawnAt > 0 && now >= slot.respawnAt) {
        this.spawnItem(type);
      }
    }

    // 2. Check collision with alive players for potions
    for (const type of ['health', 'atk_speed', 'move_speed']) {
      const slot = this.slots[type];
      if (!slot.active) continue;

      const item = slot.active;

      for (const player of players.values()) {
        if (player.isDead) continue;

        const dx = player.x - item.x;
        const dy = player.y - item.y;
        const distSq = dx * dx + dy * dy;
        const pickupDist = player.radius + item.radius;

        if (distSq <= pickupDist * pickupDist) {
          // Player collected item!
          const result = player.applyItem(item.type);

          events.push({
            type: 'item_pickup',
            itemType: item.type,
            text: result ? result.text : '아이템 획득!',
            x: item.x,
            y: item.y,
            playerId: player.id,
          });

          // Remove item from map and schedule 20-second respawn timer
          slot.active = null;
          slot.respawnAt = now + config.ITEMS.RESPAWN_DELAY; // 20000ms
          break;
        }
      }
    }

    // 3. Check periodic ammo drops spawning up to max limit
    if (now - this.lastAmmoSpawnTime >= this.ammoSpawnInterval) {
      this.lastAmmoSpawnTime = now;
      if (this.ammoDrops.length < this.maxAmmoDrops) {
        this.spawnAmmoDrop();
      }
    }

    // 4. Check collision with alive players for ammo drops
    for (let i = this.ammoDrops.length - 1; i >= 0; i--) {
      const drop = this.ammoDrops[i];

      for (const player of players.values()) {
        if (player.isDead) continue;
        // Don't pick up if already at max capacity (30)
        if (player.ammo >= player.maxAmmo) continue;

        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        const distSq = dx * dx + dy * dy;
        const pickupDist = player.radius + drop.radius;

        if (distSq <= pickupDist * pickupDist) {
          player.addAmmo(drop.amount);

          events.push({
            type: 'ammo_pickup',
            playerId: player.id,
            x: drop.x,
            y: drop.y,
            amount: drop.amount,
            currentAmmo: player.ammo,
            text: `+${drop.amount} 탄약! (${player.ammo}/${player.maxAmmo})`,
          });

          this.ammoDrops.splice(i, 1);
          break;
        }
      }
    }
  }

  serialize() {
    const activeList = [];
    for (const slot of Object.values(this.slots)) {
      if (slot.active) {
        activeList.push({
          id: slot.active.id,
          type: slot.active.type,
          x: slot.active.x,
          y: slot.active.y,
          radius: slot.active.radius,
        });
      }
    }
    return activeList;
  }

  serializeAmmoDrops() {
    return this.ammoDrops.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      radius: d.radius,
      amount: d.amount,
    }));
  }
}

module.exports = ItemManager;
