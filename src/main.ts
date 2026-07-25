import * as THREE from "./gl";
import { Rng } from "./util/random";
import { DayCycle } from "./world/daycycle";
import { Terrain } from "./world/terrain";
import { Water } from "./world/water";
import { Sky } from "./world/sky";
import { Weather } from "./world/weather";
import { Vegetation } from "./world/vegetation";
import { Stones } from "./world/stones";
import { Creatures } from "./world/creatures";
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
import { TitleScreen } from "./gfx/title";
import { initLegalOverlay, isLegalOpen } from "./legal/overlay";
import { BootScreen, yieldPaint } from "./ui/boot";
import { installMobileGuards } from "./ui/mobileGuards";
import { SettingsMenu } from "./ui/settings";
import { TouchControls } from "./ui/touchControls";

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
/** `?shot=1` — hide chrome & auto-start for marketing screenshots.
 *  `?shot=cover` — same framing hooks, but keep the title logo on screen. */
const shotMode = params.has("shot");
const coverShot = params.get("shot") === "cover";

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
  const rng = new Rng(seed);
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
  const fog = new THREE.Fog(0xffffff, 45, 330);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );

  boot.set(0.16, "Shaping the hills…", true);
  await yieldPaint();
  const terrain = new Terrain(rng);
  scene.add(terrain.mesh);

  boot.set(0.34, "Pouring the sea…");
  await yieldPaint();
  const water = new Water(scene, terrain);

  boot.set(0.42, "Hanging the clouds…");
  await yieldPaint();
  const sky = new Sky(scene, rng.fork());

  boot.set(0.5, "Planting the woods…", true);
  await yieldPaint();
  const vegetation = new Vegetation(scene, terrain, rng.fork());

  boot.set(0.72, "Setting the stones…");
  await yieldPaint();
  const stones = new Stones(scene, terrain, rng.fork());

  boot.set(0.8, "Calling the wildlife…");
  await yieldPaint();
  const audio = new AudioEngine();
  const creatures = new Creatures(scene, terrain, vegetation, rng.fork(), {
    frogHop: (pan, near) => audio.frogHop(pan, near),
  });
  const weather = new Weather(rng.fork(), params.get("weather"));

  boot.set(0.88, "Finding a path…");
  await yieldPaint();
  const spawn = findSpawn(terrain, rng);
  const gotoParam = params.get("goto");
  if (gotoParam) {
    applyGoto(
      spawn,
      gotoParam,
      {
        cairn: stones.cairnSite,
        peak: terrain.peakSite,
        marsh: vegetation.marshSpots[0] ?? null,
        pool: vegetation.poolSpots[0] ?? null,
        autumn: vegetation.autumnSpots[0] ?? null,
      },
      terrain,
    );
  }
  if (yawParam !== null) spawn.yaw += Number(yawParam);

  const controls = new Controls(
    camera,
    renderer.domElement,
    terrain,
    spawn.pos,
    spawn.yaw,
  );
  if (pitchParam !== null) controls.setPitch(Number(pitchParam));
  let touchMode = prefersTouchControls();
  const title = new TitleScreen();
  initLegalOverlay((on) => audio.setSilent(on));

  let touchUi: TouchControls | null = null;

  controls.onFirstInteract = () => {
    if (!shotMode) audio.start();
    title.dismiss();
    document.body.classList.add("playing");
    if (!shotMode) touchUi?.show();
  };

  function groundUnder(x: number, z: number): Ground {
    const h = terrain.heightAt(x, z);
    if (h < 0.12) return "water";
    if (h < 1.3) return "sand";
    if (h > terrain.snowline) return "snow";
    if (terrain.slopeAt(x, z) > 0.62) return "rock";
    return "grass";
  }

  controls.onFootstep = () => {
    audio.footstep(
      groundUnder(controls.position.x, controls.position.z),
      controls.moving,
    );
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
    },
    onOpenChange: (open) => {
      controls.setEnabled(!open);
      audio.setMuffled(open);
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
    installMobileGuards({
      canvas: renderer.domElement,
      isMenuOpen: () => settings.isOpen || isLegalOpen(),
    });
    touchUi = new TouchControls(controls, renderer.domElement, () => {
      settings.toggle();
    });
    touchUi.show();
  });

  controls.onLockChange = (locked) => {
    if (controls.touchMode || shotMode) return;
    document.body.classList.toggle("paused", !locked);
    if (locked || !controls.hasInteracted) return;
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
  const here = terrain.regionAt(spawn.pos.x, spawn.pos.z);
  const haze = new THREE.Color(1, 1, 1);
  const hazeGoal = new THREE.Color(1, 1, 1);
  hazeTint(haze, here, terrain.snowline);
  hazeGoal.copy(haze);

  // Prime one frame under the loader so the first reveal isn't empty.
  day.update(0);
  weather.update(0);
  weather.apply(day);
  terrain.material.color.copy(day.tint);
  stones.material.color.copy(day.tint);
  fog.color.copy(day.horizon);
  controls.update(0);
  sky.update(day, camera.position, 0, 0, weather);
  water.update(0, day, fog, camera.position);
  vegetation.update(0, day, fog);
  post.render(renderer, scene, camera, title.visible ? title.scene : null);

  await boot.finish();

  if (shotMode) {
    document.body.classList.add("shot");
    if (!coverShot) controls.beginPlay();
    (window as unknown as { __isle: object }).__isle = {
      day,
      weather,
      terrain,
      resize(w: number, h: number) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        post.setSize(w, h);
        title.setSize(w, h);
      },
      setLook(yaw: number, pitch = 0) {
        controls.setYaw(yaw);
        controls.setPitch(pitch);
      },
      goto(x: number, z: number, yaw?: number, pitch?: number) {
        controls.position.set(x, terrain.heightAt(x, z), z);
        if (yaw !== undefined) controls.setYaw(yaw);
        if (pitch !== undefined) controls.setPitch(pitch);
      },
      sites: {
        cairn: stones.cairnSite,
        peak: terrain.peakSite,
        marsh: vegetation.marshSpots[0] ?? null,
        pool: vegetation.poolSpots[0] ?? null,
        autumn: vegetation.autumnSpots[0] ?? null,
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

    terrain.material.color.copy(day.tint);
    stones.material.color.copy(day.tint);

    fog.color.copy(day.horizon);
    fog.near = 45;
    fog.far = 330 - weather.gloom * 110;

    shoreTimer -= dt;
    if (shoreTimer <= 0) {
      shoreTimer = 0.25;
      shore = probeShore(terrain, controls.position.x, controls.position.z);
      elevation = terrain.heightAt(controls.position.x, controls.position.z);
      hazeTint(
        hazeGoal,
        terrain.regionAt(
          controls.position.x,
          controls.position.z,
          here,
          elevation,
        ),
        terrain.snowline,
      );
    }
    haze.lerp(hazeGoal, 1 - Math.exp(-dt * 0.9));
    fog.color.multiply(haze);

    sky.update(day, camera.position, time, dt, weather);
    water.update(time, day, fog, camera.position);
    vegetation.update(time, day, fog);
    creatures.update(dt, time, day, controls.position, camera.rotation.y);

    audio.update(dt, {
      phase: day.t,
      daylight: day.daylight,
      treesNear: vegetation.treesNear(controls.position),
      cherriesNear: vegetation.cherriesNear(controls.position),
      flowersNear: vegetation.flowersNear(controls.position),
      shore,
      wading: THREE.MathUtils.clamp((0.12 - elevation) / 0.45, 0, 1),
      elevation,
      gloom: weather.gloom,
      windSpeed: weather.windSpeed,
      moving: controls.moving,
    });

    post.render(renderer, scene, camera, title.visible ? title.scene : null);
  });
}

void main();
