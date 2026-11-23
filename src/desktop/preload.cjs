// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW'S PRELOAD: what its own check page needs, and the web page's bridge for the office's page.
 *
 * The office's pages are the same pages a browser draws, and they need almost nothing from the window. The window's
 * own check page (src/desktop/check.html, loaded from a file) needs four things: what to show, and its three presses.
 * They are exposed only on that page, and the main process checks the sender again before it answers
 * (src/desktop/main.mjs).
 *
 * THE WEB PAGE'S BRIDGE (wave 13t, package OT-B) is the one thing an office page is given: it opens, places, hides,
 * shows and closes the web page the window draws over the page's box, moves it back, forward or again, opens it in
 * the ordinary browser, and answers a download's question. Since round 242 it also opens an https address the office
 * page names, an account sign-in's, in the system's browser, and nothing but https. It is exposed only on the office's
 * own origin, which the window names, and the main process checks the sender and each argument again before it acts
 * (src/desktop/the-web-page.mjs). It reads nothing from the office and gives the web page nothing.
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
} else {
  // Asked before the page's own code runs, so a page on any other origin is never given the bridge.
  const theOfficesOrigin = ipcRenderer.sendSync('the-offices-origin')
  if (typeof theOfficesOrigin === 'string' && window.location.origin === theOfficesOrigin) {
    contextBridge.exposeInMainWorld('theWindowsWebPage', {
      read: () => ipcRenderer.invoke('the-web-page'),
      open: (/** @type {unknown} */ asked) => ipcRenderer.invoke('web-page-open', asked),
      place: (/** @type {unknown} */ rectangle) => ipcRenderer.invoke('web-page-place', rectangle),
      hide: () => ipcRenderer.invoke('web-page-hide'),
      show: () => ipcRenderer.invoke('web-page-show'),
      back: () => ipcRenderer.invoke('web-page-back'),
      forward: () => ipcRenderer.invoke('web-page-forward'),
      reload: () => ipcRenderer.invoke('web-page-reload'),
      close: () => ipcRenderer.invoke('web-page-close'),
      openOutside: () => ipcRenderer.invoke('web-page-outside'),
      openHttpsOutside: (/** @type {unknown} */ address) => ipcRenderer.invoke('web-page-https', address),
      answerDownload: (/** @type {unknown} */ answer) => ipcRenderer.invoke('web-page-download', answer),
      onChange: (/** @type {(state: unknown) => void} */ then) => {
        ipcRenderer.on('the-web-page-changed', (_event, state) => then(state))
      },
    })
  }
}
