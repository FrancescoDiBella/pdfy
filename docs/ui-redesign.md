# Workspace redesign

This is the first implementation increment of [#5](https://github.com/FrancescoDiBella/pdfy/issues/5). All new interface copy, code, comments, issues, and pull requests use English.

## Design direction

Keep the existing MUI stack and organize the interface around choosing files, working on them, and downloading results. Use one navigation, readable text, semantic colors, visible keyboard focus, and explicit primary actions. The desktop sidebar becomes a dismissible mobile drawer below 900 CSS pixels. Read and Merge use the same introduction component and system/light/dark appearance.

References informing these choices:

- [MUI color schemes](https://mui.com/material-ui/customization/dark-mode/): system preference, explicit appearance choices, and persistence.
- [GOV.UK file selection](https://design-system.service.gov.uk/components/file-upload/): clear file actions and recoverable feedback. PDFy says “Open” because processing is local.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): a safe initial action, keyboard dismissal, and focus restoration or movement to the next step.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): measurable accessibility requirements. Automated checks are not a conformance assessment.

These are project-specific design choices. They still need usability testing with representative users.

## Flow and state inventory

| Tool | Start | Work held in memory | Result | Error / replacement behavior |
| --- | --- | --- | --- | --- |
| Read | Open PDF or try a generated sample | File, page, view rotation, zoom, thumbnails | Read or send a source file to Edit/Organize | Invalid, empty, and encrypted files leave the previous document intact; rendering failures offer another file selection. |
| Merge | Add PDFs or try two samples | Independent file entries, order, download filename | Download a combined PDF | Invalid files are reported; valid files remain. Download failures retain the queue. |
| Edit | Open a PDF, sample, blank page, or reader handoff | Title, annotations, history, pages, drawing and text settings | Export edited PDF | Reader handoffs to an existing session require confirmation. Internal file replacement and responsive controls still need the next increment. |
| Organize | Open a PDF, sample, or reader handoff | Page order/rotation, watermark, numbering | Export organized PDF | Reader handoffs require confirmation. Internal replacement and settings layout need further work. |
| Split | Open a PDF or sample | File, page selection, range | Extract selected pages or separate files | Existing export feedback; file validation and consistent replacement behavior need further work. |
| Info | Open a PDF, sample, or initialize from Read | File, editable metadata | Download updated or sanitized PDF | Existing parsing/export feedback; consistent replacement handling needs further work. |

## Session ownership

Each tool mounts on first use and remains mounted while hidden. Its input file is a snapshot, so opening a different file in Read does not silently reset another tool. Ordinary navigation resumes the existing tool. Explicit Read → Edit/Organize handoffs ask before replacing a previously visited session, even when the source filename matches. Confirming resets only that tool; cancelling restores focus to the initiating action.

Hidden sections use the HTML `hidden` attribute and are excluded from keyboard navigation and the accessibility tree. The editor's global keyboard shortcuts are inactive outside Edit. Closing or reloading still clears all in-memory work; the existing PWA update confirmation remains in place. PDF data is not written to local storage. Only the appearance preference is persisted by MUI.

Retaining sessions increases memory usage for large documents. There is no automatic eviction because it could discard work. A future explicit session-close action should explain which work will be lost.

## Current boundaries

- This increment redesigns the workspace, Read, and Merge. Edit, Organize, Split, and Info retain their existing dark tool panels until their layouts and colors are migrated together.
- This is not a promise that every legacy control is responsive or accessible. In particular, the editor still needs compact toolbars and adaptive side panels.
- Merging preserves the existing PDF ordering and validation logic. Reader zoom/rotation change the preview only.
- Downloads report that a download started; the browser controls the final save destination.

## Review and validation

Automated Chromium coverage includes keyboard navigation and dialog focus, session preservation, inactive editor shortcuts, reader error recovery, thumbnail navigation, appearance persistence, and light/dark Read/Merge screens at 320 and 1280 CSS pixels. axe checks WCAG A/AA tags, including contrast, on the empty Read and populated Merge screens. Existing PDF-ordering and offline/update tests remain part of CI.

CI uploads `browser-test-results-and-screenshots`, including Read/Merge screenshots in both appearances and widths. Download this artifact from the workflow run for visual review. Screenshots are not pixel-diff baselines.

Still required before closing #5:

- Extend the shared patterns and semantic colors to all remaining tools.
- Test 200% browser zoom, touch behavior, and supported browsers manually.
- Complete a screen reader audit and address remaining keyboard/dragging alternatives.
- Run the proposed five-person usability study and record actual task completion, errors, and hesitation.
