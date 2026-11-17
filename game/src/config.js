// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The walled arena the Warden flies in; the HUD sits in the band above it. */
export const ARENA = { left: 28, top: 64, right: 1252, bottom: 700 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 12,
  speed: 335,
  accel: 15,
  hull: 5,
  invulnerable: 1.3,
  fireInterval: 0.115,
  bulletSpeed: 930,
  bulletLife: 0.8,
  bulletDamage: 1,
  bulletRadius: 4,
  spread: 0.11,
  dashSpeed: 1000,
  dashTime: 0.15,
  dashCooldown: 1.05,
  dashDamage: 3,
  magnet: 105,
  orbitRadius: 48,
  orbitSpeed: 3.4,
  orbitDamage: 2,
};

export const HEART = { x: 640, y: 384, radius: 34, hp: 120, turretRange: 380, turretInterval: 1.3 };

export const PULSE = { chargePerShard: 0.034, radius: 440, speed: 950, damage: 9, knock: 620 };

export const COMBO = { window: 2.4, killsPerStep: 5, maxMult: 8 };

export const SCORE = { shard: 5, waveClear: 300, heartBonus: 12, hullBonus: 800 };

export const LIMITS = { particles: 1500, enemyShots: 420, enemies: 90 };

export const PALETTE = {
  bg: '#05030c',
  bgGlow: '#1a0b3d',
  grid: 'rgba(116, 74, 255, 0.17)',
  gridBright: 'rgba(160, 112, 255, 0.34)',
  arena: '#8a5cff',
  player: '#4ff7ff',
  playerCore: '#eaffff',
  bullet: '#a6fcff',
  heart: '#ffd166',
  heartCore: '#fff7dc',
  heartHurt: '#ff5a7a',
  shard: '#ffc94d',
  mote: '#ff3d7f',
  dart: '#ff923d',
  splitter: '#c35bff',
  weaver: '#ff4de1',
  leech: '#a6ff4d',
  boss: '#ff2d55',
  enemyShot: '#ff6ab0',
  text: '#f3eeff',
  muted: '#9a8fc0',
  danger: '#ff4d6d',
  good: '#6dffb0',
};

export const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'prismheart.best';
export const MUTE_KEY = 'prismheart.muted';
