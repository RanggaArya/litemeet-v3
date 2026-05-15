const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setInMeeting: (status) => ipcRenderer.send('set-in-meeting', status),
  isDesktop: true,
  onDesktopPicker: (callback) => ipcRenderer.on('show-desktop-picker', (_event, sources) => callback(sources)),
  selectDesktopSource: (sourceId) => ipcRenderer.send('desktop-picker-result', sourceId),
  // Screen recording: save file to local Documents folder
  saveRecording: (fileName, arrayBuffer) => ipcRenderer.invoke('save-recording', fileName, arrayBuffer),
});
