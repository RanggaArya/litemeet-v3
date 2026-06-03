const { app, BrowserWindow, ipcMain, screen, desktopCapturer, session, dialog } = require('electron');
const path = require('path');
// child_process.fork digunakan di production mode
const http = require('http');
const fs = require('fs');

let mainWindow;
let splashWindow;
let nextProcess;
let inMeeting = false;
let currentScreenShareCallback = null;
let isPipMode = false; // Track PiP state explicitly
let savedNormalBounds = null; // Store normal window bounds before PiP
let isRestoringFromPip = false; // Flag to prevent blur -> PiP during restore

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'public', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const splashHTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 420px; height: 320px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d1a 60%, #050510 100%);
        border-radius: 24px;
        overflow: hidden;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        -webkit-app-region: drag;
        position: relative;
      }

      /* Ambient glow behind logo */
      .glow {
        position: absolute;
        width: 200px; height: 200px;
        top: 50%; left: 50%;
        transform: translate(-50%, -60%);
        background: radial-gradient(circle, rgba(99,102,241,0.25) 0%, rgba(168,85,247,0.15) 30%, rgba(236,72,153,0.1) 50%, transparent 70%);
        animation: pulse-glow 3s ease-in-out infinite;
        filter: blur(30px);
        z-index: 0;
      }

      @keyframes pulse-glow {
        0%, 100% { transform: translate(-50%, -60%) scale(1); opacity: 0.8; }
        50% { transform: translate(-50%, -60%) scale(1.15); opacity: 1; }
      }

      /* Rainbow color sweep on logo */
      .logo-wrapper {
        position: relative;
        z-index: 1;
        width: 80px; height: 80px;
        margin-bottom: 18px;
        animation: float-logo 3s ease-in-out infinite;
      }

      @keyframes float-logo {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }

      .logo-wrapper img {
        width: 80px; height: 80px;
        border-radius: 16px;
        filter: drop-shadow(0 0 20px rgba(99,102,241,0.5));
      }

      .title {
        font-size: 22px;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.5px;
        z-index: 1;
        margin-bottom: 6px;
        animation: fade-in 1s ease-out 0.3s both;
      }

      .subtitle {
        font-size: 11px;
        color: rgba(255,255,255,0.4);
        letter-spacing: 2px;
        text-transform: uppercase;
        z-index: 1;
        margin-bottom: 28px;
        animation: fade-in 1s ease-out 0.6s both;
      }

      @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Loading bar */
      .loader-track {
        width: 180px; height: 3px;
        background: rgba(255,255,255,0.08);
        border-radius: 4px;
        overflow: hidden;
        z-index: 1;
        animation: fade-in 1s ease-out 0.9s both;
      }

      .loader-bar {
        width: 40%;
        height: 100%;
        border-radius: 4px;
        background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #6366f1);
        background-size: 300% 100%;
        animation: shimmer 1.8s ease-in-out infinite;
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); background-position: 0% 50%; }
        100% { transform: translateX(350%); background-position: 100% 50%; }
      }

      .version {
        position: absolute;
        bottom: 14px;
        font-size: 10px;
        color: rgba(255,255,255,0.2);
        z-index: 1;
      }

      /* Floating particles */
      .particles {
        position: absolute;
        inset: 0;
        z-index: 0;
        overflow: hidden;
      }
      .particles span {
        position: absolute;
        width: 3px; height: 3px;
        background: rgba(168,85,247,0.4);
        border-radius: 50%;
        animation: particle-float linear infinite;
      }
      .particles span:nth-child(1) { left: 10%; top: 80%; animation-duration: 6s; animation-delay: 0s; }
      .particles span:nth-child(2) { left: 25%; top: 90%; animation-duration: 8s; animation-delay: 1s; width: 2px; height: 2px; background: rgba(99,102,241,0.3); }
      .particles span:nth-child(3) { left: 55%; top: 85%; animation-duration: 7s; animation-delay: 2s; }
      .particles span:nth-child(4) { left: 75%; top: 95%; animation-duration: 9s; animation-delay: 0.5s; width: 2px; height: 2px; background: rgba(236,72,153,0.3); }
      .particles span:nth-child(5) { left: 90%; top: 88%; animation-duration: 6.5s; animation-delay: 1.5s; }
      .particles span:nth-child(6) { left: 40%; top: 92%; animation-duration: 10s; animation-delay: 3s; width: 2px; height: 2px; }

      @keyframes particle-float {
        0% { transform: translateY(0) scale(1); opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { transform: translateY(-320px) scale(0.5); opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div class="glow"></div>
    <div class="particles">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
    </div>

    <div class="logo-wrapper">
      <img src="data:image/png;base64,${fs.existsSync(path.join(__dirname, 'public', 'icon.png')) ? fs.readFileSync(path.join(__dirname, 'public', 'icon.png')).toString('base64') : ''}" alt="LiteMeet Logo" />
    </div>

    <div class="title">LiteMeet</div>
    <div class="subtitle">Preparing your experience</div>

    <div class="loader-track">
      <div class="loader-bar"></div>
    </div>

    <div class="version">v0.2.0 · Powered by Aralya</div>
  </body>
  </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

async function createWindow() {
  // Show splash screen first
  createSplashWindow();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "LiteMeet - Video Conference",
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Keep WebRTC media alive when window loses focus
    }
  });

  // --- ALLOW POPUPS FOR FIREBASE AUTH ---
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
      }
    };
  });

  // --- Enable Screen Sharing di Electron ---
  // Electron tidak support getDisplayMedia secara native, jadi kita intercept request-nya
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 400 } });
      const sourcesData = sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      }));
      
      currentScreenShareCallback = callback;
      mainWindow.webContents.send('show-desktop-picker', sourcesData);
    } catch (e) {
      console.error('Screen share error:', e);
      callback({});
    }
  });

  // --- Auto allow media permissions (Camera, Mic) ---
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log(`[Permission Request] ${permission}`);
    callback(true); // Accept all permissions
  });
  
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log(`[Permission Check] ${permission} from ${requestingOrigin}`);
    return true; // Accept all permissions
  });
  
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    console.log(`[Device Permission] ${details.deviceType}`);
    return true;
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Dalam mode packaged, file asarUnpack ada di app.asar.unpacked
    const resourcesDir = __dirname.replace('app.asar', 'app.asar.unpacked');

    const envVars = {};

    // --- Copy static & public ke standalone folder jika belum ada ---
    const standaloneDir = path.join(resourcesDir, '.next', 'standalone');
    const staticSrc = path.join(resourcesDir, '.next', 'static');
    const staticDest = path.join(standaloneDir, '.next', 'static');
    const publicSrc = path.join(resourcesDir, 'public');
    const publicDest = path.join(standaloneDir, 'public');

    // Copy fungsi rekursif
    function copyDirSync(src, dest) {
      if (!fs.existsSync(src)) return;
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDirSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    if (!fs.existsSync(staticDest)) {
      console.log('Copying .next/static to standalone...');
      copyDirSync(staticSrc, staticDest);
    }
    if (!fs.existsSync(publicDest)) {
      console.log('Copying public to standalone...');
      copyDirSync(publicSrc, publicDest);
    }

    // Jalankan bundled Next.js standalone server via fork
    const serverPath = path.join(standaloneDir, 'server.js');
    console.log('Starting Next.js server from:', serverPath);
    console.log('Standalone dir:', standaloneDir);

    // Gunakan fork dengan ELECTRON_RUN_AS_NODE=1 agar Electron bertindak sebagai Node.js
    const { fork } = require('child_process');
    nextProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ...envVars,
        PORT: '3000',
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1'
      },
      cwd: standaloneDir,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    nextProcess.stdout.on('data', data => console.log(`NextJS: ${data}`));
    nextProcess.stderr.on('data', data => console.error(`NextJS Error: ${data}`));
    nextProcess.on('error', err => console.error('Fork error:', err));
    nextProcess.on('exit', (code) => console.log('Next.js server exited with code:', code));

    const checkServerReady = async (url) => {
      for (let i = 0; i < 30; i++) {
        try {
          const isReady = await new Promise((resolve) => {
            const req = require('http').get(url, (res) => {
              if (res.statusCode === 200) resolve(true);
              else resolve(false);
            });
            req.on('error', () => resolve(false));
          });
          if (isReady) return true;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
      }
      return false;
    };

    checkServerReady('http://127.0.0.1:3000').then(ready => {
      if (!ready) {
        console.error('Next.js server failed to start!');
      }
      mainWindow.loadURL('http://127.0.0.1:3000');
    });
  }

  // Show main window and close splash when page is ready
  mainWindow.webContents.on('did-finish-load', () => {
    // Small delay to ensure page is rendered
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      if (mainWindow) {
        mainWindow.show();
        mainWindow.center();
        mainWindow.focus();
      }
    }, 800);
  });

  // ============================================================
  // ===              AUTO PIP & WINDOW MANAGEMENT             ===
  // ============================================================
  //
  // Rules:
  // 1. PiP mode: always on top, small window in corner
  // 2. Normal/Maximized mode: NOT always on top
  // 3. When user clicks another app (blur) during meeting: go to PiP
  // 4. When PiP window is clicked (focus): restore to normal
  // 5. Minimize button on PiP: actually minimize to taskbar
  // 6. Minimize button on normal/max: go to PiP
  // 7. Restore button on maximized: go to normal (NOT PiP)

  let pipTimeout = null;
  let isEnteringPip = false;

  // --- Helper: Enter PiP mode ---
  function enterPipMode() {
    if (!mainWindow || isPipMode || mainWindow.isMinimized()) return;

    isEnteringPip = true;

    // Save current bounds before going PiP (only if not already in PiP)
    const bounds = mainWindow.getBounds();
    if (bounds.width > 400 && !mainWindow.isMaximized()) {
      savedNormalBounds = bounds;
    }

    // Must unmaximize first before resizing, otherwise Windows locks the bounds
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }

    isPipMode = true;
    mainWindow.setMinimumSize(150, 100);

    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const pipWidth = 302;
    const pipHeight = 189;

    mainWindow.setBounds({
      x: screenWidth - pipWidth - 20,
      y: 20,
      width: pipWidth,
      height: pipHeight
    }, true);

    // Set always on top AFTER resizing to avoid flicker
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

    setTimeout(() => { isEnteringPip = false; }, 500);
  }

  // --- Helper: Exit PiP mode (restore to normal) ---
  function exitPipMode() {
    if (!mainWindow || !isPipMode) return;

    isRestoringFromPip = true;
    isPipMode = false;
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(800, 600);

    if (savedNormalBounds) {
      mainWindow.setBounds(savedNormalBounds, true);
    } else {
      mainWindow.setBounds({ width: 1200, height: 800 }, true);
      mainWindow.center();
    }

    // Clear restoring flag after a short delay
    setTimeout(() => { isRestoringFromPip = false; }, 1000);
  }

  // --- BLUR: When window loses focus during meeting -> enter PiP ---
  mainWindow.on('blur', () => {
    if (!inMeeting || !mainWindow || isPipMode || isRestoringFromPip) return;

    // Delay to prevent accidental triggers
    pipTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isFocused() && !mainWindow.isMinimized() && !isPipMode) {
        enterPipMode();
      }
    }, 600);
  });

  // --- FOCUS: When PiP window is clicked -> restore to normal ---
  mainWindow.on('focus', () => {
    // Cancel pending PiP if user quickly returns
    if (pipTimeout) {
      clearTimeout(pipTimeout);
      pipTimeout = null;
    }

    // If currently in PiP mode and user clicks on it, restore to normal
    if (isPipMode && inMeeting) {
      exitPipMode();
    }
  });

  // --- MINIMIZE: Different behavior depending on current state ---
  mainWindow.on('minimize', (e) => {
    if (!inMeeting || !mainWindow) return;

    if (isPipMode) {
      // Already in PiP -> allow actual minimize to taskbar
      // Don't prevent default, let it minimize
      isPipMode = false;
      mainWindow.setAlwaysOnTop(false);
    } else {
      // Normal/Maximized -> go to PiP instead of minimize
      e.preventDefault();
      if (pipTimeout) clearTimeout(pipTimeout);
      enterPipMode();
    }
  });

  // --- MAXIMIZE / UNMAXIMIZE: Always disable always-on-top ---
  mainWindow.on('maximize', () => {
    if (mainWindow) {
      isPipMode = false;
      mainWindow.setAlwaysOnTop(false);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !isEnteringPip) {
      // This fires when user clicks the restore/middle button on a maximized window
      // It should go to normal size, NOT PiP
      isPipMode = false;
      mainWindow.setAlwaysOnTop(false);
    }
  });

  // --- CLOSE CONFIRMATION (NATIVE MODAL) ---
  mainWindow.on('close', (e) => {
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Ya', 'Tidak'],
      title: 'Konfirmasi Keluar',
      message: 'Apakah Anda yakin ingin menutup aplikasi LiteMeet?',
      defaultId: 1, // Default ke 'Tidak'
      cancelId: 1
    });

    if (response === 1) { // User klik 'Tidak'
      e.preventDefault();
    } else {
      if (nextProcess) nextProcess.kill();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (nextProcess) nextProcess.kill();
});

ipcMain.on('set-in-meeting', (event, status) => {
  inMeeting = status;
  if (!inMeeting && mainWindow) {
    isPipMode = false;
    isRestoringFromPip = false;
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(800, 600);
    mainWindow.setBounds({ width: 1200, height: 800 }, true);
    mainWindow.center();
  }
});

ipcMain.on('desktop-picker-result', async (event, sourceId) => {
  if (currentScreenShareCallback) {
    if (sourceId) {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const selectedSource = sources.find(s => s.id === sourceId);
      currentScreenShareCallback({ video: selectedSource, audio: 'loopback' });
    } else {
      currentScreenShareCallback({});
    }
    currentScreenShareCallback = null;
  }
});

// --- SCREEN RECORDING: Save file to local Documents folder ---
ipcMain.handle('save-recording', async (event, fileName, arrayBuffer) => {
  try {
    const documentsPath = app.getPath('documents');
    const recordingsDir = path.join(documentsPath, 'LiteMeet Recordings');

    // Create folder if it doesn't exist
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const filePath = path.join(recordingsDir, fileName);
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    console.log(`[Recording] ✅ Saved: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    return { success: true, path: filePath };
  } catch (err) {
    console.error('[Recording] ❌ Save failed:', err);
    return { success: false, error: err.message };
  }
});
