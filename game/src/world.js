// The whole game state and its fixed-step update. A run moves through phases:
//   fight    a wave is under way
//   clear    the wave is beaten: shards fly home, a breather before the next choice
//   upgrade  three Attunement cards wait for a pick (the loop shows them)
//   dying    the Warden or the Heart has fallen: the world runs on in slow motion
//   lost     game over          won   the Null Choir is silenced, the night survived
// The world never touches the DOM or audio: it lists what happened in state.events.
import { ARENA, COMBO, HEART, PALETTE, SCORE } from './config.js';
import { createFx, burst, floatText, flash, hitstop, ring, shake, updateFx } from './fx.js';
import { createGrid, gridImpulse, updateGrid } from './grid.js';
import { createHeart, releasePulse, updateHeart } from './heart.js';
import { createPlayer, updateBullets, updateOrbitals, updatePlayer, updateShards } from './player.js';
import { updateEnemies } from './enemies.js';
import { startWave, updateWave, waveCleared, WAVES } from './waves.js';
import { damagePlayer, emit, killEnemy } from './combat.js';
import { applyUpgrade, computeStats, rollChoices } from './upgrades.js';
import { BOSSES } from './boss.js';

const CLEAR_TIME = 2.6;
const DYING_TIME = 2.2;
const DYING_SPEED = 0.3;

export const IDLE_INPUT = { moveX: 0, moveY: 0, aimX: HEART.x, aimY: 0, fire: false, dash: false, pulse: false };

function freshState(rng) {
  const state = {
    rng, time: 0, phase: 'fight', phaseTime: 0, waveIndex: 0, waveTime: 0, waveTotal: 1, queue: [], warnings: [],
    player: createPlayer(HEART.x, HEART.y + 120), heart: createHeart(), grid: createGrid(), fx: createFx(),
    enemies: [], bullets: [], enemyShots: [], shards: [], boss: null, nextId: 1,
    levels: {}, stats: computeStats({}), choices: [], events: [],
    score: 0, combo: 0, comboTimer: 0, bestCombo: 0, kills: 0, shardsTaken: 0, hitsTaken: 0, heartDamageTaken: 0, pulses: 0,
    lostReason: '', bonus: { hull: 0, heart: 0 },
  };
  return state;
}

export function createWorld(rng) {
  const world = { state: freshState(rng) };

  world.reset = (startIndex = 0) => {
    world.state = freshState(rng);
    startWave(world.state, startIndex);
  };

  world.takeEvents = () => {
    const list = world.state.events;
    world.state.events = [];
    return list;
  };

  /** Take the card at `slot` (0..2) and start the next wave. */
  world.chooseUpgrade = (slot) => {
    const s = world.state;
    if (s.phase !== 'upgrade' || !s.choices[slot]) return false;
    applyUpgrade(s, s.choices[slot]);
    emit(s, 'upgrade', { id: s.choices[slot] });
    s.choices = [];
    startWave(s, s.waveIndex + 1);
    return true;
  };

  world.step = (dt, input) => stepWorld(world.state, dt, input ?? IDLE_INPUT);
  return world;
}

function setPhase(state, phase) {
  state.phase = phase;
  state.phaseTime = 0;
}

function updateEnemyShots(state, dt) {
  const p = state.player;
  const list = state.enemyShots;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const s = list[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    let gone = s.life <= 0 || s.x < ARENA.left - 10 || s.x > ARENA.right + 10 || s.y < ARENA.top - 10 || s.y > ARENA.bottom + 10;
    const r = s.r + p.radius * 0.7;
    if (!gone && state.phase === 'fight' && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < r * r && p.invulnerable <= 0 && p.dashTime <= 0) {
      damagePlayer(state, 1, s.x, s.y);
      gone = true;
    }
    if (gone) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

function bossDefeated(state) {
  const b = state.boss;
  state.boss = null;
  state.queue = [];
  state.warnings = [];
  state.enemyShots.length = 0;
  for (const e of state.enemies) if (!e.dead) killEnemy(state, e, true);
  for (let i = 0; i < 4; i += 1) ring(state, b.x, b.y, i % 2 ? PALETTE.boss : '#ffffff', 300 + i * 160, 0.6 + i * 0.25, 10 - i * 2);
  burst(state, b.x, b.y, PALETTE.boss, 120, 900, 5, 1.4);
  burst(state, b.x, b.y, '#ffffff', 50, 500, 3, 1);
  shake(state, 1);
  hitstop(state, 0.18);
  flash(state, '#ffffff', 0.6);
  gridImpulse(state.grid, b.x, b.y, 3000, 600);
  floatText(state, b.x, b.y - 80, `${BOSSES[b.kind].name} FALLS`, PALETTE.text, 26);
  emit(state, 'bossDeath', { kind: b.kind });
}

function startDying(state, reason) {
  state.lostReason = reason;
  setPhase(state, 'dying');
  const at = reason === 'heart' ? state.heart : state.player;
  burst(state, at.x, at.y, reason === 'heart' ? PALETTE.heart : PALETTE.player, 140, 800, 5, 1.6);
  ring(state, at.x, at.y, '#ffffff', 600, 1.2, 12);
  shake(state, 1);
  flash(state, PALETTE.danger, 0.7);
  gridImpulse(state.grid, at.x, at.y, 3000, 700);
  emit(state, 'dying', { reason });
}

function finishWave(state) {
  const wave = state.waveIndex;
  const bonus = SCORE.waveClear * (wave + 1) + Math.round(state.heart.hp) * 3;
  state.score += bonus;
  const p = state.player;
  if (p.hull < state.stats.maxHull) p.hull += 1;
  floatText(state, state.heart.x, state.heart.y - 70, `WAVE CLEAR  +${bonus}`, PALETTE.good, 22);
  ring(state, state.heart.x, state.heart.y, PALETTE.good, 700, 1.1, 6);
  gridImpulse(state.grid, state.heart.x, state.heart.y, 900, 500);
  setPhase(state, 'clear');
  emit(state, 'waveClear', { index: wave, bonus });
}

function stepWorld(state, dt, input) {
  const fx = state.fx;
  if (fx.hitstop > 0) {
    fx.hitstop -= dt;
    return;
  }
  const sdt = state.phase === 'dying' ? dt * DYING_SPEED : dt;
  state.time += sdt;
  state.phaseTime += dt;
  updateGrid(state.grid, sdt);
  updateFx(state, sdt);
  updateHeart(state, sdt);

  if (state.phase === 'fight') {
    updateWave(state, sdt);
    updatePlayer(state, input, sdt);
    if (input.pulse) releasePulse(state);
    updateBullets(state, sdt);
    updateOrbitals(state);
    updateEnemies(state, sdt);
    updateEnemyShots(state, sdt);
    updateShards(state, sdt, false);
    if (state.comboTimer > 0) {
      state.comboTimer -= sdt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.boss && state.boss.dead) bossDefeated(state);
    if (state.player.hull <= 0) startDying(state, 'warden');
    else if (state.heart.hp <= 0) startDying(state, 'heart');
    else if (waveCleared(state)) finishWave(state);
  } else if (state.phase === 'clear') {
    updatePlayer(state, { ...input, dash: false }, sdt);
    updateBullets(state, sdt);
    updateEnemyShots(state, sdt);
    updateShards(state, sdt, true);
    state.combo = 0;
    if (state.phaseTime >= CLEAR_TIME && state.shards.length === 0) {
      if (state.waveIndex >= WAVES.length - 1) {
        state.bonus = { hull: state.player.hull * SCORE.hullBonus, heart: Math.round(state.heart.hp) * SCORE.heartBonus };
        state.score += state.bonus.hull + state.bonus.heart;
        setPhase(state, 'won');
        emit(state, 'victory');
      } else {
        state.choices = rollChoices(state);
        setPhase(state, 'upgrade');
        emit(state, 'upgradeOffer');
      }
    }
  } else if (state.phase === 'dying') {
    updateEnemies(state, sdt);
    updateEnemyShots(state, sdt);
    updateBullets(state, sdt);
    if (state.phaseTime >= DYING_TIME) {
      setPhase(state, 'lost');
      emit(state, 'gameover', { reason: state.lostReason });
    }
  }
}

export { COMBO };
