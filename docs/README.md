# Mole Office documentation

The [README](../README.md) says what Mole Office is. These pages say how it works, organised by the
question you came with. Nothing here is a tour: read the page that answers your question and stop.

## Start here

| You want to know | Read |
|---|---|
| What the words mean — Office, module, block, pipeline, project | [concepts.md](concepts.md) |
| How a project is stored, and what a write is allowed to leave out | [project-model.md](project-model.md) |
| What the system is made of, and where each part lives | [architecture.md](architecture.md) |
| How an agent reads the schema and writes a record | [agents.md](agents.md) |
| Who is working right now, and what happens when nobody is | [lifecycle.md](lifecycle.md) |
| How a finished run is checked, released and confirmed | [the-check.md](the-check.md) |
| How released work reaches the main branch | [the-merge-queue.md](the-merge-queue.md) |
| How comments are collected and sent to agents | [review.md](review.md) |
| How a report asks the person a question, and how the agent reads the answer | [questions-in-reports.md](questions-in-reports.md) |
| Which acts belong to the person, and what an agent gets instead | [governance.md](governance.md) |
| Plans, hours, and what somebody wrote about time | [planning.md](planning.md) |
| How project meaning is joined to code | [implementation-map.md](implementation-map.md) |
| How to hand a worker exactly the context it needs | [context-bundles.md](context-bundles.md) |
| How something deliberately unresolved is kept unresolved | [placeholders.md](placeholders.md) |
| Reaching it from a laptop or a tablet | [remote-access.md](remote-access.md) |
| Running it, the commands, and the traps that cost time | [development.md](development.md) |
| Building, signing and notarising the Mac app on an Apple silicon Mac, in Chinese | [build-on-a-mac.zh.md](build-on-a-mac.zh.md) |
| Letting Codex on a Mac join the office as an agent over a private network, in Chinese | [a-mac-agent-joins.zh.md](a-mac-agent-joins.zh.md) |
| Installing the closed beta, led by the person's own terminal AI | [beta/for-your-ai.md](beta/for-your-ai.md) |
| How the README's claims were checked, and how to check them again | [verification.md](verification.md) |
| The images, and what a favicon still needs | [brand.md](brand.md) |
| Why parts of this repository still say PanelX | [the-name.md](the-name.md) |

## Two things to know before you read any of it

**The product is called Mole Office, and it was called PanelX until 28 August 2026.** The code
carries the new name: error messages, HTTP headers, settings, the browser tab and the rail all say
Mole Office. Where a page here quotes something dated — a transcript, a measurement, a header
somebody really sent — it quotes it as it was on the day. [the-name.md](the-name.md) lists
everything that still says PanelX and why each one does.

**The schema is served, never restated.** No page here lists the fields of a record kind. `GET
/api/kinds` serves them from the same declaration that enforces a write, so the two cannot drift
apart. A document that copied them could.

## Where the deeper material lives

Some of what these pages summarise has a longer source in the repository, and the longer source is
the one to trust when they disagree:

- `explore.md` — every design decision, including the rejected ones, and what would reopen each.
- `troubleshooting.md` — problems hit while building, symptom first.
- `design/` — the campaign records, audits and reports, round by round. Historical, and dated.
- `design/DECISIONS-PENDING.md` — the product questions deliberately not answered yet.

## The two READMEs

`README.md` at the repository root is the English landing page and is the default. Translations live
in `readme/`, one file per language, named `README_<language>.md`:

```
README.md              default, English
readme/README_zh.md    Chinese
```

Each file carries a one-line switch near the top that names every language and links to the others.
Adding a third language means adding one file and one link per existing file. There is no build
step, no template and no localisation tooling, because two files do not need any — and the switch
line is short enough that keeping it right by hand is the cheapest correct option.

Both versions must agree on the product thesis, the capability status, the installation path and the
current maturity. They translate meaning, not sentence length: a Chinese sentence that reads
naturally is right even when it is nothing like the English one word for word.
