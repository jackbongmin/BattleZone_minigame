/**
 * Game Configuration & Constants
 */
module.exports = {
  PORT: process.env.PORT || 3000,
  MAX_PLAYERS: 10,
  TICK_RATE: 30, // 30Hz
  TICK_INTERVAL: 1000 / 30, // ~33.33ms

  MAP: {
    WIDTH: 3200,
    HEIGHT: 3200,
    SAFE_ZONE: {
      X: 1600,
      Y: 1600,
      RADIUS: 240,
    },
  },

  PLAYER: {
    RADIUS: 22,
    MAX_HP: 100,
    BASE_SPEED: 210, // px per second
    RUN_MULTIPLIER: 1.5, // 315 px per second
    MAX_STAMINA: 100,
    STAMINA_DRAIN_PER_SEC: 25, // empty in 4 seconds
    STAMINA_REGEN_PER_SEC: 20, // full in 5 seconds
    ATTACK_COOLDOWN: 750, // 0.75s in ms (heavier tactical swing)
    ATTACK_RANGE: 94, // Matches slash impact visuals perfectly
    ATTACK_ARC: (115 * Math.PI) / 180, // 115 degrees in radians
    PVP_DAMAGE: 20,
    MONSTER_DAMAGE: 25,
    RESPAWN_TIME: 10000, // 10s in ms
    KILL_SCORE: 50,

    // Weapon 2: Ranged Weapon & Ammo System
    RANGED_COOLDOWN: 420, // 0.42s in ms
    RANGED_DAMAGE: 20,
    RANGED_SPEED: 650,
    RANGED_RADIUS: 6,
    RANGED_LIFETIME: 1100, // 1.1s lifetime
    MAX_AMMO: 30, // User requirement: Max 30 bullets
    INITIAL_AMMO: 18, // Spawn with 18 bullets
    AMMO_PICKUP_AMOUNT: 6, // User requirement: +6 bullets per pickup
  },

  AMMO_DROP: {
    MAX_COUNT: 7, // User requirement: limit so not too many pile up
    SPAWN_INTERVAL: 4000, // Spawn check every 4 seconds
    PICKUP_RADIUS: 24,
  },

  ITEMS: {
    RESPAWN_DELAY: 20000, // 20 seconds after pickup
    PICKUP_RADIUS: 28,
    HEALTH: {
      TYPE: 'health',
      HEAL_AMOUNT: 40,
      RADIUS: 18,
    },
    ATK_SPEED: {
      TYPE: 'atk_speed',
      DURATION: 5000, // 5 seconds
      COOLDOWN_RATIO: 0.5, // 50% faster attack speed (375ms)
      RADIUS: 18,
    },
    MOVE_SPEED: {
      TYPE: 'move_speed',
      DURATION: 3000, // 3 seconds
      MULTIPLIER: 1.7, // 1.7x movement speed
      RADIUS: 18,
    },
  },

  MONSTER: {
    MELEE_COUNT: 8,
    RANGED_COUNT: 8,

    MELEE: {
      TYPE: 'melee',
      NAME: 'Wild Boar',
      MAX_HP: 55,
      RADIUS: 22,
      SPEED: 130,
      AGGRO_RANGE: 340,
      DAMAGE: 10,
      ATTACK_COOLDOWN: 1100,
      SCORE: 10,
      RESPAWN_DELAY: 6000,
    },

    RANGED: {
      TYPE: 'ranged',
      NAME: 'Thorn Flower',
      MAX_HP: 40,
      RADIUS: 20,
      SPEED: 60,
      AGGRO_RANGE: 440,
      ATTACK_RANGE: 390,
      KITE_DISTANCE: 150,
      ATTACK_COOLDOWN: 2400,
      PROJECTILE_SPEED: 290,
      PROJECTILE_RADIUS: 8,
      PROJECTILE_DAMAGE: 15,
      PROJECTILE_LIFETIME: 2600,
      SCORE: 20,
      RESPAWN_DELAY: 7000,
    },
  },
};
