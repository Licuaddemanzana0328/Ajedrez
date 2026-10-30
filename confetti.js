// EFECTO DE VICTORIA (CONFETI DE COLORES Y DESTELLOS)
function launchConfetti() {
    const old = document.getElementById('confetti-canvas');
    if (old) old.remove();

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    cv.id = 'confetti-canvas';
    cv.style.position = 'fixed';
    cv.style.top = '0';
    cv.style.left = '0';
    cv.style.width = '100vw';
    cv.style.height = '100vh';
    cv.style.pointerEvents = 'none';
    cv.style.zIndex = '99999';
    document.body.appendChild(cv);

    const c = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = window.innerWidth * dpr;
    cv.height = window.innerHeight * dpr;
    c.scale(dpr, dpr);

    const colors = ['#f1c40f', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#e67e22'];
    const count = reduce ? 35 : 120;

    const pieces = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * (window.innerHeight * 0.5),
        w: 8 + Math.random() * 8,
        h: 6 + Math.random() * 6,
        vx: -2 + Math.random() * 4,
        vy: 3 + Math.random() * 4,
        rot: Math.random() * 360,
        vr: -5 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)]
    }));

    const start = performance.now();
    const duration = 4000;

    (function frame(t) {
        const k = (t - start) / duration;
        c.clearRect(0, 0, window.innerWidth, window.innerHeight);

        pieces.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;

            c.save();
            c.translate(p.x, p.y);
            c.rotate((p.rot * Math.PI) / 180);
            c.fillStyle = p.color;
            c.globalAlpha = Math.max(0, 1 - k);
            c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            c.restore();
        });

        if (k < 1) {
            requestAnimationFrame(frame);
        } else {
            cv.remove();
        }
    })(start);
}

// EFECTO DE DERROTA (LLUVIA Y CORAZONES ROTOS)
function launchDefeat() {
    const old = document.getElementById('confetti-canvas');
    if (old) old.remove();

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    cv.id = 'confetti-canvas';
    cv.style.position = 'fixed';
    cv.style.top = '0';
    cv.style.left = '0';
    cv.style.width = '100vw';
    cv.style.height = '100vh';
    cv.style.pointerEvents = 'none';
    cv.style.zIndex = '99999';
    document.body.appendChild(cv);

    const c = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    cv.width = w * dpr;
    cv.height = h * dpr;
    c.scale(dpr, dpr);

    const drops = Array.from({ length: reduce ? 40 : 160 }, () => ({
        x: Math.random() * w,
        y: -Math.random() * h,
        len: 12 + Math.random() * 18,
        vy: 8 + Math.random() * 6,
        alpha: 0.3 + Math.random() * 0.4
    }));

    const hearts = Array.from({ length: reduce ? 3 : 9 }, () => ({
        x: Math.random() * w,
        y: -30 - Math.random() * h * 0.6,
        size: 20 + Math.random() * 18,
        vy: 1 + Math.random() * 1.5,
        sway: Math.random() * 6.28
    }));

    const start = performance.now();
    const duration = 4000;

    (function frame(t) {
        const k = (t - start) / duration;
        c.clearRect(0, 0, w, h);

        // Oscurecer pantalla suavemente
        const shade = Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 0.35;
        c.fillStyle = `rgba(5, 10, 30, ${shade})`;
        c.fillRect(0, 0, w, h);

        // Lluvia
        c.lineWidth = 1.5;
        drops.forEach(d => {
            c.strokeStyle = `rgba(150, 175, 220, ${d.alpha})`; 
            c.beginPath();
            c.moveTo(d.x, d.y);
            c.lineTo(d.x - 2, d.y + d.len);
            c.stroke();
            d.y += d.vy;
            d.x -= 0.4;
            if (d.y > h) {
                d.y = -d.len;
                d.x = Math.random() * w;
            }
           
        });

        // Gotas / particulas de derrota
        hearts.forEach(hItem => {
            hItem.y += hItem.vy;
            hItem.sway += 0.03;
            c.save();
            c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
            c.fillStyle = '#60a5fa';
            c.beginPath();
            c.arc(hItem.x + Math.sin(hItem.sway) * 15, hItem.y, (hItem.size || 16) * 0.25, 0, Math.PI * 2);
            c.fill();
            c.restore();
        });

        if (k < 1) {
            requestAnimationFrame(frame);
        } else {
            cv.remove();
        }
    })(start);
}