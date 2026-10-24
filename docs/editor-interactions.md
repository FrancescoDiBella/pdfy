# Editor interaction redesign

Issue [#16](https://github.com/FrancescoDiBella/pdfy/issues/16) follows real phone feedback after #15. Fixed panels were removed, but compact layouts explicitly disabled dragging. This increment addresses the editing interaction and control hierarchy.

## Design choices

| Area | Decision | Reason |
| --- | --- | --- |
| Tool discovery | Material icons with visible labels in grouped tiles | Text, highlighting, shapes, images, signatures and source-text editing remain recognizable without memorizing glyphs. |
| Secondary actions | Familiar icons with accessible names and tooltips | Undo/redo, properties, duplicate and delete stay reachable without crowding a narrow toolbar. Edit and Resize have visible contextual labels. |
| Direct manipulation | Select, Pan and Draw are explicit modes | The page can scroll normally while annotation drags own their pointer input. |
| Small selections | Resize is an explicit toggle with a 44 px corner target | A resize handle must not cover a newly added item and turn its first drag into an accidental resize. |
| Precise edits | Normal text/geometry fields and nudge controls | Users have alternatives to dragging and can correct small movements. |
| Feedback | Stable contextual row for selection, hints and progress | Loading does not shift the page being edited. Selection actions appear beside a short item name. |
| Replacement | Validate first, then confirm | Invalid inputs and cancellation preserve the current PDF, history and edits. |

These are project-specific design judgments. Primary references are [MUI buttons](https://mui.com/material-ui/react-button/), [Pointer Events](https://www.w3.org/TR/pointerevents3/), [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action), and [WCAG dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements). They guide implementation; they do not establish accessibility conformance or user-study results.

## Working with a PDF

1. Open a PDF or choose **New blank PDF**. In **Tools**, choose a labelled tile. New items are placed in the visible portion of the page.
2. In **Select**, drag an item directly from its first touch. Choose **Edit** for text, colors, exact position/size, font and rotation. Choose **Resize** to reveal its corner handle. Images preserve their proportions by default, with an explicit switch to change that behavior.
3. Swipe blank page space to scroll. Choose **Pan** to scroll over items too; a mouse can grab and pan. **Draw** accepts finger, pen and mouse strokes. Choose **Select** or **Done** to leave drawing/source-text selection.
4. Use undo/redo and download the PDF. The document menu also offers a validated **Open another PDF** and **New blank document**, with confirmation before replacing work.

Closing Tools after adding or selecting an item returns focus to the canvas and brings the item into view. Closing ordinary settings returns focus to its trigger. The editor retains browser safe-area containment and visible-viewport sizing; panels scroll and have a fixed close action.

Portrait phones use two compact control rows. Wide desktop and phone-landscape viewports combine document controls into one row; landscape also puts canvas modes beside contextual actions to preserve more document height.

## Gesture and document behavior

Annotation movement/resizing uses a single captured primary pointer. Touch ownership is set before the gesture starts. Only annotation targets and drawing surfaces disable native touch manipulation; the document viewport retains native touch scrolling/pinch gestures.

Live geometry is separate from annotation history. Pointer release commits at most one change, using the final event coordinates. Pointer cancellation, lost capture, Escape, focus leaving the window, or a modal taking focus rolls back the live gesture. Secondary pointers and keyboard selection mutations cannot commit over an active gesture. Mode, page, zoom, viewport, visibility and document-operation changes cancel interaction frames; toolbar mutations are locked while a transform is active.

The geometry pipeline accounts for the displayed page aspect ratio, CropBox and standard page rotations. Preview and export use the same coordinate mapping. Drawing points scale with a resized frame. PNG/JPEG files are decoded before insertion, and unsupported/corrupt images report an error instead of becoming a silently missing export.

The reader preserves each page's native PDF rotation, including thumbnails. Its Rotate view action adds a viewing offset to that original orientation without modifying the file.

Source-text edits are overlays. Their original mask stays at the old position when the replacement moves; masks are rendered before overlays so a duplicate cannot erase an earlier annotation. Right-angle source orientations are preserved. Unsupported diagonal/skew text reports a clear limitation without changing the document. **Revert text edit** restores the original appearance. Visual covering does not remove the underlying original PDF text.

Annotation fonts use the three standard PDF families, with bold/italic variants, so their export does not depend on remote font downloads. Original PDF font resources remain in the document. These annotation fonts have limited character coverage; unsupported characters produce a recoverable export error. Text is clipped to its frame in both preview and export; resize the frame to show more lines.

## Verification and limits

The regression suite uses trusted Chromium CDP touch input for initial selection/movement, resize, zoomed/scrolled coordinates, native Pan, cancellation, pointer identity, one-step undo/redo and exported appearance. It also covers mouse panning, rotated source text, crop/rotation exports, editor replacement and small-screen edge selections. Unit checks inspect saved PDF text matrices and source-mask ordering, including small text and page rotations.

Populated tool panels and selections are captured at 320/1280 CSS px in light/dark appearance, with additional phone movement and edge-state screenshots. Before captures use an isolated build of the exact PR base and its lockfile; PR evidence is retained outside the application diff.

Chromium touch emulation does not verify physical Chrome Android or Safari, virtual-keyboard behavior, screen readers, every PDF font/layout or large-document performance. Those manual checks and broader usability testing remain under #5. Files and edits remain in memory; download them before closing or reloading.
