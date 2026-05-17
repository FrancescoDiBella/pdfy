# PDFy Studio

PDFy Studio is a powerful, local-first web application that provides a comprehensive suite of tools for managing and editing PDF documents. Built with modern web technologies, it features a premium glassmorphic UI and ensures that your files never leave your device.

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
- **Styling**: Material UI (`@mui/material`) configured with a custom, premium dark-mode theme featuring modern gradients and glassmorphic overlays.
- **PDF Rendering**: `react-pdf` is used to accurately render PDF pages to the DOM.
- **PDF Manipulation**: `pdf-lib` handles the heavy lifting of parsing, modifying, and generating the raw PDF binaries.
- **Visual Editing**: `react-rnd` provides the interactive drag-and-drop overlay mechanics.

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository (or extract the source files):
   ```bash
   git clone https://github.com/FrancescoDiBella/pdfy.git
   cd pdfy
   ```

2. Install the dependencies:
   ```bash
   npm install
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

## 🛣️ Roadmap

- [ ] Support for multi-page editing in the Advanced Editor.
- [ ] PWA (Progressive Web App) integration for native-like offline desktop installation.
- [x] Free-hand drawing and annotation tools.
- [ ] Drag-and-drop file reordering in the PDF Merger tool.

## 📄 License

This project is open-source and available under the MIT License.
