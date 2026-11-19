# Why parts of this repository still say PanelX

**This product was called PanelX. It is called Mole Office now, and the code was renamed on
28 August 2026.**

The rename covered every current product-facing surface: the browser tab and the rail, every
sentence the product writes, the package name, the HTTP header prefix, the settings, the agent
skill, the archive format, the browser's stored settings and the code's own identifiers.

The name still appears about seven thousand times in this repository, and every one of those is on
the list below. **Nothing else should be.** If you find an occurrence that is not on this list and
is not inside `design/`, it is a defect.

## What still says PanelX, and why each one does

### Deliberately historical: the record of work already done

**`design/` and `drizzle/` — about 14,800 occurrences, two thirds of the total.** Dated reports,
plans, critiques, failure matrices, owner messages and probe output from rounds four through eleven,
and the generated schema migrations. **A document that said PanelX when the product was PanelX
keeps saying it.** Rewriting one would make an old report describe something nobody ever saw.

The one exception found during the rename: the held migration's runner, then at
`design/round-eleven/migrations/run-agent-lifecycle-tables.mjs` and now at
`held-migrations/run-agent-lifecycle-tables.mjs`, is not a report but a command still to be run,
so the sentence it prints was renamed with everything else.

**The frozen measurement tables that used to be in `src/`.** `src/server/db/workspace-inventory.ts`
and `src/server/db/origin-inventory.ts` were literal transcripts of a measurement taken on 12 August
2026, embedded as data so a later reader could check a migration against them. They left this
repository on 5 September 2026, because a transcript of one person's office is that person's record
ids and record titles written into the product's source. Their result is in the database they describe, in
`records.origin` and `records.workspace_id`.

**Dated measurements and quotations throughout the source.** Where a comment reports something
somebody observed — a header that was really sent, a label read off a screen, a count of files on
disk, words quoted from a brief — the name in it is part of the observation and it
stays. Where the name is the subject of a sentence about what the product does, it was renamed,
because the product is continuous.

**`STATE.md`.** Stamped at the top as accurate only to 12 August 2026 and 138 commits behind. It is
history with a label already on it.

**The record corpus in the database.** Record titles, summaries and `data` blobs that mention the
name, and every row in `changes` and `revisions`. A record reading *"Your browser app was showing
'PanelX did not start'"* is a report of an observed string. None of them was rewritten.

**The backup files written before the rename.** A backup records when it was taken, under the
name the product had then. New ones are named `mole-office-<stamp>.db`.

**`tools/isolated-panelx.mjs` and `.claude/skills/panelx/` as named inside `design/`.** Both were
moved — they are `tools/isolated-mole-office.mjs` and `.claude/skills/mole-office/` now — and the
187 references to their old paths inside dated reports name them as they were called at the time.

### An explicitly supported compatibility alias: one, and it is read-only

**`panelx-export/1`, the archive format version, with the front-matter key `panelx:` and the fence
language ```` ```panelx ````.** PanelX is the product's earlier name. Every archive written before
28 August 2026 carries all three.

The reader accepts them. The writer only ever writes `mole-office-export/2`, the front-matter key
`region:` and the fence ```` ```mole-office ````. An old archive is announced rather than silently
accepted: the import plan's notes say which version was read and that it predates the rename.

**Why this one and not the others.** The environment variables and the HTTP headers got a refusal
instead of an alias, because nothing outside this machine sends either and carrying two names is
two sources of truth. An archive is different: it already exists, it cannot be rewritten by
anybody but its owner, and the failure would appear at restore time — the moment somebody cannot
afford it.

**Removal condition.** When it is confirmed that no archive written before 28 August 2026 is still
needed. It is one constant, one branch in `parseExportFile`, one branch in the fence pattern, and
one test file.

### Justified references that are not aliases

**A project id made under the earlier name.** In the office where the product was built, the first
project was made before the rename and its id is the earlier name. That id is a foreign key on
every row filed in the project, across ten tables. Its **title** reads Mole Office, which is what a
person sees; the id is what the machine reads, and a person only meets it in Developer mode and in
the `x-mole-office-workspace` header. Changing it means updating one primary key and every row that
refers to it in one transaction, with no declared foreign keys in the schema to catch a missed
table — a migration with its own announced window, which this campaign did not have. The comment
in `src/server/db/workspace-migration.ts` says the same.

**The database file `data/panelx.db`.** The filename was not moved, and the default in
`src/server/lib/env.ts` still points at it. If that default changed, a server started with no
settings file would open a different, empty database and the person's records would disappear from
view with no error. That is the worst failure this rename could have produced, so the filename
stayed.

**`panelx` as a trigger in the misspelt-header check.** `looksLikeActorHeader` in
`src/server/lib/http.ts` still treats a header carrying the old name as an attempt to name one of
this server's own. That is a refusal of the old name, not an alias for it: nothing reads those
headers, and a caller that sends one is told so rather than being silently attributed to the owner.
Every agent that read the old skill sends `x-panelx-…`, which is why it is there. It can go when
no caller still sends them.

**The `px-` CSS class prefix — 3,331 occurrences, 633 class names.** The initials of the old name.
Deliberately retained: nobody reads a class name, and a partial rename of a stylesheet prefix shows
up as an unstyled element rather than as an error. `px-wordmark-x` did change, to
`px-wordmark-lead`, because it was named after a letter the name no longer has.

**`PanelRecord` and `PanelError` — 1,502 occurrences.** Internal type names, in no message a person
reads. Renaming them is a mechanical, type-checked change that is safe to do on its own; it buys
nothing a reader can see, so it was not done here.

**The first checkout's directory and the git remote.** The directory where the product was first
checked out still carries the earlier name. Its path is stored as data in database rows and is named
inside dated reports. The repository name on GitHub is the owner's to change; GitHub redirects the
old URL and preserves the history either way.

## What "renamed" means here

Not `grep PanelX == 0`. The rename is done when every remaining PanelX occurrence is deliberately
historical, an explicitly supported migration or compatibility alias, or another justified
reference.

Current product-facing stale references must be zero. Historical ones must stay.

## Where the accounting is

`design/round-eleven/RENAME-PREFLIGHT.md` counted and classified all 22,251 occurrences before the
rename ran, and costed the decisions it had to take. It is the document the rename was carried out
against, and it is dated: it describes the repository as it was on 27 August 2026.
