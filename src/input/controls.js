// One input model for keyboard, touch and mouse: two boolean channels.
//
// There is deliberately no "press event". The pump period lives in the rules
// (sim/match.js PRESS_COOLDOWN), so holding a thumb down and tapping it as fast as
// possible arrive at the sim identically. That parity is what makes the game
// fair on a phone, so it must not be reintroduced here.
//
// A tap can be shorter than one animation frame. Without a latch it would never be
// sampled and the thumb's press would simply vanish, so a channel press is latched
// and the next sample sees it once. That is observation, not a second event path.

const PRESS_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const BRACE_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown']);

export function createControls({ pressZone, braceZone, onPauseKey } = {}) {
  let pressHeld = false;
  let braceHeld = false;
  let pressLatched = false;
  let braceLatched = false;
  const cleanup = [];

  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    cleanup.push(() => target.removeEventListener(type, handler, opts));
  }

  on(window, 'keydown', (e) => {
    if (e.repeat) return;
    if (PRESS_KEYS.has(e.code)) { pressHeld = true; pressLatched = true; e.preventDefault(); }
    if (BRACE_KEYS.has(e.code)) { braceHeld = true; braceLatched = true; e.preventDefault(); }
    if (e.code === 'KeyP' && onPauseKey) onPauseKey();
  });

  on(window, 'keyup', (e) => {
    if (PRESS_KEYS.has(e.code)) pressHeld = false;
    if (BRACE_KEYS.has(e.code)) braceHeld = false;
  });

  // Track pointers by id so two thumbs are two independent channels.
  const pointers = new Map();

  function bindZone(el, channel) {
    if (!el) return;
    on(el, 'pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, channel);
      if (channel === 'press') { pressHeld = true; pressLatched = true; }
      else { braceHeld = true; braceLatched = true; }
      el.classList.add('down');
    });
    const release = (e) => {
      if (pointers.get(e.pointerId) !== channel) return;
      pointers.delete(e.pointerId);
      // Only clear the channel when no other finger is still holding it.
      const stillHeld = [...pointers.values()].includes(channel);
      if (!stillHeld) {
        if (channel === 'press') pressHeld = false; else braceHeld = false;
        el.classList.remove('down');
      }
    };
    on(el, 'pointerup', release);
    on(el, 'pointercancel', release);
    on(el, 'lostpointercapture', release);
  }

  bindZone(pressZone, 'press');
  bindZone(braceZone, 'brace');

  on(window, 'blur', () => { pressHeld = braceHeld = false; });

  return {
    read() {
      const out = { pressHeld: pressHeld || pressLatched, braceHeld: braceHeld || braceLatched };
      pressLatched = braceLatched = false;
      return out;
    },
    releaseAll() { pressHeld = braceHeld = pressLatched = braceLatched = false; },
    dispose() { cleanup.forEach((f) => f()); pointers.clear(); },
  };
}
