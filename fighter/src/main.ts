import * as THREE from 'three';
import './style.css';
import { FIXED_DT, PLAYER } from './config';
import { audio } from './core/Audio';
import { events } from './core/Events';
import { Input } from './core/Input';
import { Physics } from './core/Physics';
import { Actor } from './actors/Actor';
import { BotManager } from './ai/BotManager';
import { BuildingSystem } from './building/BuildingSystem';
import { EditSystem } from './building/EditSystem';
import { Effects } from './fx/Effects';
import { RoundManager } from './game/RoundManager';
import { Tournament } from './game/Tournament';
import { PlayerController } from './player/PlayerController';
import { StormManager } from './storm/StormManager';
import { HUD } from './ui/HUD';
import { CombatSystem } from './weapons/CombatSystem';
import { GameWorld } from './world/World';

const CONTROLS = `
  <div class="controls">
    <div><kbd>WASD</kbd> move</div><div><kbd>Shift</kbd> sprint</div>
    <div><kbd>Space</kbd> jump</div><div><kbd>Ctrl</kbd> crouch</div>
    <div><kbd>LMB</kbd> fire / place (hold = turbo)</div><div><kbd>RMB</kbd> aim · build: material · edit: reset</div>
    <div><kbd>1-4</kbd> pickaxe · AR · shotgun · slurp</div><div><kbd>R</kbd> reload · build: rotate ramp</div>
    <div><kbd>Z X C V</kbd> wall · floor · ramp · cone</div><div><kbd>Q</kbd> toggle build mode</div>
    <div><kbd>G</kbd> edit / confirm edit</div><div><kbd>Tab</kbd> standings · <kbd>F</kbd> fast-forward (spectating)</div>
  </div>`;

async function main(): Promise<void> {
  const physics = await Physics.create();

  // ------------------------------------------------------------ renderer + scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3ff, 120, 520);
  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 1500);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a6b35, 0.9);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top = 60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const sunOffset = new THREE.Vector3(60, 110, 40);
  scene.add(ambient, hemi, sun, sun.target);

  // ------------------------------------------------------------ systems
  const fx = new Effects(scene);
  const world = new GameWorld(scene, physics);
  const building = new BuildingSystem(scene, physics, fx);
  const edit = new EditSystem(physics);
  const combat = new CombatSystem(physics, building, world, fx);
  const storm = new StormManager(scene);
  const input = new Input(renderer.domElement);

  const playerActor = new Actor('You', physics, scene, { isPlayer: true, color: 0x2f80ed, accent: 0xff8a00 });
  playerActor.despawn();
  const player = new PlayerController(playerActor, camera, input, physics, building, edit, combat);

  let allActors: Actor[] = [playerActor];
  const bots = new BotManager(scene, physics, {
    physics, building, combat, storm, actors: () => allActors,
  });
  allActors = [playerActor, ...bots.actors];

  const tournament = new Tournament();
  const hud = new HUD(document.getElementById('hud')!, {
    player, building, edit, combat, storm, tournament, camera, actors: () => allActors,
  });
  const round = new RoundManager({
    player, bots, building, storm, world, fx, hud, tournament,
    requestLock: () => input.requestLock(),
  });

  events.on('eliminated', ({ victim }) => fx.burst(victim.position, 0x8fd3ff));
  storm.reset(); // so the title screen shows a real circle

  // ------------------------------------------------------------ menus / pointer lock
  const start = () => {
    audio.unlock();
    input.requestLock();
    round.startSession();
  };
  hud.showMenu(
    'ZONE WARS',
    `<p class="tag">Endgame build-fight prototype · ${allActors.length} players · moving storm · tournament scoring</p>${CONTROLS}`,
    [{ label: 'Play', primary: true, onClick: start }],
  );

  input.onLockChange = (locked) => {
    if (locked) {
      if (round.state !== 'menu' && !hud.menuOpen) return;
      if (round.state === 'live' || round.state === 'countdown') hud.hideMenu();
      return;
    }
    // Lost the lock mid-round: pause.
    if (round.state === 'live' || round.state === 'countdown') {
      hud.showMenu('Paused', CONTROLS, [{ label: 'Resume', primary: true, onClick: () => input.requestLock() }]);
    }
  };
  renderer.domElement.addEventListener('click', () => {
    if (!input.locked && (round.state === 'live' || round.state === 'countdown')) input.requestLock();
  });
  window.addEventListener('beforeunload', (e) => {
    // Ctrl+W while crouch-walking would otherwise close the tab mid-round.
    if (round.state === 'live') e.preventDefault();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ------------------------------------------------------------ tick loop
  let accumulator = 0;
  let last = performance.now();
  const paused = () => !input.locked && (round.state === 'live' || round.state === 'countdown');

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const running = round.simulating && !paused();
    const dt = running ? realDt * round.timeScale : 0;

    if (input.locked) {
      player.handleFrameInput();
      if (input.wasPressed('KeyF')) round.toggleFastForward();
    }
    hud.setScoreboard(input.isDown('Tab') && round.state !== 'menu');

    // Fixed-step simulation: movement, AI and physics.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 12) {
      accumulator -= FIXED_DT;
      steps++;
      player.fixedUpdate(FIXED_DT);
      if (round.state === 'live') bots.fixedUpdate(FIXED_DT);
      physics.step();
    }
    if (steps === 12) accumulator = 0;

    if (running) {
      if (round.state === 'live') storm.update(dt, allActors);
      combat.update(dt, allActors);
      building.update(dt);
      world.update(dt);
    }
    round.update(running ? realDt : 0);

    // Avatars follow their actors.
    for (const a of allActors) {
      if (!a.alive) continue;
      a.avatar.root.position.copy(a.position);
      a.avatar.update(realDt * (running ? 1 : 0), {
        yaw: a.yaw, pitch: a.pitch, speed: a.horizontalSpeed, grounded: a.grounded,
        crouch: a.crouching, drinking: a.loadout.drinking,
      });
    }

    if (round.state === 'menu') {
      // Attract mode: slow orbit over the arena behind the title menu.
      const t = now / 1000;
      camera.position.set(storm.center.x + Math.cos(t * 0.05) * 70, 28, storm.center.y + Math.sin(t * 0.05) * 70);
      camera.lookAt(storm.center.x, 4, storm.center.y);
    } else {
      player.updateCamera(realDt);
    }
    if (running) player.handleActions(dt);
    fx.update(running ? dt : 0);

    // Keep the shadow frustum centred on whatever the camera is looking at.
    const focus = playerActor.alive ? playerActor.position : player.spectate?.position ?? playerActor.position;
    sun.target.position.copy(focus);
    sun.position.copy(focus).add(sunOffset);

    // Purple storm tint when the camera is outside the safe zone.
    const inStorm = round.state !== 'menu' && !storm.isInside(camera.position);
    (scene.fog as THREE.Fog).color.setHex(inStorm ? 0x6a3fa0 : 0xbfe3ff);
    (scene.fog as THREE.Fog).far = inStorm ? 140 : 520;
    (scene.fog as THREE.Fog).near = inStorm ? 10 : 120;
    audio.setListener(camera.position);

    hud.update(realDt);
    renderer.render(scene, camera);
    input.endFrame();
  };
  requestAnimationFrame(frame);

  // Debug handle for the console.
  (window as unknown as Record<string, unknown>).zw = {
    round, player, bots, building, edit, combat, storm, physics, input, hud, tournament, camera, world, PLAYER,
  };
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#fff;padding:24px">Failed to start: ${String(err)}</pre>`;
});
