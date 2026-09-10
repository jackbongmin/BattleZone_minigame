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

    // Monster Drops on map (Server-Authoritative drop reward system)
    this.monsterDrops = [];
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

  spawnMonsterDrop(x, y) {
    const dropsConf = config.MONSTER_DROPS || {
      CHANCE_NONE: 35,
      CHANCE_AMMO_2: 35,
      CHANCE_AMMO_6: 10,
      CHANCE_BUFF: 20,
      LIFETIME: 30000,
      PICKUP_RADIUS: 24,
      BUFF_SPEED_DURATION: 7000,
      BUFF_ATTACK_DURATION: 8000,
      BUFF_HEAL_AMOUNT: 35,
    };

    const roll = Math.random() * 100;
    // 35% chance: nothing drops
    if (roll < dropsConf.CHANCE_NONE) {
      return null;
    }

    let dropType = '';
    let subType = '';
    let name = '';
    let value = 0;

    // 35% chance: 2 bullets
    if (roll < dropsConf.CHANCE_NONE + dropsConf.CHANCE_AMMO_2) {
      dropType = 'ammo';
      subType = 'ammo_2';
      name = '+2 탄약';
      value = 2;
    }
    // 10% chance: 6 bullets
    else if (roll < dropsConf.CHANCE_NONE + dropsConf.CHANCE_AMMO_2 + dropsConf.CHANCE_AMMO_6) {
      dropType = 'ammo';
      subType = 'ammo_6';
      name = '+6 탄약';
      value = 6;
    }
    // 20% chance: Random Buff (Speed, Attack, Heal - 1 of 3)
    else {
      const buffRoll = Math.floor(Math.random() * 3);
      if (buffRoll === 0) {
        dropType = 'buff';
        subType = 'move_speed';
        name = '신속의 부적 (이속 1.7배)';
        value = dropsConf.BUFF_SPEED_DURATION || 7000;
      } else if (buffRoll === 1) {
        dropType = 'buff';
        subType = 'attack_boost';
        name = '분노의 비약 (공격력 1.5배)';
        value = dropsConf.BUFF_ATTACK_DURATION || 8000;
      } else {
        dropType = 'heal';
        subType = 'heal';
        name = '생명의 정수 (+35 HP)';
        value = dropsConf.BUFF_HEAL_AMOUNT || 35;
      }
    }

    const drop = {
      id: `mdrop_${itemIdCounter++}`,
      dropType,
      subType,
      name,
      value,
      x: Math.round(x),
      y: Math.round(y),
      radius: dropsConf.PICKUP_RADIUS || 24,
      createdAt: Date.now(),
      expiresAt: Date.now() + (dropsConf.LIFETIME || 30000),
    };

    this.monsterDrops.push(drop);
    return drop;
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

    // 5. Check collision with alive players for monster drop rewards (and expire old drops)
    for (let i = this.monsterDrops.length - 1; i >= 0; i--) {
      const drop = this.monsterDrops[i];

      // Remove expired drops
      if (now >= drop.expiresAt) {
        this.monsterDrops.splice(i, 1);
        continue;
      }

      for (const player of players.values()) {
        if (player.isDead) continue;

        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        const distSq = dx * dx + dy * dy;
        const pickupDist = player.radius + drop.radius;

        if (distSq <= pickupDist * pickupDist) {
          let pickedUp = false;
          let feedbackText = '';

          if (drop.dropType === 'ammo') {
            if (player.ammo < player.maxAmmo) {
              player.addAmmo(drop.value);
              pickedUp = true;
              feedbackText = `+${drop.value} 탄약! (${player.ammo}/${player.maxAmmo})`;
            }
          } else if (drop.dropType === 'heal') {
            if (player.hp < player.maxHp) {
              const prevHp = player.hp;
              player.hp = Math.min(player.maxHp, player.hp + drop.value);
              const actualHeal = player.hp - prevHp;
              pickedUp = true;
              feedbackText = `+${actualHeal} HP 회복! (${player.hp}/${player.maxHp})`;
            }
          } else if (drop.dropType === 'buff') {
            if (drop.subType === 'move_speed') {
              player.buffs.moveSpeed = Math.max(player.buffs.moveSpeed, drop.value);
              pickedUp = true;
              const sec = Math.ceil(drop.value / 1000);
              feedbackText = `💨 ${sec}초간 이동속도 1.7배!`;
            } else if (drop.subType === 'attack_boost') {
              player.buffs.attackBoost = Math.max(player.buffs.attackBoost || 0, drop.value);
              pickedUp = true;
              const sec = Math.ceil(drop.value / 1000);
              feedbackText = `🔥 ${sec}초간 공격력 1.5배!`;
            }
          }

          if (pickedUp) {
            events.push({
              type: 'monster_drop_pickup',
              playerId: player.id,
              dropType: drop.dropType,
              subType: drop.subType,
              x: drop.x,
              y: drop.y,
              text: feedbackText,
            });
            this.monsterDrops.splice(i, 1);
            break;
          }
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

  serializeMonsterDrops() {
    return this.monsterDrops.map((d) => ({
      id: d.id,
      dropType: d.dropType,
      subType: d.subType,
      name: d.name,
      value: d.value,
      x: d.x,
      y: d.y,
      radius: d.radius,
    }));
  }
}

module.exports = ItemManager;
