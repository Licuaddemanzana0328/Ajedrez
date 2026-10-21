function launchConfetti() {
    const old = document.getElementById('confetti-canvas');
    if (old) old.remove();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    cv.id = 'confetti-canvas';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const colors = ['#e94560', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ffffff'];
    const parts = Array.from({ length: reduce ? 40 : 180 }, () => ({
        x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 4,
        rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const end = performance.now() + 4500;
    (function frame(t) {
        c.clearRect(0, 0, cv.width, cv.height);
        let alive = 0;
        parts.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.rot += p.vr;
            if (p.y < cv.height + 20) alive++;
            c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
            c.fillStyle = p.color; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            c.restore();
        });
        if (alive && t < end) requestAnimationFrame(frame); else cv.remove();
    })(performance.now());
}
