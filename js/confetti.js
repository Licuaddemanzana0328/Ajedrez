function launchDefeat() {
    const old = document.getElementById('confetti-canvas');
    if (old) old.remove();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    cv.id = 'confetti-canvas';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;

    const drops = Array.from({ length: reduce ? 40 : 160 }, () => ({
        x: Math.random() * cv.width, y: -Math.random() * cv.height,
        len: 12 + Math.random() * 18, vy: 8 + Math.random() * 6,
        alpha: 0.3 + Math.random() * 0.4
    }));
    const hearts = Array.from({ length: reduce ? 3 : 9 }, () => ({
        x: Math.random() * cv.width, y: -30 - Math.random() * cv.height * 0.6,
        size: 20 + Math.random() * 18, vy: 1 + Math.random() * 1.5,
        sway: Math.random() * 6.28
    }));

    const start = performance.now();
    const duration = 4500;
    (function frame(t) {
        const k = (t - start) / duration;
        c.clearRect(0, 0, cv.width, cv.height);

        // Pantalla que se oscurece y vuelve a aclarar
        const shade = Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 0.35;
        c.fillStyle = `rgba(5, 10, 30, ${shade})`;
        c.fillRect(0, 0, cv.width, cv.height);

        // Lluvia
        c.lineWidth = 1.5;
        drops.forEach(d => {
            c.strokeStyle = `rgba(150, 175, 220, ${d.alpha})`;
            c.beginPath();
            c.moveTo(d.x, d.y);
            c.lineTo(d.x - 2, d.y + d.len);
            c.stroke();
            d.y += d.vy; d.x -= 0.4;
            if (d.y > cv.height) { d.y = -d.len; d.x = Math.random() * cv.width; }
        });

        // Corazones rotos
        hearts.forEach(h => {
            h.y += h.vy; h.sway += 0.03;
            c.font = h.size + 'px serif';
            c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
            c.fillText('💔', h.x + Math.sin(h.sway) * 15, h.y);
            c.globalAlpha = 1;
        });

        if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(start);
}
