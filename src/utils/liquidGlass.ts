export type LiquidGlassPresetId = 'lg-pill' | 'lg-lens' | 'lg-orb' | 'lg-panel';

export interface LiquidGlassPreset {
  readonly id: LiquidGlassPresetId;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly bezel: number;
  readonly scale: number;
  readonly ior: number;
  readonly chromaticDispersion: boolean;
  readonly dispersionDelta: number;
}

export interface SvgBackdropEnv {
  userAgent?: string;
  userAgentData?: {
    brands?: ReadonlyArray<{ brand: string }>;
  };
  supportsBackdropBlur?: boolean;
  reducedTransparency?: boolean;
  forcedColors?: boolean;
}

/**
 * Aspect-bucketed optical refraction presets for Apple Liquid Glass surfaces.
 * Three small/hero shapes use edge-only 3-channel RGB dispersion; large panels
 * use single-pass displacement to preserve 60-120fps scrolling performance.
 */
export const LIQUID_GLASS_PRESETS: readonly LiquidGlassPreset[] = [
  {
    id: 'lg-pill',
    width: 160,
    height: 48,
    radius: 24,
    bezel: 11,
    scale: 14,
    ior: 1.5,
    chromaticDispersion: true,
    dispersionDelta: 2,
  },
  {
    id: 'lg-lens',
    width: 96,
    height: 44,
    radius: 22,
    bezel: 12,
    scale: 18,
    ior: 1.5,
    chromaticDispersion: true,
    dispersionDelta: 2,
  },
  {
    id: 'lg-orb',
    width: 64,
    height: 64,
    radius: 32,
    bezel: 13,
    scale: 16,
    ior: 1.5,
    chromaticDispersion: true,
    dispersionDelta: 2,
  },
  {
    id: 'lg-panel',
    width: 128,
    height: 128,
    radius: 22,
    bezel: 10,
    scale: 10,
    ior: 1.5,
    chromaticDispersion: false,
    dispersionDelta: 0,
  },
] as const;

function encodeSignedChannel(normalized: number): number {
  const clamped = Math.max(-1, Math.min(1, normalized));
  const delta = Math.sign(clamped) * Math.round(Math.abs(clamped) * 127);
  return Math.max(0, Math.min(255, 128 + delta));
}

/**
 * Computes an RGBA displacement field (R = X, G = Y, neutral 128) for an
 * analytical Rounded-Rectangle SDF with a C3-smooth Convex-Squircle bevel
 * profile h(t) = (1 - (1 - t)^4)^(1/4) and Snell's Law refraction.
 *
 * The flat interior strictly stays neutral (128, 128) so underlying text never
 * warps or fringes; only the curved glass rim bends light.
 */
export function computeBezelDisplacementField(
  w: number,
  h: number,
  r: number,
  bezel: number,
  ior = 1.5,
): Uint8ClampedArray {
  const width = Math.max(1, Math.floor(w));
  const height = Math.max(1, Math.floor(h));
  const radius = Math.max(0, Math.min(r, width / 2, height / 2));
  const bezelWidth = Math.max(0, bezel);
  const refractiveIndex = Math.max(1.01, ior);
  const data = new Uint8ClampedArray(width * height * 4);

  if (bezelWidth <= 0) {
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      data[p] = 128;
      data[p + 1] = 128;
      data[p + 2] = 128;
      data[p + 3] = 255;
    }
    return data;
  }

  const hx = width / 2;
  const hy = height / 2;
  const bx = Math.max(0, hx - radius);
  const by = Math.max(0, hy - radius);

  const vec = new Float32Array(width * height * 2);
  let maxMag = 1e-6;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      const qx = Math.abs(px) - bx;
      const qy = Math.abs(py) - by;
      const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;

      if (sdf <= 0 && sdf > -bezelWidth) {
        const t = Math.max(0.02, Math.min(1, -sdf / bezelWidth));
        const u = 1 - t;
        const u4 = u * u * u * u;
        const oneMinusU4 = Math.max(1e-5, 1 - u4);

        // Convex squircle profile h(t) = (1 - (1 - t)^4)^(1/4): C3-smooth at inner rim (t = 1).
        const hVal = Math.pow(oneMinusU4, 0.25);
        const slope = Math.min(6.0, (u * u * u) / Math.pow(oneMinusU4, 0.75));

        // Snell's Law angular deviation.
        const theta1 = Math.atan(slope);
        const sinTheta2 = Math.max(-1, Math.min(1, Math.sin(theta1) / refractiveIndex));
        const theta2 = Math.asin(sinTheta2);
        const mag = (0.35 + 0.65 * hVal) * Math.tan(theta1 - theta2);

        // True outward unit normal of Rounded-Rect SDF (never radial center skew).
        let nx = 0;
        let ny = 0;
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1;
          nx = (qx / len) * Math.sign(px);
          ny = (qy / len) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else if (qy > qx) {
          ny = Math.sign(py);
        } else {
          nx = Math.SQRT1_2 * Math.sign(px);
          ny = Math.SQRT1_2 * Math.sign(py);
        }

        // Negative normal pulls interior outward => convex magnifying bezel.
        const idx2 = (y * width + x) * 2;
        vec[idx2] = -nx * mag;
        vec[idx2 + 1] = -ny * mag;
        if (mag > maxMag) {
          maxMag = mag;
        }
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const dx = vec[i * 2] / maxMag;
    const dy = vec[i * 2 + 1] / maxMag;
    data[p] = encodeSignedChannel(dx);
    data[p + 1] = encodeSignedChannel(dy);
    data[p + 2] = 128;
    data[p + 3] = 255;
  }

  return data;
}

/**
 * Generates a base64 PNG displacement map data URL from the analytical bezel field.
 * Returns an empty string if 2D canvas rendering is unavailable.
 */
export function generateBezelMapDataUrl(
  w: number,
  h: number,
  r: number,
  bezel: number,
  ior = 1.5,
): string {
  if (typeof document === 'undefined') return '';
  const width = Math.max(1, Math.floor(w));
  const height = Math.max(1, Math.floor(h));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const field = computeBezelDisplacementField(width, height, r, bezel, ior);
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(field);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * Detects Blink/Chromium support for SVG filter URLs in CSS backdrop-filter.
 *
 * Safari and Firefox parse `backdrop-filter: url(#id)` in CSS.supports() yet
 * drop the entire backdrop-filter declaration at paint time, so Blink-only
 * detection plus accessibility media guards keep non-Chromium frosted glass intact.
 */
export function detectSvgBackdropSupport(env?: SvgBackdropEnv): boolean {
  if (env === undefined && (typeof window === 'undefined' || typeof CSS === 'undefined' || typeof navigator === 'undefined')) {
    return false;
  }

  const supportsBackdropBlur = env?.supportsBackdropBlur
    ?? (typeof CSS !== 'undefined' && Boolean(CSS.supports?.('backdrop-filter', 'blur(1px)')));
  if (!supportsBackdropBlur) return false;

  const reducedTransparency = env?.reducedTransparency
    ?? (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches));
  if (reducedTransparency) return false;

  const forcedColors = env?.forcedColors
    ?? (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(forced-colors: active)').matches));
  if (forcedColors) return false;

  const ua = env?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  // Reject Firefox and all iOS WebKit browsers (CriOS/EdgiOS/FxiOS/OPiOS).
  if (/Firefox|FxiOS|CriOS|EdgiOS|OPiOS/i.test(ua)) {
    return false;
  }

  const navUAData = env !== undefined
    ? env.userAgentData
    : (navigator as Navigator & { userAgentData?: { brands?: ReadonlyArray<{ brand: string }> } }).userAgentData;

  const hasChromiumBrand = Boolean(
    navUAData?.brands?.some(entry => /Chromium|Google Chrome|Microsoft Edge/i.test(entry.brand)),
  );
  if (hasChromiumBrand) {
    return true;
  }

  return /\b(?:Chrome|Chromium|HeadlessChrome)\b/i.test(ua);
}

/**
 * Binds a single passive delegated pointermove listener that updates --lg-mx
 * and --lg-my on hovered `.lg-interactive` elements for specular pointer sheen.
 * Automatically skips touch-only devices and users preferring reduced motion.
 */
export function bindLiquidGlassPointerSheen(root?: Document | HTMLElement): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const targetRoot = root ?? document;
  const fineHoverQuery = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!fineHoverQuery?.matches || reducedMotionQuery?.matches) {
    return () => {};
  }

  let activeElement: HTMLElement | null = null;
  let rafId = 0;
  let pointerX = 0;
  let pointerY = 0;

  const updateSheen = () => {
    rafId = 0;
    if (!activeElement) return;
    const rect = activeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const localX = Math.max(0, Math.min(rect.width, pointerX - rect.left));
    const localY = Math.max(0, Math.min(rect.height, pointerY - rect.top));
    activeElement.style.setProperty('--lg-mx', `${localX.toFixed(1)}px`);
    activeElement.style.setProperty('--lg-my', `${localY.toFixed(1)}px`);
  };

  const handlePointerMove = (event: Event) => {
    if (!fineHoverQuery?.matches || reducedMotionQuery?.matches) return;
    const pointerEvent = event as PointerEvent;
    if (pointerEvent.pointerType && pointerEvent.pointerType !== 'mouse' && pointerEvent.pointerType !== 'pen') {
      return;
    }
    const interactive = pointerEvent.target instanceof Element
      ? pointerEvent.target.closest<HTMLElement>('.lg-interactive')
      : null;
    if (!interactive) {
      activeElement = null;
      return;
    }
    activeElement = interactive;
    pointerX = pointerEvent.clientX;
    pointerY = pointerEvent.clientY;
    if (!rafId) {
      rafId = window.requestAnimationFrame(updateSheen);
    }
  };

  targetRoot.addEventListener('pointermove', handlePointerMove, { passive: true });
  return () => {
    targetRoot.removeEventListener('pointermove', handlePointerMove);
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
  };
}
