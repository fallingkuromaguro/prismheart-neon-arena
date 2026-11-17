// The screenshot scenes behind ?shot=battle|title|upgrade|victory|over (with &seed=N). Each one
// plays a real run of the real rules from wave 1, flown by the autopilot and picking its own
// cards, until the moment the scene wants, so the frame is exactly what a run looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { autopilot, chooseCard } from './autopilot.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WON } from './screens.js';

const MAX_SECONDS = 900;

/** Play `world` with the pilot until `done(state)` holds (or the run ends); returns whether it held. */
function playUntil(world, skill, done) {
  for (let i = 0; i < MAX_SECONDS / STEP; i += 1) {
    const s = world.state;
    if (done(s)) return true;
    if (s.phase === 'upgrade') world.chooseUpgrade(chooseCard(s));
    else if (s.phase === 'lost' || s.phase === 'won') return false;
    world.step(STEP, autopilot(s, skill));
    world.takeEvents();
  }
  return false;
}

function runFor(world, skill, seconds) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    world.step(STEP, autopilot(world.state, skill));
    world.takeEvents();
  }
}

/** Stage the named scene in `world`; returns the screen to draw and the HUD extras. */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title') {
    playUntil(world, 1, (s) => s.waveIndex === 3 && s.waveTime > 16);
    return { screen: SCREEN_TITLE, ui: { best: 0 } };
  }
  if (name === 'upgrade') {
    playUntil(world, 1, (s) => s.phase === 'upgrade' && s.waveIndex === 5 && s.phaseTime > 0.6);
    return { screen: SCREEN_UPGRADE, ui: { hover: 1 } };
  }
  if (name === 'victory') {
    playUntil(world, 1, (s) => s.phase === 'won' && s.phaseTime > 2.5);
    return { screen: SCREEN_WON, ui: { newBest: true } };
  }
  if (name === 'over') {
    playUntil(world, 0.4, (s) => s.phase === 'lost' && s.phaseTime > 1.5);
    return { screen: SCREEN_OVER, ui: { newBest: false } };
  }
  // battle: deep into the last wave, the Null Choir mid-fight.
  playUntil(world, 1, (s) => s.waveIndex === 9 && s.boss && s.boss.hp < s.boss.maxHp * 0.55 && s.enemyShots.length > 40);
  runFor(world, 1, 0.1);
  return { screen: SCREEN_PLAY, ui: { aimFromPilot: true } };
}
