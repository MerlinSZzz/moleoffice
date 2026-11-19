# The merge tool's command line

This command line lands one branch at a time on a project's trunk.
It keeps a local queue of branches, puts each one on top of the current trunk in a scratch worktree, runs the project's build and tests, and moves the trunk forward only when they pass.
A branch that fails goes back to its submitter as a bounce, with the reason.

## What you need

Run every command from the root of a checkout of this repository.
You need Node and git on the host.
The tests ran on Node v22.23.2 and git 2.43.0.
The command line loads TypeScript files from this repository, so use a Node that runs them without a flag; Node 22.18 and newer do.
You do not need `npm install`, because the command line loads only Node's own modules and files of this repository.

## The configuration file

Write one JSON file.
Each command takes its path with `--config`.
This is one complete example:

```json
{
  "repository": ".",
  "trunk": "main",
  "test": {
    "build": ["npm", "run", "build"],
    "suite": ["npm", "test", "--"],
    "report": "exit-code-only",
    "runIn": "host"
  },
  "land": {
    "how": "fast-forward-the-checkout",
    "before": [["git", "status", "--porcelain"]],
    "after": [
      {
        "whenAPathIsUnder": "db/",
        "run": ["npm", "run", "db:migrate"]
      }
    ],
    "healthy": null
  },
  "gates": {
    "areas": ".mole-office/protected.json",
    "markers": null,
    "tests": false
  },
  "commitAs": {
    "name": "Merge queue",
    "email": "YOUR-EMAIL-ADDRESS"
  }
}
```

`repository` is the project checkout, either an absolute path or a path relative to the configuration file's folder.
`trunk` is the branch that lands and moves forward.
`test.build` is the build command as a list of words, run in the scratch worktree.
`test.suite` is the test command as a list of words, run in the scratch worktree after the build.
`test.report` must be `"exit-code-only"`, because the command line reads the suite's exit code only.
`test.runIn` must be `"host"`, because the command line runs everything on the host.
`land.how` must be `"fast-forward-the-checkout"`, the one way this command line lands.
`land.before` is a list of commands, each a list of words, run in the project checkout before the trunk moves.
`land.after` is a list of steps; each step has `whenAPathIsUnder`, a folder path ending in `/`, and `run`, a command as a list of words, and it runs after the landing when a changed path is under that folder.
`land.healthy` must be `null`, because the command line checks no health after a landing.
`gates.areas` is the protected-paths file, relative to the repository root.
`gates.markers` must be `null`, because the command line does not look for mutation markers.
`gates.tests` must be `false`, because the command line does not run the gate that wants a test with each code change.
`commitAs.name` is the name on the commits the command line makes.
Replace the email placeholder with the address the project uses.

The command line refuses a `test.report` other than `"exit-code-only"`, a `land.healthy` other than `null`, a `gates.markers` other than `null`, and `gates.tests` other than `false`.
It stops with one sentence naming the file, every wrong key and what it does not do.

## The protected-paths file

`gates.areas` names a JSON file at the repository root.
It looks like this:

```json
{
  "why": "optional sentence for a reader",
  "protected": ["design/", "config/lock.json", "data/*.db*"],
  "generated": []
}
```

`protected` is required and may be empty.
A pattern ending in `/` covers every path under that folder.
Any other pattern must match the whole path, where `*` matches any run of characters except `/`, and `**` matches any run including `/`.
Nothing else in a pattern is special.
Paths are relative to the repository root and use `/`.

A change to a path that a protected pattern covers bounces the entry with reason `guard`.

`generated` is optional.
`run` refuses a protected-paths file whose `generated` list is not empty, because the command line does not regenerate or check generated files.
An unknown key in this file is refused.

## The commands

### submit

```
node tools/merge-tool/cli.mjs submit --config <file> --branch <branch> [--title <text>] [--id <id>]
```

`submit` reads the branch's commit and the commit where it left the trunk, then adds an entry to the queue.
It prints `submitted <id> <branch> <commit>`.
The id is the first 12 hexadecimal digits of the sha256 of the branch and commit, unless `--id` names one.
`--title` is stored with the entry.
Exit 0 means the entry is in the queue.
Exit 1 means a refusal, printed as one sentence on stderr.

### list

```
node tools/merge-tool/cli.mjs list --config <file> [--json]
```

`list` prints one line for each entry: its id, state, branch, commit and title, separated by spaces, with an empty field when the entry has none.
A bounced entry gets a second line, `bounced: <reason>`.
`--json` prints the queue as a JSON array.
Exit 0 means the queue was read.
Exit 1 means a refusal.

### run

```
node tools/merge-tool/cli.mjs run --config <file> [--entry <id>]
```

`run` carries each entry that is submitted, judged or integrating, and it skips each entry that is final.
With `--entry`, it carries only the entry that the option names.
It prints each state as the entry moves, then `landed <commit>` or `bounced <reason>`.
Exit 0 means every entry it chose landed or bounced.
Exit 1 means a refusal or a failure, such as a seat held by another run, a checkout not on the trunk, a landing command that failed, an entry put back in the queue because the trunk moved, or an entry in a state it cannot carry, such as testing or landing.

## What run does, in order

1. It reads the configuration and refuses the values it cannot act on, and a protected-paths file with a non-empty `generated` list.
2. It opens the queue and takes the suite seat.
   If another run holds the seat, it prints that run's sentence, carries nothing and exits 1.
3. For each entry, it makes a scratch worktree under the queue folder and rebases the entry onto the trunk there.
4. If the rebase conflicts, it aborts the rebase and bounces the entry with reason `conflict`.
5. It reads the protected-paths file from the project checkout and bounces the entry with reason `guard` when a changed path is protected.
6. It records the integration, then runs `test.build` and `test.suite` in the scratch worktree.
   The first command that exits non-zero bounces the entry with reason `red`.
7. It checks that the project checkout is on the trunk, records the landing, and compares the trunk with the commit it tested.
   If the trunk moved, the entry goes back to the queue for another attempt. That can happen three times.
   The fourth time, the entry bounces with reason `churn`.
8. It runs each `land.before` command in the project checkout.
9. It fast-forwards the trunk to the tested commit.
10. It runs each `land.after` step whose folder covers a changed path, in the project checkout.
11. It records the landing and prints `landed <commit>`.
12. It removes the scratch worktree and releases the seat at the end, whether the entry landed or not.

## Where the queue lives

The queue lives in `~/.cache/merge-tool/<first 16 hex digits of the sha256 of the resolved repository path>/`.

That folder holds `queue.json`, which is the queue; `the-suite-seat.lock`, which exists while a run holds the seat; and `tool-runs.jsonl`.
It also makes a `work/` folder with one scratch worktree for each entry the command line is carrying.

## What it does not do

- It does not push to a remote, and it will not until a project asks for it.
- It does not resolve a conflict; the entry bounces and its submitter fixes it.
- It runs the build and tests on the host only, never in a sandbox or a container.
- It reads only exit codes, so `test.report` must be `exit-code-only`.
- It checks no health after a landing.
- It does not regenerate or check generated files.
- It runs none of the office's own checks, does not run related tests first, starts no per-entry worker and keeps no journal join.
- It lives in this repository's `tools/merge-tool/` folder and stays there until it has a repository of its own.
