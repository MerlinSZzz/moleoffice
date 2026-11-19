// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MAC BUILD'S OWN KNOWLEDGE, apart from the commands that act on it, so a test on Linux can read every
 * answer (wave 13t, round 20). scripts/build-on-a-mac.mjs and scripts/package-mac.mjs ask this.
 *
 * It imports only Node's own modules and src/config/settings.mjs, which imports only Node's own modules too.
 * scripts/build-on-a-mac.mjs runs from a fresh clone before `npm ci`, when there is no node_modules yet, and
 * it imports this.
 *
 * THE RULES IT FOLLOWS:
 *   - their own Apple Developer account signs the app, with the Developer ID
 *     Application certificate in their login keychain;
 *   - Apple silicon only, so it builds for arm64 and nothing else;
 *   - it is built and signed on their own Mac;
 *   - a dmg and a zip (decision fdIhVGe4R7fp).
 *
 * WHAT IT NEVER DOES: ask for, print, read aloud or store a password or a key. The certificate's private key
 * stays in their keychain and `codesign` uses it there. The notarisation credentials stay in their keychain as
 * the profile THE_NOTARY_PROFILE, which they stored with `xcrun notarytool store-credentials`, and
 * `notarytool` reads them there. This build only names the profile.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { THE_SHIPPED_NODE_VERSION } from '../src/config/settings.mjs'
import { THE_LANGUAGES_CARRIED } from './the-packed-app.mjs'

/** The keychain profile that holds their notarisation credentials (the secretary's steps to them, 5 October, 18:09). */
export const THE_NOTARY_PROFILE = 'mole-office-notary'

/** The one processor the Mac app is built for. */
export const THE_MAC_ARCH = 'arm64'

/** The major version of Node the build runs on: the shipped Node's, read from where it is named once. */
export const THE_BUILDS_NODE_MAJOR = Number(THE_SHIPPED_NODE_VERSION.split('.')[0])

/**
 * Homebrew's Node defaults to OpenSSL's CA file, which may not be usable on this Mac.
 * Build subprocesses use Node's bundled roots and, when supported, macOS's trusted roots as well.
 * Verification stays enabled. Debug settings are cleared so signing metadata cannot enter logs.
 *
 * Playwright's Chromium goes into the checkout's node_modules (PLAYWRIGHT_BROWSERS_PATH=0, Playwright's own
 * setting for that), unless the person has named another folder (round W30). Otherwise Playwright keeps it under
 * the home folder, in ~/Library/Caches on a Mac. The plain privacy run gives its tests a home of their own, and
 * they would find no browser there.
 */
export function configureMacBuildEnvironment() {
  const flags = ['--use-bundled-ca']
  if (process.allowedNodeEnvironmentFlags.has('--use-system-ca')) flags.push('--use-system-ca')
  let options = process.env.NODE_OPTIONS ?? ''
  for (const flag of flags) if (!options.split(/\s+/).includes(flag)) options = `${options} ${flag}`.trim()
  process.env.NODE_OPTIONS = options
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'
  process.env.npm_config_strict_ssl = 'true'
  delete process.env.DEBUG
  delete process.env.NODE_DEBUG
  delete process.env.NODE_DEBUG_NATIVE
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
}

/** The start of every line `security find-identity` prints for a certificate that signs apps outside the App Store. */
const DEVELOPER_ID = 'Developer ID Application: '

/**
 * @typedef {{ name: string, en: string, zh: string }} MacRefusal
 * A reason the build stops, by name, in English and in Chinese. Nothing was built when one is said.
 */

/**
 * @param {string} name
 * @param {string} en
 * @param {string} zh
 * @returns {MacRefusal}
 */
const refusal = (name, en, zh) => ({ name, en, zh })

/**
 * Whether this computer can build the Mac app at all: a Mac, with Apple silicon, running a Node 22 that loads
 * TypeScript. Asked first, before anything else is run.
 *
 * package-mac.mjs imports the plain privacy run, scripts/the-plain-privacy-run.mjs, and that imports a TypeScript
 * file. Node 22 loads one by default from 22.18 on, unless --no-experimental-strip-types turns that off. A Node
 * that cannot would stop after `npm ci`, the downloads and the page's build (round W30). A Node before 22.10 does
 * not say whether it can, and is refused as one that cannot.
 *
 * This reads the Node that runs the check. The Node programs the build starts get its NODE_OPTIONS, not the flags
 * on its command line. So a Node before 22.18 given --experimental-strip-types on the command line alone passes
 * here, and package-mac.mjs then stops at that import with Node's own error.
 *
 * nodejs.org's LTS download is a later Node than 22 now, so the refusals about Node name the folder of the newest
 * Node 22 instead.
 *
 * @param {{ platform: string, arch: string, nodeVersion: string, typeStripping?: string | false }} machine
 *   what thisMachine() reads from the Node that runs the build
 * @returns {MacRefusal | null}
 */
export function theMachineRefusal({ platform, arch, nodeVersion, typeStripping }) {
  if (platform !== 'darwin') {
    return refusal(
      'notAMac',
      `This builds the Mac app, and it needs a Mac. This computer runs ${platform}. Nothing was built.`,
      `这一步做的是 Mac 版，必须在 Mac 上运行。这台电脑是 ${platform}。什么都没有做。`,
    )
  }
  if (arch !== THE_MAC_ARCH) {
    return refusal(
      'notAppleSilicon',
      `The Mac app is built for Apple silicon only, and this Node runs on ${arch}. On an Apple silicon Mac, install the arm64 Node from nodejs.org, not one that runs under Rosetta. Nothing was built.`,
      `Mac 版只为 Apple 芯片构建，而这个 Node 运行在 ${arch} 上。请在 Apple 芯片的 Mac 上，从 nodejs.org 安装 arm64 版的 Node，不要用通过 Rosetta 运行的版本。什么都没有做。`,
    )
  }
  const major = Number(/^v(\d+)\./.exec(nodeVersion)?.[1])
  const newest = `nodejs.org/dist/latest-v${String(THE_BUILDS_NODE_MAJOR)}.x`
  if (major !== THE_BUILDS_NODE_MAJOR) {
    return refusal(
      'notNode22',
      `The build runs on Node ${String(THE_BUILDS_NODE_MAJOR)}, and this is Node ${nodeVersion}. Install the newest Node ${String(THE_BUILDS_NODE_MAJOR)} from ${newest} (the .pkg file), then run this again. Nothing was built.`,
      `构建需要 Node ${String(THE_BUILDS_NODE_MAJOR)}，而这里是 Node ${nodeVersion}。请从 ${newest} 安装最新的 Node ${String(THE_BUILDS_NODE_MAJOR)}（.pkg 文件），然后再运行一次。什么都没有做。`,
    )
  }
  if (!typeStripping) {
    return refusal(
      'noTypeStripping',
      `This Node, ${nodeVersion}, cannot load a TypeScript file, and the build loads one. Node does that by default from 22.18 on. Install the newest Node ${String(THE_BUILDS_NODE_MAJOR)} from ${newest} (the .pkg file), or leave --no-experimental-strip-types out of the command and out of NODE_OPTIONS, then run this again. Nothing was built.`,
      `这个 Node（${nodeVersion}）无法加载 TypeScript 文件，而构建需要加载一个。Node 从 22.18 起默认可以加载。请从 ${newest} 安装最新的 Node ${String(THE_BUILDS_NODE_MAJOR)}（.pkg 文件），或者在命令和 NODE_OPTIONS 里都去掉 --no-experimental-strip-types，然后再运行一次。什么都没有做。`,
    )
  }
  return null
}

/**
 * The machine as the Node that runs the build sees it, for theMachineRefusal. `typeStripping` is
 * `process.features.typescript`: 'strip' or 'transform' when this Node loads TypeScript, and false when it does not.
 */
export const thisMachine = () => ({
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  typeStripping: process.features.typescript,
})

/**
 * Whether Apple's command-line tools are there: `xcode-select -p` names their folder, and `xcrun` finds
 * `notarytool` and `stapler` in it.
 *
 * @param {{ selected: boolean, notarytool: boolean, stapler: boolean }} found
 * @returns {MacRefusal | null}
 */
export function theXcodeRefusal({ selected, notarytool, stapler }) {
  if (selected && notarytool && stapler) return null
  return refusal(
    'noXcodeTools',
    "Apple's command-line tools are not installed, and signing and notarising need them. Run `xcode-select --install`, press Install in the window that opens, and run this again when it has finished. Nothing was built.",
    '没有安装 Apple 的命令行工具，签名和公证需要它们。请运行 `xcode-select --install`，在弹出的窗口里点“安装”，装完后再运行一次。什么都没有做。',
  )
}

/**
 * @typedef {{ hash: string, name: string, team: string }} DeveloperId
 * One Developer ID Application certificate with its private key: its SHA-1 as `security` prints it, its
 * name without the "Developer ID Application: " in front, and the team id in brackets at its end.
 */

/**
 * The Developer ID Application certificates in `security find-identity -v -p codesigning`'s output. That
 * command lists only certificates whose private key is in the keychain and that are valid now, one a line:
 *   `  1) 0123…CDEF "Developer ID Application: Name (TEAMID1234)"`
 *
 * @param {string} said
 * @returns {DeveloperId[]}
 */
export function theDeveloperIds(said) {
  /** @type {DeveloperId[]} */
  const found = []
  for (const line of said.split('\n')) {
    const match = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(.*)"\s*$/.exec(line)
    const [, hash, full] = match ?? []
    if (hash === undefined || full === undefined || !full.startsWith(DEVELOPER_ID)) continue
    const name = full.slice(DEVELOPER_ID.length)
    const team = /\(([A-Z0-9]{10})\)$/.exec(name)?.[1]
    if (team === undefined) continue
    found.push({ hash, name, team })
  }
  return found
}

/**
 * Whether there is exactly one certificate to sign with.
 *
 * @param {DeveloperId[]} found
 * @returns {MacRefusal | null}
 */
export function theCertificateRefusal(found) {
  if (found.length === 1) return null
  if (found.length === 0) {
    return refusal(
      'noCertificate',
      'Your keychain holds no Developer ID Application certificate with its private key, so nothing can sign the app. ' +
        'Make one in Xcode: Settings, Accounts, choose your Apple ID, Manage Certificates, press +, and choose Developer ID Application. ' +
        'If you made it on another Mac, export it there from Keychain Access with its private key as a .p12 file and open that file here. Nothing was built.',
      '你的钥匙串里没有带私钥的 “Developer ID Application” 证书，所以无法给应用签名。' +
        '请在 Xcode 里创建：设置 › 帐户，选中你的 Apple ID，点“管理证书”，点 +，选 “Developer ID Application”。' +
        '如果证书是在另一台 Mac 上创建的，请在那台 Mac 的“钥匙串访问”里把它连同私钥导出为 .p12 文件，再在这台 Mac 上打开它。什么都没有做。',
    )
  }
  const names = found.map((id) => id.name).join('; ')
  return refusal(
    'moreThanOneCertificate',
    `Your keychain holds ${String(found.length)} Developer ID Application certificates (${names}), and the build will not choose between them. Keep the one you mean to sign with and remove the others in Keychain Access, then run this again. Nothing was built.`,
    `你的钥匙串里有 ${String(found.length)} 张 “Developer ID Application” 证书（${names}），构建不会替你选。请在“钥匙串访问”里只留下要用的那一张，删掉其他的，然后再运行一次。什么都没有做。`,
  )
}

/**
 * Whether `xcrun notarytool history --keychain-profile mole-office-notary` could use the profile. Its exit
 * code and what it printed; on success nothing it printed is shown, since nothing in it is needed.
 *
 * @param {{ code: number | null, said: string }} history
 * @param {string} team the certificate's team id, for the command that stores the profile
 * @returns {MacRefusal | null}
 */
export function theNotaryRefusal({ code, said }, team) {
  if (code === 0) return null
  if (/No Keychain password item found/i.test(said)) {
    const store = `xcrun notarytool store-credentials ${THE_NOTARY_PROFILE} --apple-id <your Apple ID email> --team-id ${team}`
    return refusal(
      'noNotaryProfile',
      `Your keychain holds no notarisation profile named ${THE_NOTARY_PROFILE}, so Apple cannot be asked to notarise the app. ` +
        `Make an app-specific password at account.apple.com (Sign-In and Security, App-Specific Passwords), then run \`${store}\`. ` +
        'It asks for that password itself and keeps it in your keychain; this build never sees it. Nothing was built.',
      `你的钥匙串里没有名为 ${THE_NOTARY_PROFILE} 的公证配置，所以无法请 Apple 公证这个应用。` +
        `请先在 account.apple.com（登录与安全 › App 专用密码）生成一个 App 专用密码，再运行 \`${store}\`。` +
        '它会自己向你要这个密码，并存进你的钥匙串；这个构建脚本看不到它。什么都没有做。',
    )
  }
  const firstLine = said.trim().split('\n')[0] ?? ''
  return refusal(
    'notaryDidNotAnswer',
    `notarytool could not use the profile ${THE_NOTARY_PROFILE} (exit ${String(code)}): ${firstLine} Check that this Mac is online and that you have accepted the newest agreement at developer.apple.com, then run this again. Nothing was built.`,
    `notarytool 无法使用配置 ${THE_NOTARY_PROFILE}（退出码 ${String(code)}）：${firstLine} 请确认这台 Mac 已联网，并且已在 developer.apple.com 接受最新的协议，然后再运行一次。什么都没有做。`,
  )
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {{ code: number | null, said: string, out: string }}
 */
function run(command, args) {
  const ran = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 })
  if (ran.error !== undefined) return { code: null, said: ran.error.message, out: '' }
  return { code: ran.status, said: `${ran.stdout}${ran.stderr}`, out: ran.stdout }
}

/**
 * EVERY CHECK BEFORE ANYTHING IS BUILT, in the order a person fixes them: the machine, Apple's tools, the
 * certificate, the notarisation profile. Runs the commands on this Mac.
 *
 * @param {{ local?: boolean }} [options] Local builds need signing, but no notary tools or credentials.
 * @returns {{ refused: MacRefusal } | { refused: null, id: DeveloperId }}
 */
export function checkThisMac({ local = false } = {}) {
  const machine = theMachineRefusal(thisMachine())
  if (machine !== null) return { refused: machine }
  const xcode = theXcodeRefusal({
    selected: run('xcode-select', ['-p']).code === 0,
    notarytool: local || run('xcrun', ['--find', 'notarytool']).code === 0,
    stapler: local || run('xcrun', ['--find', 'stapler']).code === 0,
  })
  if (xcode !== null) return { refused: xcode }
  const found = theDeveloperIds(run('security', ['find-identity', '-v', '-p', 'codesigning']).out)
  const certificate = theCertificateRefusal(found)
  if (certificate !== null) return { refused: certificate }
  const id = /** @type {DeveloperId} */ (found[0])
  if (local) return { refused: null, id }
  const history = run('xcrun', ['notarytool', 'history', '--keychain-profile', THE_NOTARY_PROFILE, '--output-format', 'json'])
  const notary = theNotaryRefusal(history, id.team)
  if (notary !== null) return { refused: notary }
  return { refused: null, id }
}

/** @param {MacRefusal} refused */
export const theRefusalSaid = (refused) => {
  // The count is useful, but certificate names read from the keychain must not enter build logs.
  if (refused.name === 'moreThanOneCertificate') return 'More than one Developer ID Application signing identity is available. Choose one before building. Nothing was built.\n有多张 Developer ID Application 签名证书，请先选择要使用的一张。什么都没有做。\n'
  return `${refused.en}\n${refused.zh}\n`
}

/**
 * @typedef {{ en: string, zh: string }} AnAppName
 * The app a step makes and signs, named for the sentence a later failure prints.
 *
 * @typedef {{ what: string, command: string, args: string[], signsAnApp?: AnAppName }} ABuildStep
 */

/**
 * THE STEPS OF scripts/build-on-a-mac.mjs, in order, once every check has passed. Each runs in the checkout,
 * and the first that fails stops the build.
 *
 * `npm ci` downloads no browser, and the plain privacy files that package-mac.mjs runs draw the first page in
 * Playwright's Chromium. So Chromium is installed after the packages, in the folder configureMacBuildEnvironment
 * names (round W30).
 *
 * @param {{ checkout: string, execPath: string, local: boolean, out: string, ownerContentVerdict?: string | null }} options
 * @returns {ABuildStep[]}
 */
export function theBuildSteps({ checkout, execPath, local, out, ownerContentVerdict = null }) {
  const verdictArguments = ownerContentVerdict === null ? [] : ['--owner-content-verdict', ownerContentVerdict]
  return [
    { what: 'Installing the packages', command: 'npm', args: ['ci'] },
    // This Electron package has no npm install hook. Its checked-in installer downloads and verifies
    // the arm64 runtime, and is a no-op when the matching runtime is already installed.
    { what: 'Installing the Electron runtime', command: execPath, args: [join(checkout, 'node_modules', 'electron', 'install.js')] },
    { what: 'Installing the browser the privacy files draw the page in', command: execPath, args: [join(checkout, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'] },
    { what: 'Building the page', command: 'npm', args: ['run', 'build'] },
    {
      what: local ? 'Making and signing the app for this Mac' : 'Making, signing and notarising the app',
      command: execPath,
      args: [join(checkout, 'scripts', 'package-mac.mjs'), '--out', out, ...(local ? ['--local'] : []), ...verdictArguments],
      signsAnApp: { en: 'The app without the office map', zh: '不带办公地图的应用' },
    },
    // THE SECOND APP, WITH THE OFFICE MAP, made the same way into the same folder under its own name
    // (scripts/the-office-map-part.mjs).
    {
      what: local ? 'Making and signing the app with the office map for this Mac' : 'Making, signing and notarising the app with the office map',
      command: execPath,
      args: [join(checkout, 'scripts', 'package-mac.mjs'), '--out', out, ...(local ? ['--local'] : []), '--with-the-map', ...verdictArguments],
      signsAnApp: { en: 'The app with the office map', zh: '带办公地图的应用' },
    },
  ]
}

/**
 * What a failed step says. A step that fails before any app was made and signed says that nothing was signed.
 * A step that fails after one was made and signed names that app, its output folder and the app that was not
 * made. The words are true with and without `--local`, so they say made and signed, never notarised.
 *
 * @param {{ what: string, why: string, steps: ABuildStep[], failed: number, out: string }} failure
 * @returns {string}
 */
export function theStepFailureSaid({ what, why, steps, failed, out }) {
  const signed = steps.slice(0, failed).filter((step) => step.signsAnApp !== undefined).at(-1)?.signsAnApp
  if (signed === undefined) {
    return `${what} failed (${why}); it says why above. Nothing was signed.\n${what} 失败了，原因在上面。没有签名任何文件。\n`
  }
  const notMade = steps[failed]?.signsAnApp
  const english = `${what} failed (${why}); it says why above. ${signed.en} was made and signed, and its dmg and zip are in ${out}. ${notMade === undefined ? 'No later app was made.' : `${notMade.en} was not made.`}\n`
  const chinese = `${what} 失败了，原因在上面。${signed.zh}已经做好并签了名，它的 dmg 和 zip 在 ${out}。${notMade === undefined ? '后面没有再做别的应用。' : `${notMade.zh}没有做。`}\n`
  return `${english}${chinese}`
}

/**
 * Whether a file's first bytes are a Mach-O program or library, the kind `codesign` must sign: thin 32-
 * and 64-bit, either byte order, and a universal file. A universal file's magic is also Java's class
 * file's, which no office file is.
 *
 * @param {Uint8Array} bytes at least the first four bytes of the file
 */
export function isMachO(bytes) {
  if (bytes.length < 4) return false
  const magic = Buffer.from(bytes.subarray(0, 4)).readUInt32BE(0)
  return [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(magic)
}

/**
 * WHAT THE HARDENED RUNTIME ALLOWS THE APP AND EVERY PROGRAM INSIDE IT. Apple notarises only a program
 * signed with the hardened runtime, and that runtime refuses by default what Electron and Node do:
 *   - allow-jit: V8 compiles JavaScript to machine code at run time, in Electron and in the shipped Node;
 *   - allow-unsigned-executable-memory: V8 also writes code to memory it did not map for JIT, as Electron
 *     documents for its own apps;
 *   - disable-library-validation: the shipped Node loads better-sqlite3's and node-pty's native files.
 *     They are signed by the same team in this build, so this should not be needed; it is here because
 *     nothing on Linux can show that, and the first build on their Mac says whether it is.
 */
export const THE_ENTITLEMENTS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">',
  '<dict>',
  '  <key>com.apple.security.cs.allow-jit</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.disable-library-validation</key>',
  '  <true/>',
  '</dict>',
  '</plist>',
  '',
].join('\n')

/**
 * What `codesign -dv --verbose=2 <file>` says that is wrong for a program in the app: not signed with the
 * hardened runtime, or signed by another team. Empty when nothing is wrong.
 *
 * @param {string} file
 * @param {string} said what codesign printed (it prints to stderr)
 * @param {string} team
 * @returns {string[]}
 */
export function theSignatureProblems(file, said, team) {
  if (/code object is not signed at all/.test(said)) return [`${file} is not signed.`]
  const wrong = []
  if (!/flags=0x[0-9a-f]*\([^)]*\bruntime\b[^)]*\)/.test(said)) wrong.push(`${file} is signed without the hardened runtime, so Apple would not notarise it.`)
  const signedBy = /^TeamIdentifier=(.*)$/m.exec(said)?.[1]
  if (signedBy !== team) wrong.push(`${file} is signed by team ${String(signedBy)}, not ${team}.`)
  return wrong
}

/**
 * What `xcrun notarytool submit --wait --output-format json` answered: the submission's id and Apple's
 * verdict. Only "Accepted" is a notarised file; "Invalid" and "Rejected" are not, and notarytool ends with
 * exit 0 for them all, so the verdict is read rather than the exit code.
 *
 * @param {string} out
 * @returns {{ id: string | null, status: string, accepted: boolean }}
 */
export function theNotaryVerdict(out) {
  /** @type {{ id?: unknown, status?: unknown }} */
  let said
  try {
    said = JSON.parse(out)
  } catch {
    return { id: null, status: `no answer notarytool could be read from (${out.trim().slice(0, 200)})`, accepted: false }
  }
  const id = typeof said.id === 'string' ? said.id : null
  const status = typeof said.status === 'string' ? said.status : 'no status'
  return { id, status, accepted: status === 'Accepted' }
}

/** THE_LANGUAGES_CARRIED as a Mac names its .lproj folders: with _ for -. */
export const theMacsLanguages = () => THE_LANGUAGES_CARRIED.map((language) => language.replace('-', '_'))

/**
 * THE ELECTRON-BUILDER CONFIGURATION FOR THE MAC: a signed .app with the hardened runtime, for arm64 only,
 * and nothing more. Notarising, the zip and the dmg are done after it by scripts/package-mac.mjs with
 * Apple's own tools, so each step says plainly what it did. The fuses are the Linux installers' with RunAsNode off
 * (THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC in scripts/the-packed-app.mjs), and on a Mac Electron does check the asar
 * against its hash.
 *
 * @param {{ app: string, work: string, output: string, version: string, electron: string, electronDist: string,
 *   identity: string | null, entitlements: string, icon: string }} what
 */
export function theMacBuilderConfig({ app, work, output, electron, electronDist, identity, entitlements, icon }) {
  return {
    appId: 'office.mole.desktop',
    productName: 'Mole Office',
    directories: { app, output },
    electronVersion: electron,
    electronDist,
    asar: true,
    npmRebuild: false,
    // As on Linux: copied from the staging folder, so office/node_modules is one level down
    // (scripts/package-linux.mjs says why). On a Mac it lands in Mole Office.app/Contents/Resources/office.
    extraResources: [
      { from: work, to: '.', filter: ['office/**/*'] },
      // The unpacked Electron.app does not contain the notices beside it in electronDist.
      { from: join(electronDist, 'LICENSE'), to: 'LICENSE.electron.txt' },
      { from: join(electronDist, 'LICENSES.chromium.html'), to: 'LICENSES.chromium.html' },
    ],
    // ELECTRON'S LANGUAGES, the ten of THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs, with _ for -. On a Mac
    // electron-builder matches the names of the .lproj folders, and a Mac names them with _, as zh_CN.lproj.
    electronLanguages: theMacsLanguages(),
    mac: {
      target: [{ target: 'dir', arch: [THE_MAC_ARCH] }],
      category: 'public.app-category.productivity',
      icon,
      // The certificate's name without "Developer ID Application: ", as electron-builder asks for it.
      identity,
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements,
      entitlementsInherit: entitlements,
      notarize: false,
    },
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    },
  }
}

// ------------------------------------------------------------------------------------------- the app's icon

/**
 * @typedef {{ width: number, height: number, rgba: Buffer }} APicture
 * A picture as its rows of red, green, blue and opacity bytes, top row first.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Read a PNG of 8-bit red, green, blue and opacity, not interlaced: the kind the owner's logo is. Throws
 * on any other kind rather than reading it wrongly.
 *
 * @param {Buffer} png
 * @returns {APicture}
 */
export function readAPng(png) {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('This is not a PNG file.')
  let at = 8
  let width = 0
  let height = 0
  /** @type {Buffer[]} */
  const data = []
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) {
        throw new Error(`Only 8-bit RGBA PNGs that are not interlaced are read here; this one has depth ${String(body[8])}, colour type ${String(body[9])}, interlace ${String(body[12])}.`)
      }
    }
    if (type === 'IDAT') data.push(body)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * 4
  const rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba.readUInt8(y * stride + x - 4) : 0
      const b = y > 0 ? rgba.readUInt8((y - 1) * stride + x) : 0
      const c = x >= 4 && y > 0 ? rgba.readUInt8((y - 1) * stride + x - 4) : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`Row ${String(y)} of the PNG has filter ${String(filter)}, which PNG does not define.`)
      rgba[y * stride + x] = (line.readUInt8(x) + add) & 0xff
    }
  }
  return { width, height, rgba }
}

/**
 * @param {string} type
 * @param {Buffer} body
 */
function aChunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

/** @param {Buffer} bytes */
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Write a picture as a PNG of 8-bit red, green, blue and opacity.
 * @param {APicture} picture
 */
export function writeAPng({ width, height, rgba }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([PNG_SIGNATURE, aChunk('IHDR', header), aChunk('IDAT', deflateSync(raw)), aChunk('IEND', Buffer.alloc(0))])
}

/**
 * THE MAC APP'S ICON: the owner's logo, on a square of the given side, centred,
 * with clear space around it. A Mac app's icon must be square and at least 512 pixels, and their logo is 477
 * by 406, so it is placed as it is, never stretched, and the rest is left clear.
 *
 * @param {APicture} logo
 * @param {number} side
 * @returns {APicture}
 */
export function onASquare(logo, side) {
  if (logo.width > side || logo.height > side) throw new Error(`The logo is ${String(logo.width)} by ${String(logo.height)}, larger than the ${String(side)}-pixel square.`)
  const rgba = Buffer.alloc(side * side * 4)
  const left = Math.floor((side - logo.width) / 2)
  const top = Math.floor((side - logo.height) / 2)
  for (let y = 0; y < logo.height; y++) {
    logo.rgba.copy(rgba, ((top + y) * side + left) * 4, y * logo.width * 4, (y + 1) * logo.width * 4)
  }
  return { width: side, height: side, rgba }
}

/** The side of the Mac app's icon: the smallest electron-builder takes for a Mac. */
export const THE_MAC_ICON_SIDE = 512
