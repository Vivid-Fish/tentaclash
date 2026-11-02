// Sound. Nothing plays until the player taps once, which is both a browser rule
// and good manners. The asset paths are literal strings so build.sh can inline
// them as data URLs; do not build these paths from variables.

const CLIP_URLS = {
  ambience: 'assets/audio/ambience.m4a',
  whistle: 'assets/audio/whistle.m4a',
  cheer: 'assets/audio/cheer.m4a',
  pin: 'assets/audio/pin.m4a',
};

export function createSound() {
  let ctx = null;
  const buffers = new Map();
  let ambience = null;
  let master = null;
  let started = false;

  async function decode(url) {
    const res = await fetch(url);
    const bytes = await res.arrayBuffer();
    return ctx.decodeAudioData(bytes);
  }

  return {
    async start() {
      if (started) return;
      started = true;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // Decode lazily but start the room tone first: silence feels broken.
      const order = ['ambience', 'whistle', 'pin', 'cheer'];
      for (const name of order) {
        try {
          buffers.set(name, await decode(CLIP_URLS[name]));
        } catch (err) {
          console.warn(`sound: ${name} unavailable`, err);
        }
      }
      const room = buffers.get('ambience');
      if (room) {
        ambience = ctx.createBufferSource();
        ambience.buffer = room;
        ambience.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0.22;
        ambience.connect(g).connect(master);
        ambience.start();
      }
    },

    play(name, { gain = 1, rate = 1 } = {}) {
      if (!ctx) return;
      const buf = buffers.get(name);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(master);
      src.start();
    },

    dispose() { ctx?.close(); ctx = null; started = false; },
  };
}
