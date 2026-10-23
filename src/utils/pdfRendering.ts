// One stable options object for every viewer, including direct PDF.js text parsing.
// These resources ship with the app and are precached for offline use.
const resourceBase = `${import.meta.env.BASE_URL}pdfjs/`;

export const pdfDocumentOptions = {
  cMapUrl: `${resourceBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${resourceBase}standard_fonts/`,
  wasmUrl: `${resourceBase}wasm/`,
};
