
import { makeSpace } from './dsp';
import { Drone } from './drone';
import { NightChorus, Rain, Surf, Wind, makeBedNoise } from './beds';
import { Melody, TONIC, keyAt, midiToHz, type KeyState } from './theory';
import { Send, bowed, place, struck } from './voices';
import { Ground, bird, caw, cricket, footstep, frog, wingbeat } from './wildlife';
import { capPeak } from './envelope';

const MASTER_LEVEL = 0.85;

const VOICE_PEAK = 0.155;

export interface WorldSound {
  phase: number;
  daylight: number;
  treesNear: number;
  cherriesNear: number;
  flowersNear: number;
  shore: number;
  wading: number;
  elevation: number;
  gloom: number;
  windSpeed: number;
  /** 0 dry … 1 steady rain. */
  rain: number;
  moving: number;
  /** 0 on foot, 1 in the air — opens the world out and brings the air up. */
  flight: number;
  /** Airspeed as a fraction of a hard dive, for the rush past the ears. */
  rush: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;

  private master!: GainNode;
  private tilt!: BiquadFilterNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private musicSend!: Send;
  private sfxSend!: Send;
  private bedDuck!: GainNode;
  private hallPre!: DelayNode;
  private hallTone!: BiquadFilterNode;
  private hallLevel!: GainNode;

  private drone!: Drone;
  private surf!: Surf;
  private wind!: Wind;
  private rain!: Rain;
  private chorus!: NightChorus;
  private stepNoise!: AudioBuffer;

  private melody = new Melody();
  private key: KeyState = keyAt(0.29);
  private keyTimer = 0;
  private chord: number[] = [];
  private restTimer = 6;
  private sparkleTimer = 14;
  private birdTimer = 4;
  private cricketTimer = 1.5;
  private chorusT = 0;
  private lastPhase = -1;
  private stillT = 0;
  private stepFoot = 1;

  private silent = false;
  private muffled = false;
  private muted = false;
  private masterLevel = 1;
  private musicLevel = 1;
  private sfxLevel = 1;


  private targetMaster(): number {
    if (this.silent || this.muted) return 0;
    return MASTER_LEVEL * this.masterLevel * (this.muffled ? 0.45 : 1);
  }

  private rampBuses(seconds = 0.08): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.targetMaster(), t, seconds);
    this.musicBus.gain.setTargetAtTime(this.musicLevel, t, seconds);
    this.sfxBus.gain.setTargetAtTime(this.sfxLevel, t, seconds);
  }

  setSilent(on: boolean): void {
    this.silent = on;
    this.rampBuses(0.15);
  }

  setMuffled(on: boolean): void {
    if (this.muffled === on) return;
    this.muffled = on;
    this.rampBuses(0.25);
    if (this.ctx) {
      this.tilt.frequency.setTargetAtTime(on ? 700 : 19000, this.ctx.currentTime, 0.3);
    }
  }

  setMaster(v: number): void {
    this.masterLevel = clamp01(v);
    this.rampBuses();
  }

  setMusic(v: number): void {
    this.musicLevel = clamp01(v);
    this.rampBuses();
  }

  setSfx(v: number): void {
    this.sfxLevel = clamp01(v);
    this.rampBuses();
  }

  setMuted(on: boolean): void {
    this.muted = on;
    this.rampBuses();
  }


  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.09;
    limiter.connect(ctx.destination);

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -26;
    glue.knee.value = 14;
    glue.ratio.value = 2.2;
    glue.attack.value = 0.025;
    glue.release.value = 0.32;
    glue.connect(limiter);

    this.tilt = ctx.createBiquadFilter();
    this.tilt.type = 'lowpass';
    this.tilt.frequency.value = 19000;
    this.tilt.Q.value = 0.4;
    this.tilt.connect(glue);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.tilt);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicLevel;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxLevel;
    this.sfxBus.connect(this.master);

    const musicDry = ctx.createGain();
    musicDry.connect(this.musicBus);

    const hallIn = ctx.createGain();
    this.hallPre = ctx.createDelay(0.12);
    this.hallPre.delayTime.value = 0.024;
    const hall = ctx.createConvolver();
    hall.buffer = makeSpace(ctx, {
      seconds: 4.6,
      decay: 2.1,
      predelayMs: 18,
      openHz: 7000,
      closeHz: 620,
      earlies: 12,
      width: 1,
    });
    this.hallTone = ctx.createBiquadFilter();
    this.hallTone.type = 'lowpass';
    this.hallTone.frequency.value = 6000;
    this.hallTone.Q.value = 0.4;
    this.hallLevel = ctx.createGain();
    this.hallLevel.gain.value = 0.4;
    hallIn.connect(this.hallPre);
    this.hallPre.connect(hall);
    hall.connect(this.hallTone);
    this.hallTone.connect(this.hallLevel);
    this.hallLevel.connect(this.musicBus);

    const sfxDry = ctx.createGain();
    sfxDry.connect(this.sfxBus);
    const roomIn = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = makeSpace(ctx, {
      seconds: 1.5,
      decay: 3.4,
      predelayMs: 7,
      openHz: 9000,
      closeHz: 1300,
      earlies: 9,
      width: 0.8,
    });
    const roomLevel = ctx.createGain();
    roomLevel.gain.value = 0.3;
    roomIn.connect(room);
    room.connect(roomLevel);
    roomLevel.connect(this.sfxBus);

    this.musicSend = { dry: musicDry, wet: hallIn };
    this.sfxSend = { dry: sfxDry, wet: roomIn };

    this.bedDuck = ctx.createGain();
    this.bedDuck.gain.value = 1;
    this.bedDuck.connect(this.musicBus);

    const noise = makeBedNoise(ctx);
    this.surf = new Surf(ctx, this.bedDuck, noise.brown, noise.pink);
    this.wind = new Wind(ctx, this.bedDuck, noise.pink);
    this.rain = new Rain(ctx, this.bedDuck, noise.pink);
    this.chorus = new NightChorus(ctx, this.bedDuck, noise.pink);
    this.stepNoise = noise.pink;

    this.drone = new Drone(ctx, musicDry, hallIn);
    this.chord = this.key.colour.voicing.map((v) => TONIC + v);
    this.drone.setChord(this.chord, true);
    this.drone.setLevel(0.07, 4);
    // Bring the master up quickly so the click-to-start gesture is rewarded
    // with audible sound; the beds/drone stay soft, but not silent for seconds.
    this.master.gain.setTargetAtTime(this.targetMaster(), ctx.currentTime, 0.35);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Re-unlock after the browser suspends the context (tab blur, autoplay, etc.). */
  resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  update(dt: number, w: WorldSound): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      void ctx.resume();
      return;
    }
    const t = ctx.currentTime;

    const canopy = Math.min(1, w.treesNear / 15) * (1 - w.flight);
    const height = Math.min(1, Math.max(0, w.elevation) / 22);
    // Nothing is near you in the air: the canopy drops away, the reverb opens
    // to its widest, and what is left is the sound of moving through air.
    const openness = clamp01(
      (1 - canopy) * 0.7 + height * 0.3 + w.shore * 0.2 + w.flight * 0.5,
    );
    const night = 1 - w.daylight;

    this.stillT = w.moving < 0.12 ? this.stillT + dt : 0;
    const stillness = Math.min(1, this.stillT / 14);

    this.keyTimer -= dt;
    if (this.keyTimer <= 0) {
      this.keyTimer = 1.5;
      this.key = keyAt(w.phase);
      const want = this.key.colour.voicing.map((v) => TONIC + v);
      if (want.some((n, i) => n !== this.chord[i])) {
        this.chord = want;
        this.drone.setChord(want);
      }
      this.drone.setBright(
        clamp01(this.key.bright * 0.6 + openness * 0.25 + height * 0.2 - w.gloom * 0.5),
      );
      // Rain takes the front seat — the meditation hum steps back so the patter reads.
      this.drone.setLevel(
        (0.042 + stillness * 0.014 + this.key.bright * 0.012) * (1 - w.rain * 0.72),
        8,
      );
    }

    this.hallPre.delayTime.setTargetAtTime(0.014 + openness * 0.052, t, 2);
    this.hallLevel.gain.setTargetAtTime(0.26 + openness * 0.3 + stillness * 0.08, t, 2.5);
    this.hallTone.frequency.setTargetAtTime(
      3200 + openness * 6500 - w.gloom * 2200,
      t,
      2.5,
    );
    this.tilt.frequency.setTargetAtTime(
      this.muffled ? 700 : 19000 * (1 - w.gloom * 0.5) * (1 - w.wading * 0.55),
      t,
      1.5,
    );

    this.surf.update(w.shore * (1 - w.flight * 0.75), w.wading);
    // Flying is its own wind. A dive doubles what the weather is doing.
    this.wind.update(
      dt,
      clamp01(openness * 0.7 + height * 0.5 + w.flight * 0.4),
      canopy,
      w.windSpeed + w.rush * w.flight * 7,
    );
    this.rain.update(dt, w.rain, canopy, openness);
    this.chorus.update(night * night, 1 - w.gloom);

    if (this.lastPhase >= 0) {
      if (crossed(this.lastPhase, w.phase, 0.262)) {
        this.figure(true);
        this.chorusT = 55;
      } else if (crossed(this.lastPhase, w.phase, 0.748)) {
        this.figure(false);
      }
    }
    this.lastPhase = w.phase;
    if (this.chorusT > 0) this.chorusT -= dt;

    const presence = clamp01(
      Math.min(1, w.treesNear / 13) * 0.62 +
        Math.min(1, w.flowersNear / 7) * 0.24 +
        Math.min(1, w.cherriesNear / 3) * 0.34,
    );

    this.melody.wander(dt, 0.34 + height * 0.32 + w.daylight * 0.12);

    this.restTimer -= dt;
    if (this.restTimer <= 0) {
      const energy = clamp01(0.22 + presence * 0.5 + w.daylight * 0.25 - w.gloom * 0.3);
      const phrase = this.melody.next(this.key, energy);
      this.speak(phrase.notes, {
        openness,
        height,
        cherry: Math.min(1, w.cherriesNear / 3),
        gloom: w.gloom,
      });

      const gap = (9 + (1 - presence) * 17) * (1 - stillness * 0.28);
      const breath = Math.random() < 0.22 ? 12 + Math.random() * 18 : 0;
      this.restTimer = phrase.seconds * 0.55 + gap * (0.7 + Math.random() * 0.6) + breath;

      this.bedDuck.gain.cancelScheduledValues(t);
      this.bedDuck.gain.setTargetAtTime(0.78, t, 0.4);
      this.bedDuck.gain.setTargetAtTime(1, t + phrase.seconds * 0.6, 1.8);

      if (Math.random() < 0.3 + presence * 0.2) {
        bowed(this.ctx!, this.musicSend, {
          freq: midiToHz(TONIC + (Math.random() < 0.6 ? 0 : 7)),
          peak: capPeak(0.07 + presence * 0.02),
          when: t + phrase.seconds * 0.62,
          attack: 2.4,
          hold: 1.6,
          release: 7.5,
          pan: (Math.random() - 0.5) * 0.5,
          wet: 0.85,
          edge: 0.12,
        });
      }
    }

    if (w.flowersNear > 2) {
      this.sparkleTimer -= dt * Math.min(1.5, w.flowersNear * 0.05);
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = 7 + Math.random() * 11;
        const top = this.key.ladder[this.key.ladder.length - 1 - Math.floor(Math.random() * 4)];
        struck(ctx, this.musicSend, {
          freq: midiToHz(top),
          peak: capPeak(0.052),
          when: t + 0.05,
          ring: 2.4 + Math.random(),
          pan: (Math.random() - 0.5) * 1.3,
          bright: 0.92,
          wet: 0.8,
          mallet: 0.3,
        });
      }
    }

    if (w.daylight > 0.35) {
      const chorusing = this.chorusT > 0 ? 3.2 : 1;
      this.birdTimer -=
        dt * chorusing * (0.6 + w.daylight * 0.6 + canopy * 0.5) * (1 - w.rain * 0.85);
      if (this.birdTimer <= 0) {
        this.birdTimer = 2.5 + Math.random() * 7 + w.rain * 8;
        const near = Math.pow(Math.random(), 1.8);
        const r = Math.random();
        bird(
          ctx,
          this.sfxSend,
          r < 0.45 ? 'warble' : r < 0.75 ? 'call' : 'trill',
          {
            when: t + 0.05,
            peak: capPeak(0.075),
            pan: (Math.random() - 0.5) * 1.7,
            near,
          },
        );
      }
    }

    if (w.daylight < 0.3) {
      this.cricketTimer -= dt * (1 - w.daylight) * (1.4 - w.gloom) * (1 - w.rain * 0.9);
      if (this.cricketTimer <= 0) {
        this.cricketTimer = 0.7 + Math.random() * 1.4 + w.rain * 4;
        cricket(ctx, this.sfxSend, {
          when: t + 0.02,
          peak: capPeak(0.018),
          pan: (Math.random() - 0.5) * 1.6,
          near: Math.pow(Math.random(), 1.5),
        });
      }
    }
  }


  footstep(ground: Ground, effort = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.stepFoot = -this.stepFoot;
    footstep(ctx, this.sfxSend, ground, {
      when: ctx.currentTime,
      peak: capPeak(0.075 * (0.72 + effort * 0.28)),
      pan: this.stepFoot * 0.16,
      noise: this.stepNoise,
    });
  }

  frogHop(pan: number, near: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    frog(ctx, this.sfxSend, {
      when: ctx.currentTime,
      peak: capPeak(0.085),
      pan,
      near,
    });
  }

  /** `effort` 0 gliding, 1 hauling for height. */
  wingbeat(effort = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.stepFoot = -this.stepFoot;
    wingbeat(ctx, this.sfxSend, {
      when: ctx.currentTime,
      peak: capPeak(0.088),
      // Alternating a little left and right of centre reads as two wings.
      pan: this.stepFoot * 0.1,
      noise: this.stepNoise,
      effort,
    });
  }

  /** The call that marks becoming, or ceasing to be, a raven. */
  caw(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    caw(ctx, this.sfxSend, {
      when: ctx.currentTime + 0.02,
      peak: capPeak(0.07),
      pan: -0.08,
    });
  }

  /** Water struck at speed and left behind — a raven refusing to land on it. */
  skim(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    footstep(ctx, this.sfxSend, 'water', {
      when: ctx.currentTime,
      peak: capPeak(0.1),
      noise: this.stepNoise,
    });
  }

  private speak(
    notes: { midi: number; at: number; vel: number; ring: number }[],
    ctxInfo: { openness: number; height: number; cherry: number; gloom: number },
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.08;
    const home = (Math.random() - 0.5) * 0.9;
    const bright = clamp01(
      0.2 + this.key.bright * 0.42 + ctxInfo.cherry * 0.28 + ctxInfo.height * 0.18 - ctxInfo.gloom * 0.35,
    );

    for (const n of notes) {
      struck(ctx, this.musicSend, {
        freq: midiToHz(n.midi),
        peak: capPeak(VOICE_PEAK * n.vel),
        when: t + n.at,
        ring: n.ring * (0.85 + ctxInfo.openness * 0.35),
        pan: home + (Math.random() - 0.5) * 0.3,
        bright,
        wet: 0.42 + ctxInfo.openness * 0.4,
        mallet: 0.45 + ctxInfo.cherry * 0.3,
      });

      if (ctxInfo.height > 0.5 && Math.random() < 0.55) {
        struck(ctx, this.musicSend, {
          freq: midiToHz(n.midi + 12),
          peak: capPeak(VOICE_PEAK * n.vel * 0.22),
          when: t + n.at + 0.02,
          ring: n.ring * 0.7,
          pan: -home,
          bright: 0.95,
          wet: 0.95,
          mallet: 0.15,
        });
      }
    }
  }

  private figure(rising: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.4;
    const key = this.key;
    const n = key.ladder.length;

    bowed(ctx, this.musicSend, {
      freq: midiToHz(TONIC + (rising ? 0 : 7)),
      peak: capPeak(0.055),
      when: t,
      attack: rising ? 3.5 : 2,
      hold: 4,
      release: rising ? 8 : 11,
      wet: 0.9,
      edge: 0.15,
    });

    let idx = rising ? Math.floor(n * 0.3) : Math.floor(n * 0.8);
    for (let i = 0; i < 5; i++) {
      struck(ctx, this.musicSend, {
        freq: midiToHz(key.ladder[Math.max(0, Math.min(n - 1, idx))]),
        peak: capPeak(0.14 - i * 0.012),
        when: t + 1.1 + i * (rising ? 0.62 : 0.78),
        ring: 5 + i * 0.8,
        pan: (rising ? -0.4 : 0.4) + i * (rising ? 0.2 : -0.2),
        bright: rising ? 0.78 : 0.34,
        wet: 0.8,
        mallet: 0.4,
      });
      idx += rising ? 2 : -2;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function crossed(prev: number, now: number, mark: number): boolean {
  if (now >= prev) return prev < mark && now >= mark;
  return prev < mark || now >= mark;
}
