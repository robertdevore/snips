const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snipsFillApi', {
	onInit: (handler) => ipcRenderer.on('fill:init', (_event, payload) => handler(payload)),
	respond: (payload) => ipcRenderer.send('fill:respond', payload)
});
