# Review

How comments are collected on real things, and how they reach an agent.

## Review mode collects, and sends nothing

Turn review mode on and comment on whatever you are reading: a record, a plan line, a row in a list,
or a span of words you select inside prose. Every commented object shows a mark. Comments are stored
on the server as they are written, so a reload cannot lose them.

Nothing is sent while you are commenting. The comments reach their agents only when the review is
sent.

## Sending a review gives each agent one message

A review that comments on three people's work reaches three agents and is still one act. Each agent
is given one message from the person. It holds every comment that went to that agent, numbered 1, 2,
3 in the order they were written, and keeps each comment's quote in the same order. The agent can
answer by number. A review is handed over this way.

- **The person's chat with that agent shows the message as the person's**, the same way after a
  reload. The chat shows what the agent was given.
- **Each comment stays its own record**, so what became of each point can be followed one by one. A
  comment is not handed over on its own. The message is what hands it over, so nothing goes twice.
- **A sent review starts no run.** Until wave 13u round 19 it queued one run for each agent, and
  nothing in the office picked those runs up. A migration set the ones still waiting to `withdrawn`,
  with the reason, and revoked their keys (src/server/db/withdraw-review-runs-migration.ts).

Read on this project's corpus on 27 August 2026: two reviews — one finished collecting and was sent,
one is still collecting — one conversation, one queued run, and seven comments written of which
seven are in no review. That last number is what the product answers when asked; it is not an error,
it is what the corpus holds.

## The agent that answers writes as an agent

It is refused a decision exactly as any agent is, so a comment asking it to settle something
produces a proposal rather than a governance act taken in somebody else's name. Measured, not
assumed.

## What a review remembers

- What each comment pointed at, and the words it quoted.
- Who each comment went to, and why that recipient.
- What the membership was when collecting finished, written down and frozen.
- Which of its comments were sent, and when. The message each agent was given is a message record of
  its own, from the person. The review does not hold that message's id.

All of it survives an export and a restore. The restore proof compares it explicitly, including the
case where a review is still collecting — the null a careless restore fills in.

## What is not built

The continuation half. A review says what should change; picking that up as scoped work for the next
worker, without a person reassembling it, is designed and not finished.
