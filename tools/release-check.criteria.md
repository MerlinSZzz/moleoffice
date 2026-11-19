# Release-check start criteria

This is new support for `MOLE_OFFICE_START_MODE=release-check`, authorized in message h2Cslr6hr8XE. It is an environment start mode, not an existing maintenance mode.

1. The server selects the mode through the configuration declaration before importing the ordinary app or database client. Unset selects ordinary startup. An unknown or blank mode refuses before opening a database or binding a port.
2. Release-check requires an explicitly named, existing database outside a git worktree, opened read-only. It checks the SQLite header before opening and refuses WAL-mode files or WAL/rollback-journal companions. It uses the supported read-only SQLite connection on a checkpointed rollback-journal file; preparation of DELETE journal mode belongs to the controller while all writers are stopped. It checks SQLite integrity, the installed migration journal against the candidate's migration folder, and the declared schema without running migrations, issuing keys, pruning, registering resources, taking a service lock or creating files.
3. Only GET /api/health and GET /api/runtime answer diagnostics. Every other method or path, including ordinary GET routes with side effects, refuses in a complete sentence. No authentication last-use write or API usage write runs.
4. Both diagnostics identify the actual serving commit, repository, database, bound port and release-check mode. A commit that cannot be verified refuses. Checkout identity comes from the running checkout's Git files; bundle identity comes from its build stamp. Configured or invented commit values are not evidence.
5. No ordinary route import, message worker, background writer or recurring timer starts. Stopping the release-check listener closes its own database and listener without ordinary shutdown writes.
6. The same start accepts a private external database copy on a scratch port before downtime and the migrated actual database on the ordinary port after the old office is stopped. The upgrade controller owns the two-stage sequence and recorded process groups. This work makes no live switch.
7. Tests exercise the actual app and start entry with real external throwaway SQLite files. They compare database bytes, every table's rows, credential rows and neighboring files before and after requests/start/stop; guard readonly opening, route refusal, absent writers/timers, schema/migration refusal, actual identity and invalid mode inputs. Each new test has a green control, a deliberate implementation mutation that makes it red, and a green restore recorded through run-named-tests.

These checks do not claim that ordinary startup's prepareToServe data-step preview ran. That function can write on startup and reaches the ordinary writable client; release-check must not call it.

## Round 3 queue refusal: the test entry belongs to its test

Old point 7 required tests of the actual entry but did not spell out ownership of the entry process. The existing dev-stack gate already required every test server to stop when its owner dies.

New criterion: the actual release-check entry fixture uses the shared `apiServerArguments` and `commandThatStopsWithItsOwner` helpers. Its detached group is recorded at start and stopped in cleanup. The watchdog also stops it if the test process dies before cleanup. Read-only, identity, schema and timer expectations stay unchanged; the dev-stack gate keeps its original expectation.

Why: the queue found the bare Node entry launch in the release-check fixture. Remembering a group for afterEach does not protect it after the owner is killed. This clarification precedes the fixture implementation commit and makes no claim to meet it.
