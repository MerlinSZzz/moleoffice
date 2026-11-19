// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE AGENT'S TMUX PANE, SHOWN IN A TERMINAL THE OFFICE HOLDS. Wave 13u, round 10, way B: a secretary's page shows
 * its own tmux pane.
 *
 * The holder runs this program in a terminal: `node tmux-pane-view.mjs --session <name> --pane <%id> --view <name>`.
 * It shows what the agent's pane shows and sends what the person types to that pane. It never changes the owner's
 * own tmux client, by three choices:
 *
 *   - IT WATCHES THROUGH A SESSION OF ITS OWN, grouped with the owner's (`new-session -d -t <session> -s <view>`).
 *     A grouped session shares the windows and has its own current window, so nothing here can switch the person's.
 *   - IT ATTACHES IN CONTROL MODE WITH `-f ignore-size`, so this client's size is never counted in a window's size,
 *     and the person's panes are not resized when this terminal is drawn larger or smaller. Measured with tmux 3.4:
 *     a control-mode client that never sets its size is not counted even without the flag; the flag keeps it so.
 *   - IT SENDS ONLY `send-keys -t <pane> -H`, and no command that selects, resizes or switches anything.
 *
 * WHAT IS SHOWN. First the pane's screen as it is (`capture-pane -p -e`) with its cursor, then every `%output` line
 * tmux sends for this pane, decoded from tmux's octal escapes into the bytes the pane's program wrote. Output of every
 * other pane is dropped. Output written between the capture and the attach is missed until the pane draws it again.
 *
 * WHEN IT ENDS. The pane closing, tmux letting the client go, or this terminal being closed: each ends the view with
 * one sentence, and the view's own session is killed. The owner's session and the agent's pane are left as they are.
 *
 * MEASURED against a real tmux 3.4 (tests/the-pane-view-moves-nothing-in-a-real-tmux.test.ts): the owner's client keeps
 * its size, its window and each window's active pane. What the office asks tmux is checked against a stand-in tmux in
 * tests/an-agents-tmux-pane-is-watched-without-moving-the-persons.test.ts.
 *
 * Plain JavaScript, so the holder runs it with node and no loader.
 */

import { execFile, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// THE VARIABLE THAT RUNS THE APP'S OWN PROGRAM AS NODE is removed here at the start, as src/config/settings.mjs removes it
// from every office program that imports it. This file imports none of the office's code, so it removes it itself, and
// no tmux command it runs is given it.
delete process.env.ELECTRON_RUN_AS_NODE

/** How often the view asks whether the pane is still there. */
const THE_PANE_IS_LOOKED_FOR_EVERY_MS = 2_000
/** How long one tmux command may take before the view says it did not answer. */
const ONE_COMMAND_MS = 3_000

const out = (text) => process.stdout.write(text)
const say = (line) => out(`\r\n${line}\r\n`)

/** The value after a flag, or null. */
function theFlag(name) {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

/** Run one tmux command and answer its output, or the error tmux gave. */
function tmux(args) {
  return new Promise((done) => {
    execFile('tmux', args, { timeout: ONE_COMMAND_MS, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err === null) done({ ok: true, out: stdout })
      else done({ ok: false, missing: /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT', out: String(stderr || err.message).trim() })
    })
  })
}

/**
 * THE BYTES OF ONE `%output` VALUE. tmux writes every byte below 32, and the backslash, as a backslash and three
 * octal digits; every other byte is as the program wrote it.
 *
 * @param {string} value
 * @returns {Buffer}
 */
export function theBytesOfAnOutput(value) {
  const raw = Buffer.from(value, 'utf8')
  const bytes = []
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === 0x5c && i + 3 < raw.length && /^[0-7]{3}$/.test(raw.subarray(i + 1, i + 4).toString('latin1'))) {
      bytes.push(parseInt(raw.subarray(i + 1, i + 4).toString('latin1'), 8))
      i += 3
    } else {
      bytes.push(raw[i])
    }
  }
  return Buffer.from(bytes)
}

/** The `send-keys` line that types these bytes into the pane. */
export function theKeysLine(pane, bytes) {
  return `send-keys -t ${pane} -H ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}\n`
}

async function main() {
  const session = theFlag('--session')
  const pane = theFlag('--pane')
  const view = theFlag('--view')
  if (session === null || pane === null || view === null || !/^%\d+$/.test(pane)) {
    say('This view needs --session, --pane (a pane id such as %7) and --view. Nothing is shown.')
    process.exit(2)
  }

  const there = await tmux(['display-message', '-p', '-t', pane, '#{pane_id} #{cursor_x} #{cursor_y}'])
  if (!there.ok) {
    say(there.missing ? 'tmux is not on the PATH this terminal has, so the agent\'s pane cannot be shown.' : `The agent's tmux pane ${pane} is not there now. tmux said: ${there.out}`)
    process.exit(2)
  }
  const made = await tmux(['new-session', '-d', '-t', session, '-s', view])
  if (!made.ok) {
    say(`tmux did not make the view's own session, so nothing is shown. tmux said: ${made.out}`)
    process.exit(2)
  }

  let ending = false
  /** @type {import('node:child_process').ChildProcess | null} */
  let client = null
  const end = async (sentence, code) => {
    if (ending) return
    ending = true
    if (sentence !== null) say(sentence)
    if (client !== null && client.exitCode === null) client.kill('SIGTERM')
    // ONLY THE VIEW'S OWN SESSION IS KILLED. The windows it shared stay in the owner's session.
    await tmux(['kill-session', '-t', view])
    process.exit(code)
  }
  for (const signal of ['SIGHUP', 'SIGTERM', 'SIGINT']) process.on(signal, () => void end(null, 0))

  const screen = await tmux(['capture-pane', '-p', '-e', '-t', pane])
  const [, x, y] = there.out.trim().split(' ')
  out('\x1b[H\x1b[2J')
  if (screen.ok) out(screen.out.replace(/\n$/, '').split('\n').join('\r\n'))
  if (/^\d+$/.test(x ?? '') && /^\d+$/.test(y ?? '')) out(`\x1b[${String(Number(y) + 1)};${String(Number(x) + 1)}H`)

  client = spawn('tmux', ['-C', 'attach-session', '-f', 'ignore-size', '-t', view], { stdio: ['pipe', 'pipe', 'pipe'] })
  let pending = ''
  client.stdout.setEncoding('utf8')
  client.stdout.on('data', (chunk) => {
    pending += chunk
    let at
    while ((at = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, at)
      pending = pending.slice(at + 1)
      if (line.startsWith(`%output ${pane} `)) out(theBytesOfAnOutput(line.slice(`%output ${pane} `.length)))
      else if (line.startsWith('%exit')) void end(`tmux let this view go${line.length > 5 ? ` (${line.slice(6)})` : ''}. The agent's pane is not shown now.`, 0)
    }
  })
  client.on('exit', () => void end('The view\'s tmux client ended. The agent\'s pane is not shown now.', 0))

  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.on('data', (bytes) => {
    if (!ending && client !== null && client.stdin !== null) client.stdin.write(theKeysLine(pane, bytes))
  })

  const look = setInterval(async () => {
    const still = await tmux(['display-message', '-p', '-t', pane, '#{pane_id}'])
    if (!still.ok || still.out.trim() !== pane) {
      clearInterval(look)
      void end(`The agent's tmux pane ${pane} has closed. Its program may have ended.`, 0)
    }
  }, THE_PANE_IS_LOOKED_FOR_EVERY_MS)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
