'use client';

import { useEffect, useRef } from 'react';

const CHARS = '0123456789.%$±∆→←↑↓'.split('');

/* Three depth layers — each scrolls at a different parallax rate */
const LAYERS = [
  { count: 80,  sizeMin: 6,  sizeMax: 9,  opacityMin: 0.02, opacityMax: 0.05, speedMin: 0.1, speedMax: 0.3, parallax: 0.15 },
  { count: 100, sizeMin: 9,  sizeMax: 13, opacityMin: 0.04, opacityMax: 0.10, speedMin: 0.3, speedMax: 0.6, parallax: 0.35 },
  { count: 60,  sizeMin: 13, sizeMax: 18, opacityMin: 0.06, opacityMax: 0.14, speedMin: 0.5, speedMax: 1.0, parallax: 0.6  },
];

const REPULSION_RADIUS = 150;
const REPULSION_STRENGTH = 8;

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const scrollRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* Build particles per layer */
    const particles = [];
    for (const layer of LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 2 - canvas.height,
          baseY: 0,
          speed: layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin),
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          opacity: layer.opacityMin + Math.random() * (layer.opacityMax - layer.opacityMin),
          char: CHARS[Math.floor(Math.random() * CHARS.length)],
          parallax: layer.parallax,
          vx: 0,
          vy: 0,
        });
      }
    }

    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mouse = mouseRef.current;
      const scroll = scrollRef.current;

      for (const p of particles) {
        /* Mouse repulsion */
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPULSION_RADIUS && dist > 0) {
          const force = (1 - dist / REPULSION_RADIUS) * REPULSION_STRENGTH;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        p.x += p.vx;
        p.y += p.speed + p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;

        /* Wrap */
        if (p.y > canvas.height + 30) {
          p.y = -30;
          p.x = Math.random() * canvas.width;
          p.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        if (p.x < -30) p.x = canvas.width + 30;
        if (p.x > canvas.width + 30) p.x = -30;

        /* Parallax offset based on scroll */
        const drawY = p.y - scroll * p.parallax;
        const wrappedY = ((drawY % (canvas.height + 60)) + canvas.height + 60) % (canvas.height + 60) - 30;

        ctx.font = `${p.size}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = `rgba(0, 240, 255, ${p.opacity})`;
        ctx.fillText(p.char, p.x, wrappedY);
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    const handleMouse = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    const handleScroll = () => { scrollRef.current = window.scrollY; };

    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('mouseleave', handleLeave);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('mouseleave', handleLeave);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
