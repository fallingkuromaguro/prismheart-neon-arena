// Headless Chrome driver over the DevTools protocol (Node 22+, standard library only).
//   node tools/browser.mjs shots   capture every scene in shots.json into screenshots/ (JPEG, under 256 KiB)
//   node tools/browser.mjs play    play the real game with synthetic keyboard and mouse input,
//                                  log the game state as it goes and fail on any page error
// It starts serve.ts and Chrome itself and stops both when done.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] ?? 'shots';
const PORT = 8199;
const DEBUG_PORT = 9339;
// This VM's Chromium blocks every load of 127.0.0.1 (local-network-access checks), so by default
// the game is opened from disk; ES modules from file:// need --allow-file-access-from-files.
// BASE=http://127.0.0.1:8199/ uses serve.ts instead, as on a normal machine.
const BASE = process.env.BASE ?? `file://${root}game/index.html`;
const CHROME = process.env.CHROME ?? '/opt/meta-chromium/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// This VM's Chromium build refuses to start without a WebGL domain policy file and its SHA-256.
// The game draws with Canvas 2D, so an empty allowlist (header line only) is all it needs.
mkdirSync(join(root, '.tmp'), { recursive: true });
const policyPath = join(root, '.tmp', 'webgl-policy.txt');
writeFileSync(policyPath, 'hatch-webgl-allowed-domains-v1\n');
const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
// Wait for serve.ts to listen. Each scene is then opened as a new browser-initiated tab
// (/json/new): Chrome's local-network checks block a page-initiated navigation to 127.0.0.1.
for (let i = 0; i < 100; i += 1) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {
    await sleep(100);
  }
}
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--no-proxy-server', ...(BASE.startsWith('file:') ? ['--allow-file-access-from-files'] : []), `--remote-debugging-port=${DEBUG_PORT}`,
  `--hatch-webgl-allowed-domains-file=${policyPath}`, `--hatch-webgl-allowed-domains-sha256=${policySha}`,
  `--user-data-dir=${join(root, '.tmp', 'chrome')}`, '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });

function shutdown(code) {
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
  process.exit(code);
}

async function waitForChrome() {
  for (let i = 0; i < 100; i += 1) {
    try {
      await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method) for (const l of listeners) l(data);
  };
  return new Promise((resolve) => {
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        id += 1;
        waiting.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      on: (fn) => listeners.push(fn),
    });
  });
}

await waitForChrome();
const errors = [];
let cdp = null;
let tab = null;

const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

/** Open the game at `query` in a fresh tab (closing the last one) and attach to it. */
async function navigate(query) {
  if (tab) await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${tab.id}`);
  const url = `${BASE}${query}`;
  tab = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  cdp = await client(tab.webSocketDebuggerUrl);
  cdp.on((e) => {
    if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
    if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') errors.push(e.params.args.map((a) => a.value ?? a.description).join(' '));
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') errors.push(`${e.params.entry.text} ${e.params.entry.url ?? ''}`);
  });
  if (process.env.DEBUG) console.log('opened', tab.url, await evaluate('location.href + " " + document.body.innerText.slice(0, 120)'));
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const href = await evaluate('location.href');
  if (!href.startsWith(BASE.slice(0, 7))) throw new Error(`page failed to load: ${href} ${await evaluate('document.body.innerText')}`);
}

async function capture(path, quality = 90) {
  for (let q = quality; q >= 50; q -= 5) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: q });
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length <= 250 * 1024) {
      writeFileSync(path, bytes);
      return { bytes: bytes.length, quality: q };
    }
  }
  throw new Error(`${path}: could not fit under 250 KiB`);
}

async function shots() {
  const list = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
  for (const shot of list) {
    await navigate(shot.query);
    for (let i = 0; i < 200 && !(await evaluate('window.__shotReady === true')); i += 1) await sleep(100);
    await sleep(100);
    if (process.env.DEBUG) console.log(await evaluate('location.href + " | " + document.title'));
    const info = await capture(join(root, 'screenshots', shot.name));
    console.log(`${shot.name}: ${info.bytes} bytes at quality ${info.quality}`);
  }
}

const KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ', Enter: 'Enter', Escape: 'Escape', ShiftLeft: 'Shift', Digit1: '1', Digit2: '2', Digit3: '3', KeyR: 'r' };
const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Space: 32, Enter: 13, Escape: 27, ShiftLeft: 16, Digit1: 49, Digit2: 50, Digit3: 51, KeyR: 82 };
const key = (type, code) => cdp.send('Input.dispatchKeyEvent', { type, code, key: KEYS[code], windowsVirtualKeyCode: VK[code] });
const tap = async (code) => {
  await key('keyDown', code);
  await sleep(40);
  await key('keyUp', code);
};
const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });

async function play() {
  mkdirSync(join(root, '.tmp'), { recursive: true });
  await navigate('?seed=42');
  await sleep(1200);
  await capture(join(root, '.tmp', 'play-0-title.jpg'));
  const state = () => evaluate(`(() => { const g = window.__prismheart; const s = g.state; return { screen: g.screen, phase: s.phase, wave: s.waveIndex + 1, score: s.score, hull: s.player.hull, heart: Math.round(s.heart.hp), enemies: s.enemies.length, x: Math.round(s.player.x), y: Math.round(s.player.y) }; })()`);
  console.log('title', await state());
  await mouse('mousePressed', 640, 600);
  await mouse('mouseReleased', 640, 600);
  await sleep(300);
  console.log('after click', await state());
  // Fly in a loop around the Heart, aiming at the field, firing, dashing and pulsing now and then.
  const moves = [['KeyD', 'KeyW'], ['KeyW', 'KeyA'], ['KeyA', 'KeyS'], ['KeyS', 'KeyD']];
  await mouse('mousePressed', 900, 300);
  for (let t = 0; t < 48; t += 1) {
    const pair = moves[t % 4];
    for (const k of pair) await key('keyDown', k);
    const a = t * 0.9;
    await mouse('mouseMoved', 640 + Math.cos(a) * 420, 380 + Math.sin(a) * 260, { buttons: 1 });
    await sleep(450);
    for (const k of pair) await key('keyUp', k);
    if (t % 5 === 2) await tap('ShiftLeft');
    if (t % 9 === 4) await tap('Space');
    const s = await state();
    if (t % 6 === 0) console.log(`t=${t}`, s);
    if (s.screen === 'upgrade') {
      await capture(join(root, '.tmp', `play-upgrade-${s.wave}.jpg`));
      await sleep(700);
      await tap('Digit2');
      await sleep(100);
      console.log('picked card 2 ->', await state());
    }
    if (s.screen === 'over' || s.screen === 'won') break;
    if (t === 10) await capture(join(root, '.tmp', 'play-1-fight.jpg'));
  }
  await mouse('mouseReleased', 900, 300);
  let s = await state();
  if (s.screen === 'play') {
    await tap('Escape');
    await sleep(150);
    s = await state();
    console.log('after Esc', s.screen);
    await capture(join(root, '.tmp', 'play-2-paused.jpg'));
    await tap('Escape');
    await sleep(150);
    console.log('after Esc again', (await state()).screen);
  }
  // Stand idle and let the Hollow win, then check the end screen restarts a fresh run.
  for (let i = 0; i < 240 && !['over', 'won'].includes((s = await state()).screen); i += 1) {
    if (s.screen === 'upgrade') await tap('Digit1');
    await sleep(500);
  }
  console.log('end screen', s);
  await sleep(1500);
  await capture(join(root, '.tmp', 'play-3-end.jpg'));
  await tap('Enter');
  await sleep(300);
  const restarted = await state();
  console.log('after Enter', restarted);
  if (!(s.screen === 'over' || s.screen === 'won') || restarted.screen !== 'play' || restarted.wave !== 1 || restarted.score !== 0) throw new Error('end screen did not restart a fresh run');
}

try {
  if (mode === 'shots') await shots();
  else await play();
  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'));
    shutdown(1);
  }
  console.log('no page errors');
  shutdown(0);
} catch (error) {
  console.error(error);
  if (errors.length) console.error('page errors:\n' + errors.join('\n'));
  shutdown(1);
}
