// Windows / desktop wrapper (Electron). Loads the same www/ game the phones use.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#04050c',
    title: 'NEON BRAWL',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  // F11 toggles fullscreen
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
