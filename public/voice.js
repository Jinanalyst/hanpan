// Push-to-talk team voice. Sound goes through the game server, so players never see each other's IP address.
// Nothing is recorded, and the microphone is only opened the first time the talk key is pressed.
import { RATE, PACKET, encode, decode } from './shared/adpcm.js';

// sendFrame(Uint8Array): pass a packet to the server. allowed(id): false for muted players.
export function createVoice({ sendFrame, allowed }) {
  let mic = null, micCtx = null, node = null, opening = null, want = false, gen = 0;
  let state = 'idle';                       // idle | asking | live | denied | nomic | failed
  let enc = { value: 0, index: 0, seq: 0 };
  let out = null, bus = null;
  const talkers = new Map();                // player id -> { next, heard, seq }

  function output() {
    if (out) return out;
    out = new AudioContext({ sampleRate: RATE });
    const limit = out.createDynamicsCompressor();   // no one can blast the others' ears
    limit.threshold.value = -18; limit.ratio.value = 12;
    bus = out.createGain(); bus.gain.value = 1.5;
    bus.connect(limit).connect(out.destination);
    return out;
  }

  async function openMic() {
    const run = gen;
    state = 'asking';
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw Object.assign(new Error(), { name: 'NotFoundError' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (run !== gen) { stream.getTracks().forEach(t => t.stop()); return; }   // left the match while the browser was asking
      mic = stream;
      micCtx = new AudioContext();
      await micCtx.audioWorklet.addModule('voice-worklet.js');
      if (run !== gen || !micCtx) { stream.getTracks().forEach(t => t.stop()); return; }
      const src = micCtx.createMediaStreamSource(stream), hp = micCtx.createBiquadFilter(), lp = micCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 90;
      lp.type = 'lowpass'; lp.frequency.value = 7000;
      node = new AudioWorkletNode(micCtx, 'capture', { numberOfOutputs: 0 });
      node.port.onmessage = e => { if (want && state === 'live') sendFrame(encode(e.data, enc)); };
      src.connect(hp).connect(lp).connect(node);
      stream.getAudioTracks()[0].onended = () => { if (mic === stream) close(); };   // unplugged
      state = 'live';
      gate();
    } catch (e) {
      if (run !== gen) return;
      const why = e?.name;
      close();
      state = why === 'NotAllowedError' || why === 'SecurityError' ? 'denied' : why === 'NotFoundError' ? 'nomic' : 'failed';
      console.warn('[voice]', e);
    }
  }
  // the track itself is off unless the talk key is held
  function gate() {
    const on = want && state === 'live';
    mic?.getAudioTracks().forEach(t => { t.enabled = on; });
    node?.port.postMessage(on);
    if (on) { enc = { value: 0, index: 0, seq: enc.seq }; micCtx?.resume(); }
  }

  function start() {
    if (want) return;
    want = true;
    if (state === 'live') gate();
    else if (!opening) opening = openMic().finally(() => { opening = null; });
  }
  function stop() { if (want) { want = false; gate(); } }
  function close() {
    gen++; want = false; state = 'idle';
    mic?.getTracks().forEach(t => t.stop());
    micCtx?.close().catch(() => {});
    mic = micCtx = node = null;
    talkers.clear();
  }

  // data: ArrayBuffer from the server
  function receive(data) {
    if (data.byteLength !== 4 + PACKET) return;
    const id = new DataView(data).getUint32(0, true);
    if (!allowed(id)) return;
    const ctx = output(), packet = new Uint8Array(data, 4), seq = packet[0], t = ctx.currentTime;
    if (ctx.state === 'suspended') ctx.resume();
    let k = talkers.get(id);
    if (!k) talkers.set(id, k = { next: 0, heard: 0, seq: -1 });
    if (k.next < t + 0.02) k.next = t + 0.12;            // first packet or a gap: wait a little so jitter is not audible
    k.heard = performance.now();
    if (k.next > t + 0.6) return;                        // too far behind: drop to catch up
    k.seq = seq;
    const pcm = decode(packet), buf = ctx.createBuffer(1, pcm.length, RATE), s = ctx.createBufferSource();
    buf.copyToChannel(pcm, 0);
    s.buffer = buf; s.connect(bus); s.start(k.next);
    k.next += pcm.length / RATE;
  }

  return {
    start, stop, close, receive,
    ready() { const c = output(); if (c.state === 'suspended') c.resume().catch(() => {}); },                                         // call from a click so the browser allows sound
    get state() { return state; },
    get talking() { return want && state === 'live'; },
    speakers() { const t = performance.now(); return [...talkers].filter(([, k]) => t - k.heard < 350).map(([id]) => id); },
  };
}
