import { useEffect, useState } from 'react';
import {
  LIQUID_GLASS_PRESETS,
  bindLiquidGlassPointerSheen,
  detectSvgBackdropSupport,
  generateBezelMapDataUrl,
  type LiquidGlassPreset,
} from '../utils/liquidGlass';

interface RenderedPreset {
  preset: LiquidGlassPreset;
  href: string;
}

function buildFilterMaps(): RenderedPreset[] {
  return LIQUID_GLASS_PRESETS.map(preset => ({
    preset,
    href: generateBezelMapDataUrl(preset.width, preset.height, preset.radius, preset.bezel, preset.ior),
  }));
}

export default function LiquidGlassFilters() {
  const [filterMaps] = useState<RenderedPreset[]>(buildFilterMaps);

  useEffect(() => {
    const root = document.documentElement;
    const hasAllMaps = filterMaps.length === LIQUID_GLASS_PRESETS.length && filterMaps.every(entry => Boolean(entry.href));

    const syncRefractAttribute = () => {
      if (hasAllMaps && detectSvgBackdropSupport()) {
        root.dataset.lgRefract = '1';
      } else {
        delete root.dataset.lgRefract;
      }
    };

    syncRefractAttribute();

    const reducedTransparencyQuery = window.matchMedia?.('(prefers-reduced-transparency: reduce)');
    const forcedColorsQuery = window.matchMedia?.('(forced-colors: active)');
    reducedTransparencyQuery?.addEventListener?.('change', syncRefractAttribute);
    forcedColorsQuery?.addEventListener?.('change', syncRefractAttribute);

    const unbindPointerSheen = bindLiquidGlassPointerSheen(document);

    return () => {
      reducedTransparencyQuery?.removeEventListener?.('change', syncRefractAttribute);
      forcedColorsQuery?.removeEventListener?.('change', syncRefractAttribute);
      unbindPointerSheen();
      delete root.dataset.lgRefract;
    };
  }, [filterMaps]);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{
        position: 'fixed',
        left: -9999,
        top: -9999,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <defs>
        {filterMaps.map(({ preset, href }) => {
          if (!href) return null;
          if (preset.chromaticDispersion) {
            const redScale = preset.scale + preset.dispersionDelta;
            const greenScale = preset.scale;
            const blueScale = Math.max(1, preset.scale - preset.dispersionDelta);
            return (
              <filter
                key={preset.id}
                id={preset.id}
                filterUnits="objectBoundingBox"
                x="0%"
                y="0%"
                width="100%"
                height="100%"
                colorInterpolationFilters="sRGB"
              >
                <feImage
                  href={href}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                  result="map"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={redScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispR"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={greenScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispG"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={blueScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispB"
                />
                <feColorMatrix
                  in="dispR"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="r"
                />
                <feColorMatrix
                  in="dispG"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="g"
                />
                <feColorMatrix
                  in="dispB"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                  result="b"
                />
                <feBlend in="r" in2="g" mode="screen" result="rg" />
                <feBlend in="rg" in2="b" mode="screen" />
              </filter>
            );
          }

          return (
            <filter
              key={preset.id}
              id={preset.id}
              filterUnits="objectBoundingBox"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={href}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={preset.scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}
