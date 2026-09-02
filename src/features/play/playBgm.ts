export const BGM_TRACKS = [
  { id: "off", name: "关闭" },
  { id: "tavern", name: "酒馆低语" },
  { id: "night", name: "深夜牌桌" },
  { id: "forest", name: "林间" },
  { id: "neon", name: "赛博桌" },
] as const;

export type BgmId = (typeof BGM_TRACKS)[number]["id"];

type Voice = { osc: OscillatorNode; gain: GainNode };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voices: Voice[] = [];
let current: BgmId = "off";

function stopAll() {
  for (const v of voices) {
    try {
      v.osc.stop();
    } catch {
      /* already */
    }
    v.osc.disconnect();
    v.gain.disconnect();
  }
  voices = [];
}

function tone(c: AudioContext, dest: AudioNode, freq: number, type: OscillatorType, vol: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  voices.push({ osc, gain });
}

const RECIPES: Record<Exclude<BgmId, "off">, (c: AudioContext, dest: AudioNode) => void> = {
  tavern: (c, dest) => {
    tone(c, dest, 110, "triangle", 0.04);
    tone(c, dest, 164.8, "sine", 0.03);
    tone(c, dest, 246.9, "sine", 0.018);
  },
  night: (c, dest) => {
    tone(c, dest, 82, "sine", 0.05);
    tone(c, dest, 123, "triangle", 0.02);
    tone(c, dest, 196, "sine", 0.012);
  },
  forest: (c, dest) => {
    tone(c, dest, 98, "sine", 0.035);
    tone(c, dest, 146.8, "sine", 0.02);
    tone(c, dest, 392, "triangle", 0.01);
  },
  neon: (c, dest) => {
    tone(c, dest, 90, "sawtooth", 0.012);
    tone(c, dest, 180, "square", 0.008);
    tone(c, dest, 270, "sine", 0.02);
  },
};

export function playBgm(id: BgmId, volume = 0.35) {
  if (id === current && ctx) {
    if (master) master.gain.value = volume;
    return;
  }
  stopAll();
  current = id;
  if (id === "off") {
    void ctx?.suspend();
    return;
  }
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!master) {
    master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    master.connect(filter);
    filter.connect(ctx.destination);
  }
  master.gain.value = volume;
  RECIPES[id](ctx, master);
}

export function setBgmVolume(volume: number) {
  if (master) master.gain.value = volume;
}

export function currentBgm() {
  return current;
}

export function stopBgm() {
  playBgm("off");
}
