# Working on Mole Office

@src/config/rules/USER.md

**In the repository.** `README.md` is what Mole Office is. `explore.md` holds every decision with
what was rejected and what would reopen it. `troubleshooting.md` is symptom-first.
`design/DECISIONS-PENDING.md` holds product questions that are deliberately **not** decided — do not
resolve one by calling your preferred side "the truthful one". `design/CURRENT-CAMPAIGN.md` says
which wave the work is in and goes stale between waves; `STATE.md` is history and carries a stamp
saying so. The bootstrap read above is what those two are not (problem `NSOa-cFZLg66`).

**This file is generated onward, so edit it and not its copies.** `AGENTS.md` is written from this
file, the chapters and four sections of the Mole Office skill by `src/worker/rules.ts`, so Codex and
OpenCode read what Claude Code reads. Never edit `AGENTS.md`. A test fails within 512 bytes of the
32,768 at which Codex silently drops a project document.

## The chapters

**The rest of the rules are the office regulations, in chapters: read one when your work touches it.**
Each chapter is a record in Mole Office and that record is the only authority. `src/config/rules/CODE.md`
is generated from those records and is the whole of them in one file; read the chapter you need there, and
read it before you do the thing rather than after. Adding, deleting or changing a rule is the
person's decision; the words under a rule may be rewritten by any agent.

<!-- chapters:start -->

- **The live server and database** — The office's own server belongs to the owner. Read this before you start, stop or migrate anything that serves them.
- **Processes and ports** — Stop a process only by the group id you recorded. Read this before you start anything that outlives your command.
- **Worktrees and the owner's home** — Nothing an agent makes goes into the owner's home directory. Read this before you make a worktree or a scratch file.
- **Records and warrants** — How a write into Mole Office is addressed, shaped and attributed. Read this before you file or change a record.
- **Tests and gates** — A test is proved by mutation, after a control run. Read this before you add a test or change a criterion.
- **Screens** — Name a thing by what it is to the reader. Read this before you change a page.
- **The chat and messages** — Who may write to a person, and how to lead somebody to a page. Read this before you send a message.
- **Identity and governance** — Which acts are the person's, and what an agent may never claim to be. Read this before any governance write.
- **Toolchain and context** — The exit code and the log file. Read this before you run a command whose output you will report.
- **Writing for a person** — Plain language, and where finished writing for the owner is published. Read this before you write anything a person reads.

Chapters 11, 12, 13, 14 are role chapters; your card names yours.

<!-- chapters:end -->
