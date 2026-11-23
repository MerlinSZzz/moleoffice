// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A WEB PAGE IN THE WINDOW, WITH NO OFFICE POWERS (wave 13t, package OT-B).
 *
 * The window can draw one web page over a box the office page lays out: in the page's place, or in a column on its
 * left or its right. The page is anybody's page from the internet, so it must not reach the office. Every rule that
 * keeps it out is worked out here, and src/desktop/main.mjs hands this module the view's session and contents to apply
 * them to.
 *
 * WHAT KEEPS THE PAGE OUT:
 *   - the view has no preload, runs in the sandbox with context isolation, and has no Node (theWebPagesPreferences);
 *   - it has a session of its own, THE_WEB_PAGES_PARTITION. The office's key cookie is in the window's default session,
 *     so it is never in this one. The partition is kept on disk, so the page's own logins outlive a restart;
 *   - that session's user agent carries no window mark (withoutTheWindowsMarks in src/config/the-window-mark.mjs), so
 *     the page cannot pass for the window;
 *   - every navigation, redirect, frame and new window is asked of whyTheAddressIsRefused: only http and https, never
 *     a loopback address and never the office. Every request is asked of whyARequestIsRefused, which takes a page's
 *     WebSocket too (ws: and wss:) under the same host rules, since many pages need one to work;
 *   - no new window is ever opened. An http or https address one was asked for opens in the same view;
 *   - every permission is refused;
 *   - a download asks the person first. On yes it is saved in the downloads folder under a name nothing there has.
 *
 * WHAT IT DOES NOT CLOSE: DNS REBINDING. A name the page asks for may be answered with 127.0.0.1, and the request then
 * reaches this computer. The rules here read the address as written. Electron's webRequest says nothing of the address
 * a name was resolved to before a reply reaches the page, so the window cannot refuse it there. The fix is on the
 * server, which can refuse a request whose Host header is not its own.
 *
 * IT IMPORTS NO ELECTRON, so a test can stand the session and the contents in and ask each rule directly. It imports
 * nothing of Node's either, because the office page reads theAddressMeant and whyTheAddressIsRefused from it too.
 */

/**
 * THE WEB PAGE'S OWN SESSION. `persist:` keeps its cookies and storage on disk, in the window's own data folder,
 * apart from the office's.
 */
export const THE_WEB_PAGES_PARTITION = 'persist:web-page'

/** Where the page is drawn: in the office page's place, or in a column on its left or its right. */
export const THE_PLACES = Object.freeze(/** @type {const} */ (['body', 'left', 'right']))
/** @typedef {typeof THE_PLACES[number]} Place */

/** The view's preferences. No preload key at all, so nothing of the window's is ever loaded into the page. */
export function theWebPagesPreferences() {
  return {
    partition: THE_WEB_PAGES_PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
  }
}

// ------------------------------------------------------------------------------------------ the addresses

/**
 * WHAT A PERSON TYPED, AS AN ADDRESS. A web address is kept as typed. Words with no scheme are read as a name on the
 * web, so `example.com` is `https://example.com/`. A scheme the window refuses is kept too, so the refusal names it
 * rather than a made-up https address. Null when the words make no address.
 *
 * @param {string} typed
 * @returns {string | null}
 */
export function theAddressMeant(typed) {
  const words = typed.trim()
  if (words === '') return null
  const hasAScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(words) || /^(about|blob|data|file|javascript|view-source|chrome|devtools|mailto):/i.test(words)
  try {
    return new URL(hasAScheme ? words : `https://${words}`).href
  } catch {
    return null
  }
}

/** The schemes the page may be navigated to. */
const THE_PAGES_SCHEMES = Object.freeze(['http:', 'https:'])
/** The schemes the page may ask for: its own, and its WebSocket's. */
const THE_REQUESTS_SCHEMES = Object.freeze(['http:', 'https:', 'ws:', 'wss:'])

/** @typedef {'not-an-address' | 'scheme' | 'loopback' | 'the-office'} Refusal */

/**
 * WHY THE PAGE MAY NOT GO TO THIS ADDRESS, or null when it may. One rule for every navigation, redirect, frame and new
 * window, and for what the office page asks to open, so no way into the page is checked by another reading.
 *
 *   - `not-an-address`: the words do not parse as an address;
 *   - `scheme`: anything but http and https, so `file:`, `data:`, `javascript:`, `mailto:` and the browser's own pages;
 *   - `loopback`: 127.0.0.0/8, ::1, localhost and every name under .localhost, which the browser sends to this
 *     computer itself. 0.0.0.0/8 and :: are refused too, because a connection to them reaches this computer, and so is
 *     an IPv6 form of an IPv4 loopback address;
 *   - `the-office`: the office's own host and port, in any scheme.
 *
 * The browser's parser has already written every IPv4 form (`2130706433`, `0x7f.1`, `127.1`) as four decimal numbers,
 * and every IPv6 one in its short form, so these are compared as the browser will send them.
 *
 * @param {string} address
 * @param {string | null} office the office's address, or null while the window has none
 * @returns {Refusal | null}
 */
export function whyTheAddressIsRefused(address, office) {
  return refused(address, office, THE_PAGES_SCHEMES)
}

/**
 * WHY THE PAGE MAY NOT ASK FOR THIS, or null when it may: the rule of whyTheAddressIsRefused, with a page's WebSocket
 * (ws: and wss:) taken too. A WebSocket is never navigated to, so only a request can name one. The host rules are the
 * same, so the office's own stream doors on loopback stay refused.
 *
 * @param {string} address
 * @param {string | null} office
 * @returns {Refusal | null}
 */
export function whyARequestIsRefused(address, office) {
  return refused(address, office, THE_REQUESTS_SCHEMES)
}

/**
 * @param {string} address
 * @param {string | null} office
 * @param {readonly string[]} schemes
 * @returns {Refusal | null}
 */
function refused(address, office, schemes) {
  /** @type {URL} */
  let url
  try {
    url = new URL(address)
  } catch {
    return 'not-an-address'
  }
  if (!schemes.includes(url.protocol)) return 'scheme'
  if (office !== null && url.host === hostOf(office)) return 'the-office'
  if (reachesThisComputer(url.hostname)) return 'loopback'
  return null
}

/** @param {string} address */
function hostOf(address) {
  try {
    return new URL(address).host
  } catch {
    return null
  }
}

/** @param {string} address */
function originOf(address) {
  try {
    return new URL(address).origin
  } catch {
    return null
  }
}

/**
 * Whether a host, as the browser's parser wrote it, is this computer itself.
 *
 * @param {string} hostname
 */
function reachesThisComputer(hostname) {
  const host = hostname.toLowerCase().replace(/\.+$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const four = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (four !== null) return aLocalFour(Number(four[1]))
  if (host.startsWith('[') && host.endsWith(']')) {
    const groups = theSixteenBitGroups(host.slice(1, -1))
    if (groups === null) return false
    /** @param {number} n */
    const zeroesUpTo = (n) => groups.slice(0, n).every((g) => g === 0)
    // :: and ::1.
    if (zeroesUpTo(7) && (groups[7] === 0 || groups[7] === 1)) return true
    // An IPv4 address written as IPv6: mapped (::ffff:a.b.c.d), or the old compatible form (::a.b.c.d).
    if (zeroesUpTo(5) && (groups[5] === 0xffff || groups[5] === 0)) return aLocalFour((groups[6] ?? 0) >> 8)
  }
  return false
}

/** 127.0.0.0/8 is loopback; 0.0.0.0/8 reaches this computer as well. Read from the first of the four numbers. */
/** @param {number} first */
const aLocalFour = (first) => first === 127 || first === 0

/**
 * The eight groups of an IPv6 address the browser has written, or null for anything else. The browser writes the
 * last 32 bits of a mapped address in hex (`::ffff:7f00:1`), so dotted forms need not be read.
 *
 * @param {string} written
 * @returns {number[] | null}
 */
function theSixteenBitGroups(written) {
  const halves = written.split('::')
  if (halves.length > 2) return null
  /** @param {string} part @returns {number[]} */
  const read = (part) => (part === '' ? [] : part.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)))
  const head = read(halves[0] ?? '')
  const tail = halves.length === 2 ? read(halves[1] ?? '') : []
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const groups = [...head, .../** @type {number[]} */ (Array(missing).fill(0)), ...tail]
  return groups.some((g) => Number.isNaN(g)) ? null : groups
}

// ------------------------------------------------------------------------------------------ the session

/**
 * @typedef {{
 *   getURL(): string,
 *   getFilename(): string,
 *   setSavePath(path: string): void,
 *   pause(): void,
 *   resume(): void,
 *   cancel(): void,
 *   once(event: 'done', listener: (event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void): unknown,
 * }} ADownload Electron's DownloadItem, as far as this module uses it.
 *
 * @typedef {{
 *   setUserAgent(userAgent: string): void,
 *   webRequest: { onBeforeRequest(listener: (details: { url: string, resourceType?: string }, callback: (answer: { cancel: boolean }) => void) => void): void },
 *   setPermissionRequestHandler(handler: (contents: unknown, permission: string, callback: (granted: boolean) => void) => void): void,
 *   setPermissionCheckHandler(handler: () => boolean): void,
 *   setDevicePermissionHandler(handler: () => boolean): void,
 *   on(event: 'will-download', listener: (event: unknown, item: ADownload) => void): unknown,
 * }} ASession Electron's Session, as far as this module uses it.
 *
 * @typedef {{
 *   loadURL(url: string): Promise<void>,
 *   setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void,
 *   on(event: 'will-navigate' | 'will-redirect' | 'will-frame-navigate', listener: (event: { url: string, preventDefault(): void }) => void): unknown,
 * }} AWebContents Electron's WebContents, as far as this module uses it.
 *
 * @typedef {{ id: number, name: string, from: string }} AskedDownload
 *
 * @typedef {(
 *   | { refused: Refusal, address: string }
 *   | { download: 'saved', name: string, path: string }
 *   | { download: 'not-saved' | 'interrupted', name: string }
 *   | { failed: string, address: string }
 * )} Said What the bar is told. A refusal names the address and why; a download names its file; a page that did not
 *   load names the browser's own reason, which main.mjs reads from the view.
 */

/**
 * PUT THE SESSION'S RULES ON THE VIEW'S SESSION: its user agent, its requests, its permissions and its downloads.
 * Electron's own session in the window, a stand-in in a test. Called once for the session, since every view of the
 * partition shares it.
 *
 * A refused request is cancelled, and the bar is told when it was the page itself. A download is saved only when the
 * person says yes, under a name nothing in the downloads folder has.
 *
 * @param {{
 *   session: ASession,
 *   office: () => string | null,
 *   userAgent: string,
 *   downloads: { isTaken: (name: string) => boolean, pathOf: (name: string) => string, ask: (asked: AskedDownload) => Promise<boolean> },
 *   tell: (said: Said) => void,
 * }} given `userAgent` is the session's own, already without the window's marks.
 */
export function keepTheSessionOut({ session, office, userAgent, downloads, tell }) {
  session.setUserAgent(userAgent)
  session.webRequest.onBeforeRequest((details, callback) => {
    const why = whyARequestIsRefused(details.url, office())
    if (why !== null && details.resourceType === 'mainFrame') tell({ refused: why, address: details.url })
    callback({ cancel: why !== null })
  })
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.setDevicePermissionHandler(() => false)
  let downloadsAsked = 0
  session.on('will-download', (_event, item) => {
    // The save path can only be set here, before this listener returns. The download waits, paused, for the answer.
    const name = aFreeName(item.getFilename(), downloads.isTaken)
    const path = downloads.pathOf(name)
    item.setSavePath(path)
    item.pause()
    item.once('done', (_done, state) => {
      tell(state === 'completed' ? { download: 'saved', name, path } : { download: state === 'cancelled' ? 'not-saved' : 'interrupted', name })
    })
    downloads.ask({ id: ++downloadsAsked, name, from: item.getURL() }).then(
      (yes) => (yes ? item.resume() : item.cancel()),
      () => item.cancel(),
    )
  })
}

/**
 * PUT THE VIEW'S OWN RULES ON ITS CONTENTS: where it may navigate and redirect, its frames, and its new windows.
 * Called for each view.
 *
 * A refused navigation or redirect is stopped before it starts, and the bar is told. A refused frame is stopped and
 * the bar is not told, since the person asked for the page and not for its frame. No new window is opened. An address
 * one was asked for opens in the same view when the rules allow it.
 *
 * @param {{ contents: AWebContents, office: () => string | null, tell: (said: Said) => void }} given
 */
export function keepTheContentsOut({ contents, office, tell }) {
  /** @param {{ url: string, preventDefault(): void }} event */
  const stopARefused = (event) => {
    const why = whyTheAddressIsRefused(event.url, office())
    if (why === null) return
    event.preventDefault()
    tell({ refused: why, address: event.url })
  }
  contents.on('will-navigate', stopARefused)
  contents.on('will-redirect', stopARefused)
  contents.on('will-frame-navigate', (event) => {
    if (whyTheAddressIsRefused(event.url, office()) !== null) event.preventDefault()
  })
  contents.setWindowOpenHandler(({ url }) => {
    const why = whyTheAddressIsRefused(url, office())
    if (why === null) void contents.loadURL(url).catch(() => undefined)
    else tell({ refused: why, address: url })
    return { action: 'deny' }
  })
}

/**
 * A NAME IN THE DOWNLOADS FOLDER THAT NOTHING THERE HAS. The page's suggested name, without any folder in it, and with
 * ` (2)`, ` (3)` and so on before its extension while that name is taken. A name that is empty or only dots is
 * `download`.
 *
 * @param {string} suggested
 * @param {(name: string) => boolean} isTaken
 */
export function aFreeName(suggested, isTaken) {
  // eslint-disable-next-line no-control-regex
  const plain = (suggested.split(/[/\\]/).pop() ?? '').replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim()
  const name = /^\.*$/.test(plain) ? 'download' : plain
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot) : ''
  const stem = name.slice(0, name.length - extension.length)
  for (let n = 1; ; n++) {
    const free = n === 1 ? name : `${stem} (${String(n)})${extension}`
    if (!isTaken(free)) return free
  }
}

// ------------------------------------------------------------------------------------------ the bridge

/**
 * @typedef {{
 *   sender: unknown,
 *   senderFrame: { url: string, parent: unknown, processId: number, routingId: number } | null,
 * }} ABridgeEvent An ipcMain event, as far as the checks read it.
 *
 * @typedef {{ mainFrame: { processId: number, routingId: number } }} TheOfficesContents
 */

/**
 * WHETHER A BRIDGE CALL CAME FROM THE OFFICE PAGE: the window's own contents, from its main frame, on the office's own
 * origin. A frame inside the office page is refused, and so is any other page, the web page's view among them.
 *
 * @param {ABridgeEvent} event
 * @param {TheOfficesContents | null} officesContents the window's own webContents, or null while it has none
 * @param {string | null} office the office's address, or null while the window has none
 */
export function fromTheOfficePage(event, officesContents, office) {
  if (officesContents === null || office === null || event.sender !== officesContents) return false
  const frame = event.senderFrame
  if (frame === null || frame.parent !== null) return false
  if (frame.processId !== officesContents.mainFrame.processId || frame.routingId !== officesContents.mainFrame.routingId) return false
  const origin = originOf(office)
  return origin !== null && originOf(frame.url) === origin
}

/**
 * WHAT THE OFFICE PAGE ASKED TO OPEN, checked: an address the page may go to, and one of the three places.
 * Null when either is refused, so the window opens nothing.
 *
 * @param {unknown} asked
 * @param {string | null} office
 * @returns {{ address: string, place: Place } | null}
 */
export function theOpeningAsked(asked, office) {
  if (typeof asked !== 'object' || asked === null) return null
  const { address, place } = /** @type {{ address?: unknown, place?: unknown }} */ (asked)
  if (typeof address !== 'string' || address.length > 8192 || whyTheAddressIsRefused(address, office) !== null) return null
  const where = thePlaceAsked(place)
  return where === null ? null : { address: new URL(address).href, place: where }
}

/**
 * @param {unknown} place
 * @returns {Place | null}
 */
export function thePlaceAsked(place) {
  return THE_PLACES.find((one) => one === place) ?? null
}

/**
 * THE RECTANGLE THE OFFICE PAGE ASKED FOR, in the window's own pixels, or null when it is refused. The page measures
 * in its own pixels, which are the window's times its zoom. Each side must be a finite number, the box at least one
 * pixel each way, and wholly inside the window's content area. A pixel over each edge is allowed for the rounding.
 *
 * @param {unknown} asked
 * @param {{ width: number, height: number, zoom: number }} inside the window's content size, and the office page's zoom
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function theRectangleAsked(asked, inside) {
  if (typeof asked !== 'object' || asked === null) return null
  const { x, y, width, height } = /** @type {Record<string, unknown>} */ (asked)
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null
  if (![x, y, width, height].every((side) => Number.isFinite(side))) return null
  const left = Math.round(x * inside.zoom)
  const top = Math.round(y * inside.zoom)
  const wide = Math.round(width * inside.zoom)
  const high = Math.round(height * inside.zoom)
  if (wide < 1 || high < 1 || left < -1 || top < -1 || left + wide > inside.width + 1 || top + high > inside.height + 1) return null
  const x0 = Math.max(0, left)
  const y0 = Math.max(0, top)
  return { x: x0, y: y0, width: Math.min(inside.width, left + wide) - x0, height: Math.min(inside.height, top + high) - y0 }
}

/**
 * THE ANSWER THE OFFICE PAGE GAVE A DOWNLOAD'S QUESTION, checked: the download's id, and yes or no. Null when either
 * is not in its shape, so no download is answered.
 *
 * @param {unknown} answer
 * @returns {{ id: number, save: boolean } | null}
 */
export function theDownloadAnswerAsked(answer) {
  if (typeof answer !== 'object' || answer === null) return null
  const { id, save } = /** @type {{ id?: unknown, save?: unknown }} */ (answer)
  if (typeof id !== 'number' || !Number.isInteger(id) || typeof save !== 'boolean') return null
  return { id, save }
}

/**
 * THE HTTPS ADDRESS THE OFFICE PAGE ASKED THE SYSTEM'S BROWSER TO OPEN (round 242), checked: a string of at most 8192
 * characters that parses as an https address. Null for anything else, so nothing is opened. The page asks it for an
 * account sign-in's address, which the server has already checked against the tool's declaration
 * (src/server/lib/setting-up-an-agent-tool.ts); this check is the window's own, and opens only https.
 *
 * @param {unknown} asked
 * @returns {string | null}
 */
export function theHttpsAddressAsked(asked) {
  if (typeof asked !== 'string' || asked.length > 8192) return null
  /** @type {URL} */
  let address
  try {
    address = new URL(asked)
  } catch {
    return null
  }
  return address.protocol === 'https:' ? address.href : null
}

// ------------------------------------------------------------------------------------------ the kept page

/** The file in the window's own data folder that keeps the page's address and place over a restart. */
export const THE_KEPT_PAGES_FILE = 'web-page.json'

/**
 * THE PAGE THE FILE KEPT, checked again as if it were asked for now, or null when there is none to open. A file
 * that cannot be read, or holds an address the rules refuse, opens nothing.
 *
 * @param {string | null} text the file's text, or null when there is no file
 * @param {string | null} office
 */
export function theKeptPage(text, office) {
  if (text === null) return null
  try {
    return theOpeningAsked(JSON.parse(text), office)
  } catch {
    return null
  }
}

/**
 * @param {{ address: string, place: Place }} page
 */
export function theKeptPagesText({ address, place }) {
  return `${JSON.stringify({ address, place }, null, 2)}\n`
}
