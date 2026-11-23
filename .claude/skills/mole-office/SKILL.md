---
name: mole-office
description: Record research work in Mole Office, the local tracker for work done with AI agents. Use when a piece of work finishes, a measurement is taken, something blocks you, a fix is owed but not made, a line of exploration is dropped, you reach a fork that is not yours to decide, or you start anything that outlives the command — a server, a training run, a container, anything holding a port or a GPU — and when deciding whether something belongs in Mole Office at all. Also use at the start of a run, to file the session unless the hook did, and say which piece of work it belongs to, because nothing else will say it for you. Teaches what to record and when, how to file a record before you know everything about it, how to propose a choice you may not make, and how to read back where your work landed; the running API supplies the field shapes.
---

# Mole Office

Mole Office is a tracker for research done with AI agents, served over HTTP on this machine at the
address in `MOLE_OFFICE_API`, or `MOLE_OFFICE_PORT` on loopback if only that is set. What makes it
worth writing to is where the state ends up: in the application, not in this conversation. A
compaction, a crash or a change of model does not lose it, and the next agent can read what
happened and carry on. Your code and data stay where they are; Mole Office
holds the small linked layer saying what they mean and who needs them. **Writing meant for a person
to read is the exception: that goes inside Mole Office itself.**

**This is the core: what a run needs before its first write.** Everything else is in
`reference.md`, beside this file, read on demand.

## Non-negotiable operating rules

Mole Office prefers an explicit failure, unknown, incomplete or unverified state over a convenient
result whose provenance or method is false. Record what you observed, never a plausible
reconstruction. If the method you were asked to run did not run, say that rather than reporting a
different method's result. If you used a fallback, record that you used it. Never file example,
synthetic or placeholder content as a real observation. Leave a field unknown or incomplete when
reality is unknown. Keep a disagreement: file both findings and link them. You propose; the person
decides. Do not file records to make Mole Office look populated. If you cannot tell whether a
substitution changed what your result means, stop and report it rather than filing it.

1. **Never print, `echo` or `cat` a key**, your key file, the `key.ask-secret` file or your headers
   file. Never put a key on a command line, in a `.env` file or in a message. Read it from the file
   the registration tool wrote, into a request header only. Never copy those files out of your
   notes folder. Never print your environment or search it for keys (`env`, `printenv`, `set`,
   `export -p` and the like): it can hold keys. To see whether a variable is set, test it without
   printing its value.
2. **Talk to the person, and title and write records, in the language they write to you in.** Field
   names and fixed values stay as the office spells them.
3. **When the session hook printed a session record for this conversation, use it and file no
   second one.** If your key gets 403 on its id, write your headers file again without
   `x-mole-office-session`.

## Write in plain language. This is a rule, not a preference.

Everything you write here is read by a person, often months later, often in a hurry. Chapter 10
rule 1 has the six rules in full: one idea per sentence, the conclusion first, the plain word, no
metaphors, define an invented term the first time you use it, and never compress by deleting words
— a short plain sentence beats a short clever one, and both beat a long one.

When you name a record in a report, a message or a checklist, write it as a link with its short
name: `[short name](#/r/<id>)`. Mole Office also links a bare id it knows, with its short name. An
id it does not know stays plain text.

## Shapes come from the API, never from this skill

No record field name and no worked record example is written here. A schema copied into a document
goes stale and gets trusted anyway.

- `GET /api` — the endpoints, each with a line saying what it is for and what its reply carries.
- `GET /api/kinds` — every kind: what it is for, when to record it, the fields it takes, which it
  needs to be complete, what each means, the rules spanning more than one field, and a worked
  example. **Read it before choosing a kind.** The link vocabulary comes with it, as `linkTypes`.
- `GET /api/kinds/<kind>` — one kind, plus the nested shapes its fields mention.

**The schema that answers you is the same schema that checks your write.** Build a record from that
answer and it is accepted; invent a key and the write is refused with a 400 naming the key you
sent.

**Four vocabularies are copied into these two files anyway**: the actor types and the header names
under *How to start*, and the link types and the two provenance words in `reference.md`.
The office's tests pin all four against the server's own declarations.

## Which project you are writing into

**One installation holds several isolated projects, and every record, link, change and session
belongs to exactly one.** A project boundary is not a user or an access rule. Say which project you
are in with `x-mole-office-workspace`, on every request, reads as well as writes: a read is an
answer *about* a project, so a request naming the wrong one looks entirely normal on arrival.
Present-and-blank is refused, and an id naming no project is refused rather than created.

**A request that names none is answered from a default.** That default is a value to read, not one
to assume: read it once at the start of your run, because it is where every unstated write you have
already made has been landing.

**A title resolves inside the project you are in and nowhere else**, and a link across two projects
is refused, naming both records and both projects. If you cannot tell which project a write belongs
in, stop and report it rather than guessing.

## How to start: register yourself, and keep your key

**A session a person started registers itself in one request.** Run this before your first write:

```
node <for-agents>/register-myself.mjs --handle <handle> --name "<name>" --dir "<the directory you started in>" --key-file "<a new file in your notes folder>"
```

`<for-agents>` is `for-agents/` in a checkout. Installed, `GET /api/onboarding` names it and its Node
(`forAgents`).

`POST /api/agents/register-myself` is the same act. It files your agent record, your session
record, your worker card and your key; a card above worker is a request on the person's screen.
The reply carries the headers to send on every later request, and the key **once, and once only**.

**A durable agent may record the folder its sessions start in**: `--start-folder <absolute path>`,
never `--dir`. The hook names that agent for a session started in exactly that folder when neither
that session's environment nor a `.env` does, while it is the only live agent registered there and is
not answering in another live session.

**A new registration with no key waits for the person's press;** ask again after it, and the tool
writes the key to your `--key-file` without printing it. Send it as `x-mole-office-key`. Lost it: see *A lost key* in `reference.md`.

**Send these headers on every request, reads as well as writes:**

- `x-mole-office-workspace` — which project, on reads as well as writes.
- `x-mole-office-actor-type` — `human`, `agent` or `system`. You are `agent`.
- `x-mole-office-actor-id` — which agent you are, precisely enough to recognise in a month.
- `x-mole-office-session` — the session record for this run, once you have one.

A blank header value, a word outside the actor types, and a misspelled header name are all refused,
and the refusal prints every name Mole Office reads. Sending no attribution and no key is never what
you want. Such a write is refused, unless the person's key window is open and it comes from this
computer's own programs, never a sandbox, or from a machine the office trusts; then it is filed as
the person. Chapter 4, rule 1 gives every case.

**Mole Office cannot tell the person from a program on the person's machine that sends the person's name. A governance act asked in the person's name is taken at its word. Do not ask in the person's name.**

## Register anything that outlives the command

**Anything still running after its command returns is on no list until you register it**: a server,
a training run, a container, a watcher, anything holding a port, a GPU or a lock file. Register it
before you do anything else with it, against this run's session record, with its pid when you have
one; `GET /api` names the endpoint. An agent that is compacted, killed, or crashes mid-response
never reaches the tidy-up step. A cleanup rule needs you alive; a registration does not. When you
stop the thing, release its registration. If you are leaving it running on purpose, say so on the
session record. Chapter 2 rule 2 says why.

## Decide what you can, and report after

**Decide what you can, and record it:** a `decision` under your own handle, with an `authority` and
a `because`. Your superior reviews it in your next report. Depart the same way from a decision that
does not fit the facts: link it with `about` and report at once. Five kinds stay the
person's (direction and design, the person's rules and numbers, publishing, money and accounts,
deleting): file a `proposal` first. A `regulation` is revoked by the person, or by a secretary
carrying the person's written words for it. Chapter 4 rule 4 says it.

**When a brief, a criterion or a person's words can be read two ways and the readings would lead to different work, take the most reasonable reading and say so.**
Record it as your own decision. Ask up your chain first only on one of the five kinds, or when a
wrong reading could not be undone. Chapter 7 rule 3 says it.

**Three other acts look like deciding, and each is allowed to somebody:** recording a decision the
person made in words, acting for the person, and being raised for a while. Who may do which is one
table: `GET /api/kinds/decision` serves its words, a checkout has it at
`<checkout>/src/shared/governance-acts.ts`, and chapter 4 rule 4 and chapter 8 rule 4 say it. If the
decision is the person's and none of the three fits, file a proposal (see `reference.md`). The
warrant's shape, the four places it may cite, and which writes take one are chapter 4 rule 5.

## When somebody asks you to take them to a page

**A message's lead is only for a report written for the reader or a page where they must act; for
anything else, put a plain link in the body.** A lead is a field called `lead` beside the body of a
`message` record sent by `POST /api/records`; its shape is in `GET /api/kinds`, under the message kind.
Name the record in your words too. Chapter 7 rule 2 says the rest.

## How a message is handed to you

Every hand-over puts the same three lines before the message: `WHO SENT IT: <who wrote it>`,
`IN PROJECT: <the project it is filed in>`, `THE MESSAGE, record <its id>:`. They are one
declaration, `deliveryEnvelope`; a bridge copies them and adds nothing.

## What is in the reference, and how to read it

- **The write loop, in full** — validation failures, titles, the two link queries, picking up work
  already in flight, registering what you start, and the proposal path.
- **Say which piece of work each request belongs to** and **Say which work your run belongs to** —
  the trace and purpose headers, and how an unplaced run gets filed under a pipeline or module.
- **Links** — the full table of what stores as what; which type may carry a gate.
- **If you are on another machine** and **The cold start, in full**.
- **What not to do**.

A trigger is at `GET /api/kinds`, kind by kind. A rule a chapter carries is stated in full only in
the chapter; here and in `reference.md` it is a short version or a pointer, beside the API mechanics.
`GET /api/office-regulations` holds your office's chapters from its records, the only authority.
