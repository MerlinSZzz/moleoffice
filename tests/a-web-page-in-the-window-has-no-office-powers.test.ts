// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WEB PAGE IN THE WINDOW HAS NO OFFICE POWERS (wave 13t, package OT-B).
 *
 * src/desktop/the-web-page.mjs works out every rule that keeps the window's web page away from the office, apart
 * from Electron, so this test asks each rule directly and stands the view's session and contents in:
 *
 *   1. the view's preferences: no preload, the sandbox, context isolation, no Node, and a session of its own kept
 *      on disk;
 *   2. where the page may go: http and https only, never this computer and never the office, however the address is
 *      written;
 *   3. what the page may ask for: the same, with its WebSocket (ws: and wss:) to a public host let through, and a
 *      WebSocket to the office or to this computer refused;
 *   4. what a person's words are read as;
 *   5. the session's user agent carries none of the window's marks;
 *   6. a download's name stays in the downloads folder and takes nothing already there;
 *   7. the session's rules on a stand-in session: its user agent, its requests, its permissions and its downloads;
 *   8. the view's rules on stand-in contents: its navigations, redirects, frames and new windows.
 *
 * The real window is not started here. A page on the internet cannot be reached from a test, and a page on this
 * computer is one the rules refuse, so a window test would have to open a door the window does not have.
 */

import { describe, expect, it } from 'vitest'

import { THE_SYSTEM_MARK, THE_WINDOW_MARK, isTheWindow, withoutTheWindowsMarks } from '../src/config/the-window-mark.mjs'
import {
  THE_WEB_PAGES_PARTITION,
  aFreeName,
  keepTheContentsOut,
  keepTheSessionOut,
  theAddressMeant,
  theWebPagesPreferences,
  whyARequestIsRefused,
  whyTheAddressIsRefused,
} from '../src/desktop/the-web-page.mjs'
import type { AskedDownload, Said } from '../src/desktop/the-web-page.mjs'

/** A made-up office on another machine of the network, so a refusal of it is not a refusal of loopback. */
const AN_OFFICE = 'http://192.168.1.20:28787'
/** A made-up office on this computer, as the window usually has it. */
const AN_OFFICE_HERE = 'http://127.0.0.1:28787'

/** Addresses the page may go to. */
const ALLOWED = [
  'https://example.com/',
  'http://example.com:8080/a/path?q=1#part',
  'https://example.com./',
  'http://128.0.0.1/',
  'http://126.255.255.255/',
  'http://1.0.0.0/',
  'http://[2001:db8::1]/',
  'http://[::ffff:8.8.8.8]/',
  'http://192.168.1.20:8080/',
]

/** Addresses of this computer, in the forms a page could write them. */
const THIS_COMPUTER = [
  'http://127.0.0.1/',
  'http://127.1/',
  'http://2130706433/',
  'http://0x7f.0.0.1/',
  'http://0177.0.0.1/',
  'https://127.255.255.254:9/',
  'http://localhost/',
  'http://LOCALHOST./',
  'http://localhost:3000/',
  'http://a.localhost/',
  'http://a.b.localhost./',
  'http://0.0.0.0/',
  'http://0/',
  'http://0.1.2.3/',
  'http://[::1]/',
  'http://[0:0:0:0:0:0:0:1]/',
  'http://[::]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:7f00:1]/',
  'http://[::127.0.0.1]/',
  'http://[::ffff:0.0.0.0]/',
]

/** Addresses in a scheme the page may not be navigated to. */
const OTHER_SCHEMES = [
  'file:///etc/hosts',
  'data:text/html,<p>made-up</p>',
  'javascript:alert(1)',
  'about:blank',
  'blob:https://example.com/0f0f0f0f-0000-4000-8000-000000000000',
  'chrome://settings/',
  'devtools://devtools/bundled/inspector.html',
  'view-source:https://example.com/',
  'mailto:someone@example.com',
  'ftp://example.com/',
  'ws://example.com/socket',
  'wss://example.com/socket',
]

describe('1. the view', () => {
  it('has no preload, runs in the sandbox with context isolation and no Node, in a session of its own kept on disk', () => {
    const preferences = theWebPagesPreferences()
    expect(preferences).not.toHaveProperty('preload')
    expect(preferences).toEqual({
      partition: THE_WEB_PAGES_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
    })
    expect(THE_WEB_PAGES_PARTITION.startsWith('persist:'), 'a partition that is not persist: forgets its logins at a restart').toBe(true)
    expect(THE_WEB_PAGES_PARTITION.slice('persist:'.length), 'the default session is the office page’s own').not.toBe('')
  })
})

describe('2. where the page may go', () => {
  for (const address of ALLOWED) {
    it(`goes to ${address}`, () => {
      expect(whyTheAddressIsRefused(address, AN_OFFICE)).toBeNull()
      expect(whyTheAddressIsRefused(address, null)).toBeNull()
    })
  }

  for (const address of THIS_COMPUTER) {
    it(`never goes to ${address}, which is this computer`, () => {
      expect(whyTheAddressIsRefused(address, AN_OFFICE)).toBe('loopback')
      expect(whyTheAddressIsRefused(address, null), 'while the window has no office address yet').toBe('loopback')
    })
  }

  for (const address of OTHER_SCHEMES) {
    it(`never goes to ${address}, whose scheme is not http or https`, () => {
      expect(whyTheAddressIsRefused(address, AN_OFFICE)).toBe('scheme')
    })
  }

  it('never goes to the office, in either scheme, and goes to another port of the same machine', () => {
    expect(whyTheAddressIsRefused(`${AN_OFFICE}/`, AN_OFFICE)).toBe('the-office')
    expect(whyTheAddressIsRefused(`${AN_OFFICE}/api/records?kind=report`, AN_OFFICE)).toBe('the-office')
    expect(whyTheAddressIsRefused('https://192.168.1.20:28787/', AN_OFFICE)).toBe('the-office')
    expect(whyTheAddressIsRefused('http://192.168.1.20:28788/', AN_OFFICE)).toBeNull()
    expect(whyTheAddressIsRefused(`${AN_OFFICE_HERE}/`, AN_OFFICE_HERE), 'the office on this computer is named as the office').toBe('the-office')
    expect(whyTheAddressIsRefused('http://127.0.0.1:28788/', AN_OFFICE_HERE)).toBe('loopback')
  })

  it('refuses words that are not an address', () => {
    expect(whyTheAddressIsRefused('not an address', AN_OFFICE)).toBe('not-an-address')
    expect(whyTheAddressIsRefused('', AN_OFFICE)).toBe('not-an-address')
    expect(whyTheAddressIsRefused('http://exa mple.com/', AN_OFFICE)).toBe('not-an-address')
  })
})

describe('3. what the page may ask for', () => {
  it('lets a WebSocket to a public host through, in ws: and in wss:', () => {
    expect(whyARequestIsRefused('ws://example.com/socket', AN_OFFICE)).toBeNull()
    expect(whyARequestIsRefused('wss://example.com/socket', AN_OFFICE)).toBeNull()
    expect(whyARequestIsRefused('wss://example.com:8443/socket?room=1', AN_OFFICE_HERE)).toBeNull()
    expect(whyARequestIsRefused('ws://[2001:db8::1]/socket', AN_OFFICE)).toBeNull()
  })

  it('refuses a WebSocket to the office’s own address', () => {
    expect(whyARequestIsRefused('ws://192.168.1.20:28787/api/stream', AN_OFFICE)).toBe('the-office')
    expect(whyARequestIsRefused('wss://192.168.1.20:28787/api/stream', AN_OFFICE)).toBe('the-office')
    expect(whyARequestIsRefused('ws://127.0.0.1:28787/api/stream', AN_OFFICE_HERE)).toBe('the-office')
  })

  it('refuses a WebSocket to this computer, in every form a page could write', () => {
    for (const address of THIS_COMPUTER) {
      for (const scheme of ['ws:', 'wss:']) {
        const socket = address.replace(/^https?:/, scheme)
        expect(whyARequestIsRefused(socket, AN_OFFICE), socket).toBe('loopback')
      }
    }
  })

  it('asks the same of http and https as navigation does', () => {
    for (const address of [...ALLOWED, ...THIS_COMPUTER, `${AN_OFFICE}/`, 'not an address']) {
      expect(whyARequestIsRefused(address, AN_OFFICE), address).toBe(whyTheAddressIsRefused(address, AN_OFFICE))
    }
  })

  it('refuses every other scheme', () => {
    for (const address of OTHER_SCHEMES.filter((one) => !/^wss?:/.test(one))) {
      expect(whyARequestIsRefused(address, AN_OFFICE), address).toBe('scheme')
    }
  })
})

describe('4. what a person’s words are read as', () => {
  it('reads words with no scheme as a name on the web, over https', () => {
    expect(theAddressMeant('example.com')).toBe('https://example.com/')
    expect(theAddressMeant('  example.com:8080/a  ')).toBe('https://example.com:8080/a')
    expect(theAddressMeant('localhost:3000')).toBe('https://localhost:3000/')
  })

  it('keeps an address as written, a scheme the window refuses among them, so the refusal names it', () => {
    expect(theAddressMeant('http://example.com')).toBe('http://example.com/')
    expect(theAddressMeant('https://example.com/a b')).toBe('https://example.com/a%20b')
    expect(theAddressMeant('file:///etc/hosts')).toBe('file:///etc/hosts')
    expect(theAddressMeant('javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(whyTheAddressIsRefused(theAddressMeant('file:///etc/hosts') ?? '', AN_OFFICE)).toBe('scheme')
  })

  it('makes no address of no words, or of words that are not one', () => {
    expect(theAddressMeant('')).toBeNull()
    expect(theAddressMeant('   ')).toBeNull()
    expect(theAddressMeant('exa mple.com')).toBeNull()
  })
})

describe('5. the session’s user agent', () => {
  it('carries none of the window’s marks, so the page cannot pass for the window', () => {
    const theWindows = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Electron/44.5.1 Safari/537.36 ${THE_WINDOW_MARK} ${THE_SYSTEM_MARK}linux`
    expect(isTheWindow(theWindows), 'the stand-in is the window’s').toBe(true)
    const thePages = withoutTheWindowsMarks(theWindows)
    expect(isTheWindow(thePages)).toBe(false)
    expect(thePages).not.toContain(THE_WINDOW_MARK)
    expect(thePages).not.toContain(THE_SYSTEM_MARK)
    expect(thePages).toBe('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Electron/44.5.1 Safari/537.36')
    expect(withoutTheWindowsMarks(thePages), 'a user agent with no marks is kept as it is').toBe(thePages)
  })
})

describe('6. a download’s name', () => {
  const nothingTaken = () => false

  it('is the page’s own name while nothing in the folder has it, and numbered while one does', () => {
    expect(aFreeName('report.pdf', nothingTaken)).toBe('report.pdf')
    const taken = new Set(['report.pdf'])
    expect(aFreeName('report.pdf', (name) => taken.has(name))).toBe('report (2).pdf')
    taken.add('report (2).pdf')
    expect(aFreeName('report.pdf', (name) => taken.has(name))).toBe('report (3).pdf')
    expect(aFreeName('.profile', (name) => name === '.profile'), 'a name that starts with its dot has no extension').toBe('.profile (2)')
  })

  it('never names a folder, so the file stays in the downloads folder', () => {
    expect(aFreeName('../../.ssh/authorized_keys', nothingTaken)).toBe('authorized_keys')
    expect(aFreeName('C:\\Windows\\System32\\made-up.exe', nothingTaken)).toBe('made-up.exe')
    expect(aFreeName('a/b/', nothingTaken)).toBe('download')
  })

  it('takes no character a folder cannot hold, and no empty name', () => {
    expect(aFreeName('a<b>:c"d|e?f*g.txt', nothingTaken)).toBe('a_b__c_d_e_f_g.txt')
    expect(aFreeName('line\nbreak\u0000.txt', nothingTaken)).toBe('line_break_.txt')
    expect(aFreeName('', nothingTaken)).toBe('download')
    expect(aFreeName('..', nothingTaken)).toBe('download')
    expect(aFreeName('   ', nothingTaken)).toBe('download')
    expect(aFreeName('', (name) => name === 'download')).toBe('download (2)')
  })
})

// ------------------------------------------------------------------------------------------ stand-ins

type Answer = { cancel: boolean }
type ARequest = (details: { url: string; resourceType?: string }, callback: (answer: Answer) => void) => void
type DoneState = 'completed' | 'cancelled' | 'interrupted'

/** Electron's Session, stood in: it keeps what the rules gave it. */
function aStandInSession() {
  const given: {
    userAgent: string | null
    request: ARequest | null
    permissionRequest: ((contents: unknown, permission: string, callback: (granted: boolean) => void) => void) | null
    permissionCheck: (() => boolean) | null
    devicePermission: (() => boolean) | null
    willDownload: ((event: unknown, item: ReturnType<typeof aStandInDownload>['item']) => void) | null
  } = { userAgent: null, request: null, permissionRequest: null, permissionCheck: null, devicePermission: null, willDownload: null }
  const session = {
    setUserAgent: (userAgent: string) => { given.userAgent = userAgent },
    webRequest: { onBeforeRequest: (listener: ARequest) => { given.request = listener } },
    setPermissionRequestHandler: (handler: NonNullable<typeof given.permissionRequest>) => { given.permissionRequest = handler },
    setPermissionCheckHandler: (handler: () => boolean) => { given.permissionCheck = handler },
    setDevicePermissionHandler: (handler: () => boolean) => { given.devicePermission = handler },
    on: (event: 'will-download', listener: NonNullable<typeof given.willDownload>) => {
      if (event === 'will-download') given.willDownload = listener
      return session
    },
  }
  /** What the session answers a request, asked as Electron asks it. */
  const ask = (url: string, resourceType: string): Answer => {
    if (given.request === null) throw new Error('no request rule was put on the session')
    let answer: Answer | null = null
    given.request({ url, resourceType }, (said) => { answer = said })
    if (answer === null) throw new Error(`the request rule did not answer ${url}`)
    return answer
  }
  return { session, given, ask }
}

/** Electron's DownloadItem, stood in: it keeps what was done to it, in order. */
function aStandInDownload(filename: string, url: string) {
  const did: string[] = []
  let done: ((event: unknown, state: DoneState) => void) | null = null
  const item = {
    getURL: () => url,
    getFilename: () => filename,
    setSavePath: (path: string) => { did.push(`save to ${path}`) },
    pause: () => { did.push('pause') },
    resume: () => { did.push('resume') },
    cancel: () => { did.push('cancel') },
    once: (event: 'done', listener: (event: unknown, state: DoneState) => void) => {
      if (event === 'done') done = listener
      return item
    },
  }
  const finish = (state: DoneState) => {
    if (done === null) throw new Error('nothing listens for the download’s end')
    done(undefined, state)
  }
  return { item, did, finish }
}

/** The session's rules put on a stand-in, with a downloads folder that holds `taken`, and every answer to a download kept. */
function theSessionsRules(options: { office?: () => string | null; taken?: string[] } = {}) {
  const standIn = aStandInSession()
  const told: Said[] = []
  const asked: AskedDownload[] = []
  const answers: { yes: (save: boolean) => void; no: (error: Error) => void }[] = []
  const taken = new Set(options.taken ?? [])
  keepTheSessionOut({
    session: standIn.session,
    office: options.office ?? (() => AN_OFFICE_HERE),
    userAgent: 'Made-up user agent with no marks',
    downloads: {
      isTaken: (name) => taken.has(name),
      pathOf: (name) => {
        taken.add(name)
        return `/made-up/Downloads/${name}`
      },
      ask: (download) => {
        asked.push(download)
        return new Promise<boolean>((resolve, reject) => { answers.push({ yes: resolve, no: reject }) })
      },
    },
    tell: (said) => { told.push(said) },
  })
  const download = (filename: string, url: string) => {
    const one = aStandInDownload(filename, url)
    if (standIn.given.willDownload === null) throw new Error('nothing listens for a download')
    standIn.given.willDownload(undefined, one.item)
    return one
  }
  return { ...standIn, told, asked, answers, download }
}

/** Let the answers already given run on. */
const aTurn = () => new Promise<void>((resolve) => { setTimeout(resolve, 0) })

describe('7. the session’s rules', () => {
  it('gives the session the user agent it was given', () => {
    const { given } = theSessionsRules()
    expect(given.userAgent).toBe('Made-up user agent with no marks')
  })

  it('lets a page and its WebSocket to a public host through, and tells the bar nothing', () => {
    const { ask, told } = theSessionsRules()
    expect(ask('https://example.com/', 'mainFrame')).toEqual({ cancel: false })
    expect(ask('https://example.com/a.js', 'script')).toEqual({ cancel: false })
    expect(ask('ws://example.com/socket', 'webSocket')).toEqual({ cancel: false })
    expect(ask('wss://example.com/socket', 'webSocket')).toEqual({ cancel: false })
    expect(told).toEqual([])
  })

  it('cancels a WebSocket to the office or to this computer', () => {
    const { ask, told } = theSessionsRules({ office: () => AN_OFFICE })
    expect(ask('ws://192.168.1.20:28787/api/stream', 'webSocket')).toEqual({ cancel: true })
    expect(ask('wss://192.168.1.20:28787/api/stream', 'webSocket')).toEqual({ cancel: true })
    expect(ask('ws://127.0.0.1:9229/', 'webSocket')).toEqual({ cancel: true })
    expect(ask('wss://localhost/', 'webSocket')).toEqual({ cancel: true })
    expect(ask('ws://[::1]:28787/', 'webSocket')).toEqual({ cancel: true })
    expect(told, 'a part of the page that is refused is not the bar’s to say').toEqual([])
  })

  it('cancels a page’s own request to the office or to this computer, and tells the bar only of the page itself', () => {
    const { ask, told } = theSessionsRules()
    expect(ask('http://127.0.0.1:28787/api/records', 'xhr')).toEqual({ cancel: true })
    expect(ask('http://localhost:5173/a.png', 'image')).toEqual({ cancel: true })
    expect(ask('file:///etc/hosts', 'subFrame')).toEqual({ cancel: true })
    expect(told).toEqual([])
    expect(ask('http://localhost:3000/', 'mainFrame')).toEqual({ cancel: true })
    expect(told).toEqual([{ refused: 'loopback', address: 'http://localhost:3000/' }])
  })

  it('reads the office’s address at each request, so an office address that changes is refused at once', () => {
    let office: string | null = null
    const { ask } = theSessionsRules({ office: () => office })
    expect(ask('ws://192.168.1.20:28787/api/stream', 'webSocket')).toEqual({ cancel: false })
    office = AN_OFFICE
    expect(ask('ws://192.168.1.20:28787/api/stream', 'webSocket')).toEqual({ cancel: true })
  })

  it('refuses every permission', () => {
    const { given } = theSessionsRules()
    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'openExternal', 'pointerLock', 'midi', 'midiSysex', 'display-capture', 'hid', 'serial', 'usb', 'window-management', 'storage-access', 'idle-detection', 'keyboardLock', 'fileSystem']) {
      const granted: boolean[] = []
      given.permissionRequest?.(undefined, permission, (one) => { granted.push(one) })
      expect(granted, permission).toEqual([false])
    }
    expect(given.permissionCheck?.()).toBe(false)
    expect(given.devicePermission?.()).toBe(false)
  })

  it('sets a download’s path in the downloads folder and pauses it before the person is asked', () => {
    const { download, asked } = theSessionsRules()
    const one = download('../made-up report.pdf', 'https://example.com/files/report.pdf')
    expect(one.did).toEqual(['save to /made-up/Downloads/made-up report.pdf', 'pause'])
    expect(asked).toEqual([{ id: 1, name: 'made-up report.pdf', from: 'https://example.com/files/report.pdf' }])
  })

  it('saves a download only on yes, and tells the bar where it is', async () => {
    const { download, answers, told } = theSessionsRules()
    const one = download('report.pdf', 'https://example.com/report.pdf')
    answers[0]?.yes(true)
    await aTurn()
    expect(one.did).toEqual(['save to /made-up/Downloads/report.pdf', 'pause', 'resume'])
    one.finish('completed')
    expect(told).toEqual([{ download: 'saved', name: 'report.pdf', path: '/made-up/Downloads/report.pdf' }])
  })

  it('saves nothing on no, and tells the bar so', async () => {
    const { download, answers, told } = theSessionsRules()
    const one = download('report.pdf', 'https://example.com/report.pdf')
    answers[0]?.yes(false)
    await aTurn()
    expect(one.did).toEqual(['save to /made-up/Downloads/report.pdf', 'pause', 'cancel'])
    one.finish('cancelled')
    expect(told).toEqual([{ download: 'not-saved', name: 'report.pdf' }])
  })

  it('saves nothing when the question fails, and says a download that stopped on its own stopped', async () => {
    const { download, answers, told } = theSessionsRules()
    const one = download('report.pdf', 'https://example.com/report.pdf')
    answers[0]?.no(new Error('the window closed the question'))
    await aTurn()
    expect(one.did).toEqual(['save to /made-up/Downloads/report.pdf', 'pause', 'cancel'])
    const two = download('other.zip', 'https://example.com/other.zip')
    answers[1]?.yes(true)
    await aTurn()
    two.finish('interrupted')
    expect(told).toEqual([{ download: 'interrupted', name: 'other.zip' }])
  })

  it('gives two downloads of one name two names, and each its own question', () => {
    const { download, asked } = theSessionsRules({ taken: ['report.pdf'] })
    const one = download('report.pdf', 'https://example.com/a/report.pdf')
    const two = download('report.pdf', 'https://example.com/b/report.pdf')
    expect(one.did[0]).toBe('save to /made-up/Downloads/report (2).pdf')
    expect(two.did[0]).toBe('save to /made-up/Downloads/report (3).pdf')
    expect(asked.map((one) => one.id)).toEqual([1, 2])
  })
})

/** Electron's WebContents, stood in: it keeps its listeners, its window-open handler and every address loaded. */
function aStandInContents() {
  type Event = { url: string; preventDefault(): void }
  const listeners = new Map<string, (event: Event) => void>()
  const loaded: string[] = []
  let openHandler: ((details: { url: string }) => { action: 'deny' }) | null = null
  const contents = {
    loadURL: (url: string) => {
      loaded.push(url)
      return Promise.resolve()
    },
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => { openHandler = handler },
    on: (event: 'will-navigate' | 'will-redirect' | 'will-frame-navigate', listener: (event: Event) => void) => {
      listeners.set(event, listener)
      return contents
    },
  }
  /** Whether the listener for `name` stopped a move to `url`. */
  const stops = (name: 'will-navigate' | 'will-redirect' | 'will-frame-navigate', url: string): boolean => {
    const listener = listeners.get(name)
    if (listener === undefined) throw new Error(`nothing listens for ${name}`)
    let stopped = false
    listener({ url, preventDefault: () => { stopped = true } })
    return stopped
  }
  const open = (url: string) => {
    if (openHandler === null) throw new Error('no window-open handler was set')
    return openHandler({ url })
  }
  return { contents, loaded, stops, open }
}

function theContentsRules() {
  const standIn = aStandInContents()
  const told: Said[] = []
  keepTheContentsOut({ contents: standIn.contents, office: () => AN_OFFICE_HERE, tell: (said) => { told.push(said) } })
  return { ...standIn, told }
}

describe('8. the view’s rules', () => {
  it('lets the page navigate and redirect to a public host, and tells the bar nothing', () => {
    const { stops, told } = theContentsRules()
    expect(stops('will-navigate', 'https://example.com/next')).toBe(false)
    expect(stops('will-redirect', 'https://www.example.com/')).toBe(false)
    expect(told).toEqual([])
  })

  it('stops a navigation or a redirect to the office, this computer or another scheme, and tells the bar why', () => {
    const { stops, told } = theContentsRules()
    expect(stops('will-navigate', 'http://127.0.0.1:28787/')).toBe(true)
    expect(stops('will-navigate', 'file:///etc/hosts')).toBe(true)
    expect(stops('will-redirect', 'http://localhost/')).toBe(true)
    expect(stops('will-redirect', 'ws://example.com/socket'), 'a WebSocket is never navigated to').toBe(true)
    expect(told).toEqual([
      { refused: 'the-office', address: 'http://127.0.0.1:28787/' },
      { refused: 'scheme', address: 'file:///etc/hosts' },
      { refused: 'loopback', address: 'http://localhost/' },
      { refused: 'scheme', address: 'ws://example.com/socket' },
    ])
  })

  it('stops a refused frame without telling the bar, and lets a public frame load', () => {
    const { stops, told } = theContentsRules()
    expect(stops('will-frame-navigate', 'http://127.0.0.1:28787/api/records')).toBe(true)
    expect(stops('will-frame-navigate', 'data:text/html,<p>made-up</p>')).toBe(true)
    expect(stops('will-frame-navigate', 'https://example.com/frame')).toBe(false)
    expect(told).toEqual([])
  })

  it('opens no new window, and opens an allowed address in the same view', () => {
    const { open, loaded, told } = theContentsRules()
    expect(open('https://example.com/popup')).toEqual({ action: 'deny' })
    expect(loaded).toEqual(['https://example.com/popup'])
    expect(told).toEqual([])
  })

  it('opens no new window and loads nothing for a refused address, and tells the bar why', () => {
    const { open, loaded, told } = theContentsRules()
    expect(open('http://127.0.0.1:9/')).toEqual({ action: 'deny' })
    expect(open('javascript:alert(1)')).toEqual({ action: 'deny' })
    expect(open('http://127.0.0.1:28787/')).toEqual({ action: 'deny' })
    expect(loaded).toEqual([])
    expect(told).toEqual([
      { refused: 'loopback', address: 'http://127.0.0.1:9/' },
      { refused: 'scheme', address: 'javascript:alert(1)' },
      { refused: 'the-office', address: 'http://127.0.0.1:28787/' },
    ])
  })
})
