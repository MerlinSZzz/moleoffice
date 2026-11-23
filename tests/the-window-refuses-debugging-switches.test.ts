// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW REFUSES TO START WITH A DEBUGGING SWITCH, ON A MAC AND ON LINUX ALIKE. Wave 13t, round 23
 * (the check MwbO4MkkQOGi, on round 22: a program of the same user could start the window with
 * --remote-debugging-port and drive it).
 *
 * src/desktop/the-debugging-switches.mjs works out the refusal apart from Electron, so this test stands
 * the platform in as darwin and as linux:
 *
 *   6. the setting is declared, off by default, and refuses any value but on or off;
 *   7. a process that keeps the inspector shut does not open it on SIGUSR1, while one that does not
 *      opens it (the control);
 *   8. src/desktop/main.mjs asks before it takes the single-instance lock, with Electron's own command
 *      line and Node's own inspector, and keeps the inspector shut unless the setting allows it. A refused
 *      window asks for no lock at all (round W2): on Linux it runs on until its box is pressed, and a window
 *      started meanwhile must not hand over to it.
 *
 * The real window, given a switch, is started in tests/the-window-finds-its-office.test.ts, which runs
 * under the virtual display. What only a Mac can show is in the round's report.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - readSetting no longer checks MOLE_OFFICE_WINDOW_DEBUGGING: red, case 6;
 *   - keepTheInspectorShut listens for SIGUSR2 instead: red, case 7;
 *   - main.mjs no longer calls keepTheInspectorShut: red, case 8;
 *   - main.mjs asks for the lock whether or not the window was refused: red, case 8.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { readSetting, settingNamed } from '../src/config/settings.mjs'
import { THE_DEBUGGING_SETTING, whyTheWindowRefusesToStart } from '../src/desktop/the-debugging-switches.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PLATFORMS = ['darwin', 'linux'] as const
const ENV_FILE = '/somewhere/mole-office/.env'

/** Electron's hasSwitch, stood in: true for the switches named. */
const theCommandLine = (...given: string[]) => (name: string) => given.includes(name)

/** The refusal on this platform, for these switches, with this setting and inspector. */
function asked(platform: string, given: string[], setting = 'off', inspectorUrl: string | undefined = undefined) {
  return whyTheWindowRefusesToStart({ platform, hasSwitch: theCommandLine(...given), inspectorUrl, setting, envFile: ENV_FILE })
}

/** Every switch named in the round's brief and its kin, so taking one out of the module's list is seen. */
const EXPECTED = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk', 'inspect-wait', 'inspect-port', 'inspect-brk-node']

describe('the window refuses to start with a debugging switch', () => {
  for (const platform of PLATFORMS) {
    for (const name of EXPECTED) {
      it(`1. on ${platform}, --${name} is refused in words that name it`, () => {
        const said = asked(platform, [name])
        expect(said, `--${name} was not refused on ${platform}`).not.toBeNull()
        expect(said).toContain(`--${name}`)
        expect(said).toContain('Mole Office will not start')
        expect(said).toContain(THE_DEBUGGING_SETTING)
      })

      it(`2. on ${platform}, --${name} is allowed when ${THE_DEBUGGING_SETTING} is on`, () => {
        expect(asked(platform, [name], 'on')).toBeNull()
      })
    }

    it(`3. on ${platform}, an inspector already open with no switch is refused`, () => {
      const said = asked(platform, [], 'off', 'ws://127.0.0.1:9229/x')
      expect(said).not.toBeNull()
      expect(said).toContain("Node's inspector is already open at ws://127.0.0.1:9229/x")
      expect(asked(platform, [], 'on', 'ws://127.0.0.1:9229/x')).toBeNull()
    })

    it(`4. on ${platform}, a window given no debugging switch starts`, () => {
      expect(asked(platform, [])).toBeNull()
      expect(asked(platform, ['no-sandbox', 'lang', 'disable-dev-shm-usage'])).toBeNull()
    })
  }




  it('6. the setting is declared, off by default, and refuses any value but on or off', () => {
    expect(settingNamed(THE_DEBUGGING_SETTING).fallback).toBe('off')
    expect(readSetting(THE_DEBUGGING_SETTING, {}).value).toBe('off')
    expect(readSetting(THE_DEBUGGING_SETTING, { [THE_DEBUGGING_SETTING]: 'on' }).value).toBe('on')
    expect(() => readSetting(THE_DEBUGGING_SETTING, { [THE_DEBUGGING_SETTING]: 'yes' })).toThrow(
      'MOLE_OFFICE_WINDOW_DEBUGGING is "yes", and it must be on or off. Nothing was guessed from it.',
    )
    expect(readFileSync(join(REPO, '.env.example'), 'utf8')).toContain(`# ${THE_DEBUGGING_SETTING}=off`)
  })

  /**
   * A Node process that sends itself SIGUSR1 and says whether its inspector opened. --inspect-port=0 makes
   * an inspector that does open take a port the system chooses, so this never meets 9229 in use.
   */
  function sendItselfSigusr1(keepShut: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'the-inspector-kept-shut-'))
    const script = join(dir, 'signal.mjs')
    const module = pathToFileURL(join(REPO, 'src', 'desktop', 'the-debugging-switches.mjs')).href
    writeFileSync(
      script,
      `import inspector from 'node:inspector'\n` +
        `import { keepTheInspectorShut } from ${JSON.stringify(module)}\n` +
        `if (${String(keepShut)}) keepTheInspectorShut(process)\n` +
        `process.kill(process.pid, 'SIGUSR1')\n` +
        `setTimeout(() => { process.stdout.write(JSON.stringify({ url: inspector.url() ?? null })); inspector.close(); process.exit(0) }, 1500)\n`,
    )
    const run = spawnSync(process.execPath, ['--inspect-port=0', script], { encoding: 'utf8', timeout: 20_000 })
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    return { url: (JSON.parse(run.stdout) as { url: string | null }).url, stderr: run.stderr }
  }

  it('7. a process that keeps the inspector shut does not open it on SIGUSR1, and says so', () => {
    const control = sendItselfSigusr1(false)
    expect(control.url, 'the control: without the listener, SIGUSR1 should open the inspector').toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//)
    const kept = sendItselfSigusr1(true)
    expect(kept.url).toBeNull()
    expect(kept.stderr).toContain("Mole Office was sent SIGUSR1, which opens Node's inspector, and kept it shut.")
  }, 60_000)

  it('8. main.mjs asks first, with Electron\'s own command line and Node\'s own inspector', () => {
    const main = readFileSync(join(REPO, 'src', 'desktop', 'main.mjs'), 'utf8')
    const asks = main.indexOf('whyTheWindowRefusesToStart({')
    expect(asks).toBeGreaterThan(-1)
    expect(asks).toBeLessThan(main.indexOf('app.requestSingleInstanceLock()'))
    expect(asks).toBeLessThan(main.indexOf("app.setPath('userData'"))
    expect(main).toContain('hasSwitch: (name) => app.commandLine.hasSwitch(name)')
    expect(main).toContain('inspectorUrl: inspector.url()')
    expect(main).toContain('settingValue(THE_DEBUGGING_SETTING)')
    expect(main).toContain("if (THE_DEBUGGING_ALLOWED !== 'on') keepTheInspectorShut(process)")
    // The lock is asked for only in the branch that neither a refused window nor a print run takes. The print
    // run's branch comes between the two, before the lock: a print run takes no lock, so it neither waits for
    // a running window nor hands its page over to one.
    expect(main).toMatch(/\nif \(THE_REFUSAL !== null\) \{[^}]*\} else if \(THE_PRINT !== null\) \{[^}]*\} else if \(!app\.requestSingleInstanceLock\(\)\) \{/)
    expect(main.match(/app\.requestSingleInstanceLock\(\)/g)).toHaveLength(1)
  })
})
