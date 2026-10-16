import * as THREE from 'three';
import {
  MAP_HALF, MATERIALS, MATERIAL_ORDER, PIECE_KEYS, PIECE_ORDER, PLAYER, SLURP, WEAPONS, type PieceType,
} from '../config';
import { audio } from '../core/Audio';
import { events } from '../core/Events';
import type { BuildingSystem } from '../building/BuildingSystem';
import type { EditSystem } from '../building/EditSystem';
import type { PlayerController } from '../player/PlayerController';
import type { StormManager } from '../storm/StormManager';
import type { CombatSystem } from '../weapons/CombatSystem';
import type { Tournament } from '../game/Tournament';
import type { Actor } from '../actors/Actor';

export interface HudContext {
  player: PlayerController;
  building: BuildingSystem;
  edit: EditSystem;
  combat: CombatSystem;
  storm: StormManager;
  tournament: Tournament;
  camera: THREE.PerspectiveCamera;
  actors: () => readonly Actor[];
}

export interface MenuButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

interface DamageNumber {
  el: HTMLElement;
  pos: THREE.Vector3;
  age: number;
  drift: number;
}

const PIECE_ICONS: Record<PieceType, string> = {
  wall: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>',
  floor: '<svg viewBox="0 0 24 24"><path d="M2 15 L12 9 L22 15 L12 21 Z"/></svg>',
  ramp: '<svg viewBox="0 0 24 24"><path d="M3 21 L21 3 L21 21 Z"/></svg>',
  cone: '<svg viewBox="0 0 24 24"><path d="M2 19 L12 5 L22 19 Z"/></svg>',
};

function fmtTime(s: number): string {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function el<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`HUD element missing: ${sel}`);
  return e;
}

/**
 * DOM overlay HUD: vitals, hotbar, materials, build pieces, bloom crosshair,
 * hit markers, damage numbers, storm timer + minimap, kill feed, tournament
 * scoreboard and the menu / round-summary screens.
 */
export class HUD {
  private readonly root: HTMLElement;
  private readonly ctx: HudContext;
  private readonly textCache = new WeakMap<HTMLElement, string>();
  private readonly damageNumbers: DamageNumber[] = [];
  private hitTimer = 0;
  private hurtTimer = 0;
  private buildHpTimer = 0;
  private toastTimer = 0;
  private centerTimer = 0;
  private readonly minimap: CanvasRenderingContext2D;
  private minimapTimer = 0;
  scoreboardOpen = false;

  constructor(root: HTMLElement, ctx: HudContext) {
    this.root = root;
    this.ctx = ctx;
    root.innerHTML = `
      <div class="vignette storm-v"></div>
      <div class="vignette hurt-v"></div>
      <div id="crosshair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
      <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
      <div id="buildhp"><div class="bar"><div class="fill"></div></div><span></span></div>
      <div id="dmgnums"></div>
      <div id="topright">
        <canvas id="minimap" width="200" height="200"></canvas>
        <div class="storm-info"><span class="storm-label"></span><b class="storm-time"></b></div>
        <div class="stats">
          <div><b class="alive">0</b><small>Alive</small></div>
          <div><b class="elims">0</b><small>Elims</small></div>
          <div><b class="round">0/0</b><small>Round</small></div>
          <div><b class="points">0</b><small>Points</small></div>
        </div>
      </div>
      <div id="killfeed"></div>
      <div id="vitals">
        <div class="vital shield"><span class="num"></span><div class="bar"><div class="fill"></div></div></div>
        <div class="vital health"><span class="num"></span><div class="bar"><div class="fill"></div></div></div>
      </div>
      <div id="modebadge"></div>
      <div id="bottomright">
        <div id="mats">${MATERIAL_ORDER.map((m) => `<div class="mat ${m}" data-mat="${m}"><i></i><b></b></div>`).join('')}</div>
        <div id="pieces">${PIECE_ORDER.map((p) => `<div class="piece" data-piece="${p}">${PIECE_ICONS[p]}<kbd>${PIECE_KEYS[p]}</kbd></div>`).join('')}</div>
        <div id="hotbar">${this.ctx.player.actor.loadout.slots.map((id, i) => `
          <div class="slot" data-slot="${i}" style="--rarity:${WEAPONS[id].rarity}">
            <kbd>${i + 1}</kbd><span class="name">${WEAPONS[id].short}</span><b class="ammo"></b>
          </div>`).join('')}</div>
      </div>
      <div id="progress"><div class="bar"><div class="fill"></div></div><span></span></div>
      <div id="hint"></div>
      <div id="toast"></div>
      <div id="center"><h1></h1><p></p></div>
      <div id="scoreboard"></div>
      <div id="menu"></div>`;

    this.minimap = el<HTMLCanvasElement>(root, '#minimap').getContext('2d')!;
    this.bindEvents();
  }

  private setText(e: HTMLElement, text: string): void {
    if (this.textCache.get(e) === text) return;
    this.textCache.set(e, text);
    e.textContent = text;
  }

  private bindEvents(): void {
    const player = this.ctx.player.actor;
    events.on('damaged', (e) => {
      const total = Math.round(e.shieldDamage + e.healthDamage);
      if (e.attacker === player && e.victim !== player) {
        this.hitTimer = 0.18;
        el(this.root, '#hitmarker').classList.toggle('head', e.headshot);
        audio.play(e.headshot ? 'headshot' : 'hit');
        if (e.point && total > 0) this.spawnDamageNumber(e.point, total, e.headshot, e.healthDamage === 0);
      }
      if (e.victim === player && total > 0) {
        this.hurtTimer = 0.5;
        audio.play(e.source === 'storm' ? 'storm' : e.shieldDamage > 0 ? 'shieldHit' : 'hurt');
      }
    });
    events.on('structureHit', (e) => {
      if (e.attacker !== player) return;
      this.buildHpTimer = 1.4;
      const pct = Math.max(0, e.piece.hp / e.piece.maxHp);
      el(this.root, '#buildhp .fill').style.width = `${pct * 100}%`;
      this.setText(el(this.root, '#buildhp span'), `${Math.max(0, Math.ceil(e.piece.hp))} / ${e.piece.maxHp}`);
      if (!e.destroyed) this.hitTimer = Math.max(this.hitTimer, 0.08);
    });
    events.on('eliminated', ({ victim, killer, source }) => {
      let text: string;
      if (source === 'storm') text = killer ? `${killer.name} pushed ${victim.name} into the storm` : `${victim.name} was lost in the storm`;
      else if (source === 'fall') text = killer ? `${killer.name} knocked ${victim.name} off a ledge` : `${victim.name} fell to their death`;
      else text = `${killer?.name ?? '???'} eliminated ${victim.name} with ${WEAPONS[source as keyof typeof WEAPONS]?.name ?? source}`;
      this.killfeed(text, victim === player || killer === player);
      if (killer === player && victim !== player) {
        this.center('ELIMINATED', victim.name, 1.6, 'small');
        audio.play('elim');
      }
    });
    events.on('toast', ({ text, tone }) => this.toast(text, tone));
  }

  // ------------------------------------------------------------------ transient UI

  private spawnDamageNumber(point: THREE.Vector3, amount: number, head: boolean, shieldOnly: boolean): void {
    const e = document.createElement('div');
    e.className = `dmg${head ? ' head' : ''}${shieldOnly ? ' shield' : ''}`;
    e.textContent = String(amount);
    el(this.root, '#dmgnums').appendChild(e);
    this.damageNumbers.push({ el: e, pos: point.clone().add(new THREE.Vector3(0, 0.4, 0)), age: 0, drift: (Math.random() - 0.5) * 40 });
  }

  killfeed(text: string, highlight = false): void {
    const feed = el(this.root, '#killfeed');
    const row = document.createElement('div');
    row.className = `kf${highlight ? ' me' : ''}`;
    row.textContent = text;
    feed.prepend(row);
    while (feed.children.length > 6) feed.lastElementChild?.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }

  toast(text: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    const t = el(this.root, '#toast');
    t.className = `show ${tone}`;
    t.textContent = text;
    this.toastTimer = 1.6;
  }

  center(title: string, sub = '', duration = 2, size: 'big' | 'small' = 'big'): void {
    const c = el(this.root, '#center');
    c.className = `show ${size}`;
    this.setText(el(c, 'h1'), title);
    this.setText(el(c, 'p'), sub);
    this.centerTimer = duration;
  }

  clearCenter(): void {
    this.centerTimer = 0;
    el(this.root, '#center').className = '';
  }

  // ------------------------------------------------------------------ menus

  showMenu(title: string, bodyHtml: string, buttons: MenuButton[]): void {
    const menu = el(this.root, '#menu');
    menu.innerHTML = `<div class="panel"><h2>${title}</h2><div class="body">${bodyHtml}</div><div class="buttons"></div></div>`;
    const bar = el(menu, '.buttons');
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.onClick();
      });
      bar.appendChild(btn);
    }
    menu.classList.add('show');
  }

  hideMenu(): void {
    el(this.root, '#menu').classList.remove('show');
  }

  get menuOpen(): boolean {
    return el(this.root, '#menu').classList.contains('show');
  }

  leaderboardHtml(highlightRound = false): string {
    const t = this.ctx.tournament;
    const rows = t.leaderboard().map((s, i) => {
      const last = s.results[s.results.length - 1];
      const rounds = Array.from({ length: t.totalRounds }, (_, r) => {
        const res = s.results[r];
        return `<td class="rd">${res ? `#${res.placement}<small>${res.elims ? ` ${res.elims}k` : ''}</small>` : '–'}</td>`;
      }).join('');
      return `<tr class="${s.isPlayer ? 'me' : ''}">
        <td>${i + 1}</td><td class="nm">${s.name}</td>
        ${rounds}
        <td>${s.elims}</td><td>${s.wins}</td>
        ${highlightRound ? `<td class="gain">+${last?.points ?? 0}</td>` : ''}
        <td class="pts">${s.points}</td></tr>`;
    }).join('');
    const roundHeads = Array.from({ length: t.totalRounds }, (_, r) => `<th>R${r + 1}</th>`).join('');
    return `<table class="board">
      <thead><tr><th>#</th><th>Player</th>${roundHeads}<th>Elims</th><th>Wins</th>${highlightRound ? '<th>Round</th>' : ''}<th>Points</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  setScoreboard(open: boolean): void {
    if (open === this.scoreboardOpen) return;
    this.scoreboardOpen = open;
    const sb = el(this.root, '#scoreboard');
    if (open) {
      const t = this.ctx.tournament;
      sb.innerHTML = `<h3>Tournament standings — round ${Math.max(1, t.round)} of ${t.totalRounds}</h3>${this.leaderboardHtml()}
        <p class="legend">Placement: 1st 10 · 2nd 7 · 3rd 5 · 4th 4 · 5th 3 · 6th 2 · 7-8th 1 &nbsp;|&nbsp; +2 per elimination</p>`;
    }
    sb.classList.toggle('show', open);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  // ------------------------------------------------------------------ per-frame

  update(dt: number): void {
    const { player, building, edit, combat, storm, tournament, camera } = this.ctx;
    const a = player.actor;
    const lo = a.loadout;
    const root = this.root;

    // Vitals
    const hp = Math.ceil(a.health);
    const sh = Math.ceil(a.shield);
    el(root, '.vital.health .fill').style.width = `${(a.health / PLAYER.maxHealth) * 100}%`;
    el(root, '.vital.shield .fill').style.width = `${(a.shield / PLAYER.maxShield) * 100}%`;
    this.setText(el(root, '.vital.health .num'), `${hp}`);
    this.setText(el(root, '.vital.shield .num'), `${sh}`);

    // Hotbar
    root.querySelectorAll<HTMLElement>('#hotbar .slot').forEach((slot, i) => {
      const id = lo.slots[i];
      slot.classList.toggle('active', player.mode === 'combat' && lo.index === i);
      const ammo = lo.ammo.get(id);
      const text = ammo ? `${ammo.mag} / ${ammo.reserve}` : id === 'slurp' ? `x${lo.slurps}` : '';
      this.setText(el(slot, '.ammo'), text);
      slot.classList.toggle('empty', id === 'slurp' && lo.slurps === 0);
    });

    // Materials + pieces
    root.querySelectorAll<HTMLElement>('#mats .mat').forEach((m) => {
      const mat = m.dataset.mat as keyof typeof MATERIALS;
      this.setText(el(m, 'b'), String(a.materials[mat]));
      m.classList.toggle('active', a.selectedMaterial === mat);
      m.classList.toggle('low', a.materials[mat] < MATERIALS[mat].cost);
    });
    root.querySelectorAll<HTMLElement>('#pieces .piece').forEach((p) => {
      p.classList.toggle('active', player.mode === 'build' && building.selected === p.dataset.piece);
    });
    const modeText = player.mode === 'build'
      ? `BUILD · ${building.selected.toUpperCase()} · ${MATERIALS[a.selectedMaterial].label.toUpperCase()}`
      : player.mode === 'edit' ? 'EDIT' : WEAPONS[lo.current].name.toUpperCase();
    this.setText(el(root, '#modebadge'), modeText);
    el(root, '#modebadge').className = player.mode;

    // Hint line
    let hint = '';
    if (!a.alive) hint = player.spectate ? `Spectating ${player.spectate.name} · [F] fast-forward` : '';
    else if (player.mode === 'edit') hint = `Editing: ${edit.previewName} — LMB select tiles · G confirm · RMB reset`;
    else if (player.mode === 'build') {
      const reason = building.current && !building.current.ok ? ` (${building.current.reason})` : '';
      hint = `LMB place${reason} · hold for turbo · R rotate ramp · RMB material · Q combat`;
    } else if (edit.aimedPiece(a, player.aimOrigin, player.aimDir)?.owner === a) hint = '[G] Edit';
    this.setText(el(root, '#hint'), hint);

    // Reload / slurp progress
    const prog = el(root, '#progress');
    let frac = -1;
    let label = '';
    if (lo.reloading) {
      frac = 1 - lo.reloadTimer / lo.def.reloadTime;
      label = 'Reloading';
    } else if (lo.drinking) {
      frac = 1 - lo.drinkTimer / SLURP.drinkTime;
      label = 'Slurping';
    } else if (lo.healPool > 0) {
      frac = 1 - lo.healPool / SLURP.total;
      label = `Slurp +${lo.healPool}`;
    }
    prog.classList.toggle('show', frac >= 0);
    if (frac >= 0) {
      el(prog, '.fill').style.width = `${frac * 100}%`;
      this.setText(el(prog, 'span'), label);
    }

    // Crosshair bloom
    const ch = el(root, '#crosshair');
    const spread = combat.spreadFor(a);
    const px = (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (window.innerHeight / 2);
    ch.style.setProperty('--gap', `${4 + px}px`);
    ch.className = player.mode === 'build' ? 'build' : player.mode === 'edit' ? 'edit' : lo.def.kind === 'hitscan' ? 'gun' : 'dot';
    ch.style.display = a.alive ? '' : 'none';

    this.hitTimer = Math.max(0, this.hitTimer - dt);
    el(root, '#hitmarker').classList.toggle('show', this.hitTimer > 0);
    this.buildHpTimer = Math.max(0, this.buildHpTimer - dt);
    el(root, '#buildhp').classList.toggle('show', this.buildHpTimer > 0);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    el(root, '.hurt-v').style.opacity = String(this.hurtTimer * 1.2);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el(root, '#toast').className = '';
    }
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) el(root, '#center').className = '';
    }

    // Storm
    const st = storm.status();
    const label2 = st.state === 'waiting' ? `Storm shrinks in` : st.state === 'shrinking' ? 'Storm shrinking' : 'Storm closed';
    this.setText(el(root, '.storm-label'), `${label2} · Phase ${st.phase}/${st.phases} · ${st.damage} dmg`);
    this.setText(el(root, '.storm-time'), st.state === 'closed' ? '--:--' : fmtTime(st.timeLeft));
    const outside = a.alive && !storm.isInside(a.position);
    el(root, '.storm-v').style.opacity = outside ? '1' : '0';

    // Stats
    const actors = this.ctx.actors();
    this.setText(el(root, '.stats .alive'), String(actors.filter((x) => x.alive).length));
    this.setText(el(root, '.stats .elims'), String(a.elims));
    this.setText(el(root, '.stats .round'), `${Math.max(1, tournament.round)}/${tournament.totalRounds}`);
    const total = (tournament.standingOf(a)?.points ?? 0) + (tournament.roundRecorded ? 0 : tournament.liveRoundPoints(a));
    this.setText(el(root, '.stats .points'), String(total));

    // Damage numbers
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.age += dt;
      if (d.age > 0.9) {
        d.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      v.copy(d.pos).project(camera);
      if (v.z > 1) {
        d.el.style.display = 'none';
        continue;
      }
      d.el.style.display = '';
      const x = (v.x * 0.5 + 0.5) * w + d.drift * d.age;
      const y = (-v.y * 0.5 + 0.5) * h - d.age * 60;
      d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.15 - d.age) * 3})`;
      d.el.style.opacity = String(Math.min(1, (0.9 - d.age) * 4));
    }

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 1 / 20;
      this.drawMinimap();
    }
  }

  private drawMinimap(): void {
    const { storm, player } = this.ctx;
    const g = this.minimap;
    const S = g.canvas.width;
    const scale = S / (MAP_HALF * 2);
    const mx = (x: number) => (x + MAP_HALF) * scale;
    const my = (z: number) => (z + MAP_HALF) * scale;

    g.clearRect(0, 0, S, S);
    g.fillStyle = '#3f7a35';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      g.beginPath();
      g.moveTo((i / 10) * S, 0);
      g.lineTo((i / 10) * S, S);
      g.moveTo(0, (i / 10) * S);
      g.lineTo(S, (i / 10) * S);
      g.stroke();
    }

    // Storm: purple everywhere except the safe circle.
    g.save();
    g.fillStyle = 'rgba(140, 60, 220, 0.55)';
    g.beginPath();
    g.rect(0, 0, S, S);
    g.arc(mx(storm.center.x), my(storm.center.y), Math.max(0, storm.radius * scale), 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.restore();

    g.strokeStyle = '#c084ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx(storm.center.x), my(storm.center.y), Math.max(0, storm.radius * scale), 0, Math.PI * 2);
    g.stroke();
    if (storm.state !== 'closed') {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(mx(storm.nextCenter.x), my(storm.nextCenter.y), Math.max(0.5, storm.nextRadius * scale), 0, Math.PI * 2);
      g.stroke();
    }

    const a = player.actor.alive ? player.actor : player.spectate ?? player.actor;
    const px = mx(a.position.x);
    const pz = my(a.position.z);
    // Route line to the next safe zone when outside it.
    const dx = a.position.x - storm.nextCenter.x;
    const dz = a.position.z - storm.nextCenter.y;
    if (Math.hypot(dx, dz) > storm.nextRadius) {
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.moveTo(px, pz);
      g.lineTo(mx(storm.nextCenter.x), my(storm.nextCenter.y));
      g.stroke();
      g.setLineDash([]);
    }
    g.save();
    g.translate(px, pz);
    g.rotate(-a.yaw);
    g.fillStyle = '#ffe14d';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 6);
    g.lineTo(0, 3);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
