// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAC BUILD STOPS BY NAME, AND SAYS HOW TO MAKE WHAT IS MISSING. Wave 13t, round 20.
 *
 * The owner builds and signs Mole Office on their own Mac with one command,
 * `node scripts/build-on-a-mac.mjs`. Everything that command and scripts/package-mac.mjs know is in
 * scripts/the-mac-build.mjs, so this test reads it on Linux:
 *
 *   1. run on Linux, both commands stop at once and say they need a Mac, in English and Chinese;
 *   2. each machine refusal by name: notAMac, notAppleSilicon (Intel, or a Node under Rosetta), notNode22,
 *      and noTypeStripping, a Node 22 that cannot load the TypeScript file the privacy run imports; the two
 *      about Node name the folder of the newest Node 22, since nodejs.org's LTS download is a later Node now;
 *   3. noXcodeTools, when any of Apple's three tools is missing;
 *   4. the certificates read from `security find-identity`, and noCertificate and moreThanOneCertificate;
 *   5. noNotaryProfile, with the command that stores it for the owner's team, and notaryDidNotAnswer for anything else;
 *   6. Apple's verdict read from notarytool's answer, not from its exit code;
 *   7. a program signed without the hardened runtime, or by another team, is named;
 *   8. Mach-O files are told from other files by their first bytes;
 *   9. the electron-builder configuration: arm64 only, signed with the hardened runtime by the named
 *      certificate, notarised by package-mac.mjs and not by electron-builder, with the Linux fuses;
 *  10. the icon is the owner's logo on a 512-pixel square, unscaled and centred;
 *  11. no script of the build reads, passes or stores a password or a key;
 *  12. the machine is read from the Node that runs the build, with whether that Node loads TypeScript;
 *  13. Playwright's Chromium is installed after the packages and before the app is made, into the
 *      checkout's node_modules, where the plain privacy files still find it when their run moves HOME;
 *  14. a failed step says nothing was signed only when no earlier step made and signed an app, and
 *      otherwise names the app that was signed, its output folder and the app that was not made.
 *
 * What only the owner's Mac can test is said in the round's report: signing, notarising, Gatekeeper, the stapling,
 * and whether the entitlements are enough.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - theMachineRefusal compares the platform with 'linux' instead of 'darwin': red, cases 1 and 2;
 *   - theMachineRefusal leaves out the processor check: red, case 2 (notAppleSilicon);
 *   - theDeveloperIds keeps "Apple Development" certificates too: red, case 4;
 *   - theNotaryRefusal says noNotaryProfile for every failure: red, case 5 (notaryDidNotAnswer);
 *   - theNotaryVerdict trusts any status: red, case 6;
 *   - theMacBuilderConfig turns hardenedRuntime off: red, case 9;
 *   - (round W30) theMachineRefusal leaves out the type-stripping check: red, case 2;
 *   - (round W30) notNode22 sends the person to the LTS download again: red, case 2;
 *   - (round W30) thisMachine leaves out process.features.typescript: red, case 12;
 *   - (round W30) configureMacBuildEnvironment leaves PLAYWRIGHT_BROWSERS_PATH unset: red, case 13;
 *   - (round W30) theBuildSteps leaves out the browser: red, case 13;
 *   - a failed step's words ignore what was signed before, and always say nothing was signed: red, case 14;
 *   - a failed step's words leave out the Chinese sentence: red, case 14;
 *   - theBuildSteps leaves out the mark on the app with the office map: red, case 14.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  isMachO,
  onASquare,
  readAPng,
  THE_BUILDS_NODE_MAJOR,
  THE_ENTITLEMENTS,
  THE_MAC_ICON_SIDE,
  THE_NOTARY_PROFILE,
  theCertificateRefusal,
  theDeveloperIds,
  theMachineRefusal,
  theMacBuilderConfig,
  theNotaryRefusal,
  theNotaryVerdict,
  theBuildSteps,
  theSignatureProblems,
  theStepFailureSaid,
  theXcodeRefusal,
  thisMachine,
} from '../scripts/the-mac-build.mjs'
import { THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC } from '../scripts/the-packed-app.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_SHIPPED_NODE_VERSION } from '../src/config/settings.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The homes case 13 names to Playwright live under here, and are never made. */
const temporary = aTestDatabaseFolder('mac-build')
afterAll(() => removeThisTestFolder(temporary))

/** Whether a fuse's state is on, read as a plain string. */
const isOn = (state: string): boolean => state === 'on'

const A_MAC = { platform: 'darwin', arch: 'arm64', nodeVersion: `v${THE_SHIPPED_NODE_VERSION}`, typeStripping: 'strip' }

/** This process's environment without the office's variables, for a child that imports the build's module. */
function withoutTheOffice(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY') delete env[name]
  return env
}

/** What a child Node started with these flags prints after it imports scripts/the-mac-build.mjs and runs `code` with it as `m`. */
function inAChild(flags: string[], code: string, env = withoutTheOffice()): string {
  const module = JSON.stringify(pathToFileURL(join(REPO, 'scripts', 'the-mac-build.mjs')).href)
  const ran = spawnSync(process.execPath, [...flags, '--input-type=module', '-e', `const m = await import(${module}); ${code}`], {
    cwd: REPO, env, encoding: 'utf8', timeout: 20_000,
  })
  expect(ran.status, ran.stderr).toBe(0)
  return ran.stdout
}

/** What `security find-identity -v -p codesigning` prints, with made-up certificates. */
const IDENTITIES = [
  '  1) 1111111111111111111111111111111111111111 "Apple Development: Sam Example (ABCDE12345)"',
  '  2) 2222222222222222222222222222222222222222 "Developer ID Application: Sam Example (TEAM123456)"',
  '     2 valid identities found',
].join('\n')

describe('the Mac build stops by name', () => {
  it.each(['build-on-a-mac.mjs', 'package-mac.mjs'])('1. %s run on Linux stops at once and says it needs a Mac', (script) => {
    const ran = spawnSync(process.execPath, [join(REPO, 'scripts', script)], { cwd: REPO, encoding: 'utf8', timeout: 20_000 })
    expect(ran.status, ran.stdout + ran.stderr).toBe(1)
    expect(ran.stderr).toContain('it needs a Mac. This computer runs linux. Nothing was built.')
    expect(ran.stderr).toContain('必须在 Mac 上运行')
    // Nothing was started before the refusal: no npm, no bundle.
    expect(ran.stdout).toBe('')
  })

  it('2. the machine: a Mac, with Apple silicon, on a Node 22 that loads TypeScript', () => {
    expect(theMachineRefusal(A_MAC)).toBeNull()
    expect(theMachineRefusal({ ...A_MAC, typeStripping: 'transform' })).toBeNull()
    for (const typeStripping of [false, undefined] as const) {
      const old = theMachineRefusal({ ...A_MAC, nodeVersion: 'v22.17.1', typeStripping })
      expect(old?.name, String(typeStripping)).toBe('noTypeStripping')
      expect(old?.en).toContain('This Node, v22.17.1, cannot load a TypeScript file')
      expect(old?.en).toContain('Nothing was built.')
      expect(old?.zh).toContain('nodejs.org')
    }
    // nodejs.org's LTS download is a later Node than 22 now, so the two refusals name the folder of the newest Node 22.
    for (const refused of [theMachineRefusal({ ...A_MAC, nodeVersion: 'v26.13.0' }), theMachineRefusal({ ...A_MAC, nodeVersion: 'v22.17.1', typeStripping: false })]) {
      for (const words of [refused?.en, refused?.zh]) {
        expect(words).toContain(`nodejs.org/dist/latest-v${String(THE_BUILDS_NODE_MAJOR)}.x`)
        expect(words).not.toContain('LTS')
      }
    }
    expect(theMachineRefusal({ ...A_MAC, platform: 'linux' })?.name).toBe('notAMac')
    expect(theMachineRefusal({ ...A_MAC, platform: 'win32' })?.name).toBe('notAMac')
    expect(theMachineRefusal({ ...A_MAC, arch: 'x64' })?.name).toBe('notAppleSilicon')
    expect(theMachineRefusal({ ...A_MAC, arch: 'x64' })?.en).toContain('Rosetta')
    expect(theMachineRefusal({ ...A_MAC, nodeVersion: 'v20.11.0' })?.name).toBe('notNode22')
    expect(theMachineRefusal({ ...A_MAC, nodeVersion: 'v24.1.0' })?.zh).toContain('nodejs.org')
  })

  it("3. Apple's command-line tools", () => {
    expect(theXcodeRefusal({ selected: true, notarytool: true, stapler: true })).toBeNull()
    for (const missing of ['selected', 'notarytool', 'stapler'] as const) {
      const refused = theXcodeRefusal({ selected: true, notarytool: true, stapler: true, [missing]: false })
      expect(refused?.name, missing).toBe('noXcodeTools')
      expect(refused?.en).toContain('xcode-select --install')
    }
  })

  it('4. the certificate: one Developer ID Application certificate, read from security', () => {
    const found = theDeveloperIds(IDENTITIES)
    expect(found).toEqual([{ hash: '2222222222222222222222222222222222222222', name: 'Sam Example (TEAM123456)', team: 'TEAM123456' }])
    expect(theCertificateRefusal(found)).toBeNull()
    const none = theCertificateRefusal(theDeveloperIds('     0 valid identities found\n'))
    expect(none?.name).toBe('noCertificate')
    expect(none?.en).toContain('Developer ID Application')
    expect(none?.zh).toContain('管理证书')
    const two = theCertificateRefusal([...found, { hash: '3'.repeat(40), name: 'Sam Example (TEAM654321)', team: 'TEAM654321' }])
    expect(two?.name).toBe('moreThanOneCertificate')
    expect(two?.en).toContain('Sam Example (TEAM654321)')
  })

  it('5. the notarisation profile', () => {
    expect(theNotaryRefusal({ code: 0, said: '{"history":[]}' }, 'TEAM123456')).toBeNull()
    const missing = theNotaryRefusal({ code: 69, said: 'Error: No Keychain password item found for profile: mole-office-notary\n' }, 'TEAM123456')
    expect(missing?.name).toBe('noNotaryProfile')
    expect(missing?.en).toContain(`xcrun notarytool store-credentials ${THE_NOTARY_PROFILE} --apple-id <your Apple ID email> --team-id TEAM123456`)
    expect(missing?.zh).toContain('App 专用密码')
    const offline = theNotaryRefusal({ code: 1, said: 'Error: The Internet connection appears to be offline.\n' }, 'TEAM123456')
    expect(offline?.name).toBe('notaryDidNotAnswer')
    expect(offline?.en).toContain('The Internet connection appears to be offline.')
  })

  it("6. Apple's verdict is read from notarytool's answer", () => {
    expect(theNotaryVerdict('{"id":"abc","status":"Accepted","message":"Processing complete"}')).toEqual({ id: 'abc', status: 'Accepted', accepted: true })
    expect(theNotaryVerdict('{"id":"abc","status":"Invalid","message":"Processing complete"}')).toMatchObject({ id: 'abc', accepted: false })
    expect(theNotaryVerdict('Error: something went wrong')).toMatchObject({ id: null, accepted: false })
  })

  it('7. a program signed without the hardened runtime, or by another team, is named', () => {
    const good = 'Executable=/x/node\nCodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+7\nTeamIdentifier=TEAM123456\n'
    expect(theSignatureProblems('node', good, 'TEAM123456')).toEqual([])
    expect(theSignatureProblems('node', good.replace('0x10000(runtime)', '0x0(none)'), 'TEAM123456')[0]).toContain('without the hardened runtime')
    expect(theSignatureProblems('node', good, 'OTHER12345')[0]).toContain('signed by team TEAM123456, not OTHER12345')
    expect(theSignatureProblems('node', 'node: code object is not signed at all', 'TEAM123456')).toEqual(['node is not signed.'])
  })

  it('8. Mach-O files are told by their first bytes', () => {
    expect(isMachO(Uint8Array.from([0xcf, 0xfa, 0xed, 0xfe]))).toBe(true)
    expect(isMachO(Uint8Array.from([0xca, 0xfe, 0xba, 0xbe]))).toBe(true)
    expect(isMachO(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(false)
    expect(isMachO(readFileSync(join(REPO, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'pty.node')))).toBe(true)
    expect(isMachO(readFileSync(join(REPO, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper')))).toBe(true)
    expect(isMachO(readFileSync(join(REPO, 'LICENSE')))).toBe(false)
  })

  it('9. the app is built for arm64, signed with the hardened runtime, with the Linux fuses', () => {
    const config = theMacBuilderConfig({
      app: '/w/app',
      work: '/w',
      output: '/w/built',
      version: '0.1.0',
      electron: '44.5.1',
      electronDist: '/e',
      identity: 'Sam Example (TEAM123456)',
      entitlements: '/w/e.plist',
      icon: '/w/i.png',
    })
    expect(config.mac).toMatchObject({ target: [{ target: 'dir', arch: ['arm64'] }], identity: 'Sam Example (TEAM123456)', hardenedRuntime: true, notarize: false, entitlements: '/w/e.plist', entitlementsInherit: '/w/e.plist' })
    expect(config.electronFuses).toEqual({
      runAsNode: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.RunAsNode),
      enableNodeOptionsEnvironmentVariable: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableNodeOptionsEnvironmentVariable),
      enableNodeCliInspectArguments: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableNodeCliInspectArguments),
      enableEmbeddedAsarIntegrityValidation: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableEmbeddedAsarIntegrityValidation),
      onlyLoadAppFromAsar: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.OnlyLoadAppFromAsar),
    })
    for (const allowed of ['allow-jit', 'allow-unsigned-executable-memory', 'disable-library-validation']) {
      expect(THE_ENTITLEMENTS).toContain(`<key>com.apple.security.cs.${allowed}</key>`)
    }
  })

  it("10. the icon is the owner's logo on a 512-pixel square, unscaled and centred", () => {
    const logo = readAPng(readFileSync(join(REPO, 'assets', 'mole-office.png')))
    const icon = onASquare(logo, THE_MAC_ICON_SIDE)
    expect([icon.width, icon.height]).toEqual([512, 512])
    const left = Math.floor((512 - logo.width) / 2)
    const top = Math.floor((512 - logo.height) / 2)
    for (const y of [0, Math.floor(logo.height / 2), logo.height - 1]) {
      const row = logo.rgba.subarray(y * logo.width * 4, (y + 1) * logo.width * 4)
      const placed = icon.rgba.subarray(((top + y) * 512 + left) * 4, ((top + y) * 512 + left + logo.width) * 4)
      expect(placed.equals(row), `row ${String(y)}`).toBe(true)
    }
    // The corner is clear.
    expect(icon.rgba.readUInt8(3)).toBe(0)
  })

  it('11. no script of the build reads, passes or stores a password or a key', () => {
    for (const script of ['build-on-a-mac.mjs', 'package-mac.mjs', 'the-mac-build.mjs']) {
      const source = readFileSync(join(REPO, 'scripts', script), 'utf8')
      expect(source, script).not.toMatch(/--password\b|--key\b|--key-id\b|APPLE_ID_PASSWORD|APPLE_APP_SPECIFIC_PASSWORD|APPLE_API_KEY|CSC_KEY_PASSWORD|CSC_LINK/)
    }
  })

  it('12. the machine is read from the Node that runs the build, with whether it loads TypeScript', () => {
    expect(thisMachine()).toEqual({ platform: process.platform, arch: process.arch, nodeVersion: process.version, typeStripping: process.features.typescript })
    expect(JSON.parse(inAChild(['--no-experimental-strip-types'], 'process.stdout.write(JSON.stringify(m.thisMachine()))'))).toEqual({ platform: process.platform, arch: process.arch, nodeVersion: process.version, typeStripping: false })
  })

  it("13. Playwright's Chromium goes into the checkout after the packages, where the privacy files find it with HOME moved", () => {
    const steps = theBuildSteps({ checkout: REPO, execPath: process.execPath, local: false, out: join(REPO, 'dist', 'mac') })
    const browser = steps.findIndex(step => step.args.includes('chromium'))
    const said = steps.map(step => step.what).join('; ')
    expect(browser, said).toBeGreaterThan(steps.findIndex(step => step.command === 'npm' && step.args[0] === 'ci'))
    expect(browser, said).toBeLessThan(steps.findIndex(step => step.args[0] === join(REPO, 'scripts', 'package-mac.mjs')))
    const install = steps[browser]!
    expect(install.command).toBe(process.execPath)
    expect(install.args).toEqual([join(REPO, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'])
    expect(existsSync(install.args[0]!)).toBe(true)

    // The environment both Mac commands set, made in a child that starts with no browser folder named.
    const env = withoutTheOffice()
    delete env.PLAYWRIGHT_BROWSERS_PATH
    delete env.XDG_CACHE_HOME
    const named = JSON.parse(inAChild([], 'm.configureMacBuildEnvironment(); process.stdout.write(JSON.stringify(process.env.PLAYWRIGHT_BROWSERS_PATH ?? null))', env))
    if (named !== null) env.PLAYWRIGHT_BROWSERS_PATH = named
    // Where that install puts Chromium, asked of Playwright itself under two homes, as the privacy run moves HOME.
    const places = (home: string) => {
      const ran = spawnSync(process.execPath, [install.args[0]!, 'install', '--dry-run', 'chromium'], {
        cwd: REPO, env: { ...env, HOME: home }, encoding: 'utf8', timeout: 60_000,
      })
      expect(ran.status, ran.stderr).toBe(0)
      return [...ran.stdout.matchAll(/Install location:\s+(\S+)/g)].map(found => found[1]!)
    }
    const first = places(join(temporary, 'a-home'))
    expect(first.length).toBeGreaterThan(0)
    expect(places(join(temporary, 'another-home'))).toEqual(first)
    const inside = join(realpathSync(join(REPO, 'node_modules')), 'playwright-core', '.local-browsers') + sep
    for (const place of first) expect(place.startsWith(inside), place).toBe(true)
  })

  it('14. a failed step says nothing was signed only when no earlier step signed an app', () => {
    const out = join(REPO, 'dist', 'mac')
    for (const local of [false, true]) {
      const steps = theBuildSteps({ checkout: REPO, execPath: process.execPath, local, out })
      const signing = steps.filter(step => step.signsAnApp !== undefined)
      expect(signing.map(step => step.args.includes('--with-the-map')), String(local)).toEqual([false, true])
      for (const step of signing) {
        expect(step.command).toBe(process.execPath)
        expect(step.args[0]).toBe(join(REPO, 'scripts', 'package-mac.mjs'))
      }
      const firstAt = steps.indexOf(signing[0]!)
      const secondAt = steps.indexOf(signing[1]!)
      const firstFailed = theStepFailureSaid({ what: steps[firstAt]!.what, why: 'exit 1', steps, failed: firstAt, out })
      expect(firstFailed).toContain('it says why above. Nothing was signed.')
      expect(firstFailed).toContain('没有签名任何文件。')
      const secondFailed = theStepFailureSaid({ what: steps[secondAt]!.what, why: 'exit 1', steps, failed: secondAt, out })
      expect(secondFailed).not.toContain('Nothing was signed.')
      expect(secondFailed).not.toContain('没有签名任何文件')
      expect(secondFailed).toContain(`The app without the office map was made and signed, and its dmg and zip are in ${out}.`)
      expect(secondFailed).toContain('The app with the office map was not made.')
      expect(secondFailed).toContain(`不带办公地图的应用已经做好并签了名，它的 dmg 和 zip 在 ${out}。`)
      expect(secondFailed).toContain('带办公地图的应用没有做。')
    }
  })
})
