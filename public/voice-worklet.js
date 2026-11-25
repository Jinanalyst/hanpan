// Turns microphone sound into 16 kHz, 16-bit frames. Sends nothing unless the talk key is held.
const RATE = 16000, FRAME = 640;

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.frame = new Int16Array(FRAME);
    this.n = 0;       // samples in the frame so far
    this.pos = 0;     // position inside the current input sample, in input samples
    this.sum = 0; this.count = 0;
    this.port.onmessage = e => {
      this.on = !!e.data;
      if (!this.on) { this.n = 0; this.sum = 0; this.count = 0; this.pos = 0; }
    };
  }
  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (!x || !this.on) return true;
    const ratio = sampleRate / RATE;
    for (let i = 0; i < x.length; i++) {
      this.sum += x[i]; this.count++; this.pos++;
      if (this.pos < ratio) continue;
      this.pos -= ratio;
      const v = this.sum / this.count;   // average of the input samples that make up one output sample
      this.sum = 0; this.count = 0;
      this.frame[this.n++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
      if (this.n === FRAME) { this.port.postMessage(this.frame.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
