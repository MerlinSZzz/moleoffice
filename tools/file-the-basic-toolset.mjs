#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE THE BASIC TOOLSET'S FIRST CATEGORIES AND ENTRIES INTO ONE PROJECT, ONCE.
 *
 *   node tools/file-the-basic-toolset.mjs --api <url> --workspace <project> --as <handle> --session <run>
 *       [--confirmed-by <decision id>]
 *
 * It reads GET /api/toolset, then files through POST /api/records every category whose name, and
 * every entry whose slug, is not live in the project yet. It skips the rest, and prints what it
 * filed and what it skipped. Each record it files gets its name at reading level 1 as well, through
 * POST /api/records/<id>/short-forms (chapter 10, rule 3).
 *
 * --confirmed-by names the decision that confirms the categories, and each category it files carries
 * it in `confirmedBy`. Without it the categories are filed as proposed. The office refuses an id that
 * is not a live decision. It never changes a category or an entry that is already there.
 *
 * All four of --api, --workspace, --as and --session are needed, and none of them is read from the
 * environment: this writes into whichever office it is pointed at, so the caller says which. The one
 * thing read from the environment is MOLE_AGENT_KEY, sent as every tool here sends it
 * (officeHeaders in tools/sandbox-common.mjs). It never writes in the person's name.
 *
 * It stops at the first refusal, prints what it had filed by then and the office's words, and exits 1.
 * A wrong argument exits 2 before anything is asked.
 *
 * WHERE THE ENTRIES COME FROM. The toolset draft, report i69HYz8BQhSx, revision 2, agreed by the owner
 * in a decision: the nine general tools of block b-5, the six specialised tools of block b-6, and the services of block
 * b-7, each with the ten items of block b-4. The category names were chosen by the
 * agents. The list the draft calls resources is named Services here, because "resource" already names
 * the ledger of processes and ports at /api/resources. The five pages on parts of the office are block b-2's
 * foundation, with the doors GET /api serves.
 *
 * AN ENTRY IS MARKED BUILT ONLY WHERE A FILE IN THIS REPOSITORY DOES WHAT IT SAYS. To mark a tool
 * built later, change its `state` in ENTRIES below and give its `location`; nothing else holds it.
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { askTheOffice, officeHeaders } from './sandbox-common.mjs'

// ============================================================================ the categories

/**
 * The first categories, by name. `label` is each record's name at reading level 1. A name may not be
 * longer than the record, which for a category is its title, so a category whose title is one word
 * has no label: `null`, and the run says so.
 */
export const CATEGORIES = [
  {
    name: 'Records and writing',
    label: 'Writing tools',
    says: 'Tools for writing, keeping and finding records and messages in the office.',
  },
  {
    name: 'Timers and triggers',
    label: 'Timed tools',
    says: 'Tools that do something at a set time, or when something else happens.',
  },
  {
    name: 'Developing the office',
    label: "Builders' tools",
    says: 'Tools the people who develop the office use to build, test, check and merge it.',
  },
  {
    name: 'Pages and pictures',
    label: 'Screenshot tools',
    says: "Tools that photograph or draw the office's pages.",
  },
  {
    name: 'Backup and sharing',
    label: 'Copying tools',
    says: 'Tools that keep a copy of the code and the data, and share them safely.',
  },
  {
    name: 'Services',
    label: null,
    says: 'Things outside the office that it calls with its own key, such as a model provider or a cloud GPU.',
  },
]

// ============================================================================ the entries

const NOT_BUILT_KEEPER = 'Nobody yet: it is not built.'
const NOT_BUILT_VERSION = 'None yet: it is not built.'
const NOT_BUILT_RECORDS = 'Nothing yet: it is not built. When it is, each use writes one line on the calling run, through POST /api/toolset/uses.'

/**
 * EVERY ENTRY, IN ONE LIST. `category` is a category's name from CATEGORIES, or null for a page on a
 * part of the office. `title` is the record's title and `label` its name at reading level 1. Every
 * other key is the record's `data`, as GET /api/kinds/tool describes it.
 */
export const ENTRIES = [
  // ------------------------------------------------------------ the general tools, draft block b-5
  {
    title: 'Agent drafts',
    label: 'Unsent writing',
    category: 'Records and writing',
    data: {
      entry: 'tool',
      slug: 'drafts',
      does: 'Keeps an agent\'s unsent writing in the office, to look at and change, and reminds its writer when a draft has waited too long.',
      forWhom: 'both',
      whenToUse: 'While a message or a report is being written and is not ready to send.',
      whenNotToUse: "Not for the person's own unsent chat text, which stays in their browser. A draft is never sent by itself.",
      whoMayUse: 'Any agent or person writes one. Only its writer sends it. Any caller in the project can read a draft today: the office has no rule that narrows who reads a record.',
      howToCall: 'POST /api/records with kind draft (body, for, becomes, and remindAfterMinutes if not 60); GET /api/drafts for your own; POST /api/drafts/<id>/send to send it.',
      example: 'POST /api/drafts/<id>/send',
      costs: 'One record per draft. A reminder one hour after its last change by default, which the writer may change.',
      protects: 'Nothing sends a draft but its writer, through the office\'s own record door. A sent draft is kept, unchanged, and linked to what it became.',
      eachUseRecords: 'The draft record and its history. Sending it files the message, report or note it becomes, with a derived_from link to the draft.',
      keptBy: "The office's builders.",
      version: 'Wave 13n, version 1.',
      kept: 'in this repository',
      location: 'src/server/api/drafts.ts',
      state: 'built',
    },
  },
  {
    title: 'Run named tests',
    label: 'Chosen tests only',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'named-tests',
      does: 'Runs only the test files you name, and checks afterwards that exactly those files ran.',
      forWhom: 'developers',
      whenToUse: 'For the test files of your own change, the whole-tree or related lists that run in parts, and the browser or window list, which it reads with --list.',
      // Only the merge queue runs the whole suite.
      whenNotToUse: 'Never for the whole suite: only the merge queue runs that, with npm test. It takes no -t: it runs whole files.',
      whoMayUse: 'The secretary, supervisors and workers.',
      howToCall: 'node tools/run-named-tests.mjs <file>... [--list whole-tree|related|browser|window] [--part <n>]. A file is a path, or a file name under tests/ with or without .test.ts. --part selects one part of the whole-tree or related list. --print shows every part, or the selected part, and runs nothing. --list window runs vitest inside dbus-run-session -- xvfb-run -a, a virtual display of its own.',
      example: 'node tools/run-named-tests.mjs tests/named-tests-run-only-what-is-named.test.ts --list whole-tree',
      costs: 'One vitest process per part, one file at a time. Both the whole-tree and related lists run in parts. The whole-tree list takes about 15 minutes total.',
      protects: 'Before anything runs, it refuses an empty list, an empty name, a folder, a name that matches no file or more than one, a file that is not a test file, and a list whose script fails. It hands vitest absolute paths with no shell, and removes the four office variables and MOLE_OFFICE_WHOLE_SUITE from what it starts, so it never runs the whole suite and no test it starts can reach the office through them.',
      eachUseRecords: "vitest's whole output in a log under .logs/, and vitest's JSON report beside it, both named on the screen with the exit code and the count of files named and run. After the run, one line on the calling run, through POST /api/toolset/uses: the files named, the files that ran, and vitest's exit code. It is written only when MOLE_OFFICE_API, MOLE_OFFICE_SESSION, MOLE_OFFICE_WORKSPACE and MOLE_OFFICE_AGENT are set where the tool is started, and the screen says whether it was written. The exit code is the run's either way.",
      keptBy: "The office's builders.",
      version: 'Wave 13n, version 1.',
      kept: 'in this repository',
      location: 'tools/run-named-tests.mjs',
      state: 'built',
    },
  },
  {
    title: 'Sandbox containers',
    label: 'Agent containers',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'sandbox',
      does: 'Brings a sandbox container up, runs a command in it, starts a Claude Code worker or its second round in one command, says what is running in it, and takes it down again, keeping its folder.',
      forWhom: 'developers',
      whenToUse: "When agents should work without the owner's home folder or the live database in reach.",
      whenNotToUse: 'Not to register an agent: worker and round refuse a handle that is not registered, and registration is its own tool, not built yet.',
      whoMayUse: 'Supervisors and the secretary.',
      howToCall: 'node tools/sandbox.mjs up <template> --name <instance>; exec <instance> -- <command>; worker <instance> --agent <handle> --brief <file> [--asked-by <run>]; round <instance> --agent <handle> --brief <file>; status [<instance>]; down <instance>. A noKey hand start requires --asked-by naming a live run of its registered starter and --brief; the office checks before the worktree is made.',
      example: 'node tools/sandbox.mjs round w13n --agent w13n-x --brief briefs/w13n-x-round-2.md',
      costs: 'One container while it is up. Each exec is one command in it.',
      protects: "The checkout is mounted read-only, and no office key goes into the container. round refuses while the run before still has a live process, so a worker is never started twice. Down stops only the container and keeps the instance folder.",
      eachUseRecords: 'The container and every process started in it are rows in the ledger of processes and ports, against the calling run. worker and round also write one line on the calling run, through POST /api/toolset/uses: which agent, which run was filed, and which run it continues. They say on the screen whether it was written. up, exec, status and down write no line.',
      keptBy: "The office's builders.",
      version: 'Sandbox v1.',
      kept: 'in this repository',
      location: 'tools/sandbox.mjs',
      state: 'built',
    },
  },
  {
    title: 'Data copy',
    label: 'Keyless database',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'data-copy',
      does: 'Makes a copy of the office database for one run in a sandbox, with every key and every machine address taken out, keeps it compressed, and unpacks it into the sandbox when asked. A copy is removed once its run has ended.',
      forWhom: 'developers',
      whenToUse: "When a sandbox needs the office's real records.",
      whenNotToUse: 'Not for a backup: that is npm run db:backup.',
      whoMayUse: 'The secretary.',
      howToCall:
        'node tools/office-copy.mjs make --to <sandbox> --for <run>, and later node tools/office-copy.mjs open --in <sandbox> --for <run>. node tools/office-copy.mjs sweep removes every copy whose run has ended.',
      example: 'node tools/office-copy.mjs make --to w13n --for <the id of the run the copy is for>',
      costs: 'About 600 MB before compression, and one read of the live database.',
      protects:
        "No key hash and no machine address is left in the file, deleted pages included; the office's own backups keep the addresses. The copy keeps the whole schema, triggers included. The live database is never written. Neither command overwrites a file that is already there.",
      eachUseRecords:
        'A block in <sandbox>/out/office-copy.log, and one row of the runtime_settings table inside the copy, office-copy.marker, naming the run it is for, when it was made, by what, and what was cleared. After a make or an open that worked, one line on the calling run when MOLE_OFFICE_API and MOLE_OFFICE_SESSION are set, and the log says whether it was written. Each copy a sweep removes is a line in its sandbox log.',
      keptBy: "The office's builders.",
      version: 'Wave 13s, round 63: a copy is made for one run.',
      kept: 'in this repository',
      location: 'tools/office-copy.mjs',
      state: 'built',
    },
  },
  {
    title: 'Speed measurement',
    label: 'Door timings',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'speed',
      does: "Replays the owner's real requests on a copy of the office, and measures how long each door takes, how long the thread is held and where the processor time goes.",
      forWhom: 'developers',
      whenToUse: 'When a page or a door is slow and you need to know which one and why.',
      whenNotToUse: 'Not on the live office: it runs on a copy.',
      whoMayUse: 'Supervisors and workers.',
      howToCall: 'Not decided yet.',
      example: 'None yet: it is not built.',
      costs: 'One copy of the office and the time of the replay.',
      protects: 'The live office is never asked anything.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'in this repository',
      state: 'not built yet',
    },
  },
  {
    title: 'Page screenshots',
    label: 'Page photographs',
    category: 'Pages and pictures',
    data: {
      entry: 'tool',
      slug: 'page-screenshots',
      does: 'Photographs every page of the office at 1440, 990, 660 and 390 wide, in light and dark, on a throwaway office, and compares with the last run that passed.',
      forWhom: 'both',
      whenToUse: 'Before you call a change to a page done.',
      whenNotToUse: 'Not to photograph the live office: it starts its own on a seeded database.',
      whoMayUse: 'Everyone.',
      howToCall: 'node tools/review.mjs',
      example: 'node tools/review.mjs',
      costs: 'Two ports, one throwaway database, and a few minutes.',
      protects: 'It never touches the live database, and it stops what it started and checks that the ports are free again.',
      eachUseRecords: 'The pictures and a contact sheet in tools/review, and the reference of the last run that passed.',
      keptBy: "The office's builders.",
      version: 'As in this checkout.',
      kept: 'in this repository',
      location: 'tools/review.mjs',
      state: 'built',
    },
  },
  {
    title: 'Database backup',
    label: 'Office backups',
    category: 'Backup and sharing',
    data: {
      entry: 'tool',
      slug: 'backup',
      does: 'Backs up the database once and shows which backups exist. Handing one complete backup to the lab server is built: the office asks the host job runner to hand it over with tools/hand-over-a-backup.mjs.',
      forWhom: 'both',
      whenToUse: 'Before anything that could lose data, such as a migration.',
      whenNotToUse: 'Not for a copy for a sandbox: that is the data copy.',
      whoMayUse: 'The person, or a secretary with its own key.',
      howToCall: 'GET /api/office/backups lists every backup, with what made it, its time and its size. POST /api/office/backups, with no body, takes one now and answers when it is done. POST /api/office/backups/hand-over, with {"backup":"<the name of a complete backup in the backups folder>"} and nothing else, asks the host job runner to hand that one complete backup to the lab server, and only the person or a secretary with its own key may call it.',
      example: 'POST /api/office/backups',
      costs: 'One backup of the database and of the folders a backup carries, as npm run db:backup takes it.',
      protects: 'The backup is taken while the office runs, and nothing written in the last minutes is lost.',
      eachUseRecords: 'The backup itself, in the backups folder, under a name that says this door took it. Each call is a row of the office request log, with who called, as every request is.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/backups.ts',
      state: 'built',
    },
  },
  {
    title: 'Record search',
    label: 'Word finder',
    category: 'Records and writing',
    data: {
      entry: 'tool',
      slug: 'search',
      does: 'Finds the records and messages in one project that hold some words, and says where in each record they were found.',
      forWhom: 'both',
      whenToUse: 'When you know what a record says but not what it is called.',
      whenNotToUse: 'Not to list every record of a kind: that is GET /api/records?kind=<kind>.',
      whoMayUse: 'Everyone.',
      howToCall: 'GET /api/search?q=<the words>, in the project x-mole-office-workspace names.',
      example: 'GET /api/search?q=data%20copy',
      costs: 'One read.',
      protects: 'It writes nothing.',
      eachUseRecords: 'Nothing: it is a read.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/search.ts',
      state: 'built',
    },
  },
  {
    title: 'Adaptable timers and triggers',
    label: 'Changeable timer copy',
    category: 'Timers and triggers',
    data: {
      entry: 'tool',
      slug: 'adaptable-timers',
      does: 'Reminds at a set time, or does something when something else happens, and anybody may change its code for their own use.',
      forWhom: 'both',
      whenToUse: 'When you want a timer or a trigger that works differently from the office\'s own.',
      whenNotToUse:
        "When it must fire after a restart, or with no agent running: use the office's own timers and triggers, which promise that and are changed only through their tests. " +
        "When it must follow something that happens in the office. Office events are not followed yet: a landing, a run that finished, a group message. A shell script holds no key, so this tool cannot read the office or write to it.",
      whoMayUse: 'Everyone.',
      howToCall:
        'node tools/adaptable-timers.mjs <command> --folder <folder>, where the folder holds its state. ' +
        'make <name> takes at least one trigger (--count <n>; --amount <m> with --amount-is <what>; --quiet <minutes>; --every <hours>, with --from <YYYY-MM-DD HH:MM> if you like; --timer for a timer nobody adds to) ' +
        'and one action (--action message --words <text>; --action task --title <title>; --action command --command <shell command>). ' +
        'add <name> --reason <why> adds 1, or --count <n>, and --amount <x>. tick checks every trigger once; watch checks them every minute, or every --seconds <s>, until it is stopped; list says where each one stands. help says the rest.',
      example: [
        "node tools/adaptable-timers.mjs make reviews --folder timers --count 3 --action message --words 'Three reviews are waiting.'",
        "node tools/adaptable-timers.mjs add reviews --folder timers --reason 'a review came in'",
        "node tools/adaptable-timers.mjs make hourly --folder timers --every 1 --timer --action command --command 'echo an hour has passed'",
        'node tools/adaptable-timers.mjs tick --folder timers',
      ].join('\n'),
      costs:
        'No tokens and no money: it runs on this machine and asks nobody. One call took about 0.02 seconds and at most 48 MB here (8 November 2026, load 3). ' +
        'watch is one process for as long as it runs. A command action costs what the command costs.',
      protects: "Changing it never changes the office's own timers and triggers.",
      eachUseRecords:
        'One row in its state file, adaptable-timers.json in the folder named, for each addition and each firing, with the time and the reason or the trigger that held. ' +
        "A command's exit code is added to its firing row when it ends. Nothing in the office: it holds no key and imports nothing of the office's, so it writes no line on the calling run.",
      keptBy: "The office's builders.",
      version: 'Wave 13n, round EA: version (a), timers and hand-added counts only.',
      copyOf:
        "The office's own timers and triggers, the counters at /api/counters. Changing this copy does not change the office's own, and this copy does not have their promises. " +
        "It keeps their rules: an addition says why, the four triggers, one action, then the count starts again from zero. Where it differs: quiet here means nobody added for so many minutes, and the office's quiet means the merge lane was idle. " +
        'A message or a task is printed and kept in the state file, and never sent or filed. There is no pause and no "at most once every" limit. It fires only while its process runs.',
      kept: 'in this repository',
      location: 'tools/adaptable-timers.mjs',
      state: 'built',
    },
  },
  // ------------------------------------------------------------ the specialised tools, draft block b-6
  {
    title: 'Merge queue tool',
    label: 'Change submission',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'merge-queue',
      does: 'Submits a change to the merge queue, says where it is in the queue, and checks again only the few files it changed.',
      forWhom: 'developers',
      whenToUse: 'When a sealed change is ready to land.',
      whenNotToUse: 'Not to read what the queue holds: GET /api/merge-queue already answers that.',
      whoMayUse: 'Supervisors and the secretary.',
      howToCall: 'Not decided yet.',
      example: 'None yet: it is not built.',
      costs: 'Not measured yet.',
      protects: 'A change lands only through the queue, one at a time in each lane.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'in this repository',
      state: 'not built yet',
    },
  },
  {
    title: 'Inspection request',
    label: 'Asking inspectors',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'inspection',
      does: 'Asks an inspector to check one sealed change, reading only the files that changed.',
      forWhom: 'developers',
      whenToUse: 'When a run says it is finished and its work needs a release.',
      whenNotToUse: 'Not to check your own work: an inspector is a different agent.',
      whoMayUse: 'Supervisors and the secretary.',
      howToCall: 'Not decided yet.',
      example: 'None yet: it is not built.',
      costs: "One inspector's run.",
      protects: 'The inspector reads the changed files and not the whole checkout.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'in this repository',
      state: 'not built yet',
    },
  },
  {
    title: 'Agent registration',
    label: 'Registering runs',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'registration',
      does: "Registers an agent or a run, and the office puts the agent's key straight into its environment, so nobody copies a key into a file by hand.",
      forWhom: 'developers',
      whenToUse: 'When you start an agent or a run.',
      whenNotToUse: 'Not to give an agent a higher role card: that is the role request.',
      whoMayUse: 'Supervisors and the secretary.',
      howToCall: 'Not decided yet.',
      example: 'None yet: it is not built.',
      costs: 'Not measured yet.',
      protects: 'A key never passes through a file an agent writes by hand.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'in this repository',
      state: 'not built yet',
    },
  },
  {
    title: 'Secret scan',
    label: 'Key finder',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'secret-scan',
      does: 'Looks for keys in files that are about to leave this machine, and says how many of each kind are in which file, without printing any.',
      forWhom: 'developers',
      whenToUse: 'Before a backup, an export or an upload leaves this machine.',
      whenNotToUse: 'Not as proof that a file holds no secret of a shape it does not know.',
      whoMayUse: 'Everyone.',
      howToCall: 'node tools/secret-scan.mjs <path>... [--json] [--db <file>]',
      example: 'node tools/secret-scan.mjs ~/.cache/mole-office/sandboxes/w13n/out',
      costs: 'One read of each file it is given.',
      protects: 'It never prints a key, not even a part of one.',
      eachUseRecords: 'Nothing is kept. It prints what it found, and exits 1 when it found something.',
      keptBy: "The office's builders.",
      version: 'As in this checkout.',
      kept: 'in this repository',
      location: 'tools/secret-scan.mjs',
      state: 'built',
    },
  },
  {
    title: 'Lab server backup and sharing',
    label: 'Lab server copies',
    category: 'Backup and sharing',
    data: {
      entry: 'tool',
      slug: 'lab-server-copies',
      does: "Backs up code and data to the lab's server, and shares a repository with somebody else safely.",
      forWhom: 'both',
      whenToUse: 'When code or data should be kept off this machine, or given to somebody.',
      whenNotToUse: 'Not for a quick copy on this machine: that is the backup.',
      whoMayUse: 'The owner and the secretary.',
      howToCall: 'Not decided yet.',
      example: 'None yet: it is not built.',
      costs: 'Not measured yet.',
      protects: 'What is shared is looked at for keys first.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'elsewhere',
      state: 'not built yet',
    },
  },
  {
    title: 'Test groups',
    label: 'Common suites',
    category: 'Developing the office',
    data: {
      entry: 'tool',
      slug: 'test-groups',
      does: 'Two things. First, the test lists: the whole-tree list, which every worker runs each round, the browser list, and the window list, whose tests open an Electron window under a virtual display. These are built, in tests/the-test-lists.ts, and run named tests runs them with --list. Second, a comparison of the merge queue with main. This is not built.',
      forWhom: 'developers',
      whenToUse: 'At the end of every round, before you commit: run the whole-tree list beside the test files of your own change.',
      whenNotToUse: 'Not to run a list by some other command: run named tests runs it, and checks that exactly its files ran.',
      whoMayUse: 'Supervisors and workers.',
      howToCall: 'A list is run with node tools/run-named-tests.mjs <your files> --list whole-tree, --list browser or --list window. node --import tsx tests/the-test-lists.ts whole-tree prints a list and runs nothing. The comparison with main has no call, because it is not built.',
      example: 'node tools/run-named-tests.mjs tests/named-tests-run-only-what-is-named.test.ts --list whole-tree',
      costs: 'About 15 minutes for the whole-tree list.',
      protects: 'Every worker runs the same list, so a result can be compared with another. A list is worked out from the test files themselves, so a new test file joins it on the commit that adds it.',
      eachUseRecords: 'Printing a list records nothing. A run of a list is a use of run named tests, and records what that tool records. The comparison with main records nothing, because it is not built.',
      keptBy: "The office's builders keep the lists. Nobody keeps the comparison yet: it is not built.",
      version: 'The lists: as tests/the-test-lists.ts holds them. The comparison: none yet, because it is not built.',
      kept: 'in this repository',
      location: 'tests/the-test-lists.ts',
      state: 'not built yet',
    },
  },
  // ------------------------------------------------------------ the services, draft block b-7
  {
    title: 'OpenRouter models',
    label: 'Many models',
    category: 'Services',
    data: {
      entry: 'service',
      slug: 'openrouter',
      does: "Asks a model on OpenRouter about a video, through the office's own OpenRouter key, which the agent never sees.",
      forWhom: 'both',
      whenToUse: 'When a video needs a review by a model that takes video, such as the recording of a robot run. Write the prompt first, in a file if it is long.',
      whenNotToUse:
        "Not for text or pictures: video-review is its only command so far. Not from inside a sandbox: it runs on the host, where the office's key file is.",
      whoMayUse: 'Not decided yet.',
      howToCall:
        'node tools/openrouter.mjs video-review --file <clip.mp4> --prompt <text, or @file> [--model <id>] [--processing static|agentic] [--json]. ' +
        'It prints the answer, or with --json one JSON object. Exit 0: answered. Exit 2: refused, and nothing was sent to the model. Exit 75: no answer from OpenRouter. ' +
        "The file is an .mp4 of at most 20 MiB. --model is google/gemini-3.8-flash unless given. --processing is for Gemini models only; left out, Gemini's own default applies. " +
        "From a worktree, set MOLE_OFFICE_DB to the office's database, because the key is read from the key file beside it.",
      example: 'node tools/openrouter.mjs video-review --file run-07.mp4 --prompt @review-prompt.txt --model google/gemini-3.8-flash --processing agentic --json',
      costs:
        "Money for each call, at the model's price, as OpenRouter's answer gives it. A first batch of 29 clips of 15 to 60 seconds each cost 0.22 US dollars together (13 October 2026). " +
        "Before each call the tool refuses one that the key's own limit at OpenRouter, or the monthly cap MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD, cannot cover. The cap is 0 unless set, which means no cap of our own.",
      protects:
        "The office's own OpenRouter key, set on the Settings page and kept in the office's key file beside the database MOLE_OFFICE_DB names " +
        '(by default the database of the checkout the tool runs from). OPENROUTER_API_KEY is read only when that file holds no OpenRouter key. ' +
        "The tool reads it through src/config/provider-keys.mjs, the reader the office's picture tools use, and never from the sandboxes' secrets file, which holds a different key. " +
        'Where it finds no key it refuses and names where it looked. The key goes only to OpenRouter, and is never printed, logged or written. ' +
        'An error OpenRouter sends back is shown with the key masked.',
      eachUseRecords:
        'One line in ~/.cache/mole-office/openrouter/receipts.jsonl on this machine: when, which agent, the model, the file\'s name and size, the video\'s length, the processing, ' +
        "the tokens, the cost from OpenRouter's answer, the seconds and the outcome. And one line on the calling run, through POST /api/toolset/uses, when the environment " +
        'names the run\'s office; the tool says whether it was written. Neither holds the prompt or the answer. A refused call records nothing.',
      keptBy: "The office's builders.",
      version: 'Wave 13s, round 41: video-review only.',
      kept: 'in this repository',
      location: 'tools/openrouter.mjs',
      state: 'built',
    },
  },
  {
    title: 'Codex image generation',
    label: 'Prompted pictures',
    category: 'Services',
    data: {
      entry: 'service',
      slug: 'codex-images',
      does: 'Makes a picture from a written prompt through Codex with a small model.',
      forWhom: 'both',
      whenToUse: 'When a page or a report needs a picture. Write the prompt first.',
      whenNotToUse: 'Not for a chart of real numbers: draw that from the data.',
      whoMayUse: 'Not decided yet.',
      howToCall: 'Not decided yet: no tool in the office calls it yet.',
      example: 'None yet: it is not built.',
      costs: 'Almost none of the Codex allowance, by the owner\'s note nSEkut8eD2Tf.',
      protects: 'The login stays with Codex on this machine.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'elsewhere',
      location: 'https://github.com/openai/codex',
      state: 'not built yet',
    },
  },
  {
    title: 'Modal cloud GPU',
    label: 'Rented GPUs',
    category: 'Services',
    data: {
      entry: 'service',
      slug: 'modal-gpu',
      does: 'Runs a job on a GPU in Modal\'s cloud.',
      forWhom: 'both',
      whenToUse: 'When a job needs a GPU this machine does not have.',
      whenNotToUse: 'Not for a job this machine can run.',
      whoMayUse: 'Not decided yet.',
      howToCall: 'Not decided yet: no tool in the office calls it yet.',
      example: 'None yet: it is not built.',
      costs: 'A free allowance of 30 US dollars a month, then money for each GPU hour.',
      protects: 'The key stays in the office and goes into one run only while that run uses it.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'elsewhere',
      location: 'https://modal.com',
      state: 'not built yet',
    },
  },
  {
    title: 'Claude and DeepSeek allowances',
    label: 'Model allowance use',
    category: 'Services',
    data: {
      entry: 'service',
      slug: 'model-allowances',
      does: "Says how much of the Claude and DeepSeek allowances each agent has used, from the office's usage records and its price table.",
      forWhom: 'both',
      whenToUse: 'When you need to know what a run or an agent cost.',
      whenNotToUse: 'Not as a bill: the price table is the office\'s own reading.',
      whoMayUse: 'Not decided yet.',
      howToCall: 'Not decided yet: no tool in the office reads it this way yet.',
      example: 'None yet: it is not built.',
      costs: 'One read.',
      protects: 'It reads and writes nothing outside the office.',
      eachUseRecords: NOT_BUILT_RECORDS,
      keptBy: NOT_BUILT_KEEPER,
      version: NOT_BUILT_VERSION,
      kept: 'elsewhere',
      state: 'not built yet',
    },
  },
  // ------------------------------------------------------------ the parts of the office, draft block b-2
  {
    title: 'Sending a message',
    label: 'Message delivery',
    category: null,
    data: {
      entry: 'part of the office',
      slug: 'sending-a-message',
      does: 'Sends a message to a person or an agent, with its own id. Words still waiting to be sent may be changed; once a message has gone out, the office refuses any change to it.',
      forWhom: 'both',
      whenToUse: 'When somebody has to read something from you.',
      whenNotToUse: 'Not for finished writing for a person: file a report and link it to what it is about.',
      whoMayUse: 'Everyone, to the people and agents their card lets them write to (chapter 7).',
      howToCall: "POST /api/records with kind \"message\" to send one; GET /api/handles/:handle/waiting for what waits for an agent; GET /api/messages/:id for one message and how far it got; POST /api/messages/:id/mark to mark one.",
      example: 'POST /api/records {"kind":"message","title":"The copy is made","data":{"body":"The copy is in out/.","to":[{"kind":"agent","id":"quill"}]}}',
      costs: 'One request.',
      protects: 'Each message has one id and is delivered once.',
      eachUseRecords: 'The message is a record, with a delivery row for each person or agent it is to.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/messages.ts',
      state: 'built',
    },
  },
  {
    title: "The office's own timers and triggers",
    label: 'Built-in timers',
    category: null,
    data: {
      entry: 'part of the office',
      slug: 'office-timers',
      does: 'Fires at a set time or after a count, even with no agent running and after a restart, and then writes a line, files a task or asks for a job.',
      forWhom: 'both',
      whenToUse: 'When something must happen after N of something, or every so many hours, and must not be forgotten.',
      whenNotToUse: 'Not when you want to change how a timer works: that is the adaptable copy.',
      whoMayUse: 'Everyone may file one. Only whoever filed it, a secretary or the owner may change it.',
      howToCall: 'POST /api/counters to file one; GET /api/counters and GET /api/counters/:id to read; POST /api/counters/:id/add to add; PATCH /api/counters/:id to change; POST /api/counters/:id/pause and /resume.',
      example: 'GET /api/counters',
      costs: 'One request each.',
      protects: 'It never starts an agent, and it is changed only through its own doors and their tests.',
      eachUseRecords: 'Every addition and every firing is a row of the counter, with who and why.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/counters.ts',
      state: 'built',
    },
  },
  {
    title: 'Records and links',
    label: 'Kept project history',
    category: null,
    data: {
      entry: 'part of the office',
      slug: 'records',
      does: "Keeps the project's decisions, problems, reports and tasks, the links between them, and every earlier version.",
      forWhom: 'both',
      whenToUse: 'To file what happened, to read what is filed, and to change part of a record.',
      whenNotToUse: 'Not for a use of a tool: that is one row against your run, through POST /api/toolset/uses.',
      whoMayUse: "Everyone. A decision is the owner's own act; an agent files a proposal instead (chapter 4).",
      howToCall: 'POST /api/records to file one; GET /api/records and GET /api/records/:id to read; PATCH /api/records/:id with dataPatch to change part of one; POST /api/links to link two; GET /api/kinds for the shapes.',
      example: 'GET /api/kinds/tool',
      costs: 'One request each.',
      protects: 'Every change is kept as a revision with who made it, and a deleted record can be restored.',
      eachUseRecords: 'A change row and a revision on the record, with the actor and the run.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/records.ts',
      state: 'built',
    },
  },
  {
    title: "The merge queue's state",
    label: 'Where changes wait',
    category: null,
    data: {
      entry: 'part of the office',
      slug: 'merge-queue-state',
      does: 'Says where each change is in the merge queue, lane by lane, and what the next step waits on.',
      forWhom: 'developers',
      whenToUse: 'When you want to know whether your change has landed, or who is waiting for whom.',
      whenNotToUse: 'Not to land a change by hand: a change lands only through the queue.',
      whoMayUse: "Everyone may read it. A run's supervisor or the owner submits.",
      howToCall: 'GET /api/merge-queue for every lane; GET /api/merge-queue/:id for one entry; POST /api/merge-queue to submit; POST /api/merge-queue/:id/withdraw to take one back.',
      example: 'GET /api/merge-queue',
      costs: 'One request each.',
      protects: 'One change at a time in each lane, and every step is kept on the entry.',
      eachUseRecords: 'Each submission is a merge entry record, and each step is written on it.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/merge-queue.ts',
      state: 'built',
    },
  },
  {
    title: 'Permissions and keys',
    label: 'Who may act',
    category: null,
    data: {
      entry: 'part of the office',
      slug: 'permissions-and-keys',
      does: 'Says who may do what in the office, from the role cards, and which keys the office holds.',
      forWhom: 'both',
      whenToUse: 'Before an act you are not sure you may do, and when a key is missing.',
      whenNotToUse: 'Not to give yourself a card or a key: those are the owner\'s acts.',
      whoMayUse: 'Everyone may read. Giving a card and setting a key are the owner\'s acts.',
      howToCall: "GET /api/roles for the role cards; GET /api/participants/:kind/:id/profile for one card and what it may do; GET /api/access for which machines may reach the office; GET /api/office/keys for which keys are set.",
      example: 'GET /api/roles',
      costs: 'One request each.',
      protects: 'No key is ever answered, only whether it is set.',
      eachUseRecords: 'Nothing for a read. A change of card or key is on the change log.',
      keptBy: "The office's builders.",
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/roles.ts',
      state: 'built',
    },
  },
]

// ============================================================================ the run

const HELP = `node tools/file-the-basic-toolset.mjs --api <url> --workspace <project> --as <handle> --session <run> [--confirmed-by <decision id>]

Files the basic toolset's ${String(CATEGORIES.length)} categories and ${String(ENTRIES.length)} entries into one project, skipping any
category whose name, and any entry whose slug, is already live there. Prints what it filed and what it skipped.`

class Refusal extends Error {}

function readArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const flags = { '--api': 'api', '--workspace': 'workspace', '--as': 'as', '--session': 'session', '--confirmed-by': 'confirmedBy' }
  const said = {}
  for (let i = 0; i < argv.length; i++) {
    const key = flags[argv[i]]
    const value = argv[i + 1]
    if (key === undefined) throw new Refusal(`"${argv[i]}" is not an argument this takes.\n\n${HELP}`)
    if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Refusal(`${argv[i]} needs a value after it. Nothing was filed.`)
    said[key] = value
    i++
  }
  for (const needed of ['api', 'workspace', 'as', 'session']) {
    if (said[needed] === undefined) throw new Refusal(`--${needed} is needed. None of the four is read from the environment, so the caller says which office and who. Nothing was filed.`)
  }
  return { ...said, api: said.api.replace(/\/+$/, '') }
}

/** The office's own words for a refusal. */
function theOfficeSaid(answer) {
  if (answer.status === null) return `nothing answered (${answer.why})`
  return `${String(answer.status)}: ${String(answer.body?.error ?? JSON.stringify(answer.body)).slice(0, 1500)}`
}

/** One request, or a thrown Error carrying the office's words. */
async function ask(asked, path, what, options = {}) {
  const answer = await askTheOffice(asked.api, path, {
    ...options,
    headers: officeHeaders({ workspace: asked.workspace, agent: asked.as, session: asked.session }),
  })
  if (answer.status === null || answer.status >= 300) throw new Error(`${what}: the office answered ${theOfficeSaid(answer)}`)
  return answer.body
}

/** Write a record's name at reading level 1, made from its newest revision. */
async function writeTheLabel(asked, id, label) {
  const revisions = await ask(asked, `/api/records/${id}/revisions`, `reading the revisions of ${id}`)
  const list = Array.isArray(revisions?.revisions) ? revisions.revisions : []
  const newest = list.reduce((best, one) => (best === null || one.seq > best.seq ? one : best), null)
  if (newest === null) throw new Error(`reading the revisions of ${id}: the office answered no revision`)
  await ask(asked, `/api/records/${id}/short-forms`, `writing the name of ${id}`, {
    method: 'POST',
    body: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label } },
  })
}

async function fileIt(asked, kind, title, data, label) {
  const made = await ask(asked, '/api/records', `filing the ${kind} "${title}"`, { method: 'POST', body: { kind, title, data } })
  const id = made?.record?.id
  if (typeof id !== 'string') throw new Error(`filing the ${kind} "${title}": the office answered no record id`)
  if (label !== null) await writeTheLabel(asked, id, label)
  return id
}

/** What the run says about a record it filed with no name at reading level 1. */
const NO_LABEL = ', with no name at reading level 1, because its title is one word and a name may not be longer than the record'

async function main() {
  const filed = []
  const skipped = []
  try {
    const asked = readArguments(process.argv.slice(2))
    if (asked.help) {
      console.log(HELP)
      return
    }
    const now = await ask(asked, '/api/toolset', 'reading GET /api/toolset')
    const categoryIds = new Map((now.categories ?? []).map((one) => [one.name, one.id]))
    const liveSlugs = new Set(
      [...(now.categories ?? []).flatMap((one) => one.tools ?? []), ...(now.withoutACategory ?? []), ...(now.partsOfTheOffice ?? [])]
        .map((one) => one.slug)
        .filter((slug) => typeof slug === 'string'),
    )

    for (const category of CATEGORIES) {
      if (categoryIds.has(category.name)) {
        skipped.push(`category "${category.name}": ${categoryIds.get(category.name)} is already live`)
        continue
      }
      const data = { says: category.says, ...(asked.confirmedBy === undefined ? {} : { confirmedBy: asked.confirmedBy }) }
      const id = await fileIt(asked, 'tool_category', category.name, data, category.label)
      categoryIds.set(category.name, id)
      filed.push(`category "${category.name}": ${id}${asked.confirmedBy === undefined ? ', proposed' : `, confirmed by ${asked.confirmedBy}`}${category.label === null ? NO_LABEL : ''}`)
    }

    for (const entry of ENTRIES) {
      if (liveSlugs.has(entry.data.slug)) {
        skipped.push(`entry "${entry.data.slug}": a live tool already has this slug`)
        continue
      }
      const category = entry.category === null ? undefined : categoryIds.get(entry.category)
      if (entry.category !== null && category === undefined) throw new Error(`the entry "${entry.data.slug}" names the category "${entry.category}", which is not in CATEGORIES`)
      const data = { ...entry.data, ...(category === undefined ? {} : { category }) }
      const id = await fileIt(asked, 'tool', entry.title, data, entry.label)
      filed.push(`entry "${entry.data.slug}": ${id}, ${entry.data.state}`)
    }
    console.log(`Filed ${String(filed.length)}:`)
    for (const line of filed) console.log(`  ${line}`)
    console.log(`Skipped ${String(skipped.length)}:`)
    for (const line of skipped) console.log(`  ${line}`)
  } catch (err) {
    if (filed.length > 0 || skipped.length > 0) {
      console.error(`Filed ${String(filed.length)} before it stopped:`)
      for (const line of filed) console.error(`  ${line}`)
    }
    console.error(`${err instanceof Refusal ? 'Refused' : 'Stopped'}: ${err.message}`)
    process.exitCode = err instanceof Refusal ? 2 : 1
  }
}

// RUN ONLY WHEN IT IS THE COMMAND, so a test may import the two lists without filing anything.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
