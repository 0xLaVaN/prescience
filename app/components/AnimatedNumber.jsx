'use client';

import { useEffect, useRef, useState } from 'react';

export default function AnimatedNumber({ value = 0, duration = 1000, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef({ start: null, from: 0 });

  useEffect(() => {
    const from = ref.current.from;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = from + (value - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        ref.current.from = value;
      }
    }

    requestAnimationFrame(tick);
    return () => { ref.current.from = display; };
  }, [value, duration]);

  const formatted = Number.isInteger(value) ? Math.round(display).toLocaleString() : display.toFixed(1);

  return (
    <span className="font-mono tabular-nums">
      {prefix}{formatted}{suffix}
    </span>
  );
}
