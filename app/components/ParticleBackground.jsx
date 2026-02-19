'use client';

import { useEffect, useRef } from 'react';

const CHARS = '0123456789.0.270.730.150.420.880.03'.split('');
const MAX_PARTICLES = 250;
const REPULSION_RADIUS = 150;
const REPULSION_STRENGTH = 8;

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particlesRef = useRef([]);

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

    // Initialize particles
    const particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 0.2 + Math.random() * 0.6,
        size: 8 + Math.random() * 6,
        opacity: 0.04 + Math.random() * 0.1,
        char: CHARS[Math.floor(Math.random() * CHARS.length)],
        vx: 0,
        vy: 0,
      });
    }
    particlesRef.current = particles;

    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mouse = mouseRef.current;

      for (const p of particles) {
        // Repulsion from mouse
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < REPULSION_RADIUS && dist > 0) {
          const force = (1 - dist / REPULSION_RADIUS) * REPULSION_STRENGTH;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Apply velocity with damping
        p.x += p.vx;
        p.y += p.speed + p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;

        // Wrap around
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
          p.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;

        // Draw
        ctx.font = `${p.size}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = `rgba(0, 240, 255, ${p.opacity})`;
        ctx.fillText(p.char, p.x, p.y);
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    const handleMouse = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };
    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('mouseleave', handleLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 1 }}
    />
  );
}
