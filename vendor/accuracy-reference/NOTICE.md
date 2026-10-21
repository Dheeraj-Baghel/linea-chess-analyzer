# Accuracy reference provenance and licensing

Accuracy v2 adapts the deterministic scoring and aggregation algorithm from:

- [lila AccuracyPercent.scala](https://github.com/lichess-org/lila/blob/ea60d3bc7e9997f8f182d9dc3f3d468a036df20a/modules/analyse/src/main/AccuracyPercent.scala)
  at `ea60d3bc7e9997f8f182d9dc3f3d468a036df20a`, copyright the lila authors,
  **AGPL-3.0-or-later**, retained [license](LICENSE-AGPL-3.0.txt).
- [scalalib Maths.scala](https://github.com/lichess-org/scalalib/blob/31fc151b931ca65d9c59bf24b6084e0a49408fbe/lila/src/main/scala/Maths.scala)
  at `31fc151b931ca65d9c59bf24b6084e0a49408fbe`, retained [MIT license](LICENSE-scalalib.txt).
- [scalachess eval.scala](https://github.com/lichess-org/scalachess/blob/11ac4c5a2b8a852e0e3c4a7c0c5ae0904aa40025/core/src/main/scala/eval.scala)
  at `11ac4c5a2b8a852e0e3c4a7c0c5ae0904aa40025`, retained [MIT license](LICENSE-scalachess.txt).

Unmodified reference sources are archived here, with exact URLs and SHA-256 in
[provenance](provenance.json). JavaScript adaptation is in
[accuracy.js](../../src/accuracy.js), with attribution and AGPL license identification.
The reference's +1 uncertainty bonus and max(1, accuracy) harmonic denominator
are retained. These details are not fully described by the public article.

Linea-specific changes: an actually evaluated initial position, actual recorded
mover colors, missing/provisional coverage, and separately evidenced root-recheck
losses. The classifier, engine search policy and experimental rating heuristic
are Linea's own models, not Lichess/Chess.com classifications or account ratings.

No public deployment or redistribution occurred in this task. Before publishing
this combined application, review and satisfy applicable AGPL/GPL corresponding-
source and network-use requirements; retaining links alone is not asserted to
satisfy all obligations. Do not describe this adaptation as proprietary scoring.
