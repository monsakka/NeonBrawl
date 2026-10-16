/* NEON BRAWL — The 2.5D frame: 3D world in WebGL, effects + overlays in a transparent 2D canvas on top.
 *
 *   #gl   (WebGL)    painted-sky backdrop, deep scenery, stage prisms + art decals, 3D fighters, shields, shadows
 *   #game (Canvas2D) attack arcs, special-move FX, projectiles, hazards, particles, portals, aim reticle, banners —
 *                    drawn with the same camera transform, so they sit exactly on the 3D gameplay plane
 *   DOM              the HUD (ui/hud-dom in render/hud.js) and every menu
 * Menus keep the painted canvas backdrop; the WebGL canvas only runs during matches. If WebGL is unavailable (or
 * the context is lost) the game falls back to the classic canvas renderer automatically.                       */
'use strict';

const RENDER3D = {
  on: false,
  active() {
    if (SET.renderer !== 'webgl' || G.mode === 'menu' || GL3D.failed || GL3D.lost) return false;
    return GL3D.ok || glInit();
  },
  show(on) {
    if (on === RENDER3D.on) return;
    RENDER3D.on = on;
    if (GL3D.canvas) GL3D.canvas.classList.toggle('on', on);
    canvas.classList.toggle('overlay', on);
    RENDER_FLAGS.shield3D = on;
  }
};

function render3D() {
  RENDER3D.show(true);
  const v = FRAME_CAM || viewCam();
  // ---- 3D world ----
  if (STAGE3D.key !== ST.id || !STAGE3D.main) buildStage3D();
  const E = STAGE3D.env, D = CAM3D.K / v.z;
  E.fogNear = D + 350; E.fogFar = D + 5200;
  glBeginFrame(v, E);
  collectStage3D(v);
  const rigs = [];
  for (const f of fighters) { if (f.state === 'dead') continue; const S = solveRig(f); rigs.push([f, S]); collectFighter3D(f, S); }
  const ta = GL3D.bgW / GL3D.bgH, va = VIEW.LW / VIEW.LH;                       // cover-fit the painted backdrop
  const uv = va > ta ? [1, ta / va, 0, (1 - ta / va) / 2] : [va / ta, 1, (1 - va / ta) / 2, 0];
  glFlush({ uv, tint: E.bright ? [1, 1, 1] : [0.92, 0.92, 0.96] });
  // ---- 2D overlay (same camera) ----
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  safeTransform();
  ctx.save();
  worldTransform();
  drawHazards();
  drawGadgets();
  drawPortals();
  for (const f of fighters) drawRespawnPad(f);
  for (const [f] of rigs) { drawFighterPre(f); drawFighterPost(f); }       // attack arcs, special FX, vehicles, ice, stun stars
  drawProjs(); drawFx(); drawAtmosphereFront(); drawAim(fighters[0]);
  ctx.restore();
  drawScreenOverlays();
  drawBanners();
}
