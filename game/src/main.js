// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one) and the renderer paints the arena, the HUD and
// whichever screen is up: title, play, upgrade choice, paused, game over or victory.
//
// ?seed=N fixes the run. ?shot=battle|title|upgrade|victory|over stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, MUTE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { drawHud } from './hud.js';
import { autopilot, chooseCard } from './autopilot.js';
import { stageShot } from './shots.js';
import { WAVES } from './waves.js';
import { cardRects, drawGameOver, drawPaused, drawTitle, drawUpgrade, drawVictory, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WON } from './screens.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.1;
/** Seconds an end or card screen ignores input, so a held fire button does not skip it. */
const SCREEN_GUARD = { [SCREEN_UPGRADE]: 0.6, [SCREEN_OVER]: 1.2, [SCREEN_WON]: 1.6 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const ctx = renderer.ctx;

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the value then lasts this visit only.
  }
}

/** Paint one whole frame: the arena, then the HUD in play, then the screen on top. */
function paint(world, screen, ui) {
  const state = world.state;
  renderer.begin();
  renderer.drawWorld(state);
  if (screen !== SCREEN_TITLE) drawHud(ctx, state, ui);
  if (screen === SCREEN_TITLE) drawTitle(ctx, ui);
  else if (screen === SCREEN_UPGRADE) drawUpgrade(ctx, state, ui);
  else if (screen === SCREEN_PAUSED) drawPaused(ctx, ui);
  else if (screen === SCREEN_OVER) drawGameOver(ctx, state, ui);
  else if (screen === SCREEN_WON) drawVictory(ctx, state, ui);
  renderer.end();
}

function runShot(name) {
  const world = createWorld(createRandom(seed));
  const scene = stageShot(name, world);
  const state = world.state;
  const ui = { time: state.time, best: 0, muted: false, hover: -1, ...scene.ui };
  if (ui.aimFromPilot) {
    const control = autopilot(state, 1);
    ui.aim = { x: control.aimX, y: control.aimY };
  }
  let painted = 0;
  function frame() {
    paint(world, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(frame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  const world = createWorld(createRandom(seed));
  const demo = createWorld(createRandom(seed ^ 0x5eed));
  demo.reset(2);
  const input = createInput(canvas, renderer.toLogical);
  const audio = createAudio();
  audio.setMuted(readNumber(MUTE_KEY) === 1);
  let screen = SCREEN_TITLE;
  let screenTime = 0;
  let best = readNumber(BEST_KEY);
  let newBest = false;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let hover = -1;
  const pending = { dash: false, pulse: false };

  window.__prismheart = { get screen() { return screen; }, get state() { return world.state; } };

  function announce(message) {
    status.textContent = message;
  }

  function setScreen(next) {
    screen = next;
    screenTime = 0;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    newBest = false;
    pending.dash = false;
    pending.pulse = false;
    setScreen(SCREEN_PLAY);
    audio.play('start');
    announce('Wave 1. Defend the Heart.');
  }

  function finishRun() {
    if (world.state.score > best) {
      best = world.state.score;
      newBest = true;
      saveNumber(BEST_KEY, best);
    }
  }

  function pickCard(slot) {
    if (world.chooseUpgrade(slot)) setScreen(SCREEN_PLAY);
  }

  function handlePresses() {
    const presses = input.takePresses();
    if (presses.length > 0) audio.unlock();
    const guarded = screenTime < (SCREEN_GUARD[screen] ?? 0);
    for (const press of presses) {
      if (press === 'mute') {
        audio.setMuted(!audio.muted);
        saveNumber(MUTE_KEY, audio.muted ? 1 : 0);
        continue;
      }
      if (screen === SCREEN_TITLE) {
        if (press === 'confirm' || press === 'space' || press === 'click') startGame();
      } else if (screen === SCREEN_PLAY) {
        if (press === 'pause') {
          setScreen(SCREEN_PAUSED);
          announce('Paused.');
        } else if (press === 'dash') pending.dash = true;
        else if (press === 'space') pending.pulse = true;
      } else if (screen === SCREEN_PAUSED) {
        if (press === 'pause' || press === 'click' || press === 'confirm') setScreen(SCREEN_PLAY);
        else if (press === 'restart') startGame();
      } else if (screen === SCREEN_UPGRADE && !guarded) {
        if (press === 'card1' || press === 'card2' || press === 'card3') pickCard(Number(press.slice(4)) - 1);
        else if (press === 'left') hover = Math.max(0, hover - 1);
        else if (press === 'right') hover = Math.min(world.state.choices.length - 1, hover + 1);
        else if ((press === 'confirm' || press === 'space') && hover >= 0) pickCard(hover);
        else if (press === 'click') {
          const at = input.mouse.clicked;
          const slot = cardRects(world.state.choices.length).findIndex((r) => at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h);
          if (slot >= 0) pickCard(slot);
        }
      } else if ((screen === SCREEN_OVER || screen === SCREEN_WON) && !guarded) {
        if (press === 'confirm' || press === 'space' || press === 'click' || press === 'restart') startGame();
        else if (press === 'pause') {
          demo.reset(2);
          setScreen(SCREEN_TITLE);
        }
      }
    }
  }

  function handleEvents(events) {
    for (const e of events) {
      audio.play(e.type, e);
      if (e.type === 'waveStart') announce(`Wave ${e.index + 1}: ${e.name}.`);
      else if (e.type === 'upgradeOffer') {
        hover = -1;
        setScreen(SCREEN_UPGRADE);
        announce('Wave cleared. Choose an Attunement: 1, 2 or 3.');
      } else if (e.type === 'gameover') {
        finishRun();
        setScreen(SCREEN_OVER);
        announce(`Game over. Score ${world.state.score}.`);
      } else if (e.type === 'victory') {
        finishRun();
        setScreen(SCREEN_WON);
        announce(`Victory! Final score ${world.state.score}.`);
      } else if (e.type === 'playerHit') announce(`Hull ${e.hull}.`);
    }
  }

  function musicLevel() {
    if (screen === SCREEN_TITLE) return 0;
    const s = world.state;
    if (s.boss && !s.boss.dead) return 4;
    if (s.phase !== 'fight') return 1;
    return 1 + Math.min(2, Math.floor(s.waveIndex / 3));
  }

  function stepDemo() {
    const s = demo.state;
    if (s.phase === 'upgrade') demo.chooseUpgrade(chooseCard(s));
    else if (s.phase === 'lost' || s.phase === 'won' || s.waveIndex > 6) demo.reset(2);
    demo.step(STEP, autopilot(demo.state, 0.9));
    demo.takeEvents();
  }

  function stepPlay() {
    const s = world.state;
    const control = input.control(s.player.x, s.player.y);
    control.dash = pending.dash;
    control.pulse = pending.pulse;
    if (s.phase === 'fight' || s.phase === 'clear') {
      pending.dash = false;
      pending.pulse = false;
    }
    world.step(STEP, control);
    handleEvents(world.takeEvents());
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    screenTime += dt;
    accumulator += dt;
    handlePresses();
    if (screen === SCREEN_UPGRADE) {
      const m = input.mouse;
      const slot = cardRects(world.state.choices.length).findIndex((r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h);
      if (slot >= 0 && m.moved) hover = slot;
    }
    while (accumulator >= STEP) {
      accumulator -= STEP;
      if (screen === SCREEN_TITLE) stepDemo();
      else if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_OVER || screen === SCREEN_WON) stepPlay();
    }
    if (screen === SCREEN_PAUSED) accumulator = 0;
    audio.setIntensity(musicLevel());
    const ui = { time, best, newBest, muted: audio.muted, hover, aim: input.usingKeyAim() ? null : input.mouse };
    paint(screen === SCREEN_TITLE ? demo : world, screen, ui);
    canvas.style.cursor = screen === SCREEN_PLAY ? 'none' : 'default';
  }

  // Leaving the tab pauses a running game rather than letting the Hollow feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED);
      announce('Paused.');
    }
  });

  announce(`Prismheart. Survive ${WAVES.length} waves. Press Enter or click to start.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
