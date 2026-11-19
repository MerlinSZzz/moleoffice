# Questions in a report

How an agent asks the person something inside a report, and how it reads the answers.

A report can hold three kinds of question: a **choice**, a **fill-in box** and a **button**. The
person answers in the report itself and presses one submit for the whole report. The agent then gets
one message with the answers. Nobody has to copy the answers by hand. This is the person's own
design, recorded as their decisions in the project.

The shapes are served, never restated: `GET /api/kinds/report` serves `ChoiceBlock`, `FillInBlock`,
`ButtonBlock`, `BoxBlock` and the report's `answers` field from the declaration that checks every
write. This page shows how they fit together.

## The four blocks

- **A choice** asks a question with two to four options. The person chooses one, or several when
  `many` is true. Mark the option you recommend with `recommended`. The page always offers the person
  a box for their own words as well.
- **A fill-in box** asks for words. `asks` is the sentence saying what to write; `lines` is `one` or
  `many`, how tall the box starts: `one` for a short answer, `many` for a longer one. `boxWidth` is how wide the answer box is: `narrow` (as narrow as the choices, for a short
  answer) or `wide` (the whole column). Left out, a one-line box is narrow and a box of several lines
  is wide. Choose it for the answer you expect.
- **The person's own words take line breaks**, beside a choice and in every fill-in box. Enter makes a
  new line and sends nothing, and the box grows as they write. The line breaks are kept as written:
  in the `answers` field, in the decision a choice is recorded as, and in the message you receive.
- **A button** is one press that takes effect. The page asks once more (`confirm`) and then sends the
  press at once, on its own.
- **A box** groups choices and fill-in boxes under one title. It has no submit of its own, so give
  the box a `title` that says what its questions are about. A box written with `submitLabel` is
  refused.

A report is answered with one press. The page draws one submit for the whole report, straight after
the last choice or fill-in box, or after the box that holds it. That submit sends every answer not
sent yet, inside boxes and outside them. This is because one submit for each box
was too many presses for people and agents alike.

## The rules a write must follow

- A block sits in one box only. A box inside a box is refused when the report is written, and so is
  a button inside a box, because a button is sent by its own press.
- Every submit sends only what has not been sent yet. An agent never receives the same answer twice.
- Questions belong in a report. A module's summary that holds one is refused.
- `to` on a box or a button names the agent its answers go to, by handle or id. Left out, they go
  to the agent that wrote the report. A write that names no registered agent is refused.
- `about` on a choice names the proposal or the decision the question is about, by id. A write
  that names no proposal or decision of the project is refused.

## An example

An agent writing a report for the person, in a made-up project about a pottery studio:

```json
{
  "kind": "report",
  "title": "The spring kiln: three questions for you",
  "data": {
    "for": "The person who runs the studio",
    "date": "2026-10-02",
    "blocks": [
      { "id": "b-1", "type": "text", "text": "The kiln is ready for the spring batch. Three things are yours to decide." },
      {
        "id": "box-glaze",
        "type": "box",
        "title": "The glaze",
        "blocks": [
          {
            "id": "q-glaze",
            "type": "choice",
            "question": "Which glaze should the spring batch use?",
            "about": "Xq3vB7yT2kLm",
            "options": [
              { "id": "a", "label": "Celadon, as last spring", "recommended": true },
              { "id": "b", "label": "Tenmoku" },
              { "id": "c", "label": "Half of each" }
            ]
          },
          { "id": "q-shelf", "type": "fillin", "asks": "Which shelf should the test tiles go on?" }
        ]
      },
      { "id": "q-note", "type": "fillin", "asks": "Anything the glazer should know?", "lines": "many" },
      { "id": "q-fire", "type": "button", "label": "Fire the kiln tonight", "confirm": "Fire the kiln tonight at 22:00?" }
    ]
  }
}
```

Here `Xq3vB7yT2kLm` stands for a proposal the agent filed earlier about the glaze: put the id of
your own proposal there. When the person answers the choice, the answer settles that proposal. The
box names no agent, so its answers go to the agent that wrote the report.

## What happens when the person presses the submit

- Only the person may answer. The doors read who is pressing, the same way the review column's send
  does. An agent's press is refused, and the refusal says who may answer.
- Each answer is shown under its question: who answered, when, and what. A sent answer is shown
  as words, not as an input, until the person presses "Change this answer".
- A line at the top of the report counts its choices and fill-in boxes: how many are not answered,
  and how many have answers not sent yet. A button is not counted.
- Each answer to a choice is recorded at once as the person's decision, in their words, linked to
  the report. When `about` names a proposal, that decision settles it. When it names a decision, the
  new one replaces it.
- One message goes to each agent named, with the answers and a lead back to the report. The message
  is written through the message door, so the agent's waiter wakes.
- The person may change an answer after sending it. The changed answer is sent again in a new
  message. For a choice, a new decision replaces the earlier one. The earlier answer stays in the
  report's history.
- Until the submit is pressed, the person's answers are kept as a draft on the report. The person can
  answer part of a report and come back later.

## How the agent reads the answers

1. Wait the usual way: `GET /api/handles/<your handle>/waiting?wait=30` holds the answer open until a
   message arrives for you.
2. The message's body lists each answer: the question and its block id, the options chosen with
   their ids, the person's own words, and the decision a choice was recorded as. Its `lead` names the
   report. For the example above, when only the glaze has an answer, the submit sends a
   body like this:

   ```
   The person answered questions in the report "The spring kiln: three questions" (record <id>).

   1. Which glaze should the spring batch use? (block q-glaze)
      Chosen: Celadon, as last spring (option a).
      Recorded as the person's decision <id>.

   These answers are also in the report's answers field, under each question's block id.
   ```

   A button's line reads `Button "<label>" (block <id>): pressed.`
3. The report's `answers` field holds the same answers, one entry per block id. `sent` is the answer
   last sent, with who sent it, when, to which agent, in which message, and the decision. `draft` is
   an answer the person has kept and not sent yet; it has not been sent to you, so do not act on it.
4. Act on what was answered. A decision the person made in the report is theirs: do not ask it again
   in words.
