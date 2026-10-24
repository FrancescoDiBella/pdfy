# Mobile PDF workspace

Issue [#14](https://github.com/FrancescoDiBella/pdfy/issues/14) follows a real phone report: fixed editor sidebars and a single oversized toolbar hid the PDF. This increment makes the document the primary surface.

## Interaction model

- Edit opens with no panels covering the page. The preview fits the canvas width; fit mode follows resizing/orientation, while explicit zoom remains under the user's control. Scrolling stays inside the document viewport.
- The compact header keeps the document title, export, Tools, Properties, undo/redo and document actions reachable. Page navigation and fit/zoom controls stay in the bottom bar, with safe-area spacing.
- Tools and Properties open temporarily with named close buttons. Source text can be selected from Tools → Edit Text and edited in a normal text field. Position/size fields and nudge buttons provide alternatives to dragging; compact screens use selection targets instead of tiny drag handles.
- Drawings and signatures use captured pointer input. Secondary pointers cannot modify or finish the primary stroke. Cancelling a freehand stroke discards its temporary trace. Signature paper stays light independently of the interface appearance.
- Page deletion and clearing annotations require confirmation. Structural page updates lock pointer and keyboard edits until the byte and annotation snapshots are installed. Annotation history is updated atomically; page deletion resets that history because removed PDF pages cannot be restored by annotation Undo.
- Organize shows page previews and labelled move/rotate/copy/blank/delete actions. Watermark and numbering settings live in a closable panel. New files/samples are prepared before replacement confirmation; cancellation and invalid inputs preserve work.
- Panel height and editor height follow the visible viewport. Fields use readable text sizes and dialogs/panels scroll. The viewport retains browser-default safe-area containment instead of opting into edge-to-edge layout; supplemental inset spacing protects fixed controls. Session state lives outside the panels, so closing/reopening them retains work.

Safe-area containment follows [WebKit viewport guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/). The interaction patterns follow [MUI temporary drawers](https://mui.com/material-ui/react-drawer/) and [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events). These are project-specific interaction choices, to be checked with actual users.

## Verification

CI exercises populated editor/organizer states at 320 and 1280 CSS px in light/dark appearance, plus 390 px touch workflows and an 844×390 orientation change. It verifies text editing and exported text, geometry/undo/redo, source text, real CDP touch strokes, typed/ink signature exports, organizer page order/rotation, replacement preservation and delayed structural-operation locking. Automated axe checks cover the populated main surfaces.

Before screenshots come from an isolated build of the PR's exact base commit, using its own lockfile. After screenshots come from the PR build with matching sample documents and dimensions. CI artifacts are temporary; durable images are embedded in the PR before handoff.

Validation uses Chromium touch emulation. It does not establish physical iOS/Android keyboard behavior, Safari/Firefox compatibility, screen reader conformance, or performance on every device/document. The broader manual/usability work remains tracked in #5. Files and edits remain in memory and must be downloaded before reloading or closing.
