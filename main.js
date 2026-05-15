const { app, BrowserWindow, ipcMain, screen, desktopCapturer, session } = require('electron');
const path = require('path');
// child_process.fork digunakan di production mode
const http = require('http');
const fs = require('fs');

let mainWindow;
let nextProcess;
let inMeeting = false;
let currentScreenShareCallback = null;

function checkServerReady(url, maxRetries = 30) {
  return new Promise((resolve) => {
    let retries = 0;
    const interval = setInterval(() => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(interval);
          resolve(false);
        }
      });
    }, 1000);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "LiteMeet - Video Conference",
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
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

    // --- Load environment variables dari .env.local ---
    const envPath = path.join(resourcesDir, '.env.local');
    const envVars = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        line = line.replace(/\r/g, '').trim();
        if (line && !line.startsWith('#')) {
          const eqIndex = line.indexOf('=');
          if (eqIndex > 0) {
            const key = line.substring(0, eqIndex).trim();
            const value = line.substring(eqIndex + 1).trim();
            envVars[key] = value;
          }
        }
      });
    }

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

    const ready = await checkServerReady('http://127.0.0.1:3000');
    if (!ready) {
      console.error('Next.js server failed to start!');
    }
    mainWindow.loadURL('http://127.0.0.1:3000');
  }

  // --- AUTO PIP LOGIC ---
  mainWindow.on('blur', () => {
    if (inMeeting && mainWindow) {
      const bounds = mainWindow.getBounds();
      // Only shrink if it's not already in PiP mode (e.g. width > 400)
      if (bounds.width > 400) {
        mainWindow.setAlwaysOnTop(true, 'floating', 1);
        mainWindow.setMinimumSize(150, 100);
        
        const { width } = screen.getPrimaryDisplay().workAreaSize;
        const pipWidth = 302;
        const pipHeight = 189;
        
        // Mengecil ke pojok kanan atas
        mainWindow.setBounds({
          x: width - pipWidth - 20,
          y: 20,
          width: pipWidth,
          height: pipHeight
        }, true);
      }
    }
  });

  // Hapus mainWindow.on('focus') agar jendela tidak langsung membesar saat disentuh/digeser.
  // Pengguna bisa me-maximize secara manual atau lewat tombol restore.
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
