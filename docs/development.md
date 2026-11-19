# Running it, and the traps

## Node

Needs Node 22 or newer: better-sqlite3 13, the database driver, asks for it. On this machine that is
Node 22 through nvm; the system Node 18 cannot run the tooling and fails in two ways that do not say
what is wrong.

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

## First run

```bash
npm install
cp .env.example .env      # every setting has a working default; read the comments before changing one
npm run db:migrate
npm run db:seed           # sample data
npm run dev               # API on 8787, browser app on 5173
```

On a fresh clone the migrate line is a formality — the server would create the tables itself on the
way up. It stops being one as soon as the database holds anything.

### When the install stops at better-sqlite3

`npm install` and `npm ci` both install from package-lock.json. A lock file entry does not say that
better-sqlite3 needs no build, so npm runs `node-gyp rebuild` for it. On a platform the package carries a
ready-built binary for (Linux, macOS and Windows, on x64 and arm64), that build compiles nothing: the
package's build file leaves both of its targets empty when its binary is there. It still needs Python 3
to set the build up and `make` to run it. Without `make` the install stops with
`gyp ERR! stack Error: not found: make`.

- Debian or Ubuntu: `sudo apt-get install make python3`
- macOS: `xcode-select --install`, which brings `make`

Only where no ready-built binary matches, on another processor or system, does the build compile SQLite,
and then it also needs a C++ compiler: `build-essential` on Debian or Ubuntu. On Windows, node-gyp asks
for Visual Studio Build Tools with the "Desktop development with C++" workload. Windows has not been
tried with this repository.

Measured on 2 October 2026 with npm 10.9.8 and Node 22.23, on Linux x64. In a folder with no
package-lock.json, `npm install better-sqlite3` used the ready-built binary and ran no build. Installed
from a package-lock.json, it ran the build and stopped where there was no `make`. With `make` added and no
compiler, `npm ci` finished and better-sqlite3 loaded its ready-built binary. `npm ci --ignore-scripts`
also installs it with no `make`, but it skips the install scripts of every other package as well.

## The commands

```bash
npm test          # the tests
npm run build     # type-check and build the browser app
npm run typecheck # type-check only
npm start         # serve the built app; needs npm run build first
npm run db:backup # a verified point-in-time copy
npm run db:reset  # DESTRUCTIVE — deletes a database and rebuilds it from the seed
```

## Your work is in one file

The database file named by `MOLE_OFFICE_DB` is the only copy of your work. It defaults to
`./data/panelx.db`, named after PanelX, the product's earlier name, and it is gitignored.

**Do not back it up by copying it.** The database runs in write-ahead-log mode, so recent writes sit
beside the file until a checkpoint folds them in, and a plain `cp` copies neither. Measured 12
August 2026 with the server running: the copy held 423 records and a newest change 55 minutes old
while the database held 429, and nothing said anything was wrong.

```bash
npm run db:backup                       # verified copy → data/backups/mole-office-<stamp>.db
npm run db:backup -- --check-only <f>   # is this file a usable database? ask before you trust it
npx tsx scripts/export.ts               # write the readable archive beside the database, and commit it
npx tsx scripts/import.ts               # DRY RUN — says what it would do and writes nothing
npx tsx scripts/import.ts --apply       # read the archive back into the database
npx tsx scripts/restore-check.ts        # the destructive restore proof, in a temporary directory
```

Two ways home, and you want both: the file copy restores exactly; the archive is readable and
survives the product itself. Both were run against the live corpus on 12 August 2026 and both came
back.

One trap that is invisible until you need the backup: **a database holding links that cross a
project boundary exports happily and cannot be imported.** The exporter writes the archive, the
importer refuses the whole of it and writes nothing. The migration command says so out loud when it
leaves crossing links behind, and names the file copy as the route that is unaffected.

## Starting a server never migrates a database that holds work

A start does bring an empty or seeded database up to date, which is why a fresh clone and every
throwaway test file come up on their own. Any other database is only ever **read** at startup. If
bringing it up to date would write to it, the server prints what a migration would do and **refuses
to serve**, naming the command you run deliberately, having taken a copy first.

That rule exists because the alternative happened. The development command runs the server under a
file watcher, so every save restarts it; a server left running against the live corpus overnight
re-ran the migrations on every save, and a migration that moved 394 records between projects ran
unattended because somebody saved a file.

## Ports

**Both halves of the development command take the port they were asked for or fail.** Neither moves
to the next free port, because a browser app on an unannounced port still proxies to the configured
API port — that is a second instance's interface wired to the first instance's database, and it
looks completely normal.

```bash
ss -ltn | grep -E ':(8787|5173) '
```

Check before you take a port, and do not assume a server you find is yours. This project has had
five orphaned-process incidents. One was a server holding a database file that had already been
deleted; it served stale data into a diagnosis that was written down and worked from, and it cost an
afternoon. If you need a server of your own, take a port nobody else could be using, point the
database setting at a scratch copy, start it with `setsid` and stop it by process group.

## Looking at every screen

```bash
node tools/review.mjs     # every page, four widths, both themes, then a contact sheet
```

Nothing has to be running first. It takes two free ports, seeds a throwaway database in the system
temp directory, starts both halves, photographs every page the router knows about at 1440, 990, 660
and 390 in light and dark, and then stops both processes, deletes the database, and fails the run if
either port is still held.

The page list is read out of the router rather than written down again, so a new page is
photographed without anyone remembering to add it. `tools/shot.mjs` is the smaller tool for one
address on a server you already have running.

Four widths, not two: the two layout breakpoints cut the range into three bands, and 1440 and 390
alone left the middle one unphotographed.

## Running the suite in a worktree

Put it under `~/.cache/mole-office/worktrees` (inside `/home`, so the restore check's rule holds; never directly under your home directory), and build before you run.

```bash
git worktree add --detach ~/.cache/mole-office/worktrees/<name> HEAD
ln -s <checkout>/node_modules ~/.cache/mole-office/worktrees/<name>/node_modules
cd ~/.cache/mole-office/worktrees/<name> && npm run build && npm test
```

Two tests fail if you skip either half, and they are the recipe failing rather than the code. With
no build output, a test about where the scan did not look fails, because the skip list only names
the build directory when it is there. Outside `/home`, a test that asks whether `/home` contains
this checkout fails. **Do not weaken either test to make a misplaced worktree pass**; move the
worktree.

## Editing the READMEs

The English README is the default at the repository root; translations live in `readme/`. The
convention, and what the two versions must agree on, is in [README.md](README.md) in this folder.
