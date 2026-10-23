# PDFy Studio

PDFy Studio is a powerful, local-first web application that provides a comprehensive suite of tools for managing and editing PDF documents. It processes PDF files on your device and provides a responsive workspace for choosing tools and downloading results.

## ✨ Features

- 📄 **PDF Viewer**: Smoothly render and view PDF documents with built-in zoom controls.
- 🔗 **PDF Merger**: Easily combine multiple PDF files into a single contiguous document.
- ✂️ **PDF Splitter**: Visually select pages from a PDF and extract them into a new file.
- 📝 **Form Filler**: Automatically detect interactive form fields and fill them out in a convenient sidebar.
- 🖌️ **Advanced Visual Editor**:
  - Create completely blank PDFs from scratch.
  - Add customizable text boxes, interactive shapes (rectangles), and images.
  - Drag, drop, and resize elements anywhere on the PDF page.
  - Seamlessly export your creations into standard PDF files.
- 🔒 **Privacy-First (100% Local)**: Unlike many online PDF tools, PDFy Studio processes everything client-side in your browser. No files are ever uploaded to a remote server.

## 🛠️ Tech Stack

- **Framework**: React + Vite + TypeScript for a blazing fast development and build experience.
- **Styling**: Material UI (`@mui/material`) with system/light/dark appearance for the workspace, Reader, and Merger. The remaining tool panels retain their dark theme during the incremental redesign.
- **PDF Rendering**: `react-pdf` is used to accurately render PDF pages to the DOM.
- **PDF Manipulation**: `pdf-lib` handles the heavy lifting of parsing, modifying, and generating the raw PDF binaries.
- **Visual Editing**: `react-rnd` provides the interactive drag-and-drop overlay mechanics.

## 🚀 Getting Started

### Prerequisites
Use [Node.js](https://nodejs.org/) 22.18+ (Node 24 LTS recommended). The regression tests use Node's built-in TypeScript support.

### Installation

1. Clone the repository (or extract the source files):
   ```bash
   git clone https://github.com/FrancescoDiBella/pdfy.git
   cd pdfy
   ```

2. Install the dependencies:
   ```bash
   npm ci
   ```

### Running the App Locally

To start the development server, run:
```bash
npm run dev
```
Then, open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173`).

### Building for Production

To create an optimized production build:
```bash
npm run build
```
The compiled static assets will be output to the `dist` directory, ready to be deployed to any static web host.

### Regression Checks

```bash
npm test
npm run build
npm run test:pwa
npx playwright install chromium
npm run test:e2e
```

Browser tests run against the production preview. Run `npm run lint` for repository-wide linting; the existing lint cleanup is tracked in [#6](https://github.com/FrancescoDiBella/pdfy/issues/6).

### Workspace and Appearance

Use the sidebar on desktop or **Open tools menu** on smaller screens. **Appearance** follows your system by default and remembers an explicit Light or Dark choice. The menu, Reader, and Merger support both appearances.

Switching tools preserves their current work in this tab. Opening another PDF in Read does not overwrite other tools. Sending a document from Read to an existing Edit or Organize session asks before replacing it. Download your work before closing or reloading; files and edits are not persisted.

See the [redesign scope, flow inventory, and review guide](docs/ui-redesign.md) for current boundaries and remaining accessibility/usability validation.

### Installation and Offline Use

Open the production site over HTTPS (or localhost for testing) and wait for **“PDFy is ready for offline use”**. You can then reopen it without a connection. Supporting browsers offer **Install app** or **Add to Home Screen** in their own menus; the wording and availability depend on the browser and operating system.

The application shell, PDF worker, standard PDF fonts, CMaps and image decoders are cached locally. PDF viewing, merging, splitting and editing with standard fonts can run offline. The interface uses local system font fallbacks instead of downloading web fonts at startup. Optional custom editor fonts still request external resources and can fall back to standard fonts when unavailable; exact custom-font appearance is not guaranteed offline.

Imported files, exported PDFs and edits remain in memory and are **not** saved by the service worker. Export your work before closing or reloading. Browser storage eviction or clearing site data requires another online visit before offline use is available again.

When a new version is available, **Review update** explains the effect of reloading. **Cancel** or **Later** keeps the current session. **Reload and update** is explicit consent for that tab; other tabs do not reload automatically.

To test offline behavior locally:

```bash
npm run build
npm run preview
```

Wait for the offline-ready notification, switch the browser to offline, reload, then open a local PDF or merge two files. Inspect Application → Cache Storage to confirm only app assets are cached. Service workers are disabled for `npm run dev`. Deploy the complete `dist` directory, serve `sw.js` without a long-lived HTTP cache, and keep the site on the same origin/scope when updating. Subdirectory deployments can use Vite's `--base=/pdfy/` option.

## 🛣️ Roadmap

- [x] Support for rich PDF content editing not only adding thingss
- [x] Support for multi-page editing in the Advanced Editor (merged in [#2](https://github.com/FrancescoDiBella/pdfy/pull/2)).
- [x] PWA (Progressive Web App) integration for offline use and installation in supporting browsers ([#4](https://github.com/FrancescoDiBella/pdfy/issues/4)).
- [x] Free-hand drawing and annotation tools.
- [x] Drag-and-drop file reordering in the PDF Merger tool, with keyboard/touch alternatives and validated imports ([#3](https://github.com/FrancescoDiBella/pdfy/issues/3)).
- [ ] Simple, accessible UI/UX redesign: research, shared patterns and responsive layouts ([#5](https://github.com/FrancescoDiBella/pdfy/issues/5)).

## 📄 License

This project is open-source and available under the MIT License.

