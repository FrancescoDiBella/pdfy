import { useEffect, useState } from 'react';

function snapshot() {
  return { height: Math.round(window.visualViewport?.height ?? window.innerHeight), top: Math.round(window.visualViewport?.offsetTop ?? 0) };
}

export function useVisibleViewport() {
  const [viewport, setViewport] = useState(snapshot);
  useEffect(() => {
    const update = () => setViewport(snapshot());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  return viewport;
}
