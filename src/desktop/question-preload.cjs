// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUESTION'S PRELOAD: what its page needs, and nothing for any other page.
 *
 * Only the view that shows the question is given this file (src/desktop/main.mjs), and the main
 * process checks the sender again before it answers or acts. The office's pages are given nothing.
 *
 * It is CommonJS because a sandboxed preload is: Electron loads it with its own small `require`.
 */

const { contextBridge, ipcRenderer } = require('electron')

if (window.location.protocol === 'file:' && window.location.pathname.endsWith('/question.html')) {
  contextBridge.exposeInMainWorld('theWindowsQuestion', {
    read: () => ipcRenderer.invoke('the-question'),
    answer: (/** @type {'yes' | 'cancel'} */ what) => ipcRenderer.invoke('answer-the-question', what),
  })
}
