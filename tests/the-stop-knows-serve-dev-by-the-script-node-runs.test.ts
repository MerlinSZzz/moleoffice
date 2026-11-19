// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STOP KNOWS SERVE-DEV BY THE SCRIPT NODE RUNS, AND ITS GATE BY THE GATE'S SHAPE (wave 13q, 22 October 2026):
 * namesTheServeDevUnderNode, whyTheStarterIsNotServeDev and namesTheGateThatStartsServeDev in
 * src/config/the-service-command.mjs.
 *
 * Before `mole-office stop` signals the group of the process that started the server, it reads that process's command
 * line and asks whether it is node running tools/serve-dev.mjs. It also lets one more process in that group through:
 * the `node -e` gate through which the bootstrap and the upgrade start serve-dev. The command line is the process's
 * arguments joined with single spaces (src/config/process-reader.mjs). On macOS it is ps's command column, which has
 * no argument boundaries at all. So the stop reads the joined line, as words.
 *
 * THE READING, as the coordinator chose it:
 *   - the program is node: this process's own executable, or a file whose base name is exactly `node`;
 *   - serve-dev: the second word is tools/serve-dev.mjs, or ends in /tools/serve-dev.mjs;
 *   - the gate: the program is node, the second word is -e, and the last word is a JSON list whose first element is
 *     tools/serve-dev.mjs.
 *
 * Every case is a built command line. Nothing is started, and no process is read.
 *
 * WHAT IS PROVED, by case:
 *   1-6. the six lines the old reading accepted, one case each. It took any word that contained tools/serve-dev.mjs,
 *        and any -e anywhere on the line;
 *   7-8. the office's own start and restart, and the bootstrap's start;
 *   13. the gate's own line is not serve-dev, and serve-dev's line is not a gate;
 *   14. a node under another name is refused, and the refusal names the program it saw;
 *   15. a node path with a space is refused, with its reason;
 *   16. a full script path with a space is refused, with its reason. An office before this round started serve-dev
 *       that way when its checkout's path had a space, so such a serve-dev meets this refusal once, at its first stop.
 *   17. in a Linux bundle the window runs on the same program as the office, and none of the window's lines is serve-dev
 *       or the gate.
 *
 * That the office's restart now names the script relative to the checkout is proved where its start is recorded:
 * case D of tests/every-office-tool-reads-the-paired-office.test.ts.
 *
 * MUTATIONS, each run after the control run and then restored:
 *   - namesTheServeDevUnderNode takes any word that contains tools/serve-dev.mjs again (cases 1-4, 13 and 16 go red);
 *   - namesTheGateThatStartsServeDev takes any -e and any word that contains tools/serve-dev.mjs again (cases 5 and 6
 *     go red);
 *   - the program test takes any program (case 14 goes red).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as theCommand from '../src/config/the-service-command.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const NODE = process.execPath

/** One of the command's readings, or a failure that says the command does not offer it. */
function theReading<T>(name: string): (commandLine: string) => T {
  const found = (theCommand as Record<string, unknown>)[name]
  if (typeof found !== 'function') throw new Error(`src/config/the-service-command.mjs does not export ${name}.`)
  return found as (commandLine: string) => T
}
const isServeDev = (line: string): boolean => theReading<boolean>('namesTheServeDevUnderNode')(line)
const isTheGate = (line: string): boolean => theReading<boolean>('namesTheGateThatStartsServeDev')(line)
const whyNot = (line: string): string | null => theReading<string | null>('whyTheStarterIsNotServeDev')(line)

/**
 * A STAND-IN for the gate's program text. The real ones are in tools/stable/stable-bootstrap-processes.mjs and
 * tools/stable/stable-upgrade-transaction.mjs. The reading never looks at this text, but it has spaces and lines of its own,
 * as the real ones do, so the line splits into many words.
 */
const A_GATE_PROGRAM = `
const { spawn } = require('node:child_process')
const child = spawn(process.argv[1], JSON.parse(process.argv[2]), { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
`

/** A gate's command line, as the bootstrap and the upgrade build its arguments: -e, the program, the command, the list. */
const aGate = (list: string[], program = A_GATE_PROGRAM): string => [NODE, '-e', program, NODE, JSON.stringify(list)].join(' ')

/** A checkout's own path, without a space and with one. */
const A_CHECKOUT = '/srv/someone/mole-office'
const A_CHECKOUT_WITH_A_SPACE = '/srv/someone/My Projects/mole-office'

describe('the six lines the old reading accepted are refused', () => {
  it('1: a file whose name only begins with the script, tools/serve-dev.mjs.old', () => {
    expect(isServeDev('node tools/serve-dev.mjs.old --built')).toBe(false)
  })

  it('2: another script with an argument that names the script, --log tools/serve-dev.mjs.log', () => {
    expect(isServeDev('node other.mjs --log tools/serve-dev.mjs.log')).toBe(false)
  })

  it('3: a script in another folder whose name ends the same way, mytools/serve-dev.mjs', () => {
    expect(isServeDev('node mytools/serve-dev.mjs --built')).toBe(false)
    expect(isServeDev(`node ${A_CHECKOUT}/mytools/serve-dev.mjs --built`)).toBe(false)
  })

  it('4: another script that is given tools/serve-dev.mjs as its argument', () => {
    expect(isServeDev('node other.mjs tools/serve-dev.mjs')).toBe(false)
  })

  it('5: a line with -e that is not its second word, and a list as its last word', () => {
    expect(isTheGate('node runner.mjs -e x ["tools/serve-dev.mjs"]')).toBe(false)
  })

  it('6: a real gate whose list names tools/serve-dev.mjs.old, and a gate whose last word is not a list', () => {
    expect(isTheGate(aGate(['tools/serve-dev.mjs.old', '--built', '--prepared']))).toBe(false)
    expect(isTheGate([NODE, '-e', A_GATE_PROGRAM, NODE, 'tools/serve-dev.mjs'].join(' '))).toBe(false)
  })
})

describe('every start of serve-dev is accepted', () => {
  it('7: the office\'s own start and restart, relative to the checkout, and as a full path from an office before this round', () => {
    expect(isServeDev(`${NODE} tools/serve-dev.mjs --built --prepared`)).toBe(true)
    expect(isServeDev(`${NODE} ${A_CHECKOUT}/tools/serve-dev.mjs --built --prepared`)).toBe(true)
    expect(whyNot(`${NODE} tools/serve-dev.mjs --built --prepared`)).toBeNull()
  })

  it('8: the bootstrap\'s start, tools/stable/stable-bootstrap-execution.mjs', () => {
    const source = readFileSync(join(REPO, 'tools', 'stable/stable-bootstrap-execution.mjs'), 'utf8')
    expect(source).toContain("process.execPath, ['tools/serve-dev.mjs', '--built', '--prepared']")
    expect(isServeDev([NODE, 'tools/serve-dev.mjs', '--built', '--prepared'].join(' '))).toBe(true)
  })

})

describe('what each reading is not', () => {
  it('13: the gate\'s own line is not serve-dev, and serve-dev\'s line is not a gate', () => {
    expect(isServeDev(aGate(['tools/serve-dev.mjs', '--built', '--prepared']))).toBe(false)
    expect(isTheGate(`${NODE} tools/serve-dev.mjs --built --prepared`)).toBe(false)
  })

  it('14: a node under another name is refused, and the refusal names the program it saw', () => {
    for (const program of ['/usr/bin/nodejs', '/usr/local/bin/node22']) {
      expect(program, 'this case needs a program that is not the one running it').not.toBe(NODE)
      const line = `${program} tools/serve-dev.mjs --built --prepared`
      expect(isServeDev(line), program).toBe(false)
      expect(whyNot(line), program).toBe(`its command line is not node running tools/serve-dev.mjs (it is: ${line})`)
      expect(isTheGate([program, '-e', A_GATE_PROGRAM, NODE, JSON.stringify(['tools/serve-dev.mjs'])].join(' ')), program).toBe(false)
    }
  })

  it('15: a node path with a space is refused, with its reason', () => {
    const line = '/opt/Node Versions/22/bin/node tools/serve-dev.mjs --built --prepared'
    expect(isServeDev(line)).toBe(false)
    expect(whyNot(line)).toBe(`its command line is not node running tools/serve-dev.mjs (it is: ${line})`)
  })

  it('16: a full script path with a space, as an office before this round started it, is refused, with its reason', () => {
    const line = `${NODE} ${A_CHECKOUT_WITH_A_SPACE}/tools/serve-dev.mjs --built --prepared`
    expect(isServeDev(line)).toBe(false)
    expect(whyNot(line)).toBe(`its command line is not node running tools/serve-dev.mjs (it is: ${line.slice(0, 120)})`)
  })

  it("17: in a Linux bundle the window runs on the same program as the office, and none of the window's lines is serve-dev or the gate", () => {
    // The app's own program runs the window, and, told to run as Node, the office's scripts. Only the script tells them apart.
    for (const line of [NODE, `${NODE} --no-sandbox`, `${NODE} --type=renderer --enable-sandbox`, `${NODE} --type=gpu-process`]) {
      expect(isServeDev(line), `the window's line ${line} is read as serve-dev`).toBe(false)
      expect(isTheGate(line), `the window's line ${line} is read as the gate`).toBe(false)
    }
    expect(isServeDev(`${NODE} tools/serve-dev.mjs --built --prepared`), 'the same program running serve-dev is not read as serve-dev').toBe(true)
  })
})
