# Stable upgrade transaction

## Opt-in closed verification (item 30c, part 1)

OLD: after migration and the stable release check, the transaction stops the
check service and starts ordinary service. Recovery starts the previous ordinary
service after restoring the private snapshot. Neither path waits for an external
read-only verifier.

NEW: an optional `closedVerification` object selects closed verification. Its
only fields are `command`, `timeoutMs`, and `checks`, all required. `command` is
a nonempty array of literal strings starting with an existing canonical absolute
executable; `timeoutMs` is an integer from 1 to 1,800,000; `checks` is a nonempty
array of unique nonblank names. An absent object preserves ordinary upgrades.
Null, incomplete objects, unknown fields and an invalid command refuse before
mutation. No inferred verifier or fallback exists. The public --config command
uses this same validation and transaction. The way back does not select this mode.

After target migration and release-check health pass, retain the read-only check
service, exclusive lock, full private snapshot and existing journal while the
configured verifier runs. Ordinary routes/writes remain unavailable; migration
exit or release-check health cannot authorize ordinary publication. The terminal
holder remains alive, with the same pid and birth identity, and is never signaled.

The command receives two final arguments: private request and result paths. A
version-1 request names `phase` (target or recovery), `commit`, `repository`,
`database`, `snapshot`, `servicePort`, `checks` and `stateSha256`. The result is
exactly `{version:1, phase, commit, stateSha256, checks:{name:true,...}}`, matching
the request and every configured check, with no other fields. Only a successful
bounded exit, complete strict result and unchanged frozen state authorize the
next step. Missing/malformed/incomplete output, rejection, nonzero exit, leftover
processes, timeout or mutation refuse. Verification never repairs. Compare the
database and companions, private snapshot, recorded settings, stable source and
artifacts, saved baseline artifacts, and holder identity around verification.
This supplies a verification boundary, not the eventual identity verifier or a
security sandbox for hostile same-user programs.

Durably journal `attempted` before migration, `committed-awaiting-verification`
after successful migration, `verified` only after read-only verification, and
`recovered` only after closed recovery verification. Journal verifier attempts
before starting the recorded gated group. No ordinary start occurs on an
unverified target or restored baseline. Failure takes the existing private
snapshot recovery path. Before reopening recovery, verify exact restored database
and baseline artifacts, release-check identity, and a complete recovery-phase
verifier result. Before ordinary publication, recovery failure says NOT RESTORED and retains
the existing lock and journal with ordinary admission closed. A crashed/interrupted transaction
leaves that lock/journal; another invocation refuses it. It never interprets a
migration/check success as permission to reopen. No second maintenance or resume
controller is introduced.

Focused synthetic behavior proof covers invalid/no verifier; strict output and
failed command; timeout; publication only after verification; refused ordinary
writes during both verification phases; exact original records/private rows on
rollback; failed restoration remaining closed; interruption and lock refusal;
mutation detection; same-holder continuity; and ordinary-mode compatibility.
All proof uses made-up repositories, SQLite, settings, services and verifier
stand-ins, never real data or the running office.

Publication-boundary clarification:

OLD: a successful closed verifier could leave only its phase cached when the
release-check service stops and the ordinary start is attempted.

NEW: compare the verified frozen generation again after the last before-start
and gated-process hooks, immediately before opening the ordinary startup gate.
Apply this to target and recovery. A changed target takes snapshot recovery;
a changed recovery generation stays closed as NOT RESTORED. Account only for
read-only release-check shutdown removing its empty WAL/shared-memory companions.
Keep the original private snapshot digest pinned through final-close recovery.

WHY: a successful result cannot authorize state changed in the gap before
publication. Fault injection at ordinary-start/before and recover-start/before
must demonstrate this behavior. This clarification claims no implementation.

Late-finalization qualification:

OLD: the closed-mode wording said every recovery failure leaves ordinary
admission closed, including errors after a verified target was published.

NEW: verification and recovery-verification failures before publication keep
ordinary admission closed. After verified publication, the existing bounded
final-close recovery may encounter a foreign lock. It must preserve that lock
and service, report NOT RESTORED with verifiedState and remaining groups, and
truthfully disclose that the already verified target remains available. Closure
and restoration are separate outcomes. This exception never permits an
unverified generation to open.

WHY: another transaction may legitimately acquire the released lock. Existing
foreign-lock non-interference prevents this transaction from signaling that
transaction's service or overwriting its data. A focused closed-mode test checks
verified publication, failed final-close recovery, retained foreign lock and
continued availability. No implementation or broadened write authority is claimed.

WHY: item 30c requires the stable upgrade to own closure and exact recovery.
Successful migration alone cannot publish a generation whose verification has
not passed. This criterion adds that opt-in boundary without implementing aliases,
identity transformation, external-store rollback, writer orchestration or the
later complete identity verifier. It is an expectation, not an implementation claim.


Shared storage rule correction:

OLD: validateUpgradeConfig held the independent Git storage refusal, the shared
object alternates refusal and the stable Git object independence check inline.

NEW: requireStorageTheUpgradeAccepts(developmentRepository, stableCheckout, git)
in independent-storage.mjs owns those checks in the same order, with the same
refusal words. It returns the stable common Git directory for the existing
recovery and journal checks. validateUpgradeConfig calls it at the same point,
using its existing Git reader. Bootstrap can call the same rule with its own
reader, without importing the upgrade transaction. Tests refuse linked locked
worktrees and alternate stores and accept an independent --no-local clone.

WHY: bootstrap activation must consult the ordinary upgrade's actual storage
rule. Two copies could disagree and admit a stable office that cannot upgrade.

Old: no stable upgrade transaction or criteria existed.

New: the command `node tools/stable/upgrade-stable.mjs --config <file> [--dry]`
validates an explicit configuration, prepares an isolated candidate, and either
publishes that candidate or verifies the previous office after recovery.

Why: moving code alone cannot restore a working office after dependencies,
built pages, or the database have changed.

Audit correction — old: the first release check used an unmigrated private copy;
the last journal descriptor closed outside result handling; independent storage
checks did not inspect object hardlinks or artifact file link counts.

New: after all target builds, run and await the target migration against only the
private candidate database and scratch port, then checkpoint it before its check.
Keep the actual database untouched until downtime and verified backups. Reject
symbolic or hardlinked stable objects and multiply named artifact files before
mutation, using a shared read-only storage helper. Guard the final descriptor
close explicitly: a close failure returns NOT RESTORED, the previously verified
service state, actual remaining groups and recovery paths. After lock release it
does not change any service or another owner's lock. Record its intent durably
before closing and retain the named journal even if close partly succeeds.

Why: a schema-changing candidate needs its new schema to pass its first check;
shared inodes violate preparation independence; and a final close error must not
replace the transaction outcome with an exception that hides a running service.
Tests use a real new-schema diagnostic, migration boundaries, shared file/object
fixtures, and descriptor close failures before, after and after a real partial
effect. These extend the existing grouped control/red/restore proof.

Final-close recovery correction — old: any final descriptor error immediately
returned NOT RESTORED, even if exclusive recovery remained available.

New: after a final close error, reopen only the named journal without following a
symbolic link and verify the original device/inode. Reacquire only that journal's
exclusive lock and attempt the existing full recovery once. A foreign lock,
unverifiable journal, failed recovery, or another final close error returns the
bounded NOT RESTORED result with verified state and remaining groups/paths. Never
retry an ambiguous old descriptor number or interfere with another lock owner.

Why: truthful failure output does not replace recoverable rollback. A close error
can leave a closed descriptor and a valid durable journal, so safe exclusive
recovery must be attempted. Test one-shot errors before, after and after a real
partial close with both available exclusivity and a foreign lock, plus a repeated
close error to prove the recovery attempt stays bounded.

Baseline-close clarification — old: the bounded recovery rule also reapplied to
an already restored or unchanged baseline.

New: recover a published target once. For an already restored or unchanged
baseline, verify baseline service identity/health and retain that outcome with
the final-close error instead of restoring its database again. If that verification
fails, return NOT RESTORED with paths and remaining groups. Exercise missing,
replaced and symbolic journal paths as refusals before service mutation.

Why: repeating a database restore after verified baseline recovery needlessly
discards later baseline writes; the final close must not cause that loss.

Artifact destination correction — old: link identity and lexical containment did
not check a second link hop or a shared inode reached outside the scanned trees.

New: live artifact validation resolves every reached path, requires containment
inside both the checkout and its complete retained artifact roots, and refuses
multiply named regular targets. A directory target is visited once. Dormant
snapshot hashing keeps portable link identity without resolving absent targets.
Links into unretained workspace files are an explicit preflight incompatibility.

Why: a link may look internal while reaching development storage, or an ignored
file may be shared or lost during checkout without being in the artifact backup.
Tests cover an external second hop, an internal hardlinked target, an unretained
ordinary target, and a valid link wholly inside retained artifact storage.

1. Validation precedes mutation and the asynchronous evidence import. Explicit
   canonical paths name separate development and stable repositories, an external
   database, and an existing private recovery directory on the stable Git
   directory's filesystem, allowing the durable journal and lock to share an inode.
   The full target commit,
   original evidence reference, baseline tag, dated unused candidate tag, recorded
   service groups, notice, both ports, and bounded health checks are mandatory.
   Reject dirty or wrong repositories, shared Git storage or artifacts, absent
   baseline/dependencies/web/plugin pages, path aliases, and database/port/process
   identity disagreement. Resolved artifact targets must stay within the retained
   artifact roots; resolving a link cannot hide an external or shared inode. The
   previous baseline must be an ancestor of the target
   in development's main history; an older or divergent target is refused. Git
   replacements and filesystem-monitor hooks cannot change that reading. Stable
   stays on branch stable. A target equal to the baseline is refused as already
   installed. Main is never changed.
2. Dry validation does not fetch, lock, write files, tag, start or stop services,
   or file records. Only read-only office requests are allowed. Its output states:
   “These reads update the caller key's last-use time and the API usage counters.”
   Dry output also gives the ordered plan in words, naming both commits, paths,
   preparation, two checks, stop and backup, branch and tag, migration, publication,
   and recovery with the snapshot/write-loss boundary. The actual command says
   each attempted, completed or failed step as it happens; the journal keeps those
   words beside the step identifiers.
   A command's completed/after boundary follows its verified successful exit and
   the end of its group. Opening a startup gate is not command completion. Service
   starts have a separate health step after their gate opens.
   Addresses and observed database/port settings use the existing settings
   declaration. The scratch port differs from the explicitly recorded ordinary
   port; the general tool carries no installation-specific live-port constant.
3. Before downtime, clone the exact target detached with independent Git storage,
   install locked dependencies with npm ci, build the web page and every plugin,
   and retain verified exact copies of the previous dependencies and built pages.
   Preparation has private home/cache/settings and an explicit private SQLite copy.
   Migrate this copy with the built target before its release check, await the
   bounded command and then checkpoint it. It is never the actual rollback image.
   No preparation shares development artifacts or credentials.
   Ordinary publication and recovery retain the explicitly recorded service home
   and non-secret service overrides, verified against the actual serving process.
   The shared settings loader verifies values supplied by stable's unchanged local
   .env; an unrecorded external setting or secret is refused. The supported service
   is one port-owning group and its runtime-declared worker, with birth, checkout,
   database, port and parent lineage checked. Other groups cannot be reconstructed
   by npm start and are refused before downtime. Tests include effective dotenv
   settings and a service home that contains the checkout.
   They do not inherit caller credentials or the private preparation home. Their
   start mode is explicitly ordinary, including when a file names another mode.
4. Check the candidate in the explicit release-check mode on the scratch port and
   private database copy; verify its real commit, checkout, database and port.
   Health is verified only by a successful, complete transport envelope with
   cut=false and location=null, a JSON object, and ok=true as a boolean. Missing
   metadata and truthy non-boolean health claims are refused.
   Stop that recorded group and verify its members ended and port is free before
   stopping the old groups. After backup and migration, stable runs release-check
   on the actual database and ordinary port. Verify it, stop it, then publish the
   ordinary service and verify its identity and health. The candidate build stamp
   names the exact target. Tag after moving stable and before migration. Before
   each release check the controller explicitly prepares checkpointed DELETE-mode
   SQLite, with a journaled mutation. Back up the real database before preparing
   it. Release-check never checkpoints.
5. Acquire an exclusive lock. Persist and fsync attempted steps and recovery paths
   before each mutation; the exclusive lock's first contents are its own intent.
   A spawned process waits behind a gate until its group identity is durable.
   Signal only recorded, identity-checked process groups and confirm they ended.
   A crash leaves the journal and lock for inspection; a later invocation refuses
   that lock rather than guessing that recovery finished.
   A same-user process whose descriptors cannot be inspected is a refusal unless
   its disappearance or exited Z/X state is independently established. A live
   nondumpable process never counts as proof that no writer exists.
   Final journal publication, closing the original lock descriptor, and releasing
   the lock are journaled steps with failure boundaries. A named writable journal
   survives them. Recovery after lock release must reacquire that same exclusive
   identity; if another transaction owns the lock, report NOT RESTORED with the
   recorded groups and paths, without interfering with the new owner.
   The final named journal descriptor close is guarded separately. If it fails,
   reopen and verify the named journal and try exclusive full recovery once. If
   that cannot succeed, preserve verified state and remaining groups/paths in
   NOT RESTORED; a foreign lock always prevents service mutation.
6. After stopping old groups, take the existing verified sanitized backup through
   takeTheBackup, plus a full private SQLite backup for recovery. Private directories
   are 0700 and full images are 0600, never exported. Backup, migration and starts
   use the same explicit database and ordinary port. Preserve the snapshot point.
   (Changed: no sanitized backup is taken, and case 1 takes no private backup.
   See "A slimmer stable release" at the end of this file.)
7. Any caught failure restores everything already changed: baseline code through
   legal checkout of branch stable, exact database including private tables, dependencies,
   web and plugin pages. Stop candidate groups first, restart the previous ordinary
   service and verify it. Partial or uncertain recovery says NOT RESTORED with all
   recovery paths. Accepted writes after the snapshot are lost on database restore;
   the result says this even when publication started and then failed.
8. A real upgrade files its BEFORE announcement through canonical officeRequest
   and the dedicated upgrade notice door on the configured ordinary service,
   before downtime. Configuration pins one secretary-authored note revision by
   record id, sequence and content hash. Its body must hash equal to the notice
   text; no local approval or evidence fallback is accepted. Persist the immutable
   request and sendId before POST, and verify the original message id, revision
   and hash before proceeding. The full private database image includes BEFORE,
   so recovery retains the announcement. A missing old-server notice interface
   refuses before downtime. A local configuration or evidence refusal is not an
   announced attempt and must not invent a completed history entry.
   AFTER describes only the actual result after final descriptor-close handling
   has stabilized. Delivery failure never invokes transaction recovery or drops
   accepted writes. On successful publication it says exactly "upgrade verified;
   notice not filed" and retains the verified service, actual transaction result
   and every recovery path. Persist AFTER's immutable payload and sendId in a
   separate private journal before POST. A separate bounded retry sends those
   same bytes and id; uncertainty stays explicit, including when NOT RESTORED
   leaves the API unavailable. This retries delivery, not the transaction or a
   crashed upgrade. No new kind, migration, cloud evidence semantics, scheduler,
   producer activation, live switch or queue state is introduced here.
9. Focused tests use throwaway real Git repositories, SQLite databases, distinct
   artifact bytes and real process groups/HTTP. Prove refusals and no-change dry
   runs, successful ordering, failures at attempted mutation boundaries and partial
   effects, exact rollback, failed rollback, lock exclusion, and gated processes.
   Each added case gets a named control, red mutation and restored run.

Dry ordinary-check clarification, message lweBIbN35Mdf:

Old: dry validation read the ordinary server's runtime and health before returning
its plan, and tests required malformed ordinary health replies to refuse dry.

New: dry validates configuration, local identities, recovery inputs, the original
receipt, and known group/port/process checks. It returns before ordinary runtime
or health reads and says those checks were not performed. The real upgrade checks
ordinary runtime and health before changing anything. Malformed ordinary health
replies refuse real execution, while dry must never request those routes.

Why: the existing ordinary runtime getter can run ambient Git status and refresh
its index or execute service-home filters. Those writes are outside the agreed
key-last-use/API-counter exception. A truly read-only ordinary diagnostic is later
work to measure first; this criterion does not claim it already exists.

The same boundary applies to detached-worker declarations. Old: dry rejected an
omitted worker group by reading the ordinary runtime. New: real execution rejects
that omission before changing anything; dry checks the supplied local group
identities without claiming to have checked the runtime's worker declaration.
Why: checking that declaration requires the ordinary runtime read excluded above.

Notice integration correction:

Old: "The notice is a journal entry only. No conversation, history, operation,
record kind, migration, evidence-packet route or queue is invented."

New: criterion 8 files BEFORE and final AFTER as original system-message events
through the backend's dedicated notice door, with strict secretary note approval,
durable request identity, verified original responses, and separate AFTER retry.
Dry still performs no notice write, file, lock or POST and omits ordinary runtime
and health reads. The original receipt checks and read-bookkeeping exception stay.
The two release checks, Git/artifact/main/database identities, private full image,
caught mutation rollback and final-close recovery rules remain unchanged.

Why: the approved upgrade notice must reach the office conversation and original
history. Chat delivery cannot justify rolling back a verified service or losing
its accepted writes. The existing transaction must finish before AFTER is chosen.

Ambiguous delivery retry correction:

Old: a completed AFTER retry checked the current service before resending its
unchanged request. An accepted message whose response was lost could remain
pending after a newer upgrade changed the serving commit.

New: first look up that sendId through the existing bounded history door, with
limit 1. If found, verify its original content hash and exact retained request.
Only an absent original proceeds through fresh ordinary health and identity checks
before POST. The original initiating agent/run remains in the private journal;
the backend decides whether the current authenticated caller may reconcile it.
The helper never retrieves or reuses an earlier run's key.

Why: reconciling an existing message does not assert that its old target is still
serving. A new completed message still requires current verification. Each retry
is one bounded delivery step and never reruns or resumes the transaction.

Preflight refusal journal clarification:

Old: invalid configuration or original evidence was refused in the command's
output before any announcement, without a dedicated private refusal journal.

New: real execution retains its local preflight attempt and refusal in a 0600
journal inside the explicitly configured, validated private recovery directory.
If configuration cannot be read, or that directory is absent, unsafe or
unwritable, output says "refusal journal unavailable" and gives the reason. It
guesses no path and adds no required option. Dry creates no journal. Neither
case invents a BEFORE message or a history entry.

Why: the local refusal needs an audit trail when a trusted destination exists;
claiming a journal was retained without one would be false.

Actual candidate build correction:

Old: preparation ran `npm run build` and then required a build stamp naming the
target commit. That script runs TypeScript and Vite but writes no commit stamp,
so preparation of this actual repository could never satisfy the check.

New: preparation runs and awaits `npm run typecheck`, then imports and awaits the
exact candidate's existing `buildThePage` from `tools/build-the-page.mjs` in a
separate bounded, journaled command. A false build result fails that command with
its retained output. This existing builder publishes the page and its observed
commit stamp together. The transaction still verifies the stamp against the full
target commit and retains every Git, dependency and artifact identity check.
Both commands finish before BEFORE and before downtime. The failure matrix covers
the new typecheck boundary. Prove the real checkout with its real type checker,
Vite build and stamp reader; synthetic HTTP fixtures are not that artifact proof.

Why: the actual package build exposed a missing stamp, while the synthetic fixture
had written one itself. Calling the existing authoritative builder fixes the
observed compatibility defect without inventing a stamp or weakening its check.
Type checking remains mandatory. No receipt, health, migration, publication or
recovery rule changes.

Retained dependency hard-link accounting correction:

Old: every regular artifact file needed exactly one filesystem link. A real,
independent locked esbuild 0.28.1 install creates two names for its binary inside
node_modules, so the tool incorrectly refused this independent installation.

New: account each distinct ordinary file name across the complete retained roots
(node_modules, dist, and declared plugin dist folders), grouped by device/inode.
Every group's accounted names must equal its filesystem link count. Symbolic
aliases never count as extra names. Links outside those roots or outside the
checkout remain refused. Git object files and service settings still require
one name. Artifact byte/mode/link-target identities remain unchanged by a copy
that gives formerly linked files their own inodes. Check complete source roots
before copying; dormant snapshots preserve symbolic links without dereferencing
them, and private copies normalize hard links. Prove internal, cross-root and
external groups, symbolic aliases, and unchanged strict Git object refusal.

Why: a fresh independent npm ci reproduced esbuild's deliberate binary hard link.
Complete name accounting preserves independence without rejecting that install.
This is no exception for external artifacts, no new evidence semantics, and no
relaxation for Git objects or private journal/settings files.

The way back to the previous stable version:

Old: the transaction put back a failure inside one upgrade, and nothing else.
Once an upgrade had completed there was no way back. A person who found the new
version wrong could only wait for a newer one.

New: `node tools/stable/upgrade-stable.mjs --back --config <file> [--dry]` returns the
stable office from the version it serves to the version before the newest
completed upgrade. It is a mode of the upgrade transaction, not a second tool,
so it keeps the same lock, journal, recorded-group stops, database holder and
exclusive lock checks, clean checkout checks, release check, ordinary start,
recovery and notice path; a second copy of those could drift from the first.

- The configuration names the development and stable checkouts, the previous
  version's receipt, the recorded service groups, the notice, its approval and
  send ids, the release-check port, the health bounds and the recovery root.
  It may not name the database, port, home, settings or versions. Any other
  field refuses before an office call, naming the field.
- The database and port come from the recorded groups, which must agree. The
  home and the service settings (STABLE_SERVICE_SETTINGS, such as the message
  worker's merges-only) come from the environment of the process that serves
  the port. The usual serving checks then compare them with every process.
- The versions come from the office's upgrade history: the newest completed
  upgrade whose verified serving names this stable checkout, database and port,
  read and verified from its original BEFORE and AFTER messages by the release
  policy's own reader. Stable must serve that upgrade's commit. The upgrade must
  have moved forward (its old commit is an ancestor of its new one); a newest
  completed change that went back refuses, so the command goes back one version.
  No completed upgrade refuses: there is no previous version.
- Validation holds the previous tag to the previous commit in stable, requires
  the previous commit to be an ancestor of the serving one, and skips the
  current-day rule and the new-tag rule. Its recovery paths are named
  `<serving tag>.back-<local stamp>`, so a later upgrade to the same tag is free.
- The database is never migrated and never restored. The previous version runs
  on the database as the newer version left it, so it may do so only when every
  change since then only adds. The rule reads both versions from Git:
  - every migration of the previous version is still in the newer one, with the
    same bytes;
  - each migration added since is split on the statement breakpoint, and each
    statement must be one of: CREATE TABLE; CREATE INDEX; CREATE UNIQUE INDEX on
    a table those migrations made; ALTER TABLE ADD COLUMN without NOT NULL,
    PRIMARY KEY or UNIQUE; a SELECT; an INSERT into a table those migrations
    made. A read changes nothing, and rows put into a new table are part of
    adding it. A column that may not be empty is refused even with a default,
    because only a column that may be empty is an addition here;
  - the newer version's in-place steps (THE_STEPS in src/server/db/migrate.ts)
    add no name; a new step changes rows where they are.
  Anything else refuses before the lock, names the migration or the step, and
  says nothing was changed.
- No release authorization is read. The authority is the secretary-approved
  notice that the notice door requires, with the previous version's receipt.
  A previous version with no receipt (the first handoff) cannot pass the door.
- Kept: the private copy of the database, the clone, install, type check, page
  and plugin builds of the previous version, its release check on that
  unmigrated copy, the BEFORE notice, the stops, the sanitized backup, moving
  branch stable to the previous commit, installing its artifacts, the stable
  release check and the ordinary start. Left out: the candidate migration, the
  private restore image, the fetch, the new tag and the migration. (Changed:
  the way back follows the two cases and takes no sanitized backup. See "A
  slimmer stable release" at the end of this file.)
- A failure puts back the newer code and artifacts and restarts them. The
  database is never restored, because nothing changed it.
- The AFTER notice goes through the same path. Its words are the upgrade's own:
  "Upgrade completed and verified." The history then shows the way back as a
  completed change from the newer tag to the previous one, and a later upgrade
  takes the previous version as its baseline from that moment.
- Dry mode returns state "dry", the migrations checked and the way back's plan,
  and writes nothing: no lock, no journal, no recovery folder, no notice.
- What it cannot see: a step whose behaviour changed under the same name. The
  previous version's own start refuses a database it cannot use.

Tests, in tests/the-stable-office-goes-back-to-its-previous-version.test.ts:
a made-up completed upgrade in a test world goes back (code, artifacts, kept
rows and notices, no migration, same settings, home and port, BEFORE from the
newer version and AFTER from the previous one); a dropping migration refuses,
names the migration and changes nothing; dry mode plans and writes nothing; the
statement and step rules; the command line routes --back to the way back.

Why: the owner agreed to one command that returns the office to
the previous stable version when something is wrong after an upgrade, instead
of a separate watch. Rolling the database back would lose what was written
since the upgrade, so this command refuses whenever the previous version could
not run on the newer database, and says which migration stops it.

The way back's reviewed migrations correction:

Old: every statement in a migration added since the previous version had to
add and nothing more. A column that may not be empty was refused even with a
default. A trigger, a DELETE, and a unique index on a table the previous version
already had were refused, and nothing could let them through.

New:
- ALTER TABLE ADD COLUMN with NOT NULL counts as adding when its text gives a
  DEFAULT and SQLite accepts it in a test table: an in-memory table with one
  older column and one row, foreign keys on, the statement run as written, then
  a row that names only the older column, as the previous version's rows do.
  That row gets the default. So a default that fails a CHECK on the column, a
  default that is not a constant, DEFAULT NULL, no default, and a default on a
  REFERENCES column are refused. A CHECK that names another column cannot be
  read in that table, and is refused too. A generated column gives no default
  and is refused. A column with PRIMARY KEY or UNIQUE is still refused.
- A trigger, a DELETE, and a CREATE UNIQUE INDEX on a table these migrations did
  not make are still refused by default. Such a migration passes only when the
  way back's configuration names it in `reviewedMigrations`. That is a list of
  entries, each with four fields: `migration` (the file name, such as
  0001_a_name.sql), `safeBecause` (why it is safe for the previous version),
  `reviewedBy` (who reviewed it) and `reviewedAt` (when, as YYYY-MM-DD HH:MM).
  An entry with no reason, no reviewer or no such time counts as missing. The
  refusal names the migration, and says either that the list does not name it
  or what its entry lacks.
- Every other change still refuses, even when the list names its migration:
  DROP, RENAME, UPDATE, an INSERT into an older table, a PRAGMA, a key on a new
  column, a column the SQLite test refuses, and any statement the rule does not
  know. The refusal says that no reviewed list can allow it.
- A list the way back cannot read refuses before any office call: a value that
  is not a list, an entry that is not an object, a field other than those four,
  a migration that is not a bare .sql file name, or a migration named twice.
- Only the migrations added between the two versions are read, as before: not
  the ones the previous version already had, and not the ones after the version
  being left.
- The dry result adds `migrationsReviewed`: the entries that let a migration
  through, each with the changes it let through. The plan names each such
  migration with its reviewer, time and reason, and names any entry this way
  back did not need. The lock journal records the same check.

Tests, in tests/the-stable-office-goes-back-to-its-previous-version.test.ts: a
column that may not be empty passes with a constant default that meets its
check, and is refused when a row that leaves it out would be refused; a
trigger, a DELETE and a new unique index on an older table are each refused
when the list does not name the migration, and each passes when it does; any
other change refuses even when listed; an entry without a reason, a reviewer or
a time counts as missing; only the migrations between the two versions are
read; a dry way back in a made-up world lets a listed migration through and
plans with its review; the command line refuses a list it cannot read before
any office call.

Why: on 24 Oct 2026 the secretary, who decides stable upgrades by the owner's
decision, widened this rule. A column that may not be empty, with a constant
default that meets its check, does not stop the previous version: its rows
leave the column out and get the default. A trigger, a DELETE or a new unique
index can stop the previous version's writes. A new unique index can refuse the
previous version's insert, for example. So each needs a person who has read it,
named in the configuration with the reason, before the way back runs past it.

The way back's probe correction:

Old: SQLite tried a column that may not be empty in a test table that the way
back made itself, in memory, with one older column and one row.

New:
- The way back makes no table of its own. The database is built in memory by
  the newer version's own migrations, read from Git: every statement before
  the one being read, in the journal's order. A statement among them that
  SQLite cannot run stops the way back and names that statement.
- The table that holds the column gets one row first, as an older row would be
  there: a value in each column that may not be empty and has no default, with
  foreign keys and checks off for that one write. Then SQLite runs the
  statement as written, with foreign keys on. So SQLite itself still refuses a
  default that is not a constant, DEFAULT NULL, and a default on a REFERENCES
  column.
- Then SQLite reads each CHECK in the statement against that row, seeing only
  the new column. The row holds the default as the column stores it, with the
  column's type and collation. A default that fails its check is refused. A
  check that names another column cannot be read, and is refused.
- The rest of the rule is unchanged: a column with no default in its text, a
  generated column, and a column with PRIMARY KEY or UNIQUE are refused.

Tests: the same tests in
tests/the-stable-office-goes-back-to-its-previous-version.test.ts, which now
give the probe the test's first migration as the statements before it. The
refused list adds two columns whose checks fail only as the column stores the
default: an integer whose check compares it with text, and a NOCASE text whose
check differs only by case. A new migration that makes a table and then adds
such a column to it passes. A statement before the column that SQLite cannot
run stops the way back, read alone and read from Git, and the message names
that statement. tests/schema-inventory.test.ts finds no statement in tools/
that makes a table.

The way back's test supervisor:

Old: the way back's test started its made-up office's supervisor with a bare
spawn.

New: it starts it under the gate in tests/the-owner-watching-gate.ts, which
the notice test uses too. The gate leads its group with serve-dev as its one
child, which is the shape the upgrade accepts, and it ends its group once the
test worker is gone, even after a SIGKILL. commandThatStopsWithItsOwner is not
used, because the upgrade's topology check refuses its shell watchdog. That
check is unchanged.

Tests: tests/the-owner-watching-gate-ends-its-group-when-its-owner-dies.test.ts
kills a stand-in owner with SIGKILL and sees the gate's group and the server's
group gone within five seconds. The case moved there from the notice test, so
one proof covers every test that uses the gate.
tests/a-test-dev-stack-has-one-environment-and-dies-with-its-owner.test.ts no
longer names the way back's test. It does not see a launch under the gate at
all.

Why: on 24 Oct 2026 the merge queue returned the way back's entry. Its test
table was a statement in tools/ that makes a table, and a table is made only
by a migration in drizzle/. Its test started the made-up office's supervisor
without the watch that stops it with its owner.

The recovery test's supervisors:

Old: tests/the-stable-upgrade-recovers-every-step.test.ts started its made-up
office's supervisor in one of two shapes, and neither stopped with the test
worker. In the gated shape, its own node -e gate did not watch its owner. In
the direct shape, serve-dev led its own group and nothing watched the owner.

New:
- The gated shape uses the gate in tests/the-owner-watching-gate.ts.
- The direct shape uses commandThatWatchesItsOwnerFromInside, from the same
  file. Node loads a watch into serve-dev itself with --import, so serve-dev
  still leads a group that holds no other process.
- The watch reads once, from /proc/self/stat, whether its process leads its
  own group. If not, it does nothing, so it never ends a group it does not
  lead.
- It counts the owner as gone only when kill(owner, 0) fails with ESRCH. EPERM
  means the owner is alive. Then it sends TERM to its own group.
- Its timer is unref()'d, so it never keeps serve-dev running by itself.
- Only tests use it. tools/serve-dev.mjs, the upgrade's own start of the new
  supervisor in tools/stable/stable-upgrade-transaction.mjs, and checkTopology are
  unchanged.
- Nothing in src/ or tools/ calls fork(). The only worker threads are in the
  server, and each is given an execArgv of its own. serve-dev starts its
  children with spawn, which does not pass its execArgv on. So no child of
  serve-dev is handed the watch.

Tests: tests/the-owner-watching-gate-ends-its-group-when-its-owner-dies.test.ts
runs its SIGKILL case for both shapes. A third case starts the watch inside a
process that does not lead its group. That group is still running after the
owner is gone. The recovery test's topology case still sees serve-dev as its
group's leader in the direct shape, and as the gate's direct child in the
gated shape. tests/a-test-dev-stack-has-one-environment-and-dies-with-its-owner.test.ts
knows the new call by name, as it knows the gate's. Its list of launches that
wait no longer holds the recovery test's two launches or the notice test's.

Why: requirement 1d. If a test worker died, the recovery test's made-up office
kept running, and the rule test listed both of its launches as waiting.

The recovery test's offices after a killed worker:

Old: some of the recovery test's processes outlived a test worker killed with
SIGKILL.
- The office of the fixture that writes .ignore-term. Its made-up serve-dev
  and server ignore TERM, and the shared gate and the watch inside serve-dev
  send only TERM.
- The made-up server did not read its --stop-with-pid word. It stopped only
  on serve-dev's TERM.
- The offices the upgrade itself starts in these tests lead groups of their
  own, and nothing ended them.
- The foreign group of the topology case and the database holder had no owner.
- The orphan in the server's group had no owner of its own either. It ended
  only when serve-dev passed TERM on to the server's group.

New:
- The made-up server watches two processes with aWatchOnTheStarter from
  src/config/session-process.mjs, the product's watch for --stop-with-pid.
  It reads each one's pid and start time, so a pid given out again is not
  taken for the process it watched.
  - One is the process its --stop-with-pid word names, as in the real server.
  - The other is the fixture's owner. The fixture writes its pid into the
    server's text: this test worker, or a stand-in for it.
- Once either is gone, the server stops its worker's group and exits, even
  while .ignore-term is there. Could not look is not gone, and then the server
  keeps running.
- serve-dev, the shared gate and the upgrade's own gate each exit when their
  child exits. So every group of the office ends, and the made-up worker stops
  once the server's pid is gone.
- This holds for every office the upgrade starts from this fixture: the two
  release checks, the new office and the restored one. A release check's
  --stop-with-pid word names the upgrade's own process, which in these tests
  is the test worker.
- aLineThatEndsWithItsOwner in tests/the-owner-watching-gate.ts is one line
  of JavaScript. It ends its process once its owner is gone, read the same
  way with aWatchOnTheStarter.
  - The foreign group and the database holder each carry it.
  - The orphan carries it with the fixture's owner. Now that the server can
    stop by itself, serve-dev may exit before it passes TERM on, so the orphan
    needs a watch of its own.
  - Every stand-in owner carries it with this worker as its owner, so none
    outlives the test run. That includes the stand-in in the gate's proof file.
- No KILL is sent after a grace. The shared gate and the watch inside serve-dev
  still send only TERM, so how they end is the same for every caller. The
  server leads a group of its own, which a KILL to serve-dev's group would not
  reach, so it has to stop by itself in any case.
- Unchanged: tools/stable/stable-upgrade-transaction.mjs, tools/serve-dev.mjs,
  checkTopology, the shared gate and the watch inside serve-dev.
- The case that expects a stubborn office (NOT RESTORED) is unchanged. Its
  owner is this worker, which runs for the whole case.
- The unreadable process of the unreadable-group case keeps no owner. It ends
  by itself after 30 seconds.

Tests, in tests/the-stable-upgrade-recovers-every-step.test.ts. Each kills an
owner with SIGKILL, then waits at most A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS,
which tests/the-owner-watching-gate.ts names with its reason, for no live
process to be left:
- in any group of an office that ignores TERM, after its stand-in owner is
  killed, in both shapes;
- in the server's group and the worker's group, after the supervisor's group is
  killed;
- in any group a published upgrade recorded, after the fixture's stand-in owner
  is killed;
- in a stand-in owner's group, after its own owner is killed;
- in the topology case's foreign group and in the holder's group, after each
  one's stand-in owner is killed;
- in the orphan case's groups, after the fixture's stand-in owner is killed
  while the office ignores TERM, so that only the orphan's own line can end the
  orphan.

Why: requirement 1e. If a test worker died, these processes kept running: the
office that ignores TERM, every office the upgrade had started, the foreign
group and the holder. A server whose supervisor died without passing TERM on
kept running too.

The offices of the way back, the second handoff and the notice test after a
killed worker:

Old:
- The made-up servers of
  tests/the-stable-office-goes-back-to-its-previous-version.test.ts and
  tests/the-stable-upgrade-notices-follow-the-transaction.test.ts did not read
  their --stop-with-pid word. Each stopped only on serve-dev's TERM, so it
  outlived a supervisor killed with SIGKILL.
- The made-up server of tests/the-stable-office-takes-a-second-handoff.test.ts
  read its --stop-with-pid word, but looked with a bare kill(pid, 0). A pid
  given out again to another process would have been taken for its
  supervisor.
- The office the way back publishes, the office the second handoff publishes
  and the office the notice test's CLI upgrade publishes each lead groups of
  their own. Nothing ended them once the test worker was gone.
- The recovery test had its own copy of the server's watch. It also held the
  stand-in owner, the check that kills an owner with SIGKILL, and that check's
  bound.

New:
- aLineThatStopsAServerWithItsStarterOrOwner in tests/the-owner-watching-gate.ts
  is one line of JavaScript for a made-up server. It calls the server's stop
  function once the process its --stop-with-pid word names is gone, or once the
  fixture's owner is gone. It reads each one with aWatchOnTheStarter, by pid and
  start time. Could not look is not gone.
- The made-up servers of all four tests carry that line: the way back's, the
  second handoff's, the notice test's and the recovery test's. Each fixture
  writes its owner's pid into the server's text: this test worker, or a
  stand-in for it. So the watch is written once.
- The stand-in owner, the check that kills an owner with SIGKILL, and
  A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS with its reason move from the
  recovery test into tests/the-owner-watching-gate.ts, unchanged. Each of the
  four tests uses them from there.
- The second handoff's chain becomes one function. The case that checks the
  handoff and the owner case run the same chain.
- The notice test's two upgrade configs come from one function, with the same
  values as before. The owner case takes a third config from it.
- Unchanged: tools/stable/stable-upgrade-transaction.mjs, tools/serve-dev.mjs,
  checkTopology, the shared gate, the watch inside serve-dev, and
  tests/the-owner-watching-gate-ends-its-group-when-its-owner-dies.test.ts.

Tests. Each kills an owner with SIGKILL, then waits at most
A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS for no live process to be left:
- in tests/the-stable-office-goes-back-to-its-previous-version.test.ts:
  - in the server's group, after the supervisor's group is killed;
  - in the groups of the way back's gate and of its server, after the world's
    stand-in owner is killed;
- in tests/the-stable-office-takes-a-second-handoff.test.ts: in the groups of
  the upgrade's gate and of its server, after the fixture's stand-in owner is
  killed;
- in tests/the-stable-upgrade-notices-follow-the-transaction.test.ts:
  - in the server's group, after the supervisor's group is killed;
  - in the groups of the CLI upgrade's gate and of its server, after the
    fixture's stand-in owner is killed.
The recovery test's cases do not change. They use the shared line and the
shared check.

Why: requirement 1f. If a test worker died, these offices kept running: the
office the way back published, the office of the second handoff, and the
office of the notice test's CLI upgrade. In the way back's test and the notice
test, a server whose supervisor died without passing TERM on kept running too.
The notice test was named only for its server. Its CLI upgrade's office was
found to lead a group of its own as well.

The office's terminal holder in the topology:

Old: checkTopology refused every descendant of the recorded gate that was not
the gate, the serve-dev supervisor, the server, the worker or a process in one
of their groups. The office's terminal holder is such a descendant. The
server's press starts it as its child, detached, in a process group of its
own. So every upgrade of an office whose holder ran was refused with "The
ordinary topology has a process outside its supervisor, server and worker."

New:
- checkTopology recognises the office's terminal holder and accepts it. A
  process is the holder when all of these hold:
  - its command line is this Node, the stable checkout's THE_HOLDER_ENTRY
    (src/config/settings.mjs) as an absolute path, then `--database` and the
    configuration's database, and nothing else;
  - the kernel runs this Node for it, read from /proc/<pid>/exe;
  - it leads a process group of its own (its pid is its group id);
  - its parent is the server;
  - its working folder is the stable checkout.
  This is how startATerminalHolder (src/config/the-terminal-holder.mjs)
  starts it, with howToStart('holder') and REPO_ROOT of the stable checkout.
- Every descendant of a recognised holder is accepted too: its terminals, and
  whatever runs in them.
- A holder and its descendants are never put into the topology's records. So
  upgradeServiceGroups never names their groups, and the transaction never
  signals them. The holder keeps running across the upgrade, with the
  person's terminals. Stopping it stays the person's own act.
- The office's process ledger row for the holder is not read. The row is in
  the database, which dry validation does not open, and no office door names
  the holder. So the holder is recognised by the facts above.
- Every other descendant outside the topology is refused with the same
  sentence as before. That includes a process with the holder's entry from
  another checkout, for another database, or with another working folder.
- onlyRecordedDatabaseHolders is unchanged. The holder names the database on
  its command line, but it does not open the database file. A test checks
  that while a real holder runs and holds a terminal.
- The transition: tools/stable/upgrade-stable.mjs and its transaction run from the
  development checkout on main, against the old stable's processes. So the
  upgrade that brings this change already runs the new check, and it leaves
  the old stable's holder running.

Tests:
- in tests/the-upgrade-reads-a-worker-started-through-tsx.test.ts, a made-up
  office whose server has the press. The press calls the real
  startATerminalHolder with the stable checkout's own howToStart('holder'),
  and the real holder runs.
  - With the holder and a terminal running, both topology readers accept the
    topology and name the holder. upgradeServiceGroups names only the
    recorded groups. No process holds the database file.
  - The same office with another configured database is refused.
  - A holder started with another checkout's entry is refused, and so is one
    with another working folder.
  - With the holder running, an unknown descendant of the server in a group
    of its own is still refused.
- in tests/the-stable-office-takes-a-second-handoff.test.ts, the made-up
  server starts a made-up holder the same way, and the holder starts a
  made-up terminal in a group of its own. The real upgradeStable publishes,
  and the holder and its terminal still run, with the same start times and
  no signal received. In the owner case both end with the fixture's owner.

Why: requirement 5. The dry run of the sixth stable upgrade, on
26 October 2026 at 09:43, was refused with that sentence. The process was the
office's terminal holder, which the owner's press had started at 09:06. The
owner starts the holder the same way after each reboot, so every upgrade
would have been refused.

## The emergency path into the stable version

Old: every stable upgrade needed a green whole-suite receipt for its exact
commit and tree, read before the release. An urgent fix could skip the spacing
(mode urgent-fix), but not the receipt.

New: one owner-decided gate switch, stable-emergency, lets one fix on main into
the stable version without a receipt read before it. The configuration asks for
it with `"emergency": true`. Every other step still runs, in the same order:
the configuration check, the target on main and after the baseline, the
authorization at its four points (before the lock, under it, before BEFORE and
before the old service stops), the clone, npm ci, the type check, the page and
plugin builds, the candidate's release check on the scratch port, the old
service's health, BEFORE, both backups, the stable release check, the ordinary
start, AFTER, and recovery when a step fails after the old service stops.

What it skips, and nothing else:
- verifyUpgradeEvidence, so no receipt and none of its artifacts are read;
- the receipt check at the notice door, for BEFORE and for AFTER;
- the spacing.

The configuration:
- `emergency` is true or absent. Any other value refuses.
- With `emergency`, the configuration names no receipt: an `evidence` field
  refuses ("An emergency release names no receipt."). A fix with a receipt uses
  urgent-fix, which exists.
- With `emergency`, no file under drizzle/ may differ between the baseline and
  the target. The refusal names the files. A fix that needs a migration goes
  the ordinary way. (Changed: an emergency release follows the release's
  case. See "A slimmer stable release" at the end of this file.)
- upgrade-stable.mjs does not read a receipt for an emergency release.

The pinned note:
- Its release authorization has mode `emergency`. It carries no `evidence`.
  It carries `message: {id, seq: 1, contentHash}`, the original revision of the
  chat message to the owner.
- A configuration that asks for an emergency release with a note whose mode is
  not emergency refuses. A note whose mode is emergency with a configuration
  that does not ask for one refuses. Each is refused alone.
- The note's window is at most 15 minutes, as for the other exceptions.

The switch. It refuses, and names why, when:
- it has run out;
- it is at 0;
- it has no end time;
- the office has no recorded throw of it to 1 with this end time;
- its end time is more than 120 minutes after the throw;
- it was thrown before the newest completed release, by the order the changes
  table wrote its rows in;
- an earlier release's BEFORE already named this throw. One throw lets one
  release try once.

The chat message. It refuses when the message:
- is missing;
- was not written by an agent holding the secretary card;
- is not addressed to the owner alone;
- does not name the full 40-character target commit;
- was written before the newest completed release's AFTER, by the order the
  changes table wrote its rows in;
- was already pinned by an earlier release's BEFORE.

The rule lives once, in src/shared/stable-emergency.ts. The release tool and
the notice door both call it, each with the facts it reads.

Only an emergency that went in owes. An emergency release whose outcome is
completed, not-restored or unfinished (published, or not known) owes a
follow-up receipt and a report. One that was refused before the switch, or
failed and was cleanly restored, owes nothing more than its own BEFORE and
AFTER notices. A new emergency release refuses while an earlier one owes, and
says which one and what it owes. When the office cannot tell, the release
counts it as owed and says why.

The follow-up is worked out on read, never stored:
- The follow-up receipt is the first whole-suite receipt in the project,
  filed after the BEFORE, green or red, whose commit has the released commit as
  an ancestor and is itself on refs/heads/main of the receipt's repository.
- Git's exit 1 means "no". Any other failure means "could not be checked".
  When a receipt cannot be checked before a match is found, the answer is
  "could not be checked".
- The report is a report record, not deleted, linked about the BEFORE.

No periodic-main-suite --commit option is built. The owner said the
follow-up needs no special run: the whole suite runs about every three hours.
The follow-up is the first such receipt that contains the fix.

This round builds only the release side. A secretary's push to main is the
merge queue's round. The release checks only that the target is on main.

The use is counted. After BEFORE is filed, the release tool sends one count to
POST /api/office/gates/stable-emergency/met. A count the office did not take is
said in the result, and the release goes on.

The way back:
- --back FROM an emergency release is unchanged. It needs the receipt of the
  version before it, which exists.
- --back TO an emergency release refuses until its follow-up receipt exists and
  is green. It names the receipt state: missing, failed, or could not be
  checked.
- For that case only, the way back names the green follow-up receipt as its
  evidence. The release check reads that receipt at its own later commit. The
  way back's notice must hold one line saying so: "The emergency release <tag>
  has no receipt of its own. Its follow-up receipt <id>, on later commit
  <commit>, stands for it." The notice door takes that receipt in place of one
  for the exact commit only then. Every other door stays exact.

Tests:
- tests/an-emergency-release-needs-the-switch-and-the-message.test.ts, against
  a scratch office: each switch refusal, each message refusal, an earlier
  emergency that owes its receipt or its report, the two outcomes that owe
  nothing, the version 4 BEFORE taken only with valid pins, the version 1
  BEFORE still refused without a receipt, the follow-up and the report on read,
  and the way back's notice taking a green follow-up.
- tests/the-stable-release-policy-reads-an-emergency-note.test.ts: the two
  mode mismatches, the note window over 15 minutes, the switch and message
  refusals as the release check reads them, an owing earlier emergency, and a
  valid note returning the throw and the message.
- tests/the-stable-upgrade-recovers-every-step.test.ts: a configuration that
  names a receipt refuses; a drizzle/ change refuses; a full emergency run in a
  scratch office runs every other step and files AFTER as notice version 4; a
  step that fails after the old service stops brings back the previous version.
- tests/the-stable-office-goes-back-to-its-previous-version.test.ts: --back
  from an emergency release works; --back to one refuses until its follow-up is
  green, and then reads that receipt at its later commit.

Why: the owner agreed to option A: a fix on main goes into the
stable version at once while the office is broken, and the whole suite tests it
afterwards. The other guards stay, so the path is rare and visible. Right after
a failed attempt is exactly when a corrected second attempt is needed, so a
refused or restored attempt must not wait hours for a receipt. The way back exists to recover from a broken newer version. That
version ran as the stable office, and a green receipt contains it, so refusing
the way back to it would leave the office broken.

## A judged receipt

Old: every release that is not an emergency needed a receipt green as a whole.
The notice door's receipt check, at BEFORE and at AFTER, and the release tool's
evidence check both refused any other receipt.

New: the owner decided that a whole-suite receipt is evidence only. A person or
an agent judges whether it passes. Green receipts work exactly as before.

The judgement:
- A judgement is a note. Its extra holds `receiptJudgement`: version 2, the
  receipt it judges ({id, seq, contentHash}), and one verdict for each file
  that takes one. A verdict names the file, how it ran alone ("red", "not run"
  or "no result"), "test-fault" or "feature-broken", a reason of at most 2,000
  characters, and the problem kept for that file. Who judged and when are the
  note's create stamp. A version-1 judgement already stored still reads and
  stands as it did: it was filed when every file it judges was red alone, so
  each of its files reads as "red". The schema accepts both versions.
- POST /api/office/upgrades/judgements writes one, in one transaction. It is
  asked the receipt and, for each file, the verdict, the reason and the line
  that owns the file. It writes the note. For each file it opens a problem
  whose extra holds `judgedFile`, or takes the one still open for that file.
  It links each problem about the note. It sends each line one message, which
  leads to the note.
- The door takes the person with the person's key, and an agent holding the
  secretary card with its own key. It refuses anybody else with 403.
- The door refuses before any write: a receipt that is not an authored original
  whole-suite receipt in this project; a green receipt; a receipt no judgement
  can stand for; verdicts that do not fit the receipt; a line that is not a
  registered agent still working; and a file whose open problem names another
  line.

Which receipts can be judged:
- Version 2, complete by wholeSuiteReceiptIsComplete, a suite that exited 1,
  no error outside the tests, and at least one run alone.
- Every file whose run alone is "red", "not run" or "no result" takes a
  verdict, in the receipt's order. A file green alone takes none. A file not
  run alone, or with no result alone, no longer refuses the receipt.
- A judgement that leaves one of those files out is refused as noVerdict; one
  that names a file outside them is refused as notRed. A stored `ranAlone`
  that differs from the receipt's outcome for its file is refused with its own
  sentence.

The pin:
- The authorization note carries `stableReleaseJudgement: {id, seq,
  contentHash}` beside `stableReleaseAuthorization`, not inside it. That schema
  is strict, and an older office reads only `stableReleaseAuthorization` from
  the note.

The rule lives once, in src/shared/receipt-judgement.ts. The notice door and
the release tool both call it, each with the facts it reads. A pinned judgement
lets a receipt that is not green in only when every one of these holds. Each
refusal has its own sentence.
- The pin has the declared shape.
- The pinned revision is in this project and has that content hash.
- The pinned record is a note holding a valid `receiptJudgement`.
- The judgement was never deleted. One deleted and restored still refuses.
- When the decision is still to come, the pin is the judgement's newest
  revision.
- Every revision up to the pin was written by the person with the person's
  key, or by the agent who wrote the authorization note, with its own agent
  key. Another holder of the secretary card does not count.
- It judges exactly this receipt: the same id, seq and content hash.
- Every file whose run alone is "red", "not run" or "no result" has a verdict,
  and no other file has one.
- Each verdict's stored `ranAlone` is the receipt's outcome for that file.
- No verdict says a feature is broken, whatever the file's run alone.
- When the decision is still to come, each verdict's problem is a problem in
  this project, not deleted, that keeps that file.

It also refuses:
- a pin beside a green receipt;
- a pin in an emergency release's note;
- a judged receipt that is not of the announced commit and tree.

The person overrules a judgement by deleting it. Anybody's delete stops a
release; no delete lets one in. A restored judgement does not stand again: a
new judgement is filed. The note kind has no closed field.

When it is read:
- The notice door reads it at BEFORE, as it is then.
- AFTER takes the judgement as BEFORE took it. A delete after BEFORE does not
  refuse the AFTER of a release that went ahead.
- The release tool reads it at each check of the release policy, so a delete
  stops a release at its next check. verifyUpgradeEvidence takes the
  authorization note and asks the same reading for a receipt that is not green.
- The notice door refuses when the judgement has more revisions than it reads
  at once.
- The way back passes its own authorization note, so it may pin a judgement of
  the previous version's receipt that still stands.

The first release that carries this needs a green receipt or the emergency
switch. Its BEFORE is filed while the older office serves, and that office
refuses a receipt that is not green.

A capped receipt's judgement:

Old: a judgement held version 1: the receipt and one verdict for each file
that was red when run alone. Only a file red alone took a verdict. A file that
gave no result alone, or was not run alone, refused the receipt with its own
sentence, and the suite ran again.

New:
- A judgement holds version 2: the receipt and one verdict for each file whose
  run alone is "red", "not run" or "no result", in the receipt's order. Each
  verdict stores how its file ran alone as `ranAlone`. A file green alone
  takes no verdict.
- A version-1 judgement already stored still reads and stands as it did. It
  was filed when every file it judged was red alone, so its files read as
  "red". The schema accepts both versions.
- A judgement that leaves one of those files out is refused as noVerdict; one
  that names a file outside them is refused as notRed. A stored `ranAlone`
  that differs from the receipt's outcome for its file is refused with its own
  sentence. A feature-broken verdict stops the upgrade whatever the file's run
  alone.
- The judgement door writes version 2, reads each `ranAlone` from the receipt,
  and says in each problem's title and symptom, in the note and in the message
  to each line how the file ran alone.
- The first release that carries this is judged by the older office, which
  still refuses a receipt with a file not run or with no result alone; that
  release needs a receipt with no such file, or a green one.

Tests: tests/a-judgement-is-its-own-note.test.ts files a judgement of a
receipt with red, not-run and no-result files and reads each stored ranAlone;
a judgement that leaves out a not-run file is refused.
tests/a-judged-receipt-lets-an-upgrade-in.test.ts lets a capped receipt in
when every verdict is a test's fault, stops a feature-broken verdict on a
not-run file, refuses a stored ranAlone that differs from the receipt, keeps a
version-1 judgement standing, and refuses a receipt that fails another
completeness rule.

Why: the owner decided on 18 Nov that an upgrade need not wait for a green
suite when every remaining red is a test's fault. A red whole run runs at most
a fixed number of failed files alone, the limit that criterion 18 of
tools/cloud-suite.criteria.md sets, so a receipt with more failed files than
that has files not run alone; refusing it made such a receipt impossible to
judge. The receipt stays the one source of how each file ran alone, and the
stored copy is checked against it.

Tests:
- tests/whole-suite-receipt.test.ts: wholeSuiteReceiptIsComplete, and
  wholeSuiteReceiptIsGreen's answers unchanged over every receipt the file
  already uses.
- tests/a-judgement-is-its-own-note.test.ts: the door's note, problems, links
  and messages; the person's key; an open problem taken again or refused for
  another line; a receipt with red, not-run and no-result files, with each
  stored ranAlone; every refusal leaving no write.
- tests/a-judged-receipt-lets-an-upgrade-in.test.ts, against a scratch office:
  each refusal asked of the notice door and of the release tool, which must give
  the same sentence; a judged receipt let in at BEFORE, AFTER and every check;
  a capped receipt let in, a feature-broken verdict on a not-run file, a stored
  ranAlone that differs from the receipt, a version-1 judgement still standing;
  a delete after BEFORE; an emergency release with a pin.
- tests/the-stable-upgrade-verifies-original-evidence.test.ts: a version 2
  receipt red alone taken only with a pin that stands.

Why: the owner decided that a whole-suite receipt is evidence
only, and that a person or an agent judges whether it passes. A file red, not
run or with no result alone may still be a test's fault, and that should not
hold back every release. Each judged file opens a problem for the line that owns
it, so the fault is mended and not forgotten.

## The stable upgrade stays closed until verified (item 15)

The review. Closed verification above was measured, as this folder's owner,
against the four parts of item 15. This section adds only what it lacked.
- (a) Partly there. The verifier has its own timeout, and a failed or timed-out
  verification rolls back from the snapshot. Nothing bounds the closure as a
  whole: there is no abort deadline and no maximum closed time.
- (b) Partly there. One crash point is tested, a kill during the target
  verification. Nothing resumes a crashed upgrade. Nothing stops a restart from
  serving the unverified database: the server, tools/serve-dev.mjs and the
  service command start without reading the lock.
- (c) There. The terminal holder is never signalled, its writes are refused while
  the office is closed, and a test checks the same pid and start time. Nothing is
  added for (c).
- (d) Not there. Nothing counts the untranslated words.

### (a) The abort deadline and the maximum closed time

OLD (above): "Its only fields are `command`, `timeoutMs`, and `checks`, all
required."

NEW: its only fields are `command`, `timeoutMs`, `checks`, `abortDeadlineMs` and
`maxClosedMs`, all required. Each limit is a whole number of milliseconds from 1
to 86,400,000, and `abortDeadlineMs` is less than `maxClosedMs`. A configuration
without them, with either out of range, or with the deadline not below the
maximum, is refused before anything changes. There is no default.

- The office is closed from the journal entry `closed-time started`, written
  before the first ordinary process is stopped. The entry names both limits.
- The abort deadline holds until the target verifier passes. Past it, the upgrade
  rolls back from its snapshot, verifies the old generation and opens on it. The
  result is "restored", and its error names the abort deadline.
- The maximum closed time holds for as long as the office is closed, in a
  rollback too. A rollback that has not reopened the office by then stops there.
  The office stays closed, with the lock and the mark below, and the result says
  NOT RESTORED, names the maximum closed time and gives the resume command.
- While the office is closed, a step that would start past the limit in force
  does not start, and each wait is cut at that limit: a command, the verifier and
  a health wait. Stopping a process is not cut. It is how the office gets back to
  a safe state, and it keeps its own `stopTimeoutMs`.
- The clock stops when the ordinary start gate opens. A later final-close
  recovery that closes the office again counts from that closure.
- A resume counts from its own start, with the same two limits, and says so in
  its journal. How long the office stood closed between the crash and the resume
  is not counted against it.

A closed rollback restores the database from the upgrade's snapshot whenever the
office was closed, and checks the restored file against the snapshot. When the
rollback begins before the snapshot was taken, it takes the snapshot first, as
`recover-snapshot`, from a database no migration has touched. Before this, a
rollback that began before the migration compared the live file with the private
backup's digest and refused, and one that began before the snapshot refused for
want of one.

### (b) The mark, the start refusals and the resume

OLD (above): "A crashed/interrupted transaction leaves that lock/journal; another
invocation refuses it. It never interprets a migration/check success as
permission to reopen. No second maintenance or resume controller is introduced."

NEW, as decided for the owner of stable upgrades (both answers A, with the
condition on the first):
- While the office is closed, the upgrade keeps a mark beside the database,
  `<database>.upgrade-closed`. It is written whole, synced, right after
  `closed-time started` and before the first ordinary process is stopped. The
  journal says `upgrade-mark written`.
- The server, tools/serve-dev.mjs and the service command
  (src/config/the-service-command.mjs, which the boot unit runs) each refuse to
  start while the mark is beside the database they would open. A start for the
  release check is not refused: the upgrade itself makes that start, and it
  serves no ordinary route.
- The refusal is one sentence on standard error, and the exit status is 1. The
  sentence names the upgrade, by the commit it came from, the commit it goes to,
  the tag and when it closed the office. It gives the exact command that resumes
  the upgrade, or rolls it back if the target cannot be verified. A mark that
  cannot be read is refused too. The sentence names its path, the lock of the
  stable checkout the start's settings pair with,
  `<stable checkout>/.git/stable-upgrade.lock`, and the command that resumes
  that lock. The development checkout and the stable checkout read the same
  settings, so a start from either names the same lock. When the settings pair
  with no stable checkout, the sentence says so and names no lock.
- Only a resume or a rollback reaching "open" or "rolled back" clears the mark:
  the verified target published, or the verified old generation reopened. It is
  cleared right before the ordinary start gate opens, after the last check of the
  frozen state, and the journal says `upgrade-mark cleared`. No timer and no
  start clears it. When a rollback stops at the maximum closed time, the mark
  stays.
- Another invocation still refuses the lock. The way forward from a crash is the
  command the mark names: `node <stable checkout>/tools/stable/upgrade-stable.mjs
  --resume <stable Git folder>/stable-upgrade.lock`.

The resume:
- It takes only a closed-mode journal. It refuses while the program that wrote
  the journal, or an earlier resume, is still running, and it refuses a second
  resume that starts beside it.
- It drops a last journal line the crash left half written, and says so in the
  journal.
- It takes the configuration from the journal's first entry and appends to the
  same journal. It reads no new configuration.
- It stops each process group the journal recorded that is still the same
  process, on the same boot. It never signals the terminal holder.
- Then it goes one of four ways:
  - The ordinary start gate was reached with a verified generation, and that
    office answers: it finishes the upgrade.
  - The office was never closed: it checks the old office answers and finishes
    "unchanged".
  - The migration finished and no rollback began: it writes the mark again,
    checks the stable checkout, the tag and the artifacts are the target's,
    starts the release check and runs the target verifier. It publishes only on
    a pass. Any failure rolls back.
  - Otherwise it rolls back from the snapshot and verifies the old generation.
- Nothing opens without a verifier pass on the generation that opens, made in the
  resume, or made before the crash when the ordinary start gate was already
  reached.
- Its AFTER notice answers the BEFORE the journal recorded.

The crash proof, on made-up offices:
- A crash is the end of the upgrade program by SIGKILL, right after the journal
  line of a boundary is synced. The processes it started go on running, as they
  would after the program's own crash.
- The boundaries are every journal entry from `closed-time started` to
  `release-lock attempt`, on a run that publishes and on a run whose target
  verifier rejects. A step taken once for each of several process groups is
  tested at its first group. Before the closure, `lock attempt`,
  `notice recorded`, `candidate-migrate done`, `notice-before filed` and
  `policy-stop done` are tested. The office is not closed at any of them.
- At each boundary:
  - the lock stays;
  - while the mark is there, only the old version answers, until its processes
    are stopped, and after that no ordinary route answers;
  - another upgrade refuses;
  - the refusal sentence names this upgrade and the resume command;
  - the resume ends "published", "restored" or "unchanged", and the mark is gone;
  - "published" comes only through a target verifier pass in the resume, or by
    finishing a verified generation already open;
  - the private rows are the target's after "published" and the original rows
    after "restored" or "unchanged".
- A completeness check lists each entry a publishing run and a rejecting run
  journal inside the closure. An entry with no tested boundary fails it.
- The restart case: a crash after the migration and before the check, at
  `closed-verification committed-awaiting-verification`. A start of the made-up
  office's serve-dev is refused with the sentence. The resume runs the verifier,
  and the office opens.
- The real starts, against a made-up database that carries a mark:
  - this checkout's tools/serve-dev.mjs and src/server/index.ts each exit 1 with
    the sentence;
  - the start the boot unit makes: the unit text theStartAtLoginUnit writes for a
    made-up office, its ExecStart run with its Environment in a copied checkout,
    exits 1 with the sentence on its output. systemd keeps that output in the
    unit's journal. systemd itself is not run.

WHY: item 15 asks for a crash at each journal boundary to come back to "closed"
or "rolled back", never to "open". A lock alone does not do that. A restart by
hand, or the boot unit after a reboot, serves whatever database it finds. The
owner of stable upgrades decided that a mark refuses every start, that the
refusal says how to go on, and that a resume or rollback alone clears it. The
office may open after a crash only when the resume's verifier passes.

### (d) The untranslated-word count

- The dry run prints the count tools/stable/untranslated-words.mjs gives. It names
  the checkout and commit it counted, and says whether that is the target commit.
- The real run counts in the candidate checkout after its builds and before the
  old office stops: the step `untranslated-words`. A counter that is missing or
  fails refuses the upgrade there.
- When the count is above zero, the AFTER notice of a forward upgrade carries it,
  as `untranslatedWords` and as a sentence in its text. At zero it carries
  neither.
- A forward upgrade to a version whose notice door cannot take a count above zero
  is refused before the old office stops. The candidate's own notice contract is
  asked, at a count of zero too, with a count of 1.
- The way back sends no count, and its own output says so.

WHY: the person reads the AFTER notice. A count above zero tells the person how many
words they will see in English on the Chinese pages after the upgrade. The owner of
stable upgrades decided the way back sends none, and that an upgrade is refused
when its target could not take the count.

Tests:
- tests/the-stable-upgrade-stays-closed-until-verification.test.ts: the two
  limits refused when missing or wrong; the abort deadline passed at a pause and
  at a target verifier that hangs, each restored; a rejected target and a
  recovery verifier that hangs past the maximum, NOT RESTORED and closed with the
  mark; the dry plan names both limits and the resume command; a rollback that
  begins before the snapshot takes it first and restores from it.
- tests/a-crashed-stable-upgrade-resumes-*.test.ts: the crash proof above, one
  file for each part of the boundaries: before-it-closes, which also holds the
  completeness check, while-it-stops-and-saves, while-it-migrates-and-checks,
  while-it-verifies-the-target, while-it-opens-the-target, while-it-rolls-back,
  while-it-verifies-the-old-version and while-it-reopens-the-old-version.
- tests/a-crashed-upgrade-refuses-every-start.test.ts: the restart case, the real
  starts, and the resume's own refusals: while the program that wrote the
  journal runs, and beside another resume. It also drops a half-written last
  line. A mark that cannot be read: the start the boot unit makes from a copied
  development checkout that pairs with a made-up stable checkout exits 1, and its
  sentence names that stable checkout's lock and resume command, not a lock in
  the copied checkout. From a copied checkout that pairs with none, it exits 1,
  and its sentence names no lock.
- tests/the-upgrade-counts-untranslated-words.test.ts: (d) on the made-up office:
  the dry count, the count in the AFTER outcome or none at zero, a counter that
  fails and a notice contract that cannot take a count.
- tests/the-stable-upgrade-notices-follow-the-transaction.test.ts: (d) through
  the command line and the real notice door: the dry count and the sentence in
  the AFTER text.
- tests/the-stable-office-goes-back-to-its-previous-version.test.ts: (d) for the
  way back: no count, and the result and the dry plan say so.
All of them use made-up repositories, databases, settings, services and verifier
stand-ins. None touches the running office or its checkout.

## The closed upgrade's verifier (item 20)

OLD: "This supplies a verification boundary, not the eventual identity verifier
or a security sandbox for hostile same-user programs." The repository held no
verifier. Only the tests' stand-ins answered a request.

NEW: tools/stable/verify-the-target.mjs is the verifier. The configuration names
it by its canonical absolute path, with its own time limit:
`"command": ["<checkout>/tools/stable/verify-the-target.mjs", "--within", "<ms>"]`.

- `--within` is a whole number of milliseconds from 1 to 1,800,000, and it is
  required. The verifier cannot see `timeoutMs`, so whoever writes the
  configuration sets `--within` below it.
- It reads the request strictly. It takes exactly the nine fields of version 1,
  a phase of target or recovery, a 40-character commit, absolute paths, a port
  from 1 to 65535, a nonempty list of unique checks and a 64-character state
  hash. It knows five checks: health, records, reads, migrations and settings.
  A check it does not know, a field it does not know, or a missing `--within`
  is refused with exit 2, and no result is written.
- health: GET /api/health on the service port answers 200 and `ok: true`. Its
  identity names the request's commit, repository, database and port, and the
  mode release-check. These are the same comparisons the transaction makes.
- records: the target and the snapshot hold the same number of records, and the
  same newest record id.
- reads: for each of decision, message, report and session, the snapshot's
  newest record of that kind that is not withdrawn. The target holds the same
  record, not withdrawn, with the same kind, project, title and creation time,
  and its data is a JSON object. A kind with no such record in the snapshot fails
  the check.
- migrations: no migration in the request's repository is unapplied in the
  target, and the newest journal entry is the repository's last migration. A
  database ahead of the repository fails too.
- settings: the owner's own preferences and the office runtime settings in the
  target equal the snapshot's. The preferences are the row of the person marked
  as the office owner, every column the snapshot has. The runtime settings are
  compared row for row. A snapshot with no owner fails the check. A failure
  names the settings or preferences that differ and never prints a value.
- Release-check mode serves no record door, so records, reads, migrations and
  settings read the two database files, and the output says so.
- It opens each database file read-only and immutable, so it creates, locks and
  changes nothing beside it. It refuses a file with a rollback journal beside it,
  or a write-ahead log with anything in it. A database it cannot read fails each
  check that needs it, and the output says why. It never stops or starts
  anything.
- It prints one line per check, `<name>: passed. <why>` or
  `<name>: FAILED. <why>`, then one line with the count.
- It writes the result the contract asks for, and nothing else. Every check is a
  boolean. The file is new, private (mode 0600) and synced before exit.
- At its own limit it stops waiting. A check not started by then is false and
  says "Not run". A check that finishes after the limit is false. It exits 0 when
  every check passed, 1 when one failed, and 2 when it refused.

WHY: item 20 asks for the verifier the closed upgrade mode needs, proved on
made-up offices and timed on a made-up office of the live size. The closed-time
limits are set from that measurement. A read-only record door in release-check
mode was not added for the reads check. The old version, started for a closed
rollback, would not have that door, so the recovery phase could not use it.

Tests:
- tests/the-closed-upgrades-verifier-reads-the-target.test.ts: a good target
  passes, with a result the transaction accepts, and no file beside either
  database changes. It passes against the real release-check server. It fails,
  naming the check, for a missing record, the same count with another newest
  record, a sampled record withdrawn or changed, an older migration level and
  one newer, a door that refuses, another commit or mode, a changed setting and
  a changed owner preference.
  It refuses a database with a rollback journal. It stops at its own limit. It
  refuses an unknown check, an unknown field, another version and a missing
  limit. The configuration accepts it by its path.
All of it uses made-up offices and a made-up service. None touches the running
office or its checkout.

## A closed rollback opens the old version (item 24)

OLD (item 15 (a), above): "A closed rollback restores the database from the
upgrade's snapshot whenever the office was closed, and checks the restored file
against the snapshot." The snapshot was a byte copy of the database the old
office left, and the office keeps its database in WAL mode. So the header of the
copy said WAL mode. The rollback put the copy back and started the old version in
release-check mode on it. The release check refuses a database whose header does
not say DELETE mode. Every closed rollback of an office in WAL mode therefore
ended NOT RESTORED, with the office closed, and a resume did the same again. The
tests' made-up office was in DELETE mode, and its release check read no header,
so no test saw it.

NEW:

### (a) The made-up office in WAL mode

- The made-up office can be made in WAL mode. Its database is then in WAL mode
  from the start, and its ordinary start sets WAL mode, as
  src/server/db/client.ts does.
- The made-up office's release check refuses a database as the product's does.
  It calls the product's own `requireCheckpointed`, at its start and at each
  health read. This holds in DELETE mode too.
- On the made-up office in WAL mode, a closed upgrade whose target verifier exits
  1 ends "restored". The recovery verifier has run, the old version serves, the
  rows are as they were, and the database is in WAL mode again. This is red
  before (b).

### (b) The snapshot is checkpointed before its hash is taken

- The private snapshot is put into DELETE mode right after it is copied, and its
  hash is taken after that. It is the checkpoint the candidate and the migrated
  database already get: `wal_checkpoint(TRUNCATE)`, then
  `journal_mode = DELETE`. This holds for the snapshot `private-backup` takes and
  for the one a rollback takes first, `recover-snapshot`.
- So the snapshot can be release-checked as it was written. The restored
  database equals the snapshot by hash, and the release check reads the file the
  old version then serves.
- `requireCheckpointed` is not changed. It is exported, so that the made-up
  office can call it.

The cost:
- The snapshot is no longer a byte copy of the database the old office left.
  Bytes 18 and 19 of its header say DELETE mode where the office's said WAL mode,
  and the change counter in its header has moved on. Every table, row and index
  is the same.
- After a rollback, the old version's ordinary start sets WAL mode again, so the
  office runs in WAL mode as before.
- The closed window holds one more read-write open of the snapshot, a header
  write and two syncs. (d) measures it.

Rejected:
- A second, checkpointed copy only for `recover-check`. It costs one more whole
  copy while the office is closed, and the release check would then read a file
  the old version does not serve.
- A checkpoint of the database after the restore. The restored file would then
  no longer equal the snapshot by hash.

### (c) What the dry run refuses before anything closes

The dry run and the real run share this validation, so a real run refuses these
before anything closes too. A resume reads its configuration from the journal
and does not check them again.
- A word of the verifier's command that names a path inside the stable checkout:
  an absolute path inside it, or a relative path that exists there. The verifier
  runs in the stable checkout, and a rollback moves that checkout back to the old
  commit.
- When a word of the command names tools/stable/verify-the-target.mjs, the
  transaction runs the command once in the verifier's dry form, before anything
  closes. That is the command followed by `--dry <timeoutMs> <check>...`. It runs
  in the stable checkout, with the settings the verifier gets in a real run. The
  dry form reads only its arguments and writes nothing. It refuses, with exit 2:
  - a check name it does not know;
  - a `--within` that is not below `timeoutMs`;
  - a better-sqlite3 that its own checkout cannot load, or that cannot open a
    database in memory.
  Otherwise it exits 0, and its one line says what it checked. The transaction
  refuses any other exit, and its error quotes what the verifier printed. The
  dry plan quotes the line.
- A command that does not name tools/stable/verify-the-target.mjs is not run
  before anything closes. The dry plan says that its checks, its limit and its
  loading were not checked.
- The verifier runs with the release-check settings without
  `MOLE_OFFICE_DEVELOPMENT_CHECKOUT`, in its dry form and in a real run. That
  setting pairs the stable checkout with the development checkout. The verifier
  is named in another checkout, and the settings of that checkout refuse a
  pairing that does not name it. With the setting, the verifier exited 1 as it
  loaded, after the office had closed, in every checkout but the stable one. The
  recovery verifier then failed the same way, and the office stayed closed.

### (d) The closed window on made-up offices, timed, and the limits it recommends

- Made-up offices were built by tools/build-a-made-up-office.ts at the 22
  October scale, one in 20, one in 2 and one in 1, in WAL mode, and migrated by
  db:migrate. When the snapshot was copied they were 77,524,992, 757,284,864
  and 1,517,137,920 bytes. One in 1 is the largest the builder makes. It does
  not make the revisions, most of the changes, the file observations or the
  visitor requests, and the revisions are most of the live office's file. So
  the live size, about 5.1 GB, was not measured.
- The free space on / was read before each step, against a floor of 85 × 10^9
  bytes, 85 GB as `df -H` counts it. A step whose copies would have taken it
  under the floor was not started, and a watcher read it each second while a
  step ran. The timing ran in the sandbox, never in a host clone. Each made-up
  office and all its copies were deleted when its run ended.
- Each size was timed in two parts, on the same file. First the real programs,
  one at a time: the ordinary start and stop, db:migrate with nothing left to
  do, the release-check start and stop, and tools/stable/verify-the-target.mjs
  with its five checks. Then the transaction itself in closed mode, with the
  made-up repositories, servers and verifier of the tests: one run that
  publishes, and one whose target verifier exits 1 and that ends "restored". In
  the second part, the time of each made-up server, migration and verifier was
  replaced by the real program's time from the first part.
- Measured, in seconds, at the three sizes from the smallest:
  - publish, from the close to the target verifier's pass: 4.4, 26.9, 55.5;
  - publish, from that pass to the new office answering: 2.5, 6.7, 11.8;
  - publish, the whole closed window: 7.0, 33.6, 67.3;
  - rollback, from the close to the target verifier: 3.6, 21.8, 47.3;
  - rollback, from the target verifier to the old office answering: 4.7, 18.0,
    35.3;
  - rollback, the whole closed window: 8.3, 39.8, 82.6;
  - the sanitized backup, the longest step: 1.2, 10.0, 20.6;
  - db:migrate with nothing left to do: 1.0, 5.8, 12.6;
  - the release check, from its start to answering: 1.0, 4.2, 8.6.

  The times grow about in step with the size.
- The peak use of / was 0.34, 3.06 and 6.67 × 10^9 bytes, four to four and a
  half copies of the office. The lowest free space was 2.2 × 10^9 bytes above
  the floor. The load average over one minute was 1.06, 1.60 and 2.66 on
  average, and 3.28 at most.
- Upgrade 11 ran on the live office, about 5.1 GB, on 30 October 2026, not in
  closed mode. Its operator read these times from that upgrade's journal, to
  the second:
  - from the old office stopping to the release check answering, 162 s;
  - within that, the sanitized backup 52 s, with a files folder of about 7 GB
    that the builder does not make; the private backup 25 s; install-artifacts
    33 s; db:migrate 29 s, with three migrations to apply; the checkpoint under
    a second; the release check answering 16 s after its start;
  - from the release check stopping to the new office answering, 33 s;
  - the whole downtime, 195 s.

  The estimate below gives the same two stretches about 205 s and 35 s.
  Upgrade 11 had no verifier, no snapshot checkpoint and no rollback, so those
  are still estimates.
- Estimated for 5.1 × 10^9 bytes. THIS IS AN ESTIMATE, NOT A MEASUREMENT. Each
  step that copies, checkpoints, hashes, migrates or verifies is taken as
  linear in bytes: its time at the largest size, times 5.1 × 10^9 over that
  size. Each other step, a start or a stop, is a straight line through the three
  sizes, read at 5.1 × 10^9, and never below its time at the largest size. The
  two artifact steps ran the real code on the tests' small artifacts, in 59 and
  60 ms, and their time does not grow with the database. Each is given 33 s,
  install-artifacts' time in upgrade 11. The rollback's restore of the old
  artifacts has not been timed on the live office, so its 33 s is an
  assumption. The estimate is:
  - from the close to the target verifier's pass, 215 s;
  - from that pass to the new office answering, 35 s;
  - from the target verifier to the old office answering, in a rollback, 142 s;
  - the longest step, the sanitized backup, 69 s.
- Recommended, on that estimate: `abortDeadlineMs` 450000 and `maxClosedMs`
  900000. `abortDeadlineMs` is 2 × 215 s, up to the next 30 s. `maxClosedMs` is
  `abortDeadlineMs` + 2 × (69 s + 142 s), up to the next 30 s. Both limits are
  read only when a step starts, so a step that starts just before the deadline
  runs to its end. That is why the longest step is in `maxClosedMs`. If
  `timeoutMs` is longer than 69 s, it takes that step's place, because the
  verifier may run that long. The factor is 2 because:
  - the estimate reaches 5.1 GB by a straight line, 3.4 times past the largest
    size measured;
  - the made-up office lacks the revisions, so a step that reads rows rather
    than bytes may grow differently on the live office;
  - the made-up file had just been written, so its copies may have been read
    from memory, and the live file's may not be;
  - the load average was at most 3.3, on 20 CPUs, during the timing, and other
    suites often run on the same machine.
  The limits rest on an estimate. They are to be measured again at the live
  size when a made-up office of that size can be built.
- Not measured here, and each can make the window longer: a release whose
  migrations have work to do; the tables the builder does not make; the files
  folder; a database that is not in memory; a loaded machine; the restore of
  the old artifacts on a rollback.

WHY: item 24. Closed mode is not used on the live office until a closed rollback
can open the old version there. The made-up office now keeps its database as the
office does, and its release check reads the header as the product's does, so a
test can see what the live office would do. (d) is a measurement, not a test.
The limits need times, and the builder cannot make an office of the live size,
so the times are measured up to its largest and estimated past that, and the
estimate says so.

Tests:
- tests/a-closed-rollback-opens-the-old-version.test.ts: (a) on the made-up
  office in WAL mode, both for a rollback after the target verifier and for one
  that takes its snapshot first, and the first with both verifiers run without
  `MOLE_OFFICE_DEVELOPMENT_CHECKOUT`; (c) a dry run that refuses each of the four,
  with no lock, no mark and the old office serving, a real run that refuses one
  of them the same way, and a dry plan that quotes the verifier's line or says
  it was not run.
- tests/the-verifiers-dry-form.test.ts: (c) the dry form passes, writes
  nothing, and refuses an unknown check, a `--within` equal to `timeoutMs` and
  one above it, a checkout with no better-sqlite3, and one whose better-sqlite3
  cannot open a database.
- tests/the-closed-upgrades-verifier-reads-the-target.test.ts: its made-up
  snapshot is checkpointed into DELETE mode, as (b) leaves the transaction's.
All of them use made-up repositories, databases, settings, services and verifier
stand-ins. None touches the running office or its checkout.

## A staged re-mint map and several closed verifiers (items 28 and 31)

OLD: the configuration had no field for a re-mint map. The migration of the
explicit database was always `npm run db:migrate`, with no arguments.
`closedVerification` named one `command`. That one verifier answered every
configured check, in the target phase and in the recovery phase.

NEW:

### (a) A staged re-mint map (item 28)

- `remintMap` names the staged map. It is absent by default. Without it the
  migration of the explicit database is `npm run db:migrate`, byte for byte as
  before.
- With it, that one migration is `npm run db:migrate -- --remint <file>`. npm
  hands the script what follows `--`, so the migration is given exactly
  `--remint <file>`. Nothing else changes. The migration of the private
  candidate database, before anything closes, is not given the map.
  (Changed: with a map, the candidate copy and the live store each run
  `npm run db:migrate` and then `npm run db:migrate -- --remint <file>`. See
  "A staged re-mint map is applied by a second command" at the end of this
  file.)
- The map is named by its whole path: absolute and canonical. It must be an
  existing ordinary file that this user can read. It must be outside the stable
  checkout, because the upgrade moves that checkout and a rollback moves it
  back. It must be owned by this user, and neither its group nor others may
  write it, so nobody else can change it between the check and the migration.
  Otherwise the configuration is refused in words that name the path and say
  what is wrong. A refusal for the owner names the owner's user id and this
  user's. A refusal for the mode names the mode. The check runs when the
  configuration is read, so it comes before the lock, the notice and any stop,
  in a dry run as in a real run.
- The map is read again at the last safe point before the stop, after the
  candidate is prepared and with the other checks made there. A map that fails
  any of these checks by then is refused in the same words. Nothing has
  stopped, so the upgrade ends unchanged.
- The dry plan names the map the migration is given, or says that none is named.
  (Changed: the plan names both commands for both stores, and the map's
  sha256. See "A staged re-mint map is applied by a second command" at the
  end of this file.)
- The way back takes no map. It refuses the field as it refuses every field it
  does not take. A resume never runs the migration again, so it reads no map.
  (Changed: a resume counts the migration as done only when the re-mint is
  done too. See "A staged re-mint map is applied by a second command" at the
  end of this file.)

### (b) Several closed verifiers (item 31)

The configuration:
- `closedVerification` names exactly one of `command` and `verifiers`. With
  `command`, the configuration, the plan, the request, the journal and the
  result are as before.
- `verifiers` is a nonempty list. Each entry holds `command`, `checks` and
  `phases`, and may hold `prepare`. It holds nothing else.
- `command` and `prepare` are literal argv, each checked as `command` is
  checked: a canonical absolute executable, then strings. No word of either may
  name a path inside the stable checkout.
- `checks` is a nonempty list of unique, nonblank names. No name is in two
  entries, and every name is one of the configured `checks`.
- `phases` is a nonempty list of unique words from `target` and `recovery`.
- The checks of the entries that name `target` are exactly the configured
  `checks`. So each check is in exactly one entry, and that entry names
  `target`. An entry that names only `recovery` is therefore refused: no entry
  answers its checks in the target phase.
- At least one entry names `recovery`. Otherwise a rollback would open the old
  version with nothing checked.
- The word `{folder}` stands alone. A word that holds `{folder}` beside other
  characters is refused, because it would be passed on unchanged.

The run:
- In each phase, the entries that name it run one after another, in the
  configured order. The others do not run in that phase.
- Each entry that runs gets a new private folder inside the phase's
  verification folder. That folder holds a new request file and an absent
  result path. The request is today's frozen request, with `checks` cut to the
  entry's names, in the configured order. The result is read with
  `readClosedVerificationResult` against that entry's own request. After each
  entry the request must be unchanged and the frozen state the same, as today.
- An entry whose `command` or `prepare` holds `{folder}` gets a NEW folder for
  each run and each phase: mode 700, empty, inside the upgrade's own work folder.
  Its absolute path takes the place of every `{folder}` word. The prepare and
  its verifier get the same folder.
- `prepare` runs just before its verifier, in the stable checkout with the
  verifier's environment. It is given no request and no result. It must exit 0.
  Otherwise its verifier is not run, and the phase fails as when a verifier
  fails.
- A phase fails at the first exit other than 0, refused result, changed request
  or frozen state, or time limit. In the target phase that rolls back as one
  failing verifier does today. In the recovery phase it leaves the office
  closed and NOT RESTORED, as today.
- The office publishes only when every check of every target entry is true. A
  rollback opens the old version only when every check of every recovery entry
  is true.
- `timeoutMs` is one budget for every prepare and verifier of a phase. It counts
  from the start of the phase's first command, and each command is cut at what
  is left of it. A command is not started when nothing is left. The abort
  deadline and the maximum closed time hold over every command, as before.
  There is no order between the entries and no limit for each: each verifier's
  own `--within` must fit inside the one budget.
- The journal: entry n of a phase, counted from 1 in the configured order,
  journals `verifier-<phase>-<n> requested` with its request, result, checks and
  folder. Its prepare runs as the step `prepare-<phase>-<n>` and its verifier as
  `verifier-<phase>-<n>`. The phase ends with one `closed-verification verified`
  or `recovered` line, with the phase's checks and each entry's checks,
  request, result and folder. The upgrade's result carries the same, and a
  resume that finishes an opened generation reads it from that line.
- Before anything closes, the dry form of tools/stable/verify-the-target.mjs
  runs for each entry whose command names it, with that entry's checks.
- The dry plan says how many verifiers run in the one budget, and for each
  entry its checks, its phases, and whether it has a prepare and a folder.

WHY: item 28 lets the closed upgrade run the re-mint migration on the live
database with the map staged before the window. Item 31 lets that upgrade check
the re-mint and the export with the verifiers written for each, in one closed
window. verify-the-export refuses the recovery phase, so it runs in the target
phase only, and the re-mint's verifiers run in both.

Rejected:
- Giving the candidate migration the map as well. Item 28 changes only the one
  migrate command, the one that runs on the explicit database. (Changed: the
  candidate copy is re-minted with the same map before anything closes. See
  "A staged re-mint map is applied by a second command" at the end of this
  file.)
- Running every entry and then deciding. The first failure already decides the
  phase, and every later command would only keep the office closed longer.
- Reading a recovery-only entry as allowed. With no name in two entries and the
  target entries' checks equal to `checks`, its checks could not be answered in
  the target phase. A configuration that needs one reopens this.

Tests:
- tests/the-stable-upgrade-applies-a-staged-remint-map.test.ts: (a) no field
  means the same migrate command byte for byte and a plan that names no map; a
  field adds exactly `--remint <file>` to the stable migration and nothing to the
  candidate's, and the plan names the map (changed: a field adds the second
  command to both; see "A staged re-mint map is applied by a second command" at
  the end of this file); a missing map, an unreadable map, a
  folder, a relative path, a map inside the stable checkout, a map its group or
  others can write and a map of another user are refused in words, in a dry run
  and a real run, with no lock, no mark, no migration and the old office
  serving; a map taken
  away while the candidate is prepared ends the upgrade unchanged, before the
  notice and the stop.
- tests/a-closed-upgrade-runs-several-verifiers.test.ts: (b) a name in two
  verifiers, a union that differs from `checks`, `command` and `verifiers`
  together, a recovery-only entry and the other shapes above are refused at
  validation; all pass means published, each with its own cut request; one
  false, one exit 2 with nothing written, or one that writes a check not its own
  means restored; an export-like verifier that exits 2 in recovery is not run
  there; a prepare that exits 1 fails its verifier, which is not run, and rolls
  back; `{folder}` is new and empty for each run; two verifiers that each fit
  `timeoutMs` but not together are cut, and the upgrade rolls back.
- tests/stable-upgrade-fixture.ts: the made-up migration writes down the
  database and the arguments it was given.
All of them use made-up repositories, databases, maps, services and verifiers.
None touches the running office or its checkout.

## A slimmer stable release: two cases, one copy at most, and a floor

OLD: every release made four copies of the database by the swap: the
rehearsal copy candidate.sqlite before downtime, then the sanitized backup with
its files, then the rollback image restore.sqlite, beside the live file. A
release that changed no migration made them all the same. Upgrade 19 needed
about 142 GB free for a 13.1 GB database, and its lowest reading was 76.8 GB
free. An emergency release could change no migration at all. A start was
given `health.attempts` reads, `health.intervalMs` apart, and a call to the
live office that got no answer within `health.timeoutMs` stopped the release.

NEW: this rule. This
section replaces item 6's sanitized backup above, the emergency path's rule
that its target changes no file under drizzle/, and the sanitized backup in
the way back's kept steps.

### (1) The case is the tool's own reading

- Before the lock, the tool reads the files under the migrations folder
  (THE_MIGRATIONS_FOLDER in src/config/settings.mjs, drizzle/) that differ
  between the baseline and the target, in the development repository, with
  renames read as a deletion and an addition.
- None: case 1. Any (added, changed or deleted): case 2.
- The journal holds one `release-case decided` line with the case, the files
  and a sentence that says why. The dry result and the upgrade's result carry
  the same as `releaseCase: { case, because, files }`. The dry plan says the
  case and what it copies.
- The way back reads its case the same way, with the newer version as the
  baseline and the previous one as the target.
- A staged re-mint map is applied by the migration, and case 1 runs none.
  Case 1 with `remintMap` refuses before the lock and says so. It is not read
  as case 2.

### (2) Case 1 makes no copy of the data

- The candidate is cloned, installed, type-checked and built as before.
- Its trial start is the release check, on the scratch port, on the live
  database itself, while the old version serves. The tool tells the release
  check, in the candidate's start environment, that another version serves
  this database: MOLE_OFFICE_START_MODE is release-check-live, a third value
  beside ordinary and release-check, and the check's identity names that
  mode.
- Told that, the release check (src/server/lib/release-check.ts) opens the
  file with SQLite's read-only open, as it does today, and accepts a database
  in WAL mode with its companion files and a file whose size and time change.
  It still refuses another file at that path (another inode), a changed
  checkout, pending migrations and an incomplete schema. Not told that, it
  keeps every rule it has today.
- Any write through the release check's connection is refused by SQLite. A
  test writes through it on a database another connection holds open in WAL
  mode, and sees the refusal. The mutation that opens it for writing turns
  that test red.
- Downtime: stop the old version, swap the code and the pages, start the new
  one, verify its health and identity. No migration runs. No stable release
  check runs on the closed database, except for a target that does not take
  the live mode (below).
- A rollback: the previous tag and the saved baseline artifacts, started on
  the same database. No database is restored, because nothing changed it.
- No candidate.sqlite, no restore.sqlite and no sanitized backup are made, at
  any step.
- Closed verification is refused in case 1, before the lock, with nothing
  changed. Its records, reads and settings checks compare the target with a
  copy of the database taken before the migration, and case 1 takes no copy.
  The refusal says so. A case-1 release therefore writes no closed journal,
  and no resume takes one.
- A target older than release-check-live refuses that mode, so it cannot be
  tried while the old version serves. The tool asks the candidate's own
  settings, after its install, whether they take the mode. When they do not,
  the trial start is left out and said, and the stable release check runs on
  the closed database at downtime instead, as it did before. A failure there
  rolls back to the previous code on the untouched database. Still no copy is
  made. The way back to a version released before this change takes this
  path.

### (3) Case 2 keeps at most one database copy on disk, and copies no files

- Before downtime: the rehearsal copy candidate.sqlite is made, migrated and
  checkpointed, the candidate starts on it, and its checks run, as before.
- The copy, with any companion file, is deleted as soon as the candidate's
  check passes and the candidate has stopped, before the BEFORE notice. The
  journal says when.
- At downtime: one hash-checked rollback copy restore.sqlite, then the
  migration in place, the stable release check and the start, as before.
- No sanitized backup is taken, and no files folder is copied. The tool no
  longer calls takeTheBackup.
- The way back runs no migration, so it makes no rollback copy, as before.
- The limit: a rollback copies restore.sqlite over the database, so while it
  copies there are two copies. The rule holds for the release; the rollback
  is the one place it does not.
- A test reads the files of the work folder and beside the database at every
  step of a case-2 release, and sees at most one copy of the database at each.

### (4) The release floor

- MOLE_OFFICE_STABLE_RELEASE_FLOOR_GB is a setting, declared in a file of its
  own under src/config/ and spread into SETTINGS, with its words, its line in
  .env.example and its refusal of anything but a whole number from 1. Absent,
  it is 30 (the release floor). The
  80 GB floor of test runs is another setting, and it does not change.
  A gigabyte here is 1,000,000,000 bytes, as the sandbox's own floor counts.
- Before the lock, and in a dry run, the tool works out the lowest free space
  the case reaches: the free space now, minus 0 (case 1) or 1 (case 2) times
  the database's size, minus the build. The build is measured, not assumed:
  twice the bytes of the stable checkout's artifacts, the same paths the tool
  saves as baseline artifacts (node_modules, dist and each plugin's built
  folder: once for the candidate's install and build, once for the saved
  baseline artifacts), plus the bytes of the development
  repository's .git folder, which the candidate's clone copies.
- Free space is what the file system lets this user write, read on the file
  system of the recovery root. When the database is on another file system,
  that one's free space must stay at or above the floor too.
- Under the floor: the release refuses before the lock. The refusal names the
  free space, the case, the copies, the build, the lowest point, the floor and
  the setting. Nothing is changed.
- During the run, from the lock to the first stop of the old version, the tool
  reads free space every 10 seconds. Under the floor, the release stops before
  downtime, as any failure there does: the old version serves, the candidate
  is stopped, the lock is let go and the state is as it was. The journal
  holds the lowest reading and when it was taken.
- The dry result carries the figures as `room`.

### (5) A start waits up to 6 minutes by default

- A start (the candidate's check, the stable release check, the ordinary
  start, a recovery start and a resume's start) waits for health up to its
  limit. With no `health.attempts` in the configuration, the limit is 6
  minutes, with `health.intervalMs` between reads. With `health.attempts`, it
  is that many reads, as before.
- The dry plan says the limit and where it came from.
- The `done` line of each start's health step says how many seconds the start
  took, from the start of its process to its first healthy answer.

### (6) A call to the live office before downtime is tried again

- Before downtime, a call to the live office, at its API address or at the
  ordinary service's port, that gets no answer (the transport's time ran out,
  or the connection was refused or reset) is sent again, the same method, path
  and body, so the same sendId. It is tried until about 60 seconds have passed
  since its first try.
- A reply with any status is an answer and is not sent again.
- Only a read (GET) and the notice POST, whose sendId makes a second send
  the same notice, are sent again. A gate count
  (POST /api/office/gates/<id>/met) carries no sendId, so it is sent once, as
  today, and a count that got no answer is said and the release goes on.
- A call that still has no answer after that stops the release before
  downtime with the state unchanged. The refusal names the call and how long
  it waited.
- From the first stop of the old version on, no call is tried again this way.
  Calls to the candidate's scratch port are never tried again this way; its
  start has its own wait.
- The tool calls no office door it did not call before, so every call still
  works against the stable version that serves today (dacb4bc9f) until the
  next release.

### (7) The emergency path follows the case

- An emergency release whose target changes no file under drizzle/ goes down
  case 1; one that changes a file there goes down case 2. The refusal "An
  emergency release changes no file under drizzle/" is gone.
- src/shared/stable-emergency.ts says so in its opening comment. Everything
  else the emergency path checks stays as it is.

### (8) Numbers for the check, with a 13 GB database

These are the design's estimates. This round proves the formula with made-up
sizes. The next real release measures the minutes from its journal.
- Case 1: about 3 GB of room above the floor and about 6 minutes, with
  downtime about one ordinary start.
- Case 2: the floor plus one database plus about 3 GB, and about 11 to 12
  minutes.

WHY: a release that changes only code copied 13 GB four times. That blocked
the freeze fix for hours on disk room, and upgrade 19 was killed by a 57 s
stall of one office call.

Rejected:
- Reading a re-mint map as case 2. The case is read from the migrations
  folder only. A map with no migration to apply it is refused, so the owner's
  decision's own condition for looking again (a change that rewrites stored
  values without a migration) is said, not guessed.
- Keeping the sanitized backup in case 2. The rollback copy and the nightly
  copy to the vault cover what it gave.
- Moving restore.sqlite over the database in a rollback, to keep one copy
  there too. The image would be gone if the restored start failed, and the
  two may be on different file systems.

Tests (each with a control, a red mutation and a restore):
- the case reading, both cases and the way back, the journal line, the dry
  result, and the refusal of a re-mint map in case 1;
- case 1 publishes with no copy at any step, its trial start names the live
  database and the mode, its downtime runs no migration and no release
  check, and its rollback restores no database; a target that refuses the
  mode is checked at downtime instead, with no copy;
- the release check told that another version serves: a WAL database held
  open by a writer passes, a write through its connection is refused, and
  another inode is refused; not told, it refuses the WAL database as today;
- case 2 publishes with at most one copy at every step, deletes the rehearsal
  copy before BEFORE, and takes no sanitized backup;
- the floor: the setting's default and refusals, the estimate per case, the
  refusal before the lock, and a reading under the floor during the run that
  stops the release before downtime;
- the start limit's default, a start slower than the old default that passes,
  and the seconds in the journal;
- a stand-in office that stalls 20 s once lets the release go on, and every
  try it received carries the same method, path and body; one that stalls
  90 s stops it before downtime with the state unchanged; a gate count that
  gets no answer is sent once;
- an emergency release with a migration goes down case 2.
All of them use made-up repositories, databases and offices. None touches the
running office or its checkout.

## A staged re-mint map is applied by a second command, on the candidate and on the live store

OLD: with `remintMap`, the migration of the explicit database was the one
command `npm run db:migrate -- --remint <file>`, and the candidate's migration
was not given the map. The re-mint runs alone: it refuses a run of
`db:migrate` that also applies a migration. A release that carries a staged map
also adds migrations, so on the live store that one command always failed, and
the upgrade rolled back.

NEW: this section replaces, in (a) of "A staged re-mint map and several closed
verifiers" above, the one command with `--remint`, the candidate's migration
without the map, the plan's line for the map, and the rejection of giving the
candidate the map.

### (1) The live store

- Without `remintMap` nothing changes: the same steps and the same plan, byte
  for byte.
- With it, the migration of the explicit database is two commands, in this
  order, inside the closed window: `npm run db:migrate`, the step `migrate`,
  and then `npm run db:migrate -- --remint <file>`, the step `remint`. The
  second is given exactly `--remint <file>`. The re-mint's own rule that it
  runs alone is unchanged.
- Just before the step `remint`, the map's sha256 is read again. A map whose
  bytes differ from those the candidate was re-minted with is refused, in
  words that name the map and both hashes. The live store was migrated by then,
  so the upgrade rolls back from the snapshot.
- A resume counts the migration as done only when `migrate` is done and, when
  the journalled configuration names a map, `remint` is done too. A crash
  between the two commands therefore rolls back from the snapshot, and never
  publishes. A resume still never runs either command again.
- Case 1 still refuses `remintMap` before the lock. It takes no snapshot of the
  database, so a re-mint there would have no restore point.

### (2) The candidate copy

- With `remintMap`, the private candidate database gets the same two commands
  before anything closes: `npm run db:migrate`, the step `candidate-migrate`,
  and then `npm run db:migrate -- --remint <file>`, the step
  `candidate-remint`, with the same map. Its checkpoint and its own check come
  after them, as before.
- The map's sha256 is read when the step `candidate-remint` starts, and that
  step's attempt line in the journal carries it.
- A re-mint that fails on the candidate fails the upgrade there. Nothing has
  closed, so the upgrade ends unchanged and the live store is untouched.
- At the last safe point before the stop, the map is read again with the other
  checks there, and its sha256 must be the one the candidate was re-minted
  with. A changed map is refused in the same words. Nothing has stopped, so the
  upgrade ends unchanged.
- The candidate is given its existing checks only: its checkpoint and its own
  start, health and identity on the release-check port. The closed verifiers
  are not run on it.

### (3) The dry plan

- With `remintMap`, the candidate's line and the line for the migration of the
  explicit database each name `npm run db:migrate` and then
  `npm run db:migrate -- --remint <file>`, in that order. One further line gives
  the map's sha256 and says where it is read again, and that a crash before the
  live re-mint is done rolls back. A rehearsal by hand from the plan runs the
  commands it names, in that order.
- Without it, every line is as before, the line that says no map is named
  included.

WHY: the one command could never pass on a release that carries a map,
because such a release adds migrations and the re-mint refuses a run that
applies one. The map is staged at the migrations the store has applied, so on
the candidate as on the live store the re-mint comes after the plain
migration. Re-minting the candidate first shows, before anything closes, that
the map applies to this release's schema. The stable tool's gate cleared giving
the candidate the map on 13 November 2026. The resume rule and the two reads of
the hash keep the tool from publishing a store that was migrated and not
re-minted, or re-minted with a map that was not the one tried on the candidate.

Rejected:
- Keeping one command and letting the re-mint apply the migrations first. The
  re-mint's rule that it runs alone is not this tool's to change.
- Running the closed verifiers on the candidate. They compare the target with
  the copy taken after the old version stops, so they have nothing to compare
  with before that. The hand rehearsal covers them.
- Accepting a map in case 1. Case 1 takes no snapshot, so a failed re-mint could
  not be undone.
- Running the re-mint again in a resume. A resume never runs a migration
  again; a crash before the re-mint is done rolls back instead.

Tests (each with a control, a red mutation and a restore), in
tests/the-stable-upgrade-applies-a-staged-remint-map.test.ts. The target brings
a made-up migration whose re-mint refuses a run that applies a migration, and
refuses a map staged at other migrations than the store has applied:
- no map: the same migrate commands as before, and a plan that says none is
  named;
- a map in the dry plan: both commands in order for both stores, and the hash;
- a map, with a release that adds a migration: published; the journal shows
  `candidate-migrate`, `candidate-remint`, `migrate`, `remint` in that order,
  the candidate's re-mint carries the map's sha256, and the live store is
  re-minted;
- a map the candidate's re-mint refuses: unchanged, nothing closed, and the
  live store and the office as they were;
- a crash right after `migrate done`, before the live re-mint: the resume
  rolls back from the snapshot;
- a map that changes after the candidate's re-mint: refused at the last safe
  point, unchanged, nothing closed;
- a map that changes after the last safe point: refused before the live
  re-mint, and the upgrade rolls back;
- the refusals of (a), and the map read again before the stop, as before.
All of them use made-up repositories, databases, maps and offices. None touches
the running office or its checkout.
