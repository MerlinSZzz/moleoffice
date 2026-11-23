// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * `npm run bundle`: THE OFFICE AS ESBUILD BUNDLES, IN ONE FOLDER. Packaging step 1 of the closed-beta
 * plan (record l1RSxzw-j4P7, row 6 and section 2.2) and the build-shape decision zjs1me8BC6UQ.
 *
 *   node scripts/bundle.mjs [--out <folder>] [--for win32-x64]      default: dist/bundle in this checkout
 *
 * WHICH SYSTEM IT IS FOR. A bundle is made for the machine it runs on, or with --for win32-x64 for Windows
 * on a 64-bit Intel or AMD processor (round W13; scripts/the-bundle-target.mjs). The JavaScript is the
 * same; the native files are the target's. A bundle for Windows made on Linux carries the avatar codec's
 * Windows package, fetched at the version and sha512 package-lock.json locks (scripts/checked-downloads.mjs),
 * and the shell that a bundle for this machine opens through node-pty cannot be opened here; it says so.
 *
 * WHAT THE FOLDER HOLDS:
 *   - server.mjs, worker.mjs, mole-office.mjs and window.mjs: the server, the message worker, the
 *     `mole-office` command and the standalone window, each the ES module esbuild writes for its
 *     entry (Electron itself stays outside the window's). Which entry makes which file is
 *     THE_BUNDLES in src/config/settings.mjs, the one place that says it. The `@shared/*` alias and the
 *     `.ts` imports resolve through tsconfig.json.
 *   - attention-thread.mjs: the server's attention thread, built the same way from its own entry, because
 *     a worker thread starts from a file and a bundle has no tsx (THE_THREAD_BUNDLES in settings.mjs).
 *   - chunk-<hash>.mjs, beside them: the code that two or more of the programs, the threads and the agent tools
 *     below import. esbuild builds them all in one build with splitting on, and puts each module into one
 *     file only, so the folder carries it once. A file whose code is imported only with import() is a chunk of its
 *     own, loaded the first time that import runs.
 *   - windows-stop-pipe.ps1, beside them: the PowerShell helper that owns a program's stop pipe on Windows. The
 *     module that reads it looks for it beside itself, and in a bundle that module is in a chunk beside them
 *     (THE_STOP_HELPER in src/config/systems/windows-groups.mjs).
 *   - node_modules/better-sqlite3: the one module kept outside the bundles, because it loads a native
 *     file. Its JavaScript and the one prebuilt native file for the system and processor the bundle is
 *     for are copied as they are; the others are not.
 *   - drizzle/, the migrations, without drizzle-kit's snapshots in drizzle/meta/, and with a neutral word for the
 *     default the two first migrations gave the owner and author columns, which was a person's user name
 *     (scripts/the-migrations-in-a-bundle.mjs); dist/web, the built page, which also holds every file of public/
 *     (Vite copies them, and the server reads them there: THE_PUBLIC_FOLDER in src/config/settings.mjs);
 *     src/config/rules/default-regulations.json, src/config/rules/USER.md and src/config/roles.json, the
 *     default regulations, the user part of the rules and the role cards. These are the code's own files,
 *     under the install's root at the paths a checkout has them. CODE.md and chapters.json are not
 *     carried: they are the export of the chapters of the office this repository is developed in, and an
 *     installed office reads its own chapter records (wave 13w).
 *     CLAUDE.md is not carried: it is written for the agents that develop the office, and the owner's decision keeps it
 *     out of an installer. scripts/no-development-material.mjs refuses an installer that
 *     carries it.
 *   - for-agents/: what an agent of the office runs. register-myself.mjs is built with the programs and
 *     imports the chunks one folder up (THE_AGENTS_TOOLS in src/config/settings.mjs), and so is
 *     session-hook.mjs, which Claude Code runs when an agent's session starts, after each turn and when the
 *     session ends (THE_SESSION_HOOK); the waiter's kit, its scripts and its README, is copied as it is.
 *     hold-the-handle.mjs is built alone into one file that imports no chunk, because the office serves that
 *     file as it is to an agent on another machine (theWaiterAsOneFile in src/server/api/handles.ts).
 *     main-world-guard.mjs and opencode-plugin.mjs, the main-world guard every runtime on the host calls and the
 *     OpenCode plugin that calls it, are built into one file each that shares nothing (THE_GUARDS_BUILT_FILES in
 *     src/config/settings.mjs), because the guard runs only when its own file is the program.
 *     .claude/skills/mole-office/ is the skill those agents read, copied as it is.
 *   - holder.mjs, the terminal holder, built alone into one file that imports no chunk, and node_modules/node-pty
 *     beside it, the one module it loads from outside because it loads a native file: its package.json,
 *     lib/, LICENSE and the prebuilt native files for the system and processor the bundle is for
 *     (scripts/the-terminal-in-a-bundle.mjs). In a bundle for this machine, the Node running this opens a
 *     shell through it before the notices are written, so a bundle that cannot hold a terminal is not made.
 *   - LICENSE and NOTICE, Mole Office's own: the place for the agreement a tester receives it under.
 *     Until that agreement is written, LICENSE holds the copyright notice and says no licence is granted
 *     without a written agreement.
 *   - THIRD-PARTY-NOTICES.txt: every package the bundles and the page were built from, with its
 *     licence texts (scripts/third-party-notices.mjs).
 *   - build-stamp.json: the build's stamp, written by src/config/build-stamp.mjs, the same writer the
 *     built page's stamp comes from. Its presence is how the office tells it runs from a bundle
 *     (src/config/settings.mjs, THE INSTALL AND ITS DATA), and it names the build: the commit, when it
 *     was made, the newest source the server was bundled from, and package.json's version, which
 *     theVersion() reads back.
 *
 * Nothing in the folder is data. A bundle keeps its data in the per-user data folder.
 *
 * It needs the built page, so `npm run build` comes first; without it this stops and says so. It
 * writes into a folder that does not exist yet, or one that already holds a bundle (it has a stamp),
 * and refuses any other folder, so it never writes over something that is not a bundle.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { build } from 'esbuild'
import { theBuildStampIn, writeTheBuildStamp } from '../src/config/build-stamp.mjs'
import { THE_SERVER_ENTRY, newestSourceBuiltFrom } from '../src/config/newest-source.mjs'
import {
  THE_AGENTS_TOOLS,
  THE_BUNDLES,
  THE_FOR_AGENTS_FOLDER,
  THE_GUARDS_BUILT_FILES,
  THE_INSTALL,
  THE_SESSION_HOOK,
  THE_THREAD_BUNDLES,
  REPO_ROOT,
  theVersion,
} from '../src/config/settings.mjs'
import { THE_BUILT_PAGE, THE_PAGES_MODULES, missingWebBuild } from '../src/config/the-built-page.mjs'
import { THE_STOP_HELPER } from '../src/config/systems/windows-groups.mjs'
import { THE_DEFAULT_REGULATIONS_FILE } from '../src/server/lib/read-the-default-regulations.ts'
import { developmentMaterialIn, theRefusal } from './no-development-material.mjs'
import { ownerContentIn, theOwnerContentRefusal, theUncheckedSaid, whatTheEntriesLet } from './no-owner-content.mjs'
import { theCommentsStayOut } from './the-comments-stay-out.mjs'
import { copyTheMigrationsInto } from './the-migrations-in-a-bundle.mjs'
import { buildTheTerminalInto, theShellAnswersThroughThePty, THE_PTY_MODULE } from './the-terminal-in-a-bundle.mjs'
import { copyAvatarCodecInto, theAvatarCodecPackageFor } from './avatar-codec-in-a-bundle.mjs'
import { isThisMachine, theBundleTarget, theTargetsName } from './the-bundle-target.mjs'
import { fetchTheLockedPackage } from './checked-downloads.mjs'
import { packageFoldersOf, readThePagesModules, writeTheThirdPartyNotices } from './third-party-notices.mjs'

/** @param {string} line */
const say = (line) => process.stdout.write(`${line}\n`)

/** @param {string} line @returns {never} */
function fail(line) {
  process.stderr.write(`${line}\nNothing was bundled.\n`)
  process.exit(1)
}

if (THE_INSTALL.from !== 'checkout') fail('A bundle is made from a checkout, and this is not one.')
const asked = theBundleTarget(process.argv.slice(2), { platform: process.platform, arch: process.arch })
if ('refused' in asked) fail(asked.refused)
const target = asked.target
const here = isThisMachine(target, { platform: process.platform, arch: process.arch })

const at = process.argv.indexOf('--out')
const out = at === -1 ? join(REPO_ROOT, 'dist', 'bundle') : resolve(String(process.argv[at + 1] ?? ''))
if (at !== -1 && (process.argv[at + 1] ?? '') === '') fail('--out needs a folder.')
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(theBuildStampIn(out))) {
  fail(`${out} is not empty and holds no bundle, so it is not written over.`)
}
const missing = missingWebBuild(THE_BUILT_PAGE)
if (missing !== null) fail(missing)

mkdirSync(out, { recursive: true })
// An earlier bundle's stamp goes first: it is written again last, so a folder whose bundling stops part
// way holds no stamp and is never read as a whole bundle.
rmSync(theBuildStampIn(out), { force: true })

// THE PROGRAMS, IN ONE BUILD. `require` is made available because some bundled packages are CommonJS. Every
// source file esbuild reads is kept, so what was compiled in can be checked below. None of our comments goes in
// (scripts/the-comments-stay-out.mjs).
/** @type {string[]} */
const sources = []
// WHAT AN AGENT RUNS is bundled in the same build, into for-agents/ at the same names: the registration tool
// and the session hook. Each runs on the installation's own Node and imports the chunks one folder up. Code built
// into one of them finds the bundle's stamp one folder up, and code in a chunk finds it beside itself
// (src/config/settings.mjs, whereTheStampIs).
/** The waiter's tool, which is built alone, after the others. */
const THE_WAITERS_TOOL = 'hold-the-handle.mjs'
if (!THE_AGENTS_TOOLS.includes(THE_WAITERS_TOOL)) fail(`${THE_WAITERS_TOOL} is not in THE_AGENTS_TOOLS in src/config/settings.mjs, so which agent tool to build alone is not known.`)
const everyBundle = [
  ...Object.entries(THE_BUNDLES).map(([entry, file]) => ({ entry, file })),
  // THE SERVER'S THREADS, each a file of its own, because a worker thread starts from a file and a bundle
  // has no tsx to start a TypeScript one (THE_THREAD_BUNDLES in src/config/settings.mjs).
  ...Object.entries(THE_THREAD_BUNDLES).map(([entry, file]) => ({ entry, file })),
  ...[...THE_AGENTS_TOOLS.filter((tool) => tool !== THE_WAITERS_TOOL), THE_SESSION_HOOK].map((tool) => ({ entry: join(THE_FOR_AGENTS_FOLDER, tool), file: join(THE_FOR_AGENTS_FOLDER, tool) })),
]
/** @type {import('esbuild').BuildOptions} How both builds below build. */
const theOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: join(REPO_ROOT, 'tsconfig.json'),
  // THE CHECK TOOLS STAY OUT. The server's sweep of check worktrees imports tools/check-worktrees.mjs
  // (src/server/lib/resources.ts), and tools/ never ships. As an external it is left as an import that
  // an installed office never makes: src/server/lib/check-worktrees.ts does not sweep from one.
  external: ['better-sqlite3', 'electron', '../../../tools/*'],
  banner: { js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);" },
  plugins: [theCommentsStayOut],
  logLevel: 'warning',
}
// THE CHUNKS ARE AT THE FOLDER'S ROOT, beside the programs. A module reads a file beside it through its own
// import.meta.url, which in a chunk is the chunk's own place. At the root that is the folder each such read
// used before the build was split (THIS_CODES_FOLDER in src/config/settings.mjs, THE_STOP_HELPER in
// src/config/systems/windows-groups.mjs).
const THE_CHUNKS = 'chunk-'
// An earlier bundle's chunks go first. A chunk is named by a hash of what it holds, so a new build does not
// write over them, and they would stay beside its own.
for (const name of readdirSync(out)) {
  if (name.startsWith(THE_CHUNKS) && name.endsWith('.mjs')) rmSync(join(out, name))
}
/** @type {Record<string, string>} each entry's source, by the path it is written to without its .mjs */
const entryPoints = {}
for (const { entry, file } of everyBundle) {
  if (!file.endsWith('.mjs')) fail(`${file} does not end in .mjs, and the build writes every program as a .mjs file.`)
  entryPoints[file.slice(0, -'.mjs'.length)] = join(REPO_ROOT, entry)
}
const split = await build({ ...theOptions, metafile: true, entryPoints, outdir: out, splitting: true, outExtension: { '.js': '.mjs' }, chunkNames: `${THE_CHUNKS}[hash]` })
sources.push(...Object.keys(split.metafile.inputs))
for (const { entry, file } of everyBundle) say(`Bundled ${entry} into ${join(out, file)}.`)
const chunks = Object.keys(split.metafile.outputs).filter((path) => basename(path).startsWith(THE_CHUNKS))
say(`Wrote ${String(chunks.length)} chunks into ${out}: each holds code the files above share, or code one of them loads with import().`)

// THE WAITER'S TOOL, BUILT ALONE into one file that imports no chunk. The office serves this file as it is to an
// agent on another machine, which runs it with nothing beside it (theWaiterAsOneFile in src/server/api/handles.ts).
const waiter = join(THE_FOR_AGENTS_FOLDER, THE_WAITERS_TOOL)
const alone = await build({ ...theOptions, metafile: true, entryPoints: [join(REPO_ROOT, waiter)], outfile: join(out, waiter) })
sources.push(...Object.keys(alone.metafile.inputs))
say(`Bundled ${waiter} alone into ${join(out, waiter)}.`)

// THE MAIN-WORLD GUARD AND ITS OPENCODE PLUGIN, each built into one file that imports no chunk, with nothing shared.
// The guard runs only when the program's address is the guard's own module's, and the plugin imports the guard; in
// the split build above the guard's code would move into a chunk, and the guard's file would then exit 0 on every
// call without reading it. Not because a file is served alone, as the waiter's is: the two only need their own code
// in their own file. Code built into either finds the bundle's stamp one folder up, as the tools above do.
const guards = await build({
  ...theOptions,
  metafile: true,
  entryPoints: Object.fromEntries(THE_GUARDS_BUILT_FILES.map((file) => [join(THE_FOR_AGENTS_FOLDER, file.slice(0, -'.mjs'.length)), join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, file)])),
  outdir: out,
  outExtension: { '.js': '.mjs' },
})
sources.push(...Object.keys(guards.metafile.inputs))
for (const file of THE_GUARDS_BUILT_FILES) say(`Bundled ${join(THE_FOR_AGENTS_FOLDER, file)} alone into ${join(out, THE_FOR_AGENTS_FOLDER, file)}.`)

// THE NATIVE MODULE, outside the bundles: its JavaScript, and the one prebuilt native file for the
// target's system and processor, which is the one its lib/binding.js loads there.
const sqlite = join(REPO_ROOT, 'node_modules', 'better-sqlite3')
const nativeFile = join('prebuilds', `${theTargetsName(target)}.node`)
if (!existsSync(join(sqlite, nativeFile))) fail(`better-sqlite3 has no prebuilt native file ${nativeFile} for ${theTargetsName(target)}.`)
for (const part of ['package.json', 'lib', nativeFile]) {
  cpSync(join(sqlite, part), join(out, 'node_modules', 'better-sqlite3', part), { recursive: true })
}
say(`Copied better-sqlite3 and its ${nativeFile} into ${join(out, 'node_modules', 'better-sqlite3')}.`)

// THE MIGRATIONS, without drizzle-kit's snapshots and with no person's name as a default.
try {
  say(copyTheMigrationsInto(join(out, 'drizzle')))
} catch (error) {
  fail(`The migrations could not be copied: ${error instanceof Error ? error.message : String(error)}`)
}

// THE CODE'S OWN FILES.
for (const [from, to] of /** @type {[string, string][]} */ ([
  [THE_BUILT_PAGE, join(out, 'dist', 'web')],
  // Read by the server from the install's root at the same paths a checkout has them: the default
  // regulations it copies into a new office, the user part of the rules, and the role cards. Not the
  // export of the chapters, CODE.md and chapters.json: an installed office reads its own chapter records.
  ...[THE_DEFAULT_REGULATIONS_FILE, join('src', 'config', 'rules', 'USER.md')].map((file) => /** @type {[string, string]} */ ([
    join(REPO_ROOT, file),
    join(out, file),
  ])),
  [join(REPO_ROOT, 'src', 'config', 'roles.json'), join(out, 'src', 'config', 'roles.json')],
  // The script the terminal holder runs to show an agent's tmux pane (THE_PANE_VIEW in src/server/lib/agent-pane.ts).
  [join(REPO_ROOT, 'src', 'config', 'tmux-pane-view.mjs'), join(out, 'src', 'config', 'tmux-pane-view.mjs')],
  // The stop pipe's helper, beside the bundles that read it (THE_STOP_HELPER in src/config/systems/windows-groups.mjs).
  [join(REPO_ROOT, 'src', 'config', 'systems', THE_STOP_HELPER), join(out, THE_STOP_HELPER)],
  // Mole Office's own licence and notice, at the install's root.
  [join(REPO_ROOT, 'LICENSE'), join(out, 'LICENSE')],
  [join(REPO_ROOT, 'NOTICE'), join(out, 'NOTICE')],
  // The window's own pages and pictures, at the paths src/desktop/main.mjs reads them from.
  [join(REPO_ROOT, 'src', 'desktop'), join(out, 'src', 'desktop')],
  [join(REPO_ROOT, 'assets', 'mole-office.png'), join(out, 'assets', 'mole-office.png')],
  [join(REPO_ROOT, 'src', 'web', 'logo'), join(out, 'src', 'web', 'logo')],
  // The office's colours, which the window's check page reads so it looks like the office.
  [join(REPO_ROOT, 'src', 'web', 'tokens.css'), join(out, 'src', 'web', 'tokens.css')],
  // THE SKILL an installed office's agents read, at the path a checkout has it (src/worker/rules.ts reads
  // it there too). Its words name nothing an installed office does not carry (tests/the-installed-office-
  // carries-what-an-agent-starts-with.test.ts).
  [join(REPO_ROOT, '.claude', 'skills', 'mole-office'), join(out, '.claude', 'skills', 'mole-office')],
  // THE WAITER'S KIT, every file of for-agents/ that is not built above, as it is written.
  ...readdirSync(join(REPO_ROOT, THE_FOR_AGENTS_FOLDER))
    .filter((name) => !THE_AGENTS_TOOLS.includes(name) && !name.endsWith('.mjs') && statSync(join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, name)).isFile())
    .map((name) => /** @type {[string, string]} */ ([join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, name), join(out, THE_FOR_AGENTS_FOLDER, name)])),
])) {
  cpSync(from, to, { recursive: true })
  say(`Copied ${from} into ${to}.`)
}

// THE TERMINAL: the holder and node-pty, in every bundle (wave 13t, round 17). Before the notices, so they
// name what holder.mjs was built from and node-pty, and before the check below, so what holder.mjs was
// built from is read for development material with the rest.
let terminal
try {
  terminal = await buildTheTerminalInto(out, /** @type {NodeJS.Platform} */ (target.platform), target.arch)
} catch (error) {
  fail(`The terminal holder could not be put into the bundle: ${error instanceof Error ? error.message : String(error)}`)
}
for (const line of terminal.said) say(line)
sources.push(...terminal.sources)
if (here) {
  const shell = theShellAnswersThroughThePty(out, process.execPath)
  if (!shell.ok) fail(`This Node cannot open a shell through the ${THE_PTY_MODULE} beside the bundle: ${shell.said}`)
  say(`This Node opens a shell through ${THE_PTY_MODULE} beside the bundle and reads it back (${shell.said}).`)
} else {
  say(`NOT RUN: no shell was opened through the ${THE_PTY_MODULE} beside the bundle, whose native files are for ${theTargetsName(target)} and not for this machine.`)
}

// THE THIRD-PARTY NOTICES, for every package the bundles, the page and the copied native modules carry.
let avatarCodec
try {
  if (here) avatarCodec = copyAvatarCodecInto(out)
  else {
    // ANOTHER SYSTEM'S CODEC, fetched into this machine's cache, as the shipped Node is (scripts/the-shipped-node.mjs).
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'))
    const name = theAvatarCodecPackageFor(target.platform, target.arch)
    const fetched = await fetchTheLockedPackage(name, { lock, cache: join(homedir(), '.cache', 'mole-office', 'npm'), say })
    avatarCodec = copyAvatarCodecInto(out, { ...target, folder: fetched.folder, version: fetched.version })
  }
} catch (error) {
  fail(`The avatar codec could not be put into the bundle: ${error instanceof Error ? error.message : String(error)}`)
}
say(`Copied the avatar codec and ${String(avatarCodec.packages.length)} runtime packages for ${theTargetsName(target)}.`)
let notices
try {
  notices = writeTheThirdPartyNotices({
    folder: out,
    folders: [
      ...packageFoldersOf(sources, process.cwd()),
      ...packageFoldersOf(readThePagesModules(THE_PAGES_MODULES, THE_BUILT_PAGE), REPO_ROOT),
      sqlite,
      terminal.pty,
      ...avatarCodec.folders,
    ],
  })
} catch (error) {
  fail(`The third-party notices could not be written: ${error instanceof Error ? error.message : String(error)}`)
}
say(`Wrote ${notices.written}, naming ${String(notices.packages)} packages${notices.withoutAFile.length === 0 ? '' : `; ${String(notices.withoutAFile.length)} of them carry no licence file of their own and are named with what their package.json says`}.`)

// NO DEVELOPMENT MATERIAL: nothing from tests/, tools/ or design/ compiled in or copied beside it
// (scripts/no-development-material.mjs). Checked before the stamp, so a refused folder holds no bundle.
const carried = developmentMaterialIn({ root: REPO_ROOT, sources, folder: out })
if (carried.length > 0) {
  process.stderr.write(`${theRefusal('The bundle', carried)}\nNo bundle was made: ${out} holds what was made so far, with no stamp, and the next bundle into it is refused until it is emptied.\n`)
  process.exit(1)
}
say(`The bundle carries nothing from tests/, tools/ or design/: ${String(new Set(sources).size)} source files compiled in, and every file in ${out}, were read.`)

// NONE OF THE OWNER'S CONTENT, read in the built bytes of every file in the folder (scripts/no-owner-content.mjs).
// Also before the stamp.
let owners
try {
  owners = ownerContentIn({ folder: out, root: REPO_ROOT })
} catch (error) {
  fail(`The bundle could not be read for the owner's content: ${error instanceof Error ? error.message : String(error)}`)
}
if (owners.found.length > 0) {
  process.stderr.write(`${theOwnerContentRefusal('The bundle', owners.found)}\nNo bundle was made: ${out} holds what was made so far, with no stamp, and the next bundle into it is refused until it is emptied.\n`)
  process.exit(1)
}
const notLookedFor = theUncheckedSaid(owners.unchecked)
say(
  `The bundle carries none of the owner's content${notLookedFor === null ? '' : ' that was looked for'}: ${String(owners.read)} files read in their built bytes, ` +
    `${String(owners.notText.length)} not text and not read. ${whatTheEntriesLet(owners.let)}${notLookedFor === null ? '' : ` ${notLookedFor}`}`,
)

// THE STAMP, last, so a folder with a stamp holds a whole bundle.
let commit = null
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
} catch {
  // Not a git checkout. The stamp says no commit was recorded rather than guessing one.
}
const newest = newestSourceBuiltFrom(THE_SERVER_ENTRY)
const version = theVersion()
if (version === null) fail('package.json names no version.')
const { written } = writeTheBuildStamp(out, {
  commit,
  version,
  newestSource: newest === null ? null : { at: newest.at, file: newest.file, files: newest.files },
})
say(`Wrote the build stamp ${written}, version ${version}${commit === null ? ', with no commit recorded' : `, commit ${commit}`}.`)
