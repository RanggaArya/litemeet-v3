const { app, BrowserWindow, ipcMain, screen, desktopCapturer, session, dialog } = require('electron');
const path = require('path');
// child_process.fork digunakan di production mode
const http = require('http');
const fs = require('fs');

let mainWindow;
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
      contextIsolation: true,
      backgroundThrottling: false, // Keep WebRTC media alive when window loses focus
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
    // Di mode production, langsung load versi Web Vercel
    // Ini menghilangkan bug 'Server configuration error' karena ENV dari lokal tidak perlu dibaca.
    mainWindow.loadURL('https://litemeet-v3.vercel.app');
  }

  // --- AUTO PIP LOGIC ---
  let pipTimeout = null;

  mainWindow.on('blur', () => {
    if (inMeeting && mainWindow) {
      const bounds = mainWindow.getBounds();
      // Only shrink if it's not already in PiP mode (e.g. width > 400)
      if (bounds.width > 400) {
        // Add a delay to prevent accidental PiP triggers that kill media tracks
        pipTimeout = setTimeout(() => {
          if (!mainWindow.isFocused() && !mainWindow.isMinimized()) {
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
        }, 800); // 800ms delay — prevents flash-minimize from killing tracks
      }
    }
  });

  mainWindow.on('focus', () => {
    // Cancel pending PiP if user quickly returns
    if (pipTimeout) {
      clearTimeout(pipTimeout);
      pipTimeout = null;
    }
  });

  // Jika tombol minimize diklik: jika layar besar, jadikan PIP. Jika sudah PIP, biarkan minimize beneran.
  mainWindow.on('minimize', (e) => {
    if (inMeeting && mainWindow) {
      const bounds = mainWindow.getBounds();
      if (bounds.width > 400) {
        e.preventDefault(); // Jangan minimize, tapi jadikan PIP
        if (pipTimeout) clearTimeout(pipTimeout);
        
        mainWindow.setAlwaysOnTop(true, 'floating', 1);
        mainWindow.setMinimumSize(150, 100);
        
        const { width } = screen.getPrimaryDisplay().workAreaSize;
        const pipWidth = 302;
        const pipHeight = 189;
        
        mainWindow.setBounds({
          x: width - pipWidth - 20,
          y: 20,
          width: pipWidth,
          height: pipHeight
        }, true);
      }
    }
  });

  // Hapus alwaysOnTop jika kembali ke ukuran normal/maximized
  mainWindow.on('maximize', () => {
    if (mainWindow) mainWindow.setAlwaysOnTop(false);
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow) mainWindow.setAlwaysOnTop(false);
  });
  mainWindow.on('resize', () => {
    if (mainWindow && mainWindow.getBounds().width > 400) {
      mainWindow.setAlwaysOnTop(false);
    }
  });

  // --- CLOSE CONFIRMATION (CUSTOM MODAL) ---
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.webContents.send('request-close'); // Minta React untuk tampilkan modal cantik
    }
  });

  ipcMain.on('confirm-close', () => {
    app.isQuitting = true;
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // tidak ada NextProcess
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
