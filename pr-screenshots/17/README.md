# PR #17 UI evidence

These 29 PNGs are an unmodified subset of the verified screenshot artifact from [successful CI run 40085141024](https://github.com/FrancescoDiBella/pdfy/actions/runs/40085141024).

- Before: isolated build of exact PR base `cfd77f9cfb56663b431d8ba42f51db73184f0211`, using that revision's lockfile.
- After: exact reviewed and tested application head `f3737f9b11e71da154b12b8e2ed7e119d8b90fa5`.
- Editor, Tools and Selection comparisons: 320×900 and 1280×900 CSS px in light/dark appearance, using the same Sample Invoice fixture and interaction state.
- Additional states: first-touch moved text (390×844), page-edge selection (320×568), phone Properties/Signature (390×844) and phone landscape (844×390).
- `evidence.json` records artifact provenance, image dimensions, byte lengths, SHA-256 and Git blob hashes. The downloaded artifact digest and every uploaded blob hash were verified.

The images are stored on a dedicated evidence branch outside the application PR diff. PR embeds use this commit's immutable raw URLs; they do not depend on the seven-day CI artifact retention period.

These are automated Chromium captures. They do not establish physical Chrome Android/Safari, OS keyboard, screen-reader or accessibility conformance. See the application interaction guide and issues #5/#10 for remaining manual validation.
