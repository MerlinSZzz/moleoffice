// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW'S PRELOAD: what its own check page needs, and nothing for the office's pages.
 *
 * The office's pages are the same pages a browser draws, and they need nothing from the window, so
 * they are given nothing. The window's own check page (src/desktop/check.html, loaded from a file)
 * needs four things: what to show, and its three presses. They are exposed only on that page, and the
 * main process checks the sender again before it answers (src/desktop/main.mjs).
 *
 * It is CommonJS because a sandboxed preload is: Electron loads it with its own small `require`.
 */

const { contextBridge, ipcRenderer } = require('electron')

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('theWindowsCheck', {
    read: () => ipcRenderer.invoke('the-check'),
    checkAgain: () => ipcRenderer.invoke('check-again'),
    openAnyway: () => ipcRenderer.invoke('open-anyway'),
    restartTheService: () => ipcRenderer.invoke('restart-the-service'),
    onChange: (/** @type {() => void} */ then) => {
      ipcRenderer.on('the-check-changed', () => then())
    },
  })
}
