// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { createServer } from 'node:http'
import { realpathSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import {
  REPO_ROOT,
  addressesForOtherMachines,
  mergedEnvironment,
  portFrom,
  readSetting,
  theApiThisBrowserAppFilesIn,
  viteCacheDirFrom,
  workspaceFrom,
} from './src/config/settings.mjs'
import { WORLD_HEADER, parseWorldHeader } from './src/config/world-header.mjs'
import { KEY_HEADER } from './src/config/key-header.mjs'
import { theOfficeKey } from './src/config/office-key.mjs'
import { THE_PAGES_ENTRY, THE_PAGES_FOLDERS, newestSourceBuiltFrom } from './src/config/newest-source.mjs'
import { THE_ALIASES, THE_PUBLIC_FOLDER, theFilesBuiltFrom } from './src/config/import-graph.mjs'
import { THE_RECORD_OF_WHAT_A_BUILD_READ, digestOfTheFilesBuiltFrom } from './src/config/content-digest.mjs'
import { THE_PAGES_MODULES } from './src/config/the-built-page.mjs'
import { THE_TROUBLE_ADDRESS, readTheTrouble, whatTheTroubleSays } from './src/config/supervisor-trouble.mjs'
import { localStamp } from './src/shared/time.ts'
import { startTimeOf } from './src/config/session-process.mjs'
import { fetchAFullList } from './for-agents/a-full-list-read.mjs'
import {
  THE_BROWSER_APP,
  theEarlierOwnRowsAmong,
  theOwnPartBlock,
  theOwnPartUsageReceipt,
  theReplacedOwnRowPatch,
} from './src/config/own-rows.mjs'

/** Where .env lives: the root of this checkout, as src/config/settings.mjs finds it. */
const repoRoot = REPO_ROOT

/**
 * Where the browser app's own files live: Vite's root, a few hundred lines below.
 *
 * Worked out from the page's entry rather than written again, because they cannot differ — the
 * entry is the page Vite serves out of its root.
 */
const THE_VITE_ROOT = THE_PAGES_ENTRY.slice(0, THE_PAGES_ENTRY.lastIndexOf('/'))

/**
 * The folders outside Vite's root that the browser app imports from, read from the one declaration
 * rather than spelt again here.
 *
 * `src/shared` is the folder both programs share. `src/config` joined it on 3 September 2026, when
 * the app started reading `src/config/world-header.mjs` — the one declaration of what the world
 * header on every reply says, criterion G3, which the server, the session hook and the browser all
 * have to read the same way. Both need the same watch for the same reason: see
 * `watchTheFoldersOutsideTheRoot` below for the account and the measurement.
 */
const foldersOutsideTheRoot = THE_PAGES_FOLDERS.filter((folder) => folder !== THE_VITE_ROOT).map((folder) =>
  fileURLToPath(new URL(`./${folder}`, import.meta.url)),
)

/**
 * THE TWO PORTS, FROM ONE ENVIRONMENT, AND THEIR DEFAULTS COME FROM THE DECLARATION.
 *
 * This function used to hold the defaults itself — `portFrom(env, 'MOLE_OFFICE_PORT', 8787)` — while
 * `src/server/index.ts` held a second copy of the same two numbers. That is the defect CLAUDE.md
 * names at the top: one fact worked out in two places, free to disagree, with nothing failing when
 * they do. Both halves of `npm run dev` now read `src/config/settings.mjs`, which is also what the
 * tools and the test helpers read.
 *
 * IT IS STILL EXPORTED AND STILL TAKES AN ENVIRONMENT, because a test CANNOT create "nothing is
 * set" by deleting a variable from `process.env`: the default export reads `.env` off the disk as
 * well, and no amount of deleting reaches a file. That once cost a red suite —
 * `tests/surface-fixes.test.ts` deleted MOLE_OFFICE_PORT, asserted 8787, and got the port `.env`
 * named, because the port had been moved in `.env` and the assertion had been describing an empty
 * `.env` all along without saying so.
 *
 * The API port and the dev server's port have separate variables on purpose. Moving the browser app
 * off its usual port — one something else on this machine may be holding — has nothing to do with
 * where the API is. MOLE_OFFICE_PORT is the same variable the server reads, so one setting moves the
 * port the API listens on and the port the page is told to call, and the two cannot disagree.
 *
 * A SET BUT EMPTY VALUE IS REFUSED, in the declaration, for both halves at once. Falling back would
 * start Vite, tell the page the built-in port, and turn a typo in .env into a page of failed API
 * calls that looks exactly like a server that is not running. Measured on a scratch checkout on
 * 2026-08-12: the server refused to start on `MOLE_OFFICE_PORT=`, Vite came up, and `GET /api/health`
 * on the built-in port answered `{"ok":true,"records":416}` from the LIVE corpus on the developer's
 * real server. UNSET is a different fact and still means the default: nobody who has not set a
 * variable has made a mistake.
 */
export function portsFrom(env: Record<string, string | undefined>): { apiPort: number; webPort: number } {
  return {
    apiPort: portFrom(env, 'MOLE_OFFICE_PORT'),
    webPort: portFrom(env, 'MOLE_OFFICE_WEB_PORT'),
  }
}

/**
 * THE PORT AN API ADDRESS NAMES, or the fallback when it names none or is not an address.
 *
 * The page is told a port and takes the host from its own address bar, so an address the plugin
 * reaches and an address the page calls agree on the port. `MOLE_OFFICE_API` is the one setting that
 * can be a whole address rather than a port, and a malformed or portless one falls back to the
 * declared port rather than stopping Vite from starting.
 */
function thePortInAddress(address: string, fallback: number): number {
  try {
    const port = Number(new URL(address).port)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback
  } catch {
    return fallback
  }
}

/**
 * Whether this Vite has been told to start no file watcher.
 *
 * Unset means watch, which is what a person running `npm run dev` has always got. `1` means do not.
 * Any other value stops the start rather than being read as one of the two: a setting nobody can
 * spell is a setting nobody can rely on, and this is the same rule `portFrom` above follows.
 *
 * Exported so a test can hand it an environment of its own.
 */
export function noWatch(env: Record<string, string | undefined>): boolean {
  const raw = readSetting('MOLE_OFFICE_NO_WATCH', env).value
  if (raw === null) return false
  if (raw === '1') return true
  throw new Error(
    `MOLE_OFFICE_NO_WATCH is "${raw}". It takes 1, meaning start no file watcher, or nothing at all, ` +
      `meaning watch as usual. It is set by the test helper that starts a Vite per test file; nothing else sets it.`,
  )
}

/**
 * WHERE THIS VITE KEEPS ITS PRE-BUNDLED DEPENDENCIES: ONE CACHE PER CHECKOUT, OUTSIDE node_modules.
 *
 * WHAT WAS WRONG. Vite's own default is `node_modules/.vite`, found from the package root. The
 * worktree recipe in CLAUDE.md makes a worktree's `node_modules` a symlink to the main checkout's
 * copy, so every checkout on this machine shared ONE cache directory. Measured on 2 September 2026:
 * a worktree's `node_modules/.vite` and the main checkout's `node_modules/.vite` were the same
 * directory, one inode, and it held three leftover `deps_temp_*` directories from
 * re-optimisations. A Vite whose configuration differs re-bundles that cache when it starts, and the
 * person's own dev server on 5173 is reading it — so their page reloaded for something they had not done,
 * and nothing anywhere reported an error. The test suite did it fifty-odd times a run, because
 * `liveApp` in tests/helpers.ts starts a Vite per browser test file. Problems `7n3NOgXhqux-` and
 * `nGHs0tZ27YKS` have the accounts and the measurements.
 *
 * WHAT THIS DOES. The cache goes in `.cache/vite` inside the checkout this config file is in, found
 * from the file's own location rather than from the working directory — so it is the same directory
 * whichever folder npm was run from, and a worktree gets its own rather than the main checkout's.
 * `.cache/` is in .gitignore.
 *
 * WHAT IT COSTS. The first `npm run dev` in a fresh worktree bundles the dependencies once, into an
 * empty cache. Measured in this checkout on 2 September 2026: 0.6 seconds for the 17 files under
 * `deps`. Every start after that reads the cache it made.
 *
 * THE VARIABLE IS FOR ONE CALLER. `liveApp` sets it so that each test server bundles into the
 * throwaway directory it already makes and deletes, which keeps a suite run out of the checkout's
 * cache as well. Nobody running `npm run dev` sets it.
 *
 * SET AND EMPTY IS REFUSED, not read as "use the default", which is the rule `portFrom` above
 * follows for the same reason: the two are different statements and this cannot guess which was
 * meant. A relative path is resolved against the checkout, not against Vite's root — Vite would
 * resolve it against `src/web` a few lines below, which is not where anyone means.
 */
export function cacheDirFrom(env: Record<string, string | undefined>): string {
  return viteCacheDirFrom(env)
}

/**
 * MAKE THE DEV SERVER WATCH src/shared.
 *
 * WHAT WAS WRONG. Vite watches one folder: its root, which is `src/web` a few lines below. Files in
 * `src/shared` are outside it, and Vite reached them one at a time — it adds a watch to a file
 * after it has read that file off the disk to serve it, and not before. So which shared files were
 * watched depended on what a browser had already asked for. Counted from the person's own dev server
 * on 2 September 2026: 51 of the 56 files in src/shared had a watch, the other five did not, and
 * the folder itself had none.
 *
 * WHY THAT BREAKS. The only thing that adds one of those per-file watches is serving the file, and
 * the server only serves it again after the module has been thrown away, and it is only thrown away
 * when the watcher reports a change. A file that drops out of that set never gets back in. Twice on
 * 2 September a git merge changed `src/shared/reportrungs.ts` and the running server never noticed:
 * it went on serving the copy it had, the page imported a name that copy does not export, and the
 * browser stopped at the first module and showed "Mole Office did not start". Restarting the server
 * was the only cure. Problem `gdzXYFIK81cf` has the account.
 *
 * WHY THIS IS THE FIX. Adding the folder to the server's own watcher makes the coverage of
 * src/shared something this configuration states rather than something the browser happens to have
 * caused. Everything after that is Vite's own: it already invalidates the changed module and its
 * importers and reloads the page for any file its watcher reports, whether or not the file is
 * inside the root.
 *
 * WHAT IT COSTS, MEASURED. One dev server in this checkout with the records page open, counted from
 * its inotify watches: 187 watches without this plugin and 194 with it, and the files under
 * src/shared went from 50 of 56 watched to all 56. So it is seven more watches — the six files
 * nobody's browser had asked for, and one for the folder. It does not replace the per-file watches;
 * chokidar keeps one for every file either way. The note in vitest.config.ts explains why the number
 * of watches on this machine is worth knowing.
 *
 * IT DOES NOTHING WHEN THERE IS NO WATCHER. With MOLE_OFFICE_NO_WATCH=1, `server.watch` is null and
 * Vite hands out a watcher that ignores everything it is given, so a test still starts a Vite that
 * watches nothing.
 *
 * IT TAKES ITS FOLDERS AS AN ARGUMENT FOR ONE CALLER. The configuration below gives it none, so it
 * watches src/shared and src/config. tests/the-dev-server-watches-the-shared-folder.test.ts hands it
 * a folder of the test's own and writes its scratch file there. Before 29 September 2026 that test
 * wrote into src/shared itself, and a test that was reading every file under src/shared at the same
 * moment died on a file that vanished between listing and opening (problem F1VMPqnxnhrH).
 */
export function watchTheFoldersOutsideTheRoot(folders: readonly string[] = foldersOutsideTheRoot): Plugin {
  return {
    name: 'mole-office:watch-the-shared-folder',
    apply: 'serve',
    configureServer(server) {
      for (const folder of folders) server.watcher.add(folder)
    },
  }
}

/**
 * THE PAGE THAT COULD NOT START CAN STILL SAY THE SUPERVISOR CANNOT START A SERVER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`. `GET /api/health` and the runtime record both name a run of failed starts
 * — and both of them need a server to answer. The state this is for is the one where none does. The
 * supervisor's file is on disk either way, and Vite is the one process still running that can read
 * a file and hand it to a browser.
 *
 * IT IS A DEV MIDDLEWARE AND NOT A MODULE. `src/web/index.html` cannot import anything to say this:
 * a module would be fetched and transformed by the same machinery the notice exists to report the
 * failure of. So the notice fetches this address, plainly, and a build — where there is no
 * supervisor and no middleware — answers nothing and the notice says nothing.
 *
 * 204 MEANS THERE IS NO TROUBLE, which is the ordinary answer and is different from a 404. A file
 * nothing has rewritten for two minutes reads as no trouble too — `readTheTrouble` applies that one
 * rule for every reader, so the page cannot go on shouting about a supervisor that has stopped.
 */
function serveWhatTheSupervisorCannotDo(): Plugin {
  return {
    name: 'mole-office:the-supervisor-cannot-start-a-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(THE_TROUBLE_ADDRESS, (_request, reply) => {
        const trouble = readTheTrouble(repoRoot)
        if (trouble === null) {
          reply.statusCode = 204
          reply.end()
          return
        }
        reply.setHeader('content-type', 'application/json')
        reply.setHeader('cache-control', 'no-store')
        reply.end(JSON.stringify({ ...trouble, says: whatTheTroubleSays(trouble) }))
      })
    },
  }
}

/**
 * SERVE THE BROWSER APP ON THE ADDRESS OTHER MACHINES REACH THIS COMPUTER AT, AS WELL AS ON 127.0.0.1.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND LISTENER AND NOT `server.host`
 * ---------------------------------------------------------------------------------------
 *
 * Vite's `server.host` is one value, and one value cannot be two addresses. Setting it to the
 * address for other machines would take the browser app OFF 127.0.0.1, so the person's own bookmark
 * would stop working the day they set the variable — a change to what they see that nobody asked for.
 * Setting it to `true` binds every address this computer has, which is what
 * `src/config/settings.mjs` refuses by name and for the same reason: this app has no login.
 *
 * So the same shape the API uses: one app, two doors. `server.middlewares` is the whole of Vite's
 * request handling, so a page opened on this door is the same page a browser on 127.0.0.1 gets. It
 * then calls the API at the host it was served from — this address — and the API's own door there
 * answers it, which is what lets that machine be named. Hot reload comes with it, because a
 * websocket upgrade arriving here is handed to the server Vite's own websocket listener is attached
 * to.
 *
 * ---------------------------------------------------------------------------------------
 * UNSET MEANS OFF, AND THAT IS WHAT KEEPS A SCRATCH STACK ON 127.0.0.1
 * ---------------------------------------------------------------------------------------
 *
 * The plugin has nothing to do when nobody has set an address, which is every test, every worktree
 * and every installation until somebody decides otherwise. There is no default, because a default
 * would be this file deciding to serve other machines because nobody said not to.
 *
 * ---------------------------------------------------------------------------------------
 * AND VITE HAS TO BE TOLD THE NAME IS ALLOWED
 * ---------------------------------------------------------------------------------------
 *
 * Vite refuses a request whose `Host` header names something it was not told about, which is a
 * defence against a page on another site reaching a dev server through somebody's browser. A name
 * in `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` is one the operator wrote down on purpose, so `config`
 * below adds exactly that one and nothing else.
 */
function serveTheAddressForOtherMachines(
  forOtherMachines: { host: string; apiAddress: string; webAddress: string } | null,
  webPort: number,
): Plugin {
  return {
    name: 'mole-office:serve-the-address-for-other-machines',
    apply: 'serve',
    config() {
      if (forOtherMachines === null) return {}
      // Only the one name, so this stays a door the operator opened rather than a door left open.
      return { server: { allowedHosts: [forOtherMachines.host] } }
    },
    configureServer(server) {
      if (forOtherMachines === null) return
      const door = createServer((raw, res) => {
        server.middlewares(raw, res)
      })
      /**
       * HOT RELOAD TOO, by handing the upgrade to the server Vite's websocket listener sits on.
       * Without this, a page opened on this door loads and then never updates, and nothing on it
       * says why: the browser retries a websocket nobody is listening for.
       */
      door.on('upgrade', (raw, socket, head) => {
        server.httpServer?.emit('upgrade', raw, socket, head)
      })
      door.on('error', (err) => {
        // Loud, and only about this door. The browser app on 127.0.0.1 is unaffected and the message
        // says so, because a person whose local page still works needs telling that the other one
        // does not.
        server.config.logger.error(
          `The browser app could not open a door on ${forOtherMachines.host} port ${String(webPort)} for other ` +
            `machines: ${err.message}. The app on 127.0.0.1 is unaffected, and nothing is being served to another ` +
            `machine.`,
        )
      })
      /**
       * AFTER VITE HAS TAKEN THE PORT, NEVER BEFORE IT.
       *
       * `configureServer` runs before Vite listens. Binding here would take the port on one address
       * first, and Vite's own check then reads the port as held by something else and prints
       * *there may be another server running on a wildcard IP* — measured on 4 September 2026. It
       * carried on and bound 127.0.0.1 anyway, so nothing broke, but `strictPort` is set on this
       * server precisely so that a taken port is a refusal rather than a quiet move to another one,
       * and this door must not be the thing that makes that check lie.
       */
      server.httpServer?.once('listening', () => {
        door.listen(webPort, forOtherMachines.host, () => {
          server.config.logger.info(
            `  ➜  other machines: ${forOtherMachines.webAddress}, with the API reached through it`,
          )
        })
      })
      // The door goes when Vite goes. A listener outliving the server that feeds it would answer out
      // of a closed module graph, which is the kind of fault nobody finds for a day.
      server.httpServer?.once('close', () => {
        door.close()
      })
    },
  }
}

/**
 * THE PAGE'S OWN LIST OF WHAT IT WAS MADE FROM, for the third-party notices an installer carries
 * (wave 13t, round 15; the beta guide, question 7). A build writes every module id that went into
 * the page to THE_PAGES_MODULES, beside dist/web and never served. scripts/bundle.mjs reads the
 * packages from it, as it reads esbuild's list for the bundles, so the notices name what the page
 * really carries and not what package.json happens to list. It runs only for `vite build`, and after the
 * page's files are written, so a list older than the page's index.html is one a later build did not
 * replace, and scripts/bundle.mjs refuses it.
 */
function listThePagesModules(): Plugin {
  return {
    name: 'mole-office-list-the-pages-modules',
    apply: 'build',
    writeBundle(_options, bundle) {
      const ids = new Set<string>()
      for (const one of Object.values(bundle)) if (one.type === 'chunk') for (const id of one.moduleIds) ids.add(id)
      writeFileSync(THE_PAGES_MODULES, `${JSON.stringify([...ids].sort(), null, 1)}\n`)
    },
  }
}

/**
 * THE WORDS OF THE SIX LATER LANGUAGES ARE FILES OF THEIR OWN, fetched when the page is to be drawn in one of them.
 *
 * The page's first script carried the words of every language, about ten of its
 * thirteen megabytes, and a person reads one language. This plugin writes each list
 * src/shared/words/later-words-here.ts holds as a JSON file beside the scripts, named by a hash of its words. It builds
 * that module as an empty list and the names of those files, and src/shared/words/joined.ts fetches a file when the
 * page asks for its language. The server, the scripts and the tests read the module as it is written, with every
 * language. Node reads it here as it is written too: its files are plain data, and Node runs TypeScript of that kind.
 *
 * A FETCH OF JSON AND NOT A SCRIPT CHUNK, because Chromium keeps a failed import(): measured on 8 November 2026 with
 * Chromium 151, a second import() of a module whose first one failed sent no request. A page that once failed to
 * bring a language's words could then never ask again.
 */
const THE_LATER_WORDS = fileURLToPath(new URL('./src/shared/words/later-words-here.ts', import.meta.url))

function bringTheLaterWordsWhenAsked(): Plugin {
  const files: Record<string, string> = {}
  let serving = false
  const theLaterWords = async () => (await import(pathToFileURL(THE_LATER_WORDS).href)) as { LATER_WORDS_ALREADY_HERE: Record<string, object> }
  return {
    name: 'mole-office-bring-the-later-words-when-asked',
    enforce: 'pre',
    configResolved(config) {
      serving = config.command === 'serve'
    },
    async buildStart() {
      if (serving) return
      const here = await theLaterWords()
      for (const [language, words] of Object.entries(here.LATER_WORDS_ALREADY_HERE)) {
        const json = JSON.stringify(words)
        const name = `words-${language}-${createHash('sha256').update(json).digest('base64url').slice(0, 10)}.json`
        // Beside the scripts, so the name is read from the address of the script that fetches it.
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: json })
        files[language] = `./${name}`
      }
    },
    async load(id) {
      if (id.split('?')[0] !== THE_LATER_WORDS) return null
      if (serving) {
        // THE PAGE VITE SERVES WHILE IT IS DEVELOPED HAS EVERY LANGUAGE. The module loads each file at its first read
        // with a require, and a page has none, so here the six are imported as they are. Object.keys reads no getter.
        const languages = Object.keys((await theLaterWords()).LATER_WORDS_ALREADY_HERE)
        const imports = languages.map((language) => `import { ${language} } from './${language}.ts'\n`).join('')
        return `${imports}export const LATER_WORDS_ALREADY_HERE = { ${languages.join(', ')} }\nexport const LATER_WORDS_FILES = {}\n`
      }
      return `export const LATER_WORDS_ALREADY_HERE = {}\nexport const LATER_WORDS_FILES = ${JSON.stringify(files)}\n`
    },
  }
}

/**
 * A BROTLI AND A GZIP COPY BESIDE EVERY SCRIPT, STYLESHEET AND WORD FILE THE BUILD WRITES.
 *
 * Wave 13y round 147, item 101. On 8 November 2026 a person opened the office from another machine, and the page said
 * in red that Mole Office did not start while the app's files were still arriving. The biggest of them,
 * the first chunk, is 13.3 MB as built. Brotli at its highest quality makes it 2.2 MB, and gzip 3.3 MB. The server
 * sends the copy the browser's Accept-Encoding names (`preCompressed` in src/server/index.ts), and the file itself
 * when it names neither. tests/a-slow-first-load-says-it-is-loading.test.ts checks that every copy unpacks to its file.
 *
 * BOTH KINDS ARE WRITTEN because a browser asks for brotli only from a secure address, that is https or this machine.
 * A phone that reaches the office over plain http from another machine asks for gzip alone.
 *
 * QUALITY 11 COSTS ABOUT 12 SECONDS A BUILD. Measured on this machine on 8 November 2026 for 140 files: 12.7 s at
 * quality 11 against 0.8 s at quality 9, for copies 9 % smaller in all (4.50 MB against 4.94 MB). A copy is made once
 * and sent many times. Only scripts, stylesheets and the word files of bringTheLaterWordsWhenAsked are copied: the
 * pictures and fonts are already compressed, and index.html is a few kilobytes.
 */
function writeTheCompressedCopies(): Plugin {
  const brotli = promisify(brotliCompress)
  const gzipped = promisify(gzip)
  return {
    name: 'mole-office-compressed-copies',
    apply: 'build',
    async writeBundle(options, bundle) {
      const folder = options.dir
      if (folder === undefined) throw new Error('The build named no folder, so its compressed copies have nowhere to go.')
      await Promise.all(
        Object.keys(bundle)
          .filter((name) => /\.(js|css|json)$/.test(name))
          .map(async (name) => {
            const file = join(folder, name)
            const bytes = await readFile(file)
            const [br, gz] = await Promise.all([
              brotli(bytes, {
                params: {
                  [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
                  [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
                },
              }),
              gzipped(bytes, { level: constants.Z_BEST_COMPRESSION }),
            ])
            await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)])
          }),
      )
    },
  }
}

/**
 * WHAT THE BROWSER APP KNOWS ABOUT ITS OWN AGE.
 *
 * Criterion G6 of design/ground/ACCEPTANCE.md: *the server and the web each report the newest
 * source they have loaded.* The server reads its own; the browser app cannot, because it has no
 * disk. So this plugin serves it a module with the answer in it.
 *
 * IN DEVELOPMENT it is the newest modification time under `src/` at the moment Vite serves this
 * module. A change under `src/` invalidates the module graph and the page reloads, so the value the
 * page is holding is re-read at the same moment the code it is running is.
 *
 * IN A BUILD it is the moment of the build, which is the same fact for a bundle: a built page is
 * exactly as new as the build that made it. A build also records `contentDigest`, the digest of what
 * the files it read held, and that is what a built page is judged by when the server says the same of
 * the checkout. A file touched after the build without being changed is newer than the build and
 * holds the same, and until wave 13y round 87 that made a built page "behind" on every load. The same
 * digest is written beside the page as well, for the server's own verdict on the built page (wave 13y
 * round 91, item 11c).
 *
 * WHAT IT COST NOT TO HAVE IT, from section 2 of the acceptance document: two whole gate runs were
 * invalidated by a browser serving a seven-hour-old transform of `src/shared`, and nothing said the
 * code was old. Twice on 2 September the person's own page failed to start on the same cause.
 *
 * THE WALK IS `src/config/newest-source.mjs`, the same one the API server reports from. Two walks
 * would be two answers with nothing making them agree, and the comparison between the two halves is
 * the whole point of the number.
 */

/**
 * WHERE THE API IS, TOLD TO THE PAGE BY WHOEVER SERVED THE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PAGE DOES WITH IT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion R1 of design/ground/ACCEPTANCE.md section 7: *the page reads the API address from where
 * it was served, never from a guess*. The page takes the host out of its own address bar and the
 * port out of this module, and calls the API there. `src/web/lib/api-address.ts` is the one place
 * that joins them.
 *
 * IN A BUILD IT IS NULL, and null means "the server that served this page is the API". A built page
 * is served by Fastify on the API's own port, so its own origin is the answer and there is nothing
 * to tell it. In development Vite serves the page on a different port, so the port has to be said.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PAGE DOES NOT SIMPLY ASK ITS OWN ORIGIN, WHICH IS WHAT IT USED TO DO
 * ---------------------------------------------------------------------------------------
 *
 * It used to send every request to a path, and Vite proxied `/api/` to `http://127.0.0.1:<api
 * port>`. That worked and it lost one fact on the way: the API saw every browser call arrive on its
 * loopback door, from this computer. So a browser opened from another machine was never named in
 * *Machines that reached it from somewhere else*, and it was never treated as another machine
 * either — it got the authority of a caller sitting at this keyboard. Problem `MqQjiJIdjK4a`.
 *
 * A proxy could have carried the caller's address in a header instead. That would have been a
 * second mechanism, alive only in development, telling the API something it can otherwise measure —
 * and it would have left the authority hole open, because a request through that proxy still
 * arrives on the loopback door. Reaching the API's own door is one mechanism, the same in
 * development and in a build, and the address is read off the socket.
 */
const API_MODULE = 'virtual:mole-office-api'

function serveTheApiAddress(apiPort: number): Plugin {
  const resolved = `\0${API_MODULE}`
  let building = false
  return {
    name: 'mole-office:serve-the-api-address',
    configResolved(config) {
      building = config.command === 'build'
    },
    resolveId(id) {
      return id === API_MODULE ? resolved : null
    },
    load(id) {
      if (id !== resolved) return null
      return `export const apiPortInDevelopment = ${building ? 'null' : String(apiPort)}\n`
    },
  }
}

const SERVED_MODULE = 'virtual:mole-office-served'

export function serveTheSourceStamp(): Plugin {
  const resolved = `\0${SERVED_MODULE}`
  let building = false
  /** The digest this build put into the page, written beside it when the build is written. */
  let whatThisBuildRead: string | null = null
  return {
    name: 'mole-office:serve-the-source-stamp',
    configResolved(config) {
      building = config.command === 'build'
    },
    resolveId(id) {
      return id === SERVED_MODULE ? resolved : null
    },
    load(id) {
      if (id !== resolved) return null
      // THE FILES THE PAGE IS BUILT FROM, walked from its own entry — not the whole of `src/` and
      // not a list of folders. src/config/newest-source.mjs says why, and the page's own comparison
      // is answered by the API out of the same walk.
      const newest = building ? null : newestSourceBuiltFrom(THE_PAGES_ENTRY)
      const at = newest === null ? new Date() : newest.at
      const file = newest === null ? null : newest.file
      // WHAT A BUILD READ, so the page is judged by contents and not by times. src/config/content-digest.mjs
      // says why. A dev server gives none: it stamps the page again on every change to these files,
      // a touch too, so a dev page's time is never older than the files' for long.
      const content = building ? digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, repoRoot).digest : null
      whatThisBuildRead = content
      return [
        `export const servedAt = ${JSON.stringify(localStamp(at))}`,
        `export const newestSourceFile = ${JSON.stringify(file)}`,
        `export const fromABuild = ${JSON.stringify(building)}`,
        `export const contentDigest = ${JSON.stringify(content)}`,
      ].join('\n')
    },
    /**
     * THE SAME DIGEST, WRITTEN BESIDE THE PAGE (wave 13y round 91, item 11c). The server cannot read it
     * out of the page's code, and its verdict on the built page went on judging by the times: live
     * after an upgrade, it said "older than the checkout" about a page whose files had only been
     * touched. It is the digest put into the page above, not a second reading, so the two cannot differ.
     */
    generateBundle() {
      if (!building || whatThisBuildRead === null) return
      this.emitFile({ type: 'asset', fileName: THE_RECORD_OF_WHAT_A_BUILD_READ, source: `${JSON.stringify({ contentDigest: whatThisBuildRead })}\n` })
    },
    /**
     * THE STAMP IS THROWN AWAY WHENEVER THE PAGE'S CODE CHANGES.
     *
     * ---------------------------------------------------------------------------------------
     * WHY, MEASURED
     * ---------------------------------------------------------------------------------------
     *
     * Problem `2hadqssN_rc4`. Vite caches what `load` returns until the module is invalidated, and
     * nothing invalidated this one. So the stamp was whatever the newest file had been when Vite
     * last loaded its configuration, and every later save left it behind. On the person's live stack
     * on 4 September 2026, a page opened a minute after a merge said *THIS PAGE served as it was at
     * 2026-09-04 01:19:07, which is 36 seconds behind* and the red sheet blocked it. The page's
     * modules were fresh; only the stamp was old. Touching `vite.config.ts` cleared it, because
     * that makes Vite reload its configuration.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT THIS DOES
     * ---------------------------------------------------------------------------------------
     *
     * On every change under the folders the page is built from, the stamp module is invalidated and
     * reloaded. `server.reloadModule` invalidates it and sends the hot update, and
     * `src/web/lib/served.ts` accepts that update — so an OPEN page's stamp moves too, without a
     * reload. A page opened afterwards gets a fresh `load` because the old one is gone.
     *
     * IT IS THE SAME WATCHER `watchTheFoldersOutsideTheRoot` ADDS THE FOLDERS TO, which is why the two
     * plugins are next to each other and why this one needs no watcher of its own.
     */
    configureServer(server) {
      /**
       * IS THIS ONE OF THE FILES THE PAGE IS BUILT FROM?
       *
       * The set, not the folders. A save under `src/shared` that only the API imports moves the
       * API's reading and not the page's, so throwing the page's stamp away for it would say the
       * page's code had changed when it had not. The set is re-walked by the walk itself whenever
       * a file in it is saved, so a file that has just become part of the page arrives on the save
       * of whatever imports it.
       */
      const oneOfThePagesFiles = (path: string): boolean => {
        const built = theFilesBuiltFrom(THE_PAGES_ENTRY, repoRoot)
        return built.files.some((file) => path === fileURLToPath(new URL(`./${file}`, import.meta.url)))
      }
      const throwTheStampAway = (path: string): void => {
        if (!oneOfThePagesFiles(path)) return
        const held = server.moduleGraph.getModuleById(resolved)
        if (held === undefined) return
        void server.reloadModule(held)
      }
      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, throwTheStampAway)
    },
  }
}

/**
 * THE BROWSER APP WRITES ITSELF INTO THE LEDGER OF WHAT IS RUNNING, WITH THE WORLD IT SERVES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G5 of design/ground/ACCEPTANCE.md: every process a test, a worktree or an agent starts
 * is registered with its owner session and the world it serves. Act 1 of section 4 asks for the
 * canonical server and the canonical browser app to be "both registered, both saying the same
 * world".
 *
 * The browser app could not do either half. It had to be registered from outside by whoever
 * started it, and the route that does that recorded no world, so the person's own Vite on 5173 read
 * as "registered by ... and the row does not record which world it serves". Problem `oRrML6lgPNnr`.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE WORLD OFF THE API IT PROXIES TO
 * ---------------------------------------------------------------------------------------
 *
 * A Vite has no checkout facts of its own to report: what matters about it is which Mole Office the
 * pages it serves are told to call, which is the API at MOLE_OFFICE_PORT. So it asks that server,
 * takes the `x-mole-office-world` header off the reply, and hands it to the registration. The route
 * reads it with the one parser in src/config/world-header.mjs.
 *
 * ---------------------------------------------------------------------------------------
 * IT KEEPS ASKING UNTIL THE API ANSWERS, AND THAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `vbK-soqTSVpA`. It used to make exactly one attempt, on the `listening` event, and
 * `npm run dev` starts the two halves at once: Vite is ready in about 110 ms and the API has a
 * 120 MB SQLite file to open first. So the one attempt failed, nothing tried again, and the browser
 * app was on no list for the whole of its life — every time the stack was started the documented
 * way. `node tools/listeners.mjs` called its port UNOWNED, which is the state the ledger exists to
 * prevent.
 *
 * Waiting for the API is the normal condition of a browser app at start, not a failure. So the attempt repeats: quickly at first, then once every thirty seconds for as long as
 * this process lives. One plain line is printed when it gets in, and one when the first minute has
 * gone by without an answer — so a person reading the terminal is told once and not every attempt.
 *
 * ---------------------------------------------------------------------------------------
 * AND AGAIN WHEN THE LEDGER IT WROTE INTO IS NO LONGER THE ONE BEING READ
 * ---------------------------------------------------------------------------------------
 *
 * The ledger is a table in the API's own database. A row is only in the list a person reads while
 * the API still has that database open, so an API that comes back on a different database leaves
 * this process unlisted again — with a row, and a session record, in a file nobody is reading. The
 * same check that watches for the API to arrive watches for that: when the database identity on the
 * world header changes, this process files itself again in the new one. When the API restarts on
 * the same database, the row is still there and still true, and nothing is written — a second row
 * for one process is what the orphan report reads as two.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER STOPS VITE FROM STARTING
 * ---------------------------------------------------------------------------------------
 *
 * A browser app that will not start because the ledger is down is a worse outcome than an
 * unregistered process, and it is the same rule `tests/helpers.ts` follows for the API. Every
 * failure here is stepped over, and the timer that carries on is unreferenced, so it never holds
 * Vite open at the end.
 *
 * IT DOES NOTHING WHEN A TEST STARTED THIS VITE. `MOLE_OFFICE_NO_WATCH` is set by `liveApp` in
 * tests/helpers.ts and by nothing else — the declaration says so in as many words — so it is what
 * says "a test started this". A test registers its own Vite through the same route from the test
 * process, and two registrations of one process would be two rows the orphan report reads as two
 * processes.
 */
/**
 * WHAT THIS PROCESS HAS ALREADY WRITTEN DOWN, HELD ON `globalThis`.
 *
 * ONE REGISTRATION PER PROCESS, NOT PER PLUGIN INSTANCE, and that is measured rather than tidy.
 * Vite restarts its dev server in the same process whenever a watched file changes — this plugin
 * watches `src/shared` and `src/config`, so a save in either restarts it — and every restart builds
 * the plugin again. On 4 September 2026 a scratch stack left FIVE live ledger rows for one Vite pid,
 * each under a session record of its own, because each restart filed a new one. The ledger's own
 * words for that state: two rows for one thing would be reported as two orphans.
 *
 * The session record is kept as well as the row, so a restart reuses it rather than filing another.
 */
const REGISTERED = Symbol.for('mole-office.what-the-browser-app-has-written-down')

interface WrittenDown {
  sessionRecordId: string | null
  resourceId: string | null
  /**
   * The identity of the database this process's session record and row were written into.
   *
   * Null while nothing has been written. It is the database and not the whole world because that is
   * what decides WHICH LEDGER holds them: a new commit or a restarted API is the same list, and the
   * row in it is still true. It outlives the row — a released row leaves the session record where
   * it is, and a restart against the same database reuses it.
   */
  ledger: string | null
  /** Whether the "it has not answered yet" line has been printed for the current wait. */
  saidItIsWaiting: boolean
  /**
   * THE WRITE THAT IS IN FLIGHT, so two rounds cannot both file a session record.
   *
   * The guard below reads `sessionRecordId`, and two rounds that read it before either has written
   * both see null and both file. That is not an invented race: two Vite dev-server instances
   * configured in one process do it, and a config reload that overlaps the first round does too.
   * Measured on the person's office as pairs of "The browser app" rows with the SAME pid and the same
   * startedAt, one pair per suite run (problem `1p-pQxYe0RLB`). Serialising the rounds makes the
   * second one find the first's row rather than file a second.
   */
  writing: Promise<unknown> | null
}

function whatIsWrittenDown(): WrittenDown {
  const held = (globalThis as Record<symbol, unknown>)[REGISTERED] as WrittenDown | undefined
  if (held !== undefined) return held
  const fresh: WrittenDown = {
    sessionRecordId: null,
    resourceId: null,
    ledger: null,
    saidItIsWaiting: false,
    writing: null,
  }
  ;(globalThis as Record<symbol, unknown>)[REGISTERED] = fresh
  return fresh
}

/**
 * HOW OFTEN IT TRIES, IN MILLISECONDS.
 *
 * `quickly` while it has never got in: the API usually needs a second or two, and a person watching
 * `npm run dev` should see the line almost at once. `slowly` after the first minute, and for ever:
 * an API that has not started in a minute is being worked on, and a browser app that gives up
 * entirely is the defect this is here to fix. `slowly` is also the cadence of the check that
 * watches which database the API has open.
 */
/** The shipped clock; tests pass a shorter clock to the plugin without changing its words. */
export const HOW_OFTEN = { quickly: 1_000, slowly: 30_000, sayNothingHasAnsweredAfter: 60_000 }

/**
 * WHEN THIS PROCESS BEGAN, as the office's probe writes a start time, or null when it cannot be read.
 *
 * It is read the way the terminal holder reads its own, through `startTimeOf`, which comes from the
 * same process reader as the probe (src/config/process-reader.mjs). It is written with `localStamp`,
 * which is how the probe writes it, so the two compare as text.
 */
function theStartOfThisProcess(): string | null {
  const started = startTimeOf(process.pid)
  return started === null ? null : localStamp(started)
}

export function registerThisBrowserApp(
  apiAddress: string | null,
  workspace: string,
  webPort: number,
  officeKey: string | null,
  clock: typeof HOW_OFTEN = HOW_OFTEN,
): Plugin {
  /**
   * A CHECKOUT WITH NO MOLES OFFICE OF ITS OWN FILES NOTHING, AND SAYS SO ONCE.
   *
   * See `theApiThisBrowserAppFilesIn` in src/config/settings.mjs for what makes a checkout the
   * office: its own `.env`, or an environment that names the API. A worktree or a check with
   * neither has no world of its own. Its pages still call the office its main checkout's `.env`
   * names, because that is the resolver's rule for the tools and the server; what it may not do is
   * file a row there claiming to be that office's browser app. Problem `1p-pQxYe0RLB`.
   */
  if (apiAddress === null) {
    return {
      name: 'mole-office:register-this-browser-app',
      apply: 'serve',
      configureServer() {
        // A test started this Vite, and tests/helpers.ts registers it from the test process.
        if (noWatch(process.env)) return
        console.info(
          'The browser app is not filing a row of its own: this checkout has no Mole Office of its ' +
            'own, because the environment named no API and it has no .env. Its pages call the office ' +
            'its main checkout names, and nothing there will say this browser app is running.',
        )
      },
    }
  }
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vite/the-browser-app',
    // THE OFFICE'S OWN KEY, so this office's own browser app proves it is the office and stops
    // being a header-only claim. Criterion P83, point 5. With no key file this spreads nothing.
    ...(officeKey === null ? {} : { [KEY_HEADER]: officeKey }),
  }
  /**
   * The one thing that can go wrong on the way out, said in the words that are true of it.
   *
   * It used to end "nothing on any list will say this process is here", which is the opposite of
   * what has happened: the row could not be CLOSED, so it is still open, and the list still names a
   * process that has stopped. Same family as problem `MB7lkqJrRSL8` and found while fixing it.
   */
  const couldNotCloseTheRow = (err: unknown): void => {
    console.warn(
      `The browser app could not close its row in the ledger of what is running ` +
        `(${err instanceof Error ? err.message : String(err)}). The row is still open, so the list ` +
        'will go on naming this process until somebody releases it.',
    )
  }

  /**
   * CLOSE THIS PROCESS'S ROW AND SIGNAL NOTHING, when its page server closes.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `L3hKJEp1Z4cG`. This used to send a plain release. The release door kills by process
   * group, and it will not act on a live process without the confirm phrase sent back. The process
   * sending the request is the one the row names and it is still alive, so the answer was always a
   * 400, and nothing read it. On 4 September 2026, 113 "the browser app" rows were live and not one
   * had been closed by the browser app.
   *
   * So it asks for the close that signals nothing, as the session that registered the row, which
   * is the only caller that close accepts while the process runs.
   *
   * IT WAITS FOR ANY WRITE IN FLIGHT, and a later round waits for it, through the same chain
   * `writing` serialises the rounds with. A row being written as the server closes is closed too,
   * and a restart does not read the row as still held while its close is on the way.
   *
   * A REFUSAL IS SAID, not dropped. The row is then still live, and a later round in this process
   * finds it and holds it again.
   */
  const closeTheRowWithoutASignal = async (): Promise<void> => {
    const written = whatIsWrittenDown()
    const id = written.resourceId
    const session = written.sessionRecordId
    if (id === null || session === null) return
    // Cleared before the close is sent, so this process does not believe it still holds a row it
    // has just given up. The session record is kept: a restart against the same ledger reuses it.
    written.resourceId = null
    try {
      const answered = await fetch(`${apiAddress}/api/resources/${id}/release`, {
        method: 'POST',
        headers: { ...headers, 'x-mole-office-session': session },
        // Vite closes its page server to stop and also to restart, so the note says only that.
        body: JSON.stringify({ signalNothing: true, note: 'the browser app closed its page server' }),
        signal: AbortSignal.timeout(5000),
      })
      if (!answered.ok) throw new Error(`the release answered ${String(answered.status)}: ${await answered.text()}`)
    } catch (err) {
      couldNotCloseTheRow(err)
    }
  }
  const letGoOfTheRow = (): Promise<void> => {
    const written = whatIsWrittenDown()
    const after = written.writing ?? Promise.resolve()
    const mine = after.then(closeTheRowWithoutASignal, closeTheRowWithoutASignal)
    written.writing = mine.then(
      () => undefined,
      () => undefined,
    )
    return mine
  }

  /**
   * CLOSE THE ROWS AN EARLIER BROWSER APP START LEFT SAYING THEY WERE RUNNING.
   *
   * ---------------------------------------------------------------------------------------
   * WHY
   * ---------------------------------------------------------------------------------------
   *
   * Problem `2G9jNsuJwJf4`. The API server closes its own earlier rows and the message worker's at
   * start; the browser app filed a fresh "The browser app" row at every start of the dev page
   * server and closed none of them, so ten rows said running on a machine with one. The rule for
   * which rows those are is `theEarlierOwnRowsAmong` in `src/config/own-rows.mjs`, shared with the
   * server's half, so the two cannot come to different answers.
   *
   * IT REACHES THEM THE WAY EVERYTHING ELSE IN THIS PLUGIN DOES: over HTTP, at the address this
   * process really reaches the API on. This process is not the API and must not open the API's
   * database; `src/config/own-rows.mjs` says why the rule is where it is.
   *
   * IT NEVER STOPS VITE FROM STARTING. A ledger that will not answer, or a row whose patch is
   * refused, is a line in the terminal; the browser app goes on serving and files its own row. A
   * row that could not be closed stays running, and the warning says so rather than pretending.
   */
  const closeTheEarlierRows = async (startedAt: string): Promise<void> => {
    const part = { role: THE_BROWSER_APP, port: webPort, checkout: repoRoot.replace(/\/$/, '') }
    try {
      // THE WHOLE ROWS, because the rule reads each row's `data`, which the list's narrow default leaves out. An office of
      // an older version refuses `shape=full` with a 400 and answers whole rows without it; `fetchAFullList` retries so.
      const answered = await fetchAFullList(fetch, `${apiAddress}/api/records?kind=session&shape=full`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (!answered.ok) throw new Error(`reading the session rows answered ${String(answered.status)}`)
      const { records } = (await answered.json()) as {
        records: { id: string; title: string; data: Record<string, unknown> }[]
      }
      const dataPatch = theReplacedOwnRowPatch(startedAt)
      for (const row of theEarlierOwnRowsAmong(records, part)) {
        const closed = await fetch(`${apiAddress}/api/records/${row.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ dataPatch }),
          signal: AbortSignal.timeout(5000),
        })
        if (!closed.ok) throw new Error(`closing row ${row.id} answered ${String(closed.status)}`)
      }
    } catch (err) {
      console.warn(
        `The browser app could not close the row(s) an earlier start left in the ledger of what is ` +
          `running (${err instanceof Error ? err.message : String(err)}). Those rows still say they ` +
          'are running, and the list will go on naming browser apps that have stopped.',
      )
    }
  }

  /**
   * THE LIVE ROW THIS PROCESS ALREADY HOLDS UNDER `sessionRecordId`, or null when it holds none.
   *
   * A row is this process's when it is not released, it is a `process`, its key is this pid, and it
   * belongs to the session record this process filed. All four, because the ledger's own guard is
   * on all four: one live row per project, session, type and key.
   *
   * IT THROWS NOTHING. The caller is inside the one attempt below, which reports rather than
   * throws, and a ledger that will not answer is the same answer as a ledger with no row in it:
   * nothing is known, so try to register and let the ledger decide.
   */
  const theRowThisProcessAlreadyHolds = async (sessionRecordId: string | null): Promise<string | null> => {
    if (sessionRecordId === null) return null
    try {
      const answered = await fetch(`${apiAddress}/api/resources`, { headers, signal: AbortSignal.timeout(5000) })
      if (!answered.ok) return null
      const { resources } = (await answered.json()) as {
        resources: { id: string; sessionRecordId: string; type: string; key: string; releasedAt: string | null }[]
      }
      const mine = resources.find(
        (row) =>
          row.releasedAt === null &&
          row.type === 'process' &&
          row.key === String(process.pid) &&
          row.sessionRecordId === sessionRecordId,
      )
      return mine?.id ?? null
    } catch {
      return null
    }
  }

  /**
   * ONE ATTEMPT. It answers what happened rather than throwing, because the caller is a timer and
   * a timer has nobody to throw to.
   *
   * `already in` means a row of this process's is live in the ledger the API has open now, so
   * nothing is written. `written` means one was just written. `not yet` carries the reason in the
   * words a person reads.
   */
  const tryToWriteItDown = async (): Promise<
    { state: 'already in' } | { state: 'written'; where: string } | { state: 'not yet'; why: string }
  > => {
    const written = whatIsWrittenDown()
    let world: string | null = null
    try {
      // The world of the Mole Office this app's pages are told to call, read off a reply. Any reply
      // carries it, so /api/health is asked rather than anything larger.
      const answered = await fetch(`${apiAddress}/api/health`, { signal: AbortSignal.timeout(5000) })
      world = answered.headers.get(WORLD_HEADER)
    } catch (err) {
      return { state: 'not yet', why: err instanceof Error ? err.message : String(err) }
    }
    /**
     * WHICH LEDGER THAT REPLY CAME OUT OF. A reply with no readable world leaves this null, and a
     * row written against null is written once and never rewritten on a second unreadable reply:
     * "nobody said" is one state, not a new one each time.
     */
    const read = parseWorldHeader(world)
    const ledger = read.ok ? read.world.database : null
    if (written.resourceId !== null && written.ledger === ledger) return { state: 'already in' }
    /**
     * THE LEDGER HAS MOVED, SO THE ROW THIS PROCESS HOLDS IS NOT IN THE LIST ANYBODY IS READING.
     *
     * It is forgotten here, before anything is written, because from this moment until a new row
     * exists this process really is on no list — and the warning below is allowed to say so only
     * while that is true. Problem `MB7lkqJrRSL8`.
     */
    const hadASessionHere = written.sessionRecordId !== null && written.ledger === ledger
    written.resourceId = null

    try {
      /**
       * THE LEDGER IS ASKED WHETHER THIS PROCESS IS ALREADY IN IT, BEFORE ANYTHING IS WRITTEN.
       *
       * ---------------------------------------------------------------------------------------
       * WHY, MEASURED
       * ---------------------------------------------------------------------------------------
       *
       * `written.resourceId` is this process's MEMORY of its row, and the ledger is the truth. The
       * two come apart: the close handler above clears the memory before it sends the release, so a
       * release that is refused or never lands leaves the row live with nothing remembering it. The
       * next round then registered again, and the ledger refused it — one live row per session,
       * type and key — and the refusal was caught and read as "not registered", so the next round
       * registered again, for ever.
       *
       * Measured on the person's corpus on 6 September 2026: `vite/the-browser-app` made 10,812
       * `POST /api/resources` calls answered 409 between 4 September 02:27 and 6 September 06:30,
       * beside 332 answered 201. The refusal, reproduced on an isolated stack: *"This session
       * already has process "576629" in the ledger, as PGxMbMN-khQj, and it has not been released.
       * Two rows for one thing would be reported as two orphans."* Problem `d6WpcnqS0IsS`.
       *
       * ---------------------------------------------------------------------------------------
       * WHY IT IS A READ AND NOT A CHANGE TO THE ROUTE
       * ---------------------------------------------------------------------------------------
       *
       * `POST /api/resources` says what it does in `GET /api`: *201 with the ledger row*. Its 409
       * is the guard that stops two rows standing for one process, and the orphan report reads two
       * rows as two orphans. The caller here is the one that is wrong — it asks to be written down
       * twice — so the caller is what changes.
       *
       * ONLY ON THE PATH WHERE A ROW COULD BE THERE. A session record filed in this same ledger is
       * the only thing a row of this process could hang from, so a fresh start and a moved ledger
       * both skip this and cost nothing.
       */
      if (hadASessionHere) {
        const already = await theRowThisProcessAlreadyHolds(written.sessionRecordId)
        if (already !== null) {
          written.resourceId = already
          written.ledger = ledger
          return { state: 'already in' }
        }
      }
      /**
       * A SESSION RECORD IN THIS LEDGER. The one this process filed before is in the database the
       * API had open then, so a new ledger needs a new one — a resource is owned by a session
       * record, and a row cannot point at a record that is not in the same file.
       */
      if (written.sessionRecordId === null || written.ledger !== ledger) {
        // THE START THIS ROW STANDS FOR, computed once so the cause written on the rows it replaces
        // and the start time written on its own row are the same moment.
        const startedAt = localStamp(new Date())
        await closeTheEarlierRows(startedAt)
        const filed = await fetch(`${apiAddress}/api/records`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            kind: 'session',
            title: THE_BROWSER_APP,
            data: {
              state: 'running',
              runtime: 'vite',
              startedAt,
              doing: `serving the browser app, whose pages call the API at ${apiAddress}`,
              workingDirectory: repoRoot.replace(/\/$/, ''),
              // It runs no model, and its receipt says so in words.
              usageReceipt: theOwnPartUsageReceipt(THE_BROWSER_APP, process.env),
              // THE PID AND START TIME, so a later reading can check what this row stands for
              // instead of believing the word `running`. The start time is the one the operating
              // system gives this process, written as the office's probe writes it, so the reading
              // can show the process under the pid is this one (decided for wave 13y round 31).
              // When it cannot be read, none is recorded, and the row says its process is not shown.
              extra: theOwnPartBlock(
                { role: THE_BROWSER_APP, port: webPort, checkout: repoRoot },
                process.pid,
                theStartOfThisProcess(),
              ),
            },
          }),
        })
        if (!filed.ok) throw new Error(`filing the session record answered ${String(filed.status)}`)
        written.sessionRecordId = ((await filed.json()) as { record: { id: string } }).record.id
      }
      const registered = await fetch(`${apiAddress}/api/resources`, {
        method: 'POST',
        headers: { ...headers, 'x-mole-office-session': written.sessionRecordId },
        body: JSON.stringify({
          type: 'process',
          key: String(process.pid),
          detail: 'the browser app',
          // This process started before the session it files above (decision AOwsOHMVq6Ce).
          adopting: 'the browser app registers itself under the session it filed after it started',
          // Left out when the reply carried none: a row with no world says nobody recorded
          // one, which is true, and inventing one would be worse than saying so.
          ...(world === null ? {} : { world }),
        }),
      })
      if (!registered.ok) throw new Error(`registering answered ${String(registered.status)}`)
      written.resourceId = ((await registered.json()) as { resource: { id: string } }).resource.id
      written.ledger = ledger
      return {
        state: 'written',
        where: ledger === null ? 'a Mole Office that did not say which database it has open' : `database ${ledger}`,
      }
    } catch (err) {
      return { state: 'not yet', why: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    name: 'mole-office:register-this-browser-app',
    apply: 'serve',
    /**
     * VITE WAITS FOR THIS BEFORE IT EXITS. On SIGTERM, on the end of its input and on `q`, Vite
     * awaits `server.close()` and then calls `process.exit()`. The close event above does not hold
     * that up, so its request could be cut off. `buildEnd` runs inside `server.close()` and is
     * awaited, so waiting here for the same close lets the request land. Ctrl-C sends SIGINT, which
     * Vite does not catch, so no close runs then. The row stays live until somebody finds its
     * process gone: any caller's release closes such a row, and so does the next start of the API
     * server whose world the row names.
     */
    async buildEnd() {
      await letGoOfTheRow()
    },
    configureServer(server) {
      if (noWatch(process.env)) return
      server.httpServer?.once('listening', () => {
        /**
         * WHEN THIS STRETCH OF BEING ON NO LIST BEGAN, or null because it is on one.
         *
         * ---------------------------------------------------------------------------------------
         * WHY IT IS RESET, MEASURED
         * ---------------------------------------------------------------------------------------
         *
         * Problem `MB7lkqJrRSL8`. It used to be set once, when the http server started listening,
         * and never again. So the first failed attempt after a successful registration found a wait
         * already longer than a minute and printed *nothing on any list says this process is here
         * yet* — at a moment when this process's row was live, registered six minutes earlier and
         * never rewritten. Measured on 4 September 2026: the API half was stopped, the browser app
         * said that within thirty seconds, and `GET /api/resources` still held the row.
         *
         * The sentence is about a stretch of being unregistered, so the clock behind it starts when
         * that stretch starts.
         */
        let onNoListSince: number | null = Date.now()
        let timer: NodeJS.Timeout | null = null
        let stopped = false

        const askAgainIn = (ms: number): void => {
          if (stopped) return
          timer = setTimeout(() => {
            void round()
          }, ms)
          // NEVER HOLDS VITE OPEN. An unreferenced timer does not count towards the event loop, so
          // a `npm run dev` that is stopped exits at once rather than waiting up to thirty seconds
          // for a check nobody is waiting for.
          timer.unref()
        }

        const round = async (): Promise<void> => {
          if (stopped) return
          const written = whatIsWrittenDown()
          /**
           * ONE WRITE AT A TIME, PER PROCESS. See `writing` on `WrittenDown` for the measurement.
           * The chain is read and replaced in the same synchronous step, so two rounds that start
           * together cannot both see "nothing in flight".
           */
          const after = written.writing ?? Promise.resolve()
          const mine = after.then(
            () => tryToWriteItDown(),
            () => tryToWriteItDown(),
          )
          written.writing = mine.then(
            () => undefined,
            () => undefined,
          )
          const outcome = await mine
          if (outcome.state === 'written') {
            console.info(
              `The browser app is in the ledger of what is running: process ${String(process.pid)}, ` +
                `in ${outcome.where}.`,
            )
          }
          if (outcome.state === 'not yet') {
            onNoListSince ??= Date.now()
          } else {
            // IT IS ON THE LIST, so the stretch is over and the next one starts from its own
            // beginning. Saying it again is allowed once that has happened.
            onNoListSince = null
            written.saidItIsWaiting = false
          }
          /**
           * SAID WHILE IT IS TRUE, AND ONCE PER STRETCH OF BEING TRUE.
           *
           * `written.resourceId` is what makes it true: null means this process holds no row in the
           * ledger anybody is reading. An API that is merely down does not make it true — the row is
           * still in the database, still live, and still what a person reading the list will find.
           * That is the whole of problem `MB7lkqJrRSL8`.
           */
          const onNoList = written.resourceId === null
          if (outcome.state === 'not yet' && onNoList && !written.saidItIsWaiting) {
            const howLongOnNoList = Date.now() - (onNoListSince ?? Date.now())
            if (howLongOnNoList >= clock.sayNothingHasAnsweredAfter) {
              written.saidItIsWaiting = true
              console.warn(
                `The browser app has been unable to write itself in the ledger of what is running for a ` +
                  `minute (${outcome.why}). It is serving normally; nothing on any list says this process ` +
                  `is here yet. It keeps trying every ${String(HOW_OFTEN.slowly / 1000)} seconds.`,
              )
            }
          }
          /**
           * SLOWLY ONCE IT IS IN, OR ONCE THE FIRST MINUTE HAS GONE. Quickly is for the ordinary
           * case, which is an API that is still opening its database; a minute of quick attempts
           * against a machine with no API on it would be noise for no reader.
           */
          const waitedFor = onNoListSince === null ? 0 : Date.now() - onNoListSince
          const settled = outcome.state !== 'not yet' || waitedFor >= clock.sayNothingHasAnsweredAfter
          askAgainIn(settled ? clock.slowly : clock.quickly)
        }

        server.httpServer?.once('close', () => {
          stopped = true
          if (timer !== null) clearTimeout(timer)
          // THE LEDGER IS NOT CLEARED. The session record this process filed is still in that
          // database, so a restart against the same one reuses it: a restart is not a second run of
          // the browser app. Clearing it made the next round file a second session record, which
          // `tests/the-browser-app-writes-itself-down-once.test.ts` caught.
          void letGoOfTheRow()
        })

        void round()
      })
    },
  }
}

// The browser app is served by Vite in development, and its pages call the API on the host they
// were served from. In production Fastify serves the built files itself, so the page's own origin is
// the API and there is one process to run.
export default defineConfig(() => {
  /**
   * .env, then the real environment on top.
   *
   * `mergedEnvironment` in src/config/settings.mjs reads the same file src/server/index.ts loads,
   * and Vite's own `loadEnv` is not used any more: it was a THIRD reader of `.env`, with rules of
   * its own about prefixes and about `.env.local`. MOLE_OFFICE_PORT has no VITE_ prefix and never
   * should, because it is one setting shared by the API and the page rather than something the
   * browser bundle may see. Nothing read here is passed to `define`: the one value the page is told
   * is the API port, and it goes through `serveTheApiAddress` above, which is a module Vite serves
   * rather than a string baked into the bundle.
   *
   * Real environment last, which is the precedence the server uses: MOLE_OFFICE_PORT=9000 npm run dev
   * has to beat whatever .env says, or the two processes end up on different ports.
   */
  const env = mergedEnvironment()
  const { apiPort: theMergedApiPort, webPort } = portsFrom(env)
  /**
   * THE ONE ADDRESS THIS VITE'S BROWSER APP USES, READ ONCE.
   *
   * `theApiThisBrowserAppFilesIn` answers where this checkout's own browser app files its row, or
   * null because this checkout has no office of its own (a worktree or check with no `.env`, and an
   * environment that names no API). The pages and the plugin both take the port from this ONE
   * answer, so the row can never be filed at an address the pages do not call. It replaces two
   * computations of the same fact: the page read MOLE_OFFICE_PORT while the plugin read
   * `apiAddressForThisProcess`, and a world that named only MOLE_OFFICE_API had the plugin in the
   * world and the pages in the operator's office. Problem `1p-pQxYe0RLB`.
   */
  const apiAddress = theApiThisBrowserAppFilesIn()
  const apiPort = apiAddress === null ? theMergedApiPort : thePortInAddress(apiAddress, theMergedApiPort)
  // Null in every installation until somebody sets MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES, and the
  // plugin below has nothing to do when it is null. Both addresses are derived from this name and
  // the two ports above, in the declaration, so there is no second place that works them out.
  const forOtherMachines = addressesForOtherMachines(env)

  return {
    root: THE_VITE_ROOT,
    publicDir: fileURLToPath(new URL(`./${THE_PUBLIC_FOLDER}`, import.meta.url)),
    // The pre-bundled dependency cache. `cacheDirFrom` above says why it is not Vite's default.
    cacheDir: cacheDirFrom(env),
    plugins: [
      react(),
      bringTheLaterWordsWhenAsked(),
      listThePagesModules(),
      writeTheCompressedCopies(),
      watchTheFoldersOutsideTheRoot(),
      serveTheSourceStamp(),
      serveTheApiAddress(apiPort),
      serveWhatTheSupervisorCannotDo(),
      /**
       * IT REGISTERS WHERE THIS PROCESS REALLY REACHES THE API. Until 5 September 2026 it took
       * `apiAddressFrom(env)`, which prefers a MOLE_OFFICE_API named in the checkout's `.env` to a
       * MOLE_OFFICE_PORT set in the real environment. A Vite that a test or a worktree started with
       * only the port set then served pages that called its own API while it wrote its session row
       * into the person's live database, where it said "running" for ever: 268 rows titled "The
       * browser app" in two days. Problem `f1uCdpMEB1hs`. The rule that a port set nearer to the
       * process beats an address the file names lives in the declaration, beside `apiAddressFrom`.
       *
       * AND IT FILES NOTHING FROM A CHECKOUT THAT IS NOT THE OFFICE. See
       * `theApiThisBrowserAppFilesIn`: a worktree or a check reads its main checkout's `.env`, and
       * the row it used to file there was never closed. Problem `1p-pQxYe0RLB`.
       */
      registerThisBrowserApp(apiAddress, workspaceFrom(env), webPort, theOfficeKey(env).key),
      serveTheAddressForOtherMachines(forOtherMachines, webPort),
    ],
    resolve: {
      /**
       * THE ALIAS MAP IS READ, NOT SPELT AGAIN. `THE_ALIASES` in src/config/import-graph.mjs is the
       * one declaration: the walk that works out which files the browser app is built from has to
       * resolve `@shared/…` exactly as Vite does, or the set it reports is not the set Vite serves.
       */
      alias: Object.fromEntries(
        Object.entries(THE_ALIASES).map(([alias, folder]) => [
          alias,
          fileURLToPath(new URL(`./${folder}`, import.meta.url)),
        ]),
      ),
    },
    /**
     * THERE IS NO PROXY FOR `/api/`, AND ITS ABSENCE IS THE POINT.
     *
     * This used to be `proxy: { '/api/': 'http://127.0.0.1:<api port>' }`, and every call the page
     * made went through it. The API therefore saw every browser call arrive on its loopback door,
     * from this computer, whichever machine the browser was on: the caller was not merely unnamed in
     * *Machines that reached it from somewhere else*, it was not counted as another machine at all,
     * and it was given the authority of somebody sitting at this keyboard. Problem `MqQjiJIdjK4a`.
     *
     * The page now calls the API's own door, at the host it was served from and the port
     * `serveTheApiAddress` above tells it. Nothing needs a proxy, and leaving a dead one here would
     * be a second way to reach the API that launders a remote caller into a local one.
     */
    server: {
      port: webPort,
      /**
       * TAKE THE PORT ASKED FOR OR FAIL — never the next one up.
       *
       * Vite's default is to print `Port 5173 is in use, trying another one...` and bind 5174. That
       * is a reasonable default for a static site and the wrong one here, because this app is half
       * of a pair: the browser app on the unannounced port still tells its pages to call
       * MOLE_OFFICE_PORT, so a second `npm run dev` gives you a working-looking UI on an address you
       * did not choose, wired to the FIRST instance's server and its database. Measured on
       * 2026-08-12 — the second instance served 200s from a port nobody had been told about.
       *
       * Failing sends the person to `ss -ltn` and one decision, which is the honest ten seconds.
       */
      strictPort: true,
      // NODE_MODULES MAY BE A LINK TO A FOLDER OUTSIDE THE CHECKOUT, as in a worktree. Vite serves a file by its real
      // path and only from the folders named here, so with Vite's default, the checkout alone, KaTeX's fonts answered 403.
      // The first folder is Vite's own default, which a list set here replaces; the second is where node_modules really is.
      fs: { allow: [searchForWorkspaceRoot(join(repoRoot, THE_VITE_ROOT)), realpathSync(join(repoRoot, 'node_modules'))] },
      /**
       * WATCH THE FILES, UNLESS THIS VITE IS SERVING A TEST.
       *
       * `null` is Vite's own way of saying "start no file watcher" — see `server.watch` in its
       * types. It is set only when MOLE_OFFICE_NO_WATCH says so, which only `liveApp` in
       * tests/helpers.ts says. `npm run dev` never sets it, so a developer still gets hot reload.
       *
       * WHY IT EXISTS: a watching Vite holds one inotify instance, Linux allows a user 128 of them
       * on the whole machine, and fifty-two test files start one of these each. When they ran out,
       * this watcher was what died — `EMFILE: too many open files, watch '.../vite.config.ts'` —
       * and it took the test file with it. The measurement is in vitest.config.ts, beside the limit
       * on how many test files run at once, so that it is written down once.
       *
       * NOTHING IS WATCHING BECAUSE NOTHING CHANGES. A test starts this server, opens pages and
       * stops it; no source file is edited while it runs, so hot reload has nothing to carry.
       */
      ...(noWatch(process.env) ? { watch: null as null } : {}),
    },
    build: { outDir: '../../dist/web', emptyOutDir: true },
  }
})
