// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { GATES } from './gates.mjs'
import { WORK_SWITCH_SETTINGS } from '../shared/work-switches.mjs'
/** Which declared settings run the office, rather than describe one command or its identity. The work switches are among them (wave 13q item 17). */
export const RUNTIME_SETTING_NAMES = [
  'AGENT_MODEL', 'CHORE_RUNTIME', 'CHORE_MODEL', 'CHORE_VARIANT', 'INSPECTION_MODEL',
  'REMIND_ME_LATER_EVERY_SECONDS', 'NOTICE_BATCH_MAX_MINUTES',
  'INSPECTION_MINUTES', 'INSPECTION_API_SECONDS', 'INSPECTION_OFFICE_BACK_SECONDS',
  'SETTLE_PROTECTED_HANDLES', 'LINES_THE_INSPECTOR_ANSWERS', 'REGISTER_TIMEOUT_SECONDS', 'COMMIT_EMAIL',
  'MODAL_MONTHLY_CAP_USD', 'BUS_MOST_ENTRIES', 'BUS_LEAVES_AFTER_SECONDS', 'BUILD_SHERIFF', 'MERGE_WORKERS',
  'MESSAGE_WORKER', 'TERMINAL_HOLDER', 'WINDOW_DEBUGGING',
  'FEW_RED_FILES', 'HAND_BACK_HOURS', 'RUN_WAITS_MINUTES', 'IDLE_REMINDER_HOURS', 'CLAUDE_SUPERVISORS_AT_ONCE',
  'BROADCAST_TIMES', 'BROADCAST_LEAD_MINUTES',
  'BROADCAST_BACKUP_REMINDER', 'BROADCAST_REPORT_TEMPLATE', 'BROADCAST_REPORT_LATE_MINUTES',
  'MODULE_REMINDER_SECRETARIES', 'HANDLE_BEAT_SECONDS', 'MAIN_WORLD_SUPERVISORS',
  'MAIN_WORLD_WORKERS', 'HANDLE_LAPSES_AFTER_SECONDS', 'HANDLE_GRACE_SECONDS',
  'HANDLE_UNREAD_AFTER_SECONDS', 'REPLY_REMINDER_MINUTES', 'MESSAGE_EDIT_WINDOW_SECONDS',
  'ENDED_RUN_LOOK_AFTER_SECONDS', 'ENDED_RUN_LOOK_EVERY_SECONDS', 'ENDED_RUN_SWEEP_EVERY_SECONDS',
  'IDLE_AFTER', 'ORPHAN_AFTER', 'EXPENSIVE_AFTER', 'LARGE_LAST_TURN_TOKENS', 'LOCK_PATHS',
  'AVATAR_MAX_BYTES', 'MESSAGE_PICTURE_MAX_BYTES', 'RETURNED_FILE_MAX_BYTES', 'PERSONAL_SPACE_MAX_BYTES',
  'EVENT_RING', 'ALIVE_WITHIN_MINUTES', 'PERSON_ALIVE_WITHIN_SECONDS',
  'REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN', 'DEAD_LETTER_AFTER_DAYS', 'DEAD_LETTER_AFTER_COUNT',
  'STRAY_GRACE', 'STALE_CODE_GRACE', 'CHECK_FOR_MISSED_CHANGES', 'FAILED_STARTS_BEFORE_SAYING',
  'TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS', 'CLAUDE_COMPACTS_AT_ON_THE_HOST', 'CLAUDE_COMPACTS_AT_IN_A_SANDBOX',
  'RESULT_LEVEL_OF_EACH_KIND', 'RESULT_WHOLE_UNDER_CHARACTERS', 'RESULTS_CAP_CHARACTERS', 'KNOWLEDGE_QUERY_LIMIT', 'KNOWLEDGE_RATING_ASK', 'KNOWLEDGE_LOW_RATING_NOTICE', 'KNOWLEDGE_FEWEST_RATINGS',
].map((name) => `MOLE_OFFICE_${name}`).concat(GATES.map(row => row.setting)).concat(WORK_SWITCH_SETTINGS)

/**
 * A CHANGE TO ONE OF THESE IS USED AFTER A RESTART. Some of their readers keep a value or a timer from when they start.
 * The others read the environment the office started with: the office reads `.env` into it once, when it starts
 * (loadPanelEnv in src/server/lib/env.ts), so a name set there keeps its value until a restart (UqJis_ofrSWA).
 * The message worker is started again with the server, so this holds for what it reads too. Each read-only setting
 * here was traced to every reader in wave 13r round 16, and STABLE_CHECKOUT in wave 13q round 12. The settings door reads each one when it starts, so the
 * Office controls page can say which value the running office started with.
 * TEST_SHUTDOWN_LIMIT_MS is for the test suite only. The server reads it when it shuts down (wave 13n round F).
 * LOOK_AT_PRESENCE_AGAIN_EVERY_MS is for a test office. It is on this list and not on RUNTIME_SETTING_NAMES, so the
 * Office controls page shows the value the office started with and cannot change it. The server reads it once, when
 * the presence clock starts (src/server/api/events.ts).
 * RUN_THE_SLEEP_CLOCK_EVERY_MS is for a test office too. It is on this list and not on RUNTIME_SETTING_NAMES, so the
 * Office controls page shows the value the office started with and cannot change it. The server reads it once, when
 * the sleep clock starts (src/server/index.ts).
 */
export const RESTART_SETTING_NAMES = [
  'AVATAR_MAX_BYTES', 'MESSAGE_PICTURE_MAX_BYTES', 'RETURNED_FILE_MAX_BYTES',
  'MESSAGE_WORKER', 'WORKER_CHECKOUT', 'TERMINAL_HOLDER', 'WINDOW_DEBUGGING', 'REMIND_ME_LATER_EVERY_SECONDS', 'IDLE_AFTER', 'ORPHAN_AFTER',
  'HANDLE_BEAT_SECONDS', 'NOTICE_BATCH_MAX_MINUTES', 'ENDED_RUN_LOOK_EVERY_SECONDS', 'ENDED_RUN_SWEEP_EVERY_SECONDS',
  'A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', 'MIGRATIONS_HAVE_TO_FINISH_WITHIN',
  'PORT', 'DB', 'WEB_PORT', 'REPO_ROOT', 'REMOTE_PORT', 'STABLE_CHECKOUT',
  'INSTALLATION', 'WORLD_STARTED_BY', 'WORLD_SECRETARIES', 'WORLD_PURPOSE', 'WORLD_HANDBACK', 'WORLD_INHERITED_DELIVERIES',
  'VISITOR_CARD_CEILING', 'PREVIEW_ROOTS', 'PLUGINS',
  'GPU_WATCHER', 'HARNESS_REGISTRY', 'MODAL_TOKEN_FILE',
  'FAKE_RUNTIME', 'FAKE_MERGE_TOOL', 'FAKE_INSPECTION_TOOL', 'FAKE_ROUND_LAUNCHER', 'START_MODE', 'TEST_SHUTDOWN_LIMIT_MS',
  'LOOK_AT_PRESENCE_AGAIN_EVERY_MS',
  'RUN_THE_SLEEP_CLOCK_EVERY_MS',
].map((name) => `MOLE_OFFICE_${name}`).concat(['KIMI_BASE_URL', 'KIMI_MODEL_NAME'])

/**
 * The office does not use these. A tool that runs on its own reads each one when it runs: `npm run db:reset`,
 * `npm run db:seed`, a photographing tool, the first-handoff rehearsal (tools/stable/bootstrap-stable.mjs), the main-suite job,
 * the cloud suite (tools/cloud-suite.mjs), tools/openrouter.mjs, or an agent's tool that checks which copy of the office
 * its address is for (theEnvironmentsAddressIsForAnotherCopy). The merge queue starts the cloud suite without the two
 * cloud settings, because a run the worker starts is given no MOLE_OFFICE_ setting but the few it needs.
 * AGENT is read by the session hook and by an agent's tools, each when it runs (round 18). The message worker does not
 * read it, and a run the office starts is given the agent it serves, not the value in `.env`.
 * TEST_SUPERVISOR_CLOCKS and TEST_HOOK_CLOCK_SCALE are for the test suite only. serve-dev reads the first when it
 * starts, and the session hook reads the second each time it runs (wave 13n round F).
 * TEST_FOLDER_LIMIT_MS and TEST_GPU_COMMAND_LIMIT_MS are for the test suite only. `node tools/sandbox.mjs sizes` reads
 * the first for each folder it measures, and tools/gpu-watch.mjs reads the second for each GPU command (wave 13n round G).
 * TEST_FILES_SHARE_A_PROCESS is for the test suite only. vitest.config.ts reads it when a test run starts (wave 13n round I).
 * STABLE_RELEASE_FLOOR_GB is read by the stable release tool (tools/stable/upgrade-stable.mjs) each time a release runs (wave 13q).
 * SANDBOX_DISK_WATCHERS is read by `node tools/sandbox.mjs sizes --tell` each time it runs, and TIMING_REPORT_READER by
 * tools/run-the-timing-job.mjs on each tick (line 13z).
 */
export const TOOL_SETTING_NAMES = [
  'RESET_YES_DELETE_MY_DATA', 'RESET_WITHOUT_THE_LEDGER', 'SEED_CORPUS', 'URL', 'SHOTS', 'PICTURES',
  'REHEARSAL_KEEP_CLEAR_PORTS', 'MAIN_SUITE_COUNTER', 'MAIN_SUITE_LANDINGS', 'MAIN_SUITE_HOURS', 'CLOUD_RUNNER_FILE', 'CLOUD_TRANSPORT', 'OPENROUTER_MONTHLY_CAP_USD', 'API_ROOT',
  'AGENT', 'TEST_SUPERVISOR_CLOCKS', 'TEST_HOOK_CLOCK_SCALE', 'TEST_FOLDER_LIMIT_MS', 'TEST_GPU_COMMAND_LIMIT_MS', 'TEST_FILES_SHARE_A_PROCESS',
  'STABLE_RELEASE_FLOOR_GB', 'SANDBOX_DISK_WATCHERS', 'TIMING_REPORT_READER',
].map((name) => `MOLE_OFFICE_${name}`)

/** The office does not use these. Vite reads them when it starts (vite.config.ts), and the office's Restart does not restart Vite. */
export const WEB_DEVELOPMENT_SERVER_SETTING_NAMES = ['NO_WATCH', 'VITE_CACHE'].map((name) => `MOLE_OFFICE_${name}`)

/*
 * THE FIVE LISTS BELOW ARE THE 14 READ-ONLY SETTINGS ROUND 16 DID NOT PLACE, placed in wave 13r round 18. None of them
 * is on the restart line. Under the installed service, the Restart press starts the new server with the old server's
 * environment over `.env`, so a name `.env` held at the last start keeps its old value (problem OaNJukRMwRjG).
 */

/**
 * The office reads these when it starts, and keeps the value it read: the server binds the address for other machines
 * then, and the message worker is given the server's environment. Other programs read them at their own times: serve-dev
 * and Vite when they start, the mail tool when its service starts, a tool when it runs, and a run from what the office
 * gives it.
 * The provider router's two: the office checks the switch when it starts and reads both from the environment it started
 * with; tools/sandbox.mjs reads the switch when it starts a run. Nothing outside the office reads the cap, so the line's
 * last sentence says more than is true for it.
 */
export const OFFICE_START_SETTING_NAMES = ['API', 'WEB', 'WORKSPACE', 'ADDRESS_FOR_OTHER_MACHINES', 'PROVIDER_ROUTER', 'PROVIDER_ROUTER_RUN_CAP']
  .map((name) => `MOLE_OFFICE_${name}`)

/**
 * The office reads these on each start, in its migrate (src/server/db/owner-setting.ts), and uses them only when it
 * records its first owner. Once it has an owner, a different id or a name it cannot accept stops the start, and nothing
 * here renames the owner.
 */
export const FIRST_OWNER_SETTING_NAMES = ['OWNER_ID', 'OWNER_NAME'].map((name) => `MOLE_OFFICE_${name}`)

/**
 * The program that starts the office may set these, to tell the office about that start: serve-dev sets RESTART_REASON
 * and LISTEN_FD, and the service command sets STARTED_BY. Where that program does not set one, the office reads the
 * value in `.env` as if it had.
 */
export const STARTER_SETTING_NAMES = ['RESTART_REASON', 'LISTEN_FD', 'STARTED_BY'].map((name) => `MOLE_OFFICE_${name}`)

/**
 * The program that starts a run may set these for that run: the message worker sets HOME_WORLD and VISIT for a run that
 * works away from home, and tools/dsh-hooks/run-agent.sh sets BRIEF_PATH. BRIEF_PATH's two readers read the run's own
 * environment, which does not take it from `.env`. Nothing but the settings door reads HOME_WORLD or VISIT.
 */
export const RUN_STARTER_SETTING_NAMES = ['BRIEF_PATH', 'HOME_WORLD', 'VISIT'].map((name) => `MOLE_OFFICE_${name}`)

/**
 * The merge tool reads this each time it asks whether it can take a second opinion on Modal, and the VM test runner
 * reads it when it runs (tools/modal-tests.mjs). The message worker starts the merge tool with no MOLE_OFFICE_ name, so
 * that merge tool reads `.env` itself, and the value the office started with does not reach it.
 */
export const MERGE_TOOL_SETTING_NAMES = ['MODAL_PYTHON'].map((name) => `MOLE_OFFICE_${name}`)

// Owner-decided values stay protected even when this installation has no decision reference.
// From four decisions and neHefMNZkJDU.
// The release spacing: the 180 minutes between two stable upgrades stay, as
// a setting.
// The emergency switch: a fix may go into the stable version before its tests,
// and only their throw lets one in.
// The Claude supervisors at once: decided on 30 October 2026 to stay for Claude supervisors, for the Claude login's
// five-hour window.
export const DECIDED_SETTING_NAMES = [
  'DEAD_LETTER_AFTER_DAYS', 'DEAD_LETTER_AFTER_COUNT', 'BROADCAST_TIMES',
  'MESSAGE_EDIT_WINDOW_SECONDS', 'MODAL_MONTHLY_CAP_USD', 'BUS_MOST_ENTRIES', 'BUS_LEAVES_AFTER_SECONDS',
  'RELEASE_SPACING_MINUTES',
  'STABLE_EMERGENCY',
  'CLAUDE_SUPERVISORS_AT_ONCE',
].map((name) => `MOLE_OFFICE_${name}`)
