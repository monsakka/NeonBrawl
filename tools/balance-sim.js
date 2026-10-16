// Balance tournament: every fighter plays every other fighter (both sides), CPU vs CPU on Hard,
// on hazard-free stages. Prints each fighter's win rate so outliers can be tuned.
// Run with:  npm run balance            (optionally: npm run balance -- 2   for 2 rounds per pairing,
//                                         npm run balance -- featured 3   for only the 8 featured fighters, 3 rounds)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const rounds = Math.max(1, parseInt(process.argv.find(a => /^\d+$/.test(a)), 10) || 1);
const featuredOnly = process.argv.includes('featured');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  const out = await win.webContents.executeJavaScript(`(async () => {
    const B = window.__brawl, N = B.CHARS.length, wins = Array(N).fill(0), games = Array(N).fill(0), kos = Array(N).fill(0);
    const stages = B.STAGES.map((s, i) => i).filter(i => !B.STAGES[i].hazard);
    let timeouts = 0, played = 0;
    const list = B.CHARS.map((c, i) => i).filter(i => !${featuredOnly} || FEATURED_FIGHTERS.includes(B.CHARS[i].id));
    for (let r = 0; r < ${rounds}; r++)
    for (const a of list) for (const b of list) {
      if (a === b) continue;
      B.SEL.p1 = a; B.SEL.cpu = b; B.SEL.stage = stages[(a * 7 + b * 3 + r) % stages.length]; B.SEL.randStage = false; B.SEL.hazards = false; B.SEL.diff = 2;
      B.startMatch(); B.G.mode = 'play'; B.fighters[0].cpu = true;
      let f = 0;
      while (B.G.mode === 'play' && f < 60 * 180) { B.step(); f++; }
      while (B.G.mode === 'ending') B.step();
      const [p, q] = B.fighters;
      let w;
      if (p.stocks !== q.stocks) w = p.stocks > q.stocks ? 0 : 1;
      else { timeouts++; w = p.percent < q.percent ? 0 : 1; }                 // time-out: lower damage wins
      wins[w ? b : a]++; games[a]++; games[b]++; kos[a] += 3 - q.stocks; kos[b] += 3 - p.stocks; played++;
      if (played % 50 === 0) await new Promise(res => setTimeout(res, 0));
    }
    const rows = list.map(i => ({ name: B.CHARS[i].name, wr: wins[i] / games[i], k: kos[i] / games[i] })).sort((x, y) => y.wr - x.wr);
    return { rows, played, timeouts };
  })()`).catch(e => { console.error('Balance sim failed: ' + e); app.exit(1); return null; });
  if (!out) return;
  console.log('Matches: ' + out.played + '  (time-outs decided on damage: ' + out.timeouts + ')\n');
  for (const r of out.rows) console.log(r.name.padEnd(11) + ' ' + (r.wr * 100).toFixed(0).padStart(3) + '%  ' + '#'.repeat(Math.round(r.wr * 40)).padEnd(40) + '  KOs/game ' + r.k.toFixed(2));
  app.exit(0);
});
