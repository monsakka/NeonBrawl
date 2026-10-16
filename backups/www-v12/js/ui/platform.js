/* NEON BRAWL — Platform glue: one build for iPhone / iPad (Safari or "Add to Home Screen"), Android (browser or the
 * Capacitor APK) and desktop (browser or Electron). Nothing here changes how the game plays.
 *   • a generated home-screen icon (apple-touch-icon + favicon), drawn once into a canvas — no image files
 *   • portrait on a touch device: the CSS shows a "rotate your device" card (pointer: coarse only, so desktop windows
 *     of any shape never see it) and an offline match pauses until you turn back; tapping the card asks for
 *     fullscreen + a landscape lock where the browser allows it (Android); iOS can't lock, so it simply waits
 *   • standalone (home-screen web app) and iOS flags on <html> for the CSS (safe-area padding round the notch)     */
'use strict';

(function makeAppIcon() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 180, 180); g.addColorStop(0, '#1a0f4a'); g.addColorStop(1, '#05030f'); x.fillStyle = g; x.fillRect(0, 0, 180, 180);
    const r = x.createRadialGradient(90, 80, 10, 90, 90, 110); r.addColorStop(0, 'rgba(109,77,255,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, 180, 180);
    x.font = '900 82px Orbitron, "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const tg = x.createLinearGradient(0, 50, 0, 130); tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#22e6ff'); tg.addColorStop(1, '#ff2fd0');
    x.shadowColor = '#22e6ff'; x.shadowBlur = 18; x.fillStyle = tg; x.fillText('NB', 90, 94);
    x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 4; x.strokeRect(10, 10, 160, 160);
    const url = c.toDataURL('image/png'); for (const id of ['app-icon', 'fav-icon']) { const l = document.getElementById(id); if (l) l.href = url; }
  } catch (e) { /* no canvas: keep the default icon */ }
})();

const PLATFORM = {
  ios: /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
  portraitMQ: window.matchMedia ? matchMedia('(orientation: portrait) and (pointer: coarse)') : { matches: false, addEventListener() {} }
};
document.documentElement.classList.toggle('ios', PLATFORM.ios);
document.documentElement.classList.toggle('standalone', PLATFORM.standalone);
function onOrientation() {
  const p = PLATFORM.portraitMQ.matches; document.documentElement.classList.toggle('portrait', p);
  if (p && (G.mode === 'play' || G.mode === 'count') && !G.paused && !NET.active) setPaused(true);   // (online matches keep running: they can't pause)
}
if (PLATFORM.portraitMQ.addEventListener) PLATFORM.portraitMQ.addEventListener('change', onOrientation); else if (PLATFORM.portraitMQ.addListener) PLATFORM.portraitMQ.addListener(onOrientation);
onOrientation();
document.getElementById('rotate').addEventListener('click', () => { if (typeof enterFullscreenLandscape === 'function') enterFullscreenLandscape(); });
