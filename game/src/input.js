// Keyboard and mouse. Held state (movement, aim, fire) is read every step; one-shot presses
// (start, pause, dash, pulse, card keys) queue up until the loop takes them, so a tap shorter
// than a frame is never lost.
const MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const AIM_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const PRESS = {
  Enter: 'confirm', NumpadEnter: 'confirm', Space: 'space', Escape: 'pause', KeyP: 'pause', KeyM: 'mute', KeyR: 'restart',
  ShiftLeft: 'dash', ShiftRight: 'dash', Digit1: 'card1', Digit2: 'card2', Digit3: 'card3', Numpad1: 'card1', Numpad2: 'card2', Numpad3: 'card3',
  KeyA: 'left', KeyD: 'right', ArrowLeft: 'left', ArrowRight: 'right',
};

export function createInput(canvas, toLogical) {
  const held = new Set();
  const presses = [];
  const mouse = { x: 640, y: 200, down: false, moved: false, clicked: null };
  let lastAim = 'mouse';

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat && PRESS[event.code]) presses.push(PRESS[event.code]);
    if (AIM_KEYS[event.code]) lastAim = 'keys';
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.moved = true;
    lastAim = 'mouse';
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    if (event.button === 0) {
      mouse.down = true;
      presses.push('click');
      mouse.clicked = p;
    } else if (event.button === 2) presses.push('dash');
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  function vector(map) {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const v = map[code];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    return { x, y };
  }

  return {
    mouse,
    /** Everything pressed since the last call, oldest first. */
    takePresses() {
      return presses.splice(0, presses.length);
    },
    /** The control state for one simulation step, aimed from the Warden at (px, py). */
    control(px, py) {
      const move = vector(MOVE_KEYS);
      const aimKeys = vector(AIM_KEYS);
      const keyAiming = aimKeys.x !== 0 || aimKeys.y !== 0;
      let aimX = mouse.x;
      let aimY = mouse.y;
      if (keyAiming || lastAim === 'keys') {
        if (keyAiming) this.keyAim = { x: aimKeys.x, y: aimKeys.y };
        const k = this.keyAim ?? { x: 0, y: -1 };
        aimX = px + k.x * 200;
        aimY = py + k.y * 200;
      }
      return { moveX: move.x, moveY: move.y, aimX, aimY, fire: mouse.down || keyAiming, dash: false, pulse: false };
    },
    usingKeyAim: () => lastAim === 'keys',
  };
}
