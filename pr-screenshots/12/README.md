# PR #12 screenshot evidence

Before: application commit `4a58b02c1dec11e860c0a59885c1c6de97f86869`, CI run https://github.com/FrancescoDiBella/pdfy/actions/runs/40030210189.

After: application commit `de9a288b95346b0c5643f0a38b5bc0680ca1f7eb`, CI run https://github.com/FrancescoDiBella/pdfy/actions/runs/40030462917.

All documents are synthetic. Loaded-tool screenshots cover 320x900 and 1280x900 CSS pixels in light and dark appearance. Replacement dialogs use 1280x720. Before captures use the existing sample/short-filename fixtures; after captures exercise long filenames and selected pages. These illustrate UI states, not pixel-diff baselines.

The PNGs were copied unmodified from CI artifacts and verified against their Git blob hashes. This separate branch keeps screenshot files out of the application PR diff and provides durable immutable links.
