# Three check sessions as the office answered them

Each file is part of a real reply of `GET /api/records/<id>` for a check's session record. Wave 13n's round AD read these
replies for item 3 (report cDSA0kLEOp9a), and its copies are dated 26 October 2026, 22:22. Item 3p5 of wave 13n's round AJ
cut them down to what tests/a-crashed-check-says-why.test.ts reads:

- `changes`, each with only `op`, `field`, `oldValue`, `newValue`, `at` and `appendOrder`, newest first as the office gives them;
- `changesCarried`, as the office gave it.

Everything else in the reply was left out. One thing in the values was changed: the home folder at the start of each path
is written as `~`, as the office's masking writes it, so the copy names nobody's home. Nothing else was changed.

- `crashed-before-the-first-process-row.json`: check 0aEkyxtFx9pE, of 25 October 2026, 01:03 to 01:04. It crashed with only the
  inspector sandbox's container row.
- `crashed-after-the-checkout.json`: check HzGAjPq7GYvP, of 25 October 2026, 08:57 to 08:58. Its checkout command's row was
  made and released, and no other command ran.
- `finished-after-the-model.json`: check znWMMsOaTBTi, of 24 October 2026, 22:20 to 22:31. It did not crash: it finished, after
  its checkout, its try of the view and its model (OpenCode). The test reads it as a check that ends after the model.

The test makes two more stages from these by leaving out the newest changes, and says so where it does it: during the
checkout, from the second file, and during the model, from the third.
