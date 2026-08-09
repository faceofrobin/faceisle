import * as THREE from "./gl";
import { Rng } from "./util/random";
import { DayCycle } from "./world/daycycle";
import { Archipelago } from "./world/archipelago";
import { Water } from "./world/water";
import { Sky } from "./world/sky";
import { Weather } from "./world/weather";
import { Rain } from "./world/rain";
import { findSpawn, applyGoto } from "./world/spawn";
import { hazeTint } from "./world/palette";
import { probeShore } from "./world/shore";
import { Controls } from "./player/controls";
import {
  prefersTouchControls,
  whenTouchControlsNeeded,
} from "./player/touchPref";
import { AudioEngine } from "./audio/engine";
import type { Ground } from "./audio/wildlife";
import { PixelatePass } from "./gfx/post";
import { RavenView } from "./gfx/raven";
import { TitleScreen } from "./gfx/title";
import { initLegalOverlay, isLegalOpen } from "./legal/overlay";
import { BootScreen, yieldPaint } from "./ui/boot";
import { ControlsHint } from "./ui/controlsHint";
import { installMobileGuards } from "./ui/mobileGuards";
import { SettingsMenu } from "./ui/settings";
import { TouchControls } from "./ui/touchControls";

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
/** `?shot=1` — hide chrome & auto-start for marketing screenshots.
 *  `?shot=cover` — same framing hooks, but keep the title logo on screen. */
const shotMode = params.has("shot");
const coverShot = params.get("shot") === "cover";

/** Fog on foot, and the distance it opens to once you are up and flying. */
const FOG_NEAR = 45;
const FOG_FAR = 330;
const FOG_NEAR_AIR = 190;
const FOG_FAR_AIR = 1480;
/** The height at which the haze has fully drawn back. */
const OPEN_AT = 210;

const FOV_GROUND = 72;
const FOV_DIVE = 88;

/** Milliseconds a frame may spend building the next island. */
const STREAM_BUDGET = 4.5;

function parseSeed(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim();
  if (!s) return null;
  const dec = Number(s);
  if (Number.isFinite(dec)) return dec >>> 0;
  const hex = parseInt(s, 16);
  return Number.isFinite(hex) ? hex >>> 0 : null;
}

async function main(): Promise<void> {
  const boot = new BootScreen();
  await yieldPaint();

  const seed =
    parseSeed(params.get("seed")) ?? (Math.random() * 4294967296) >>> 0;
  const tParam = params.get("t");
  const yawParam = params.get("yaw");
  const pitchParam = params.get("pitch");
  const day = new DayCycle(tParam !== null ? Number(tParam) : 0.29);

  boot.set(0.06, "Opening the sky…");
  await yieldPaint();

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0xffffff, FOG_NEAR, FOG_FAR);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    FOV_GROUND,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );

  const audio = new AudioEngine();
  const creatureSounds = {
    frogHop: (pan: number, near: number) => audio.frogHop(pan, near),
  };

  boot.set(0.16, "Shaping the hills…", true);
  await yieldPaint();
  const world = new Archipelago(scene, renderer, seed, creatureSounds);
  const home = world.boot;
  const terrain = home.terrain;

  boot.set(0.34, "Pouring the sea…");
  await yieldPaint();
  const water = new Water(scene, world, 0, 0);

  boot.set(0.42, "Hanging the clouds…");
  await yieldPaint();
  const sky = new Sky(scene, home.skyRng);
  const weather = new Weather(home.weatherRng, params.get("weather"));
  const rain = new Rain(scene, (x, z) => world.heightAt(x, z));


  // The home island is built outright behind the loading bar, the way it
  // always was. Every island after this one streams in while you are flying.
  // The build yields hundreds of times; letting the page paint on a stopwatch
  // rather than on every nth step keeps the bar moving without spending most
  // of the boot waiting on frames.
  boot.set(0.5, "Planting the woods…", true);
  await yieldPaint();
  const grow = home.grow("full", creatureSounds, renderer);
  const started = performance.now();
  let until = started + 90;
  while (!grow.next().done) {
    if (performance.now() < until) continue;
    boot.set(
      0.5 + Math.min(0.36, (performance.now() - started) / 1900),
      "Planting the woods…",
      true,
    );
    await yieldPaint();
    until = performance.now() + 90;
  }

  boot.set(0.88, "Finding a path…");
  await yieldPaint();
  const spawn = findSpawn(terrain, home.spawnRng);
  const gotoParam = params.get("goto");
  if (gotoParam) {
    applyGoto(
      spawn,
      gotoParam,
      {
        cairn: home.stones?.cairnSite ?? null,
        peak: terrain.peakSite,
        marsh: home.vegetation?.marshSpots[0] ?? null,
        pool: home.vegetation?.poolSpots[0] ?? null,
        autumn: home.vegetation?.autumnSpots[0] ?? null,
      },
      terrain,
    );
  }
  if (yawParam !== null) spawn.yaw += Number(yawParam);

  const controls = new Controls(
    camera,
    renderer.domElement,
    world,
    spawn.pos,
    spawn.yaw,
  );
  if (pitchParam !== null) controls.setPitch(Number(pitchParam));
  let touchMode = prefersTouchControls();
  const title = new TitleScreen();
  const raven = new RavenView();
  initLegalOverlay((on) => audio.setSilent(on));

  let touchUi: TouchControls | null = null;
  const controlsHint = shotMode ? null : new ControlsHint(touchMode);

  controls.onFirstInteract = () => {
    if (!shotMode) audio.start();
    title.dismiss();
    document.body.classList.add("playing");
    if (!shotMode) {
      touchUi?.show();
      controlsHint?.show();
    }
  };
  controls.onGesture = () => {
    if (!shotMode) audio.resume();
  };

  function groundUnder(x: number, z: number): Ground {
    const island = world.nearest(x, z);
    const h = world.heightAt(x, z);
    if (h < 0.12) return "water";
    if (h < 1.3) return "sand";
    if (h > island.terrain.snowline) return "snow";
    if (island.terrain.slopeAt(x, z) > 0.62) return "rock";
    return "grass";
  }

  controls.onFootstep = () => {
    audio.footstep(
      groundUnder(controls.position.x, controls.position.z),
      controls.moving,
    );
  };
  controls.onWingbeat = () => {
    // Hauling for height costs more air than a correction in a glide.
    audio.wingbeat(THREE.MathUtils.clamp(1 - controls.flight.airspeed / 40, 0.2, 1));
  };
  controls.onSkim = () => audio.skim();
  controls.onTakeOff = () => audio.caw();
  controls.onLand = () => {
    audio.footstep(groundUnder(controls.position.x, controls.position.z), 1);
  };

  boot.set(0.94, "Almost there…");
  await yieldPaint();

  const settings = new SettingsMenu(document.getElementById("settings")!, {
    seed,
    touchMode,
    onApply: (v) => {
      audio.setMaster(v.master);
      audio.setMusic(v.music);
      audio.setSfx(v.sfx);
      audio.setMuted(v.muted);
      controls.setLookSensitivity(v.lookSensitivity);
      controls.setInvertY(v.invertY);
      day.setDayLength(v.dayLength);
    },
    onOpenChange: (open) => {
      controls.setEnabled(!open);
      audio.setMuffled(open);
      if (open) controlsHint?.dismiss();
      if (!open && controls.hasInteracted && !controls.touchMode) {
        queueMicrotask(() => {
          if (!settings.isOpen && !isLegalOpen()) controls.requestLock();
        });
      }
    },
  });

  whenTouchControlsNeeded(() => {
    if (touchUi) return;
    touchMode = true;
    document.body.classList.add("touch-mode");
    const prompt = document.getElementById("prompt");
    if (prompt) prompt.textContent = "Tap to start";
    settings.setTouchMode(true);
    controlsHint?.setTouchMode(true);
    installMobileGuards({
      canvas: renderer.domElement,
      isMenuOpen: () => settings.isOpen || isLegalOpen(),
    });
    touchUi = new TouchControls(controls, renderer.domElement, () => {
      settings.toggle();
    });
    touchUi.show();
  });

  // Only treat pointer-lock *exit* as pause. A failed first lock (common in
  // iframes / browsers that deny lock) used to open Settings immediately and
  // muffle the audio, which felt like "no sound after click".
  let hadPointerLock = false;
  controls.onLockChange = (locked) => {
    if (controls.touchMode || shotMode) return;
    if (locked) {
      hadPointerLock = true;
      document.body.classList.remove("paused");
      return;
    }
    document.body.classList.toggle("paused", hadPointerLock);
    if (!hadPointerLock || !controls.hasInteracted) return;
    if (!isLegalOpen() && !settings.isOpen) settings.show();
  };

  document.getElementById("btn-settings")?.addEventListener("click", () => {
    settings.show();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" || isLegalOpen()) return;
    e.preventDefault();
    settings.toggle();
  });

  const post = new PixelatePass(window.innerWidth, window.innerHeight);

  function fitViewport(): void {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv?.width ?? window.innerWidth));
    const h = Math.max(1, Math.round(vv?.height ?? window.innerHeight));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
    title.setSize(w, h);
    raven.setSize(w, h);
  }
  window.addEventListener("resize", fitViewport);
  window.addEventListener("orientationchange", () => {
    setTimeout(fitViewport, 120);
  });
  window.visualViewport?.addEventListener("resize", () => {
    setTimeout(fitViewport, 50);
  });

  const clock = new THREE.Clock();
  let time = 0;

  let shore = 0;
  let shoreTimer = 0;
  let elevation = 0;
  let openness = 0;
  let fov = FOV_GROUND;
  const here = terrain.regionAt(spawn.pos.x, spawn.pos.z);
  const haze = new THREE.Color(1, 1, 1);
  const hazeGoal = new THREE.Color(1, 1, 1);
  hazeTint(haze, here, terrain.snowline);
  hazeGoal.copy(haze);

  // Prime one frame under the loader so the first reveal isn't empty.
  day.update(0);
  weather.update(0);
  weather.apply(day);
  fog.color.copy(day.horizon);
  controls.update(0);
  world.update(controls.position.x, controls.position.z);
  world.updateVisuals(0, 0, day, fog, controls.position, 0);
  sky.update(day, camera.position, 0, 0, weather);
  water.update(0, day, fog, camera.position, weather.rain);
  rain.update(0, camera.position, day, weather);
  post.render(renderer, scene, camera, title.visible ? title.scene : null);

  await boot.finish();

  if (shotMode) {
    document.body.classList.add("shot");
    if (!coverShot) controls.beginPlay();
    (window as unknown as { __isle: object }).__isle = {
      day,
      weather,
      terrain,
      world,
      resize(w: number, h: number) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        post.setSize(w, h);
        title.setSize(w, h);
        raven.setSize(w, h);
      },
      setLook(yaw: number, pitch = 0) {
        controls.setYaw(yaw);
        controls.setPitch(pitch);
      },
      goto(x: number, z: number, yaw?: number, pitch?: number) {
        controls.position.set(x, world.heightAt(x, z), z);
        if (yaw !== undefined) controls.setYaw(yaw);
        if (pitch !== undefined) controls.setPitch(pitch);
      },
      /** Hold the wings on or off, for framing shots from the air. */
      fly(on: boolean) {
        controls.setFlap(on);
      },
      /** Put the raven at an absolute height, for aerial framing. */
      aloft(x: number, y: number, z: number, yaw?: number, pitch?: number) {
        controls.setFlap(true);
        controls.position.set(x, y, z);
        if (yaw !== undefined) controls.setYaw(yaw);
        if (pitch !== undefined) controls.setPitch(pitch);
      },
      state() {
        return {
          flying: controls.flying,
          morph: controls.morph,
          altitude: controls.altitude,
          y: controls.position.y,
          x: controls.position.x,
          z: controls.position.z,
          airspeed: controls.flight.airspeed,
          islands: world.islands.size,
          building: world.building,
          fogFar: fog.far,
        };
      },
      sites: {
        cairn: home.stones?.cairnSite ?? null,
        peak: terrain.peakSite,
        marsh: home.vegetation?.marshSpots[0] ?? null,
        pool: home.vegetation?.poolSpots[0] ?? null,
        autumn: home.vegetation?.autumnSpots[0] ?? null,
      },
    };
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    day.update(dt);
    controls.update(dt);
    title.update(dt);
    weather.update(dt);
    weather.apply(day);

    const pos = controls.position;
    world.update(pos.x, pos.z);
    world.pump(STREAM_BUDGET);

    // Height is what opens the world: the haze draws back as you climb, which
    // is the moment the other islands exist. On the ground nothing changes.
    const lift = THREE.MathUtils.clamp(controls.altitude / OPEN_AT, 0, 1);
    const want = controls.morph * (0.25 + lift * 0.75);
    openness += (want - openness) * (1 - Math.exp(-dt * 0.8));

    fog.color.copy(day.horizon);
    fog.near = THREE.MathUtils.lerp(FOG_NEAR, FOG_NEAR_AIR, openness);
    fog.far =
      THREE.MathUtils.lerp(FOG_FAR, FOG_FAR_AIR, openness) -
      weather.gloom * 110 * (1 - openness * 0.7);

    const wantFov = THREE.MathUtils.lerp(
      FOV_GROUND,
      FOV_DIVE,
      controls.morph * THREE.MathUtils.clamp((controls.flight.airspeed - 20) / 26, 0, 1),
    );
    if (Math.abs(wantFov - fov) > 0.01) {
      fov += (wantFov - fov) * (1 - Math.exp(-dt * 3));
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    shoreTimer -= dt;
    if (shoreTimer <= 0) {
      shoreTimer = 0.25;
      const island = world.nearest(pos.x, pos.z);
      shore = probeShore(island.terrain, pos.x, pos.z);
      elevation = world.heightAt(pos.x, pos.z);
      hazeTint(
        hazeGoal,
        island.terrain.regionAt(pos.x, pos.z, here, elevation),
        island.terrain.snowline,
      );
    }
    haze.lerp(hazeGoal, 1 - Math.exp(-dt * 0.9));
    fog.color.multiply(haze);

    sky.update(day, camera.position, time, dt, weather);
    water.update(time, day, fog, camera.position, weather.rain);
    rain.update(dt, camera.position, day, weather);
    world.updateVisuals(dt, time, day, fog, pos, camera.rotation.y);
    raven.update(controls.morph, controls.flight.beatPhase, controls.flight.roll, day.tint);

    const island = world.nearest(pos.x, pos.z);
    const veg = island.vegetation;
    audio.update(dt, {
      phase: day.t,
      daylight: day.daylight,
      treesNear: veg ? veg.treesNear(pos) : 0,
      cherriesNear: veg ? veg.cherriesNear(pos) : 0,
      flowersNear: veg ? veg.flowersNear(pos) : 0,
      shore,
      wading: THREE.MathUtils.clamp((0.12 - elevation) / 0.45, 0, 1),
      elevation: controls.flying ? Math.max(elevation, controls.altitude * 0.3) : elevation,
      gloom: weather.gloom,
      windSpeed: weather.windSpeed,
      rain: weather.rain,
      moving: controls.moving,
      flight: controls.morph,
      rush: THREE.MathUtils.clamp((controls.flight.airspeed - 18) / 30, 0, 1),
    });

    post.render(
      renderer,
      scene,
      camera,
      raven.scene.visible ? raven.scene : null,
      title.visible ? title.scene : null,
    );
  });
}

void main();
