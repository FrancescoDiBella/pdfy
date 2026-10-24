# PR #15 mobile workspace visual evidence

Unedited Chromium screenshots from [successful CI run 40080091217](https://github.com/FrancescoDiBella/pdfy/actions/runs/40080091217), artifact 12554957375.

- Before: isolated production build of exact PR base `7592d9e617dbd87d7ee94f17928ef8360f25b76c`, installed with its own lockfile.
- After: PR head `f22f46e13ca2bf6da1035de94c45c1917caa6aca` in the CI merge build against that same base.
- Editor comparison: Sample Invoice. Organizer comparison: the four-page Operations Dossier. Matching viewports: 320×900 and 1280×900, in light and dark system appearance.
- Additional phone states: properties and ink signature at 390×844; editor at 844×390 landscape.
- Legacy Edit remains dark in both before appearance captures. That is intentional evidence of the prior behavior.
- CI passed 17 unit tests, 36 Chromium browser scenarios without flakiness, root/Pages PWA assets, Pages path checks and the Pages offline browser scenario.
- A separate adversarial agent reviewed the implementation and all after/phone screenshots. Physical Safari/PWA, mobile keyboard and screen-reader verification remain manual follow-up under #5.
- This evidence-only branch keeps PNGs outside the application PR diff. PR image links use this commit's immutable SHA, so the seven-day Actions artifact expiration does not remove them.

`evidence.json` records archive and image hashes. The downloaded archive SHA-256 and every uploaded PNG Git blob SHA were verified.
