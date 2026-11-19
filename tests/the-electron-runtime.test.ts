// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ELECTRON'S RUNTIME IS PUT IN WHERE THE LINUX BUILD FIRST NEEDS IT. Electron 44 has no install hook, so a fresh clone's
 * `npm ci` leaves node_modules/electron/dist empty, and scripts/package-linux.mjs runs Electron's own installer at
 * step 2 through scripts/the-electron-runtime.mjs.
 *
 * Every checkout here is a folder made under one scratch folder, removed when this file ends. Its
 * node_modules/electron/install.js is a stand-in written by the case, so nothing is downloaded; each stand-in does one
 * thing the real installer can do: put the runtime in, fail with its own words, end without the runtime, or not end.
 *
 * MUTATIONS: a function that never runs the installer, one that always runs it, one that runs it with another Node, one
 * that drops the installer's words, and one that trusts the installer's exit without looking for the runtime again
 * each turn a case here red.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { putInElectronsRuntime, THE_ELECTRON_INSTALL, THE_ELECTRON_RUNTIME } from '../scripts/the-electron-runtime.mjs'

const temporary = aTestDatabaseFolder('electron-runtime')
afterAll(() => removeThisTestFolder(temporary))
let serial = 0

/** What a stand-in installer does. Each writes the Node that ran it beside itself, so a case can see which ran it. */
const THE_INSTALLERS = {
  putsItIn: "fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'dist', 'electron'), '')",
  fails: "console.error('Error: the stand-in download was refused (an invented reason)'); process.exit(1)",
  endsWithoutIt: 'process.exit(0)',
  neverEnds: 'setTimeout(() => {}, 60_000)',
}

/** A checkout of its own whose node_modules/electron holds a stand-in installer, with the runtime already in or not. */
function aCheckout({ installer, runtime }: { installer: keyof typeof THE_INSTALLERS; runtime: boolean }): string {
  const root = join(temporary, `checkout-${String(++serial)}`)
  const electron = join(root, 'node_modules', 'electron')
  mkdirSync(electron, { recursive: true })
  writeFileSync(join(electron, 'package.json'), '{ "name": "electron", "version": "0.0.0" }\n')
  writeFileSync(
    join(electron, 'install.js'),
    ["const fs = require('node:fs')", "const path = require('node:path')", "fs.writeFileSync(path.join(__dirname, 'ran-with'), process.execPath)", THE_INSTALLERS[installer], ''].join('\n'),
  )
  if (runtime) {
    mkdirSync(join(electron, 'dist'))
    writeFileSync(join(root, THE_ELECTRON_RUNTIME), '')
  }
  return root
}

/** The Node the stand-in installer was run with, or null when it was never run. */
function ranWith(root: string): string | null {
  const file = join(root, 'node_modules', 'electron', 'ran-with')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Every line a call says, and its answer. */
function put(root: string, timeout?: number) {
  const said: string[] = []
  const refused = putInElectronsRuntime({ root, say: (line) => said.push(line), ...(timeout === undefined ? {} : { timeout }) })
  return { refused, said }
}

describe("Electron's runtime is put in where the Linux build first needs it", () => {
  it('leaves a runtime that is there alone, and runs no installer', () => {
    const root = aCheckout({ installer: 'putsItIn', runtime: true })
    expect(put(root)).toEqual({ refused: null, said: [] })
    expect(ranWith(root)).toBeNull()
  })

  it('runs Electron\'s own installer with the Node that runs the build when the runtime is missing, and says so', () => {
    const root = aCheckout({ installer: 'putsItIn', runtime: false })
    const { refused, said } = put(root)
    expect(refused).toBeNull()
    expect(ranWith(root)).toBe(process.execPath)
    expect(existsSync(join(root, THE_ELECTRON_RUNTIME))).toBe(true)
    expect(said).toEqual([
      `Electron's runtime, ${THE_ELECTRON_RUNTIME}, is not there, so it is put in now with: node ${THE_ELECTRON_INSTALL}`,
      `Electron's runtime is in: ${THE_ELECTRON_RUNTIME}.`,
    ])
  })

  it("refuses with the installer's own words when it fails", () => {
    const root = aCheckout({ installer: 'fails', runtime: false })
    const { refused } = put(root)
    expect(refused).toBe(
      `Electron's runtime could not be put in: node ${THE_ELECTRON_INSTALL} ended with exit 1, and said: ` +
        'Error: the stand-in download was refused (an invented reason)',
    )
  })

  it('refuses when the installer ends well and the runtime is still not there', () => {
    const root = aCheckout({ installer: 'endsWithoutIt', runtime: false })
    expect(put(root).refused).toBe(
      `Electron's runtime could not be put in: node ${THE_ELECTRON_INSTALL} ended with exit 0, and ${THE_ELECTRON_RUNTIME} is still not there. ` +
        'It said nothing.',
    )
  })

  it('refuses when the installer does not end in its time', () => {
    const root = aCheckout({ installer: 'neverEnds', runtime: false })
    expect(put(root, 2_000).refused).toBe(`Electron's runtime could not be put in: node ${THE_ELECTRON_INSTALL} did not end within 2 seconds, and was stopped.`)
  })
})
