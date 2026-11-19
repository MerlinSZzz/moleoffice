// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PANE VIEW, AGAINST A REAL TMUX, SHOWS THE AGENT'S PANE AND MOVES NOTHING IN THE OWNER'S OWN CLIENT.
 * Wave 13u, round 11, way B (src/config/tmux-pane-view.mjs), the way a decision chose.
 *
 * THIS NEEDS A REAL TMUX. Where `tmux -V` does not answer, every case is skipped, and its name says why.
 *
 * The tmux server is the test's own: TMUX_TMPDIR is a fresh folder under the system's temporary folder, so its socket
 * is nobody else's, and the test ends it with kill-server on that socket. The owner's client is a real one, attached in
 * a 120×40 terminal to a session `own` with two windows: `home`, which the owner is looking at, and `agent`, split in
 * two. The agent's pane is the second pane of `agent`, which is not its active pane. The view runs in a 60×15 terminal.
 *
 *   1. The view shows what the agent's pane writes.
 *   2. The owner's client keeps its size, and every window and pane keeps its size, while the view runs and after.
 *   3. The owner's client stays on the window it was on, and no window is added or taken away.
 *   4. Each window keeps its active pane, and no pane is added or taken away.
 *
 * MEASURED with tmux 3.4: a control-mode client that never sets its size is listed as `80x` with no height and is
 * not counted in a window's size, so taking `-f ignore-size` out alone changes nothing here.
 *
 * MUTATION (after a control run; the round's report has the runs): the plain attach put back, so the view runs
 * `tmux attach-session -t own ; select-window -t <pane> ; select-pane -t <pane>` as an ordinary client in its
 * terminal. Measured: the windows of `agent` go to 60×14, the owner's client is moved to `agent`, and the agent's
 * pane becomes the active pane. Cases 2, 3 and 4 are red; case 1 stays green, because that view shows the pane too.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pty from 'node-pty'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const THE_PANE_VIEW = join(import.meta.dirname, '..', 'src', 'config', 'tmux-pane-view.mjs')

const version = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
const NO_TMUX = version.status !== 0
const WHY = NO_TMUX ? ` (skipped: this needs a real tmux, and \`tmux -V\` here said ${version.error?.message ?? (version.stderr.trim() || `exit ${String(version.status)}`)})` : ''

interface Look { clients: string[]; current: string; windows: string[]; sizes: string[]; active: string[]; panes: string[] }

let folder = ''
let env: NodeJS.ProcessEnv = {}
let owner: pty.IPty | null = null
let view: pty.IPty | null = null
let shown = ''
let agentPane = ''
/** The owner's client, by the terminal tmux names it by. */
let theOwnersTty = ''
let before: Look
let during: Look
let after: Look

const tmux = (...args: string[]): string => execFileSync('tmux', args, { env, encoding: 'utf8' }).trim()
const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '')
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(what: string, check: () => boolean, ms = 8_000): Promise<void> {
  const by = Date.now() + ms
  while (!check()) {
    if (Date.now() > by) throw new Error(`waited ${String(ms)} ms for ${what}; the view showed: ${JSON.stringify(shown.slice(-400))}`)
    await sleep(100)
  }
}

/** What the owner's client and session are, read from tmux. */
function look(): Look {
  return {
    clients: lines(tmux('list-clients', '-t', 'own', '-F', '#{client_tty} #{client_width}x#{client_height}')),
    current: lines(tmux('list-clients', '-F', '#{client_tty} #{client_session}:#{window_name}'))
      .filter((line) => line.startsWith(`${theOwnersTty} `)).join('\n').slice(theOwnersTty.length + 1),
    windows: lines(tmux('list-windows', '-t', 'own', '-F', '#{window_id} #{window_name}')),
    sizes: lines(tmux('list-panes', '-s', '-t', 'own', '-F', '#{window_name} #{window_width}x#{window_height} #{pane_id} #{pane_width}x#{pane_height}')),
    active: lines(tmux('list-windows', '-t', 'own', '-F', '#{window_name} #{pane_id}')),
    panes: lines(tmux('list-panes', '-s', '-t', 'own', '-F', '#{pane_id}')),
  }
}


describe.skipIf(NO_TMUX)(`the pane view in a real tmux${WHY}`, () => {
  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'pane-view-tmux-'))
    env = { ...process.env, TMUX_TMPDIR: folder, TERM: 'xterm-256color' }
    delete env['TMUX']
    tmux('new-session', '-d', '-s', 'own', '-x', '120', '-y', '40', '-n', 'home')
    tmux('new-window', '-t', 'own', '-n', 'agent')
    tmux('split-window', '-t', 'own:agent', '-h')
    tmux('select-pane', '-t', 'own:agent.0')
    tmux('select-window', '-t', 'own:home')
    agentPane = tmux('display-message', '-p', '-t', 'own:agent.1', '#{pane_id}')

    owner = pty.spawn('tmux', ['attach-session', '-t', 'own'], { cols: 120, rows: 40, env: env as Record<string, string> })
    await until("the owner's client", () => lines(tmux('list-clients', '-F', '#{client_tty}')).length === 1)
    theOwnersTty = tmux('list-clients', '-F', '#{client_tty}')
    before = look()

    view = pty.spawn(process.execPath, [THE_PANE_VIEW, '--session', 'own', '--pane', agentPane, '--view', 'pane-view'], {
      cols: 60, rows: 15, env: env as Record<string, string>,
    })
    view.onData((data) => { shown += data })
    await until("the view's client", () => lines(tmux('list-clients', '-F', '#{client_name}')).length === 2)
    await sleep(500)
    tmux('send-keys', '-t', agentPane, 'echo MARK-$((6*7))', 'Enter')
    await until('the mark in the view', () => shown.includes('MARK-42')).catch(() => undefined)
    during = look()

    const ended = new Promise<void>((done) => view?.onExit(() => done()))
    view.kill('SIGTERM')
    await ended
    await until('the view to let go', () => lines(tmux('list-clients', '-F', '#{client_name}')).length === 1)
    after = look()
  }, 40_000)

  afterAll(() => {
    view?.kill('SIGKILL')
    owner?.kill()
    if (folder !== '') {
      spawnSync('tmux', ['kill-server'], { env })
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('1: shows what the agent\'s pane writes', () => {
    expect(shown).toContain('MARK-42')
  })

  it("2: keeps the owner's client, every window and every pane at its size, while the view runs and after", () => {
    expect(before.clients).toEqual([`${theOwnersTty} 120x40`])
    expect(during.clients.filter((line) => line.startsWith(`${theOwnersTty} `))).toEqual(before.clients)
    expect(during.sizes).toEqual(before.sizes)
    expect(after.clients).toEqual(before.clients)
    expect(after.sizes).toEqual(before.sizes)
  })

  it("3: keeps the owner's client on its window, and adds or takes away no window", () => {
    expect(before.current).toBe('own:home')
    expect(during.current).toBe(before.current)
    expect(after.current).toBe(before.current)
    expect(during.windows).toEqual(before.windows)
    expect(after.windows).toEqual(before.windows)
  })

  it('4: keeps each window\'s active pane, and adds or takes away no pane', () => {
    expect(before.active).toContain('agent ' + tmux('display-message', '-p', '-t', 'own:agent.0', '#{pane_id}'))
    expect(during.active).toEqual(before.active)
    expect(after.active).toEqual(before.active)
    expect(during.panes).toEqual(before.panes)
    expect(after.panes).toEqual(before.panes)
  })
})
