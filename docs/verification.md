# How the claims here were checked

Every capability the [README](../README.md) claims was checked against the running product on
27 August 2026, before it was written down. This page says how, so you can check it again.

The server used was the campaign's working copy of the owner's corpus, on
`http://localhost:8787`. Every request carried the project header. Nothing below wrote a record:
the two write attempts were both refusals, and the record count was 795 before and after.

## The checks, one line each

| Claim | Request | What came back |
|---|---|---|
| Typed records and links | `GET /api/kinds` | every kind and every link type, with fields, examples and cross-field rules |
| The API describes itself | `GET /api` | every endpoint with a description |
| Strict about keys | `POST /api/records` with `{"contxet":"typo"}` | **400** — `unknown key "contxet" — did you mean "context"?`, nothing stored |
| Forgiving about completeness | `GET /api/records` | 518 records, 5 of them incomplete and readable as such |
| Search | `GET /api/search?q=rename` | the matching records, with the words that matched |
| Projects | `GET /api/workspaces` | five projects; every request names one |
| Modules, blocks, pipelines | `GET /api/project/bootstrap` | 15 modules, 28 blocks, 2 pipelines in this project |
| History and provenance | `GET /api/records/<id>/revisions` and `…/compare/…` | 1,315 revisions; each difference named by path, with who and when |
| Absence beats a guess | `GET /api/anchor` | "cannot say what has changed since you last looked — not *nothing has changed*" |
| Implementation map | `GET /api/implementation/record/<id>` | 152 rows; each says stated or guessed, and who accepted it |
| Context bundles | `GET /api/bundles/preview?preset=continue` | assembled text with the validity limits above the content |
| Sessions and runs | `GET /api/sessions`, `GET /api/agent/threads` | 50 session records; one conversation, its runs and their states |
| The person's queue | `GET /api/needs-you` | 26 things waiting on the person, each with why it is theirs |
| Governance is enforced | `POST /api/records` `{"kind":"decision"}` as an agent | **403**, nothing written |
| An identity claim must be complete | a write sending only the actor-id header | **400**, naming the missing header and what filling it in would have done |
| A misspelt header is refused | a write sending `x-mole-office-actor` | **400**, listing the headers the server does read |
| Remote access is off here | `GET /api/access` | `remoteAccess: off`, `answersOn: this machine only` |
| The source index is per project | `GET /api/source/coverage` | refuses, names the command that builds it, and answers nothing else |

## The restore proof, run on 27 August 2026

```bash
npx tsx scripts/restore-check.ts
```

It builds a real corpus, exports it, **deletes the database and the mirror**, rebuilds from the text
alone, restores twice more for idempotence, and re-exports byte for byte. It compares what the
product *says* about the two databases rather than comparing tables, and a comparison that looked at
nothing is reported as vacuous and fails the run.

Result: **exit 0. Fourteen phases ok. Twenty-six comparisons held, none vacuous.** Among them:
records of every kind over 305, links and backlinks over 380, the change log over 676, the revision
ledger over 371, Unicode and Chinese text over 229, sessions over 125, soft-deleted records with
their recoverable history, the implementation map and what a guess became, reviews with who each
comment went to, and machine state asserted absent.

Three things do not round-trip. The proof declares all three itself, with the differences each one
accounts for; a difference no declaration names fails the run. They are listed in
[history.md](history.md).

**What it does not prove:** it builds and destroys its own corpus rather than the live one. The one
time the live database was exported and read back after project boundaries landed, five
cross-boundary links broke it, and the proof could not have caught that because its corpus then had
one project and the comparison was vacuous. It has two now.

## The test suite

```bash
npm test
```

**This page did not re-run the whole suite.** The campaign that wrote it recorded two test files red
at the current commit on 27 August 2026, down from fifteen at the campaign's start. Run the command
for the current answer rather than trusting a number in a document.

Three rules about tests in this repository, and each was paid for:

- **A test ships with the code, not after it.**
- **A test is proved by mutation.** Revert the fix, watch it go red, restore it. A test that would
  pass with its feature deleted is not a test.
- **Run a control first** — one unmutated run of the same command — because a run that never started
  looks exactly like a run that failed. An agent proving seven tests by mutation once got seven reds
  from a mistyped reporter flag and nearly recorded them as proof.

## Two traps in verifying anything here

**Never read the type checker's output through `grep`.** `npx tsc --noEmit | grep "error TS"` prints
nothing on a broken tree: there is an escape sequence between `error` and ` TS`, so the pattern never
matches and a failing typecheck reads as clean. Use the exit code, or `npm run build`, which does.
Two agents were fooled by this in one session, one of them into committing a type error.

**A claim is checked against the product, not against a document.** Every dated measurement in these
pages names the date it was taken. Several statements in the old README were true when written and
false by the time they were read again; that is why the dates are there.

## Where the campaign records live

`design/` holds the round-by-round record: what was planned, what was built, what was found and what
was left. It is historical and dated. `explore.md` holds the decisions with what was rejected;
`troubleshooting.md` is symptom-first; `design/DECISIONS-PENDING.md` holds the questions
deliberately left open.
