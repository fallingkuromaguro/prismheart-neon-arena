// Balance check without a browser: the autopilot plays whole runs of the real world code for a
// range of seeds and skills, and this prints how far each got. node tools/simulate.mjs [runs] [skill]
import { createWorld } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { autopilot, chooseCard } from '../game/src/autopilot.js';
import { STEP } from '../game/src/config.js';

const runs = Number(process.argv[2] ?? 8);
const skill = Number(process.argv[3] ?? 1);
const results = [];
for (let seed = 1; seed <= runs; seed += 1) {
  const world = createWorld(createRandom(seed));
  world.reset();
  let steps = 0;
  const waveTimes = [];
  let waveStart = 0;
  while (steps < 60 * 60 * 15) {
    const s = world.state;
    if (s.phase === 'lost' || s.phase === 'won') break;
    if (s.phase === 'upgrade') {
      waveTimes.push(Math.round(s.time - waveStart));
      waveStart = s.time;
      world.chooseUpgrade(chooseCard(s));
    }
    world.step(STEP, autopilot(s, skill));
    world.takeEvents();
    steps += 1;
  }
  const s = world.state;
  results.push({ seed, phase: s.phase, why: s.lostReason, wave: s.waveIndex + 1, score: s.score, hull: s.player.hull, heart: Math.round(s.heart.hp), kills: s.kills, mins: (s.time / 60).toFixed(1), waveTimes: waveTimes.join(',') });
}
console.table(results);
