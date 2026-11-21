(() => {
  const windowBox = document.querySelector(".name-window");
  const letters = windowBox.querySelector(".name-letters");
  const baseline = windowBox.querySelector(".name-baseline");
  const canvas = windowBox.querySelector("canvas");
  const button = windowBox.querySelector(".water-toggle");
  const nav = windowBox.querySelector(".topnav");
  const arrow = windowBox.querySelector("#navhider");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width, height, spacing, particles, heads, columns;
  const interactionRange = 1.55;
  let frame = 0, lastTime = 0, elapsed = 0;
  let grab = null;
  const step = 1 / 90;

  // Rasterize just the ink area. The inline marker measures the real text baseline.
  function seed() {
    const bounds = letters.getBoundingClientRect();
    const box = windowBox.getBoundingClientRect();
    const font = getComputedStyle(letters);
    const mask = document.createElement("canvas");
    mask.width = Math.ceil(bounds.width) + 4;
    mask.height = Math.ceil(bounds.height) + 4;
    const ink = mask.getContext("2d", { willReadFrequently: true });
    ink.font = font.fontWeight + " " + font.fontSize + " " + font.fontFamily;
    ink.fillText(letters.textContent, 2, baseline.getBoundingClientRect().top - bounds.top + 2);
    const pixels = ink.getImageData(0, 0, mask.width, mask.height).data;
    let area = 0;
    for (let i = 3; i < pixels.length; i += 4) area += pixels[i] / 255;
    spacing = Math.max(1.1, Math.sqrt(area / 4200));
    const points = [];
    const burstSpeed = Math.min(460, box.height * 0.95);
    for (let row = 0; row * spacing < mask.height; row++) {
      const y = row * spacing;
      for (let x = (row % 2) * spacing / 2; x < mask.width; x += spacing) {
        const alpha = pixels[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3];
        if (alpha < 110) continue;
        const px = bounds.left - box.left + x - 2;
        const py = bounds.top - box.top + y - 2;
        const across = 2 * (x - 2) / bounds.width - 1;
        const down = 2 * (y - 2) / bounds.height - 1;
        // Neighboring dots launch together so the strokes fan out in small sheets.
        const vx = burstSpeed * (across + 0.24 * Math.sin(across * 11));
        const vy = burstSpeed * (down * 0.65 - 0.33 + 0.18 * Math.cos(across * 14));
        points.push({ x: px, y: py, oldX: px, oldY: py,
          vx, vy, smoothX: 0, smoothY: 0, next: -1, cell: 0 });
      }
    }
    return points;
  }

  function size() {
    const box = windowBox.getBoundingClientRect();
    if (particles && width && height) {
      const scaleX = box.width / width, scaleY = box.height / height;
      spacing *= scaleX;
      if (grab) {
        grab.x *= scaleX;
        grab.y *= scaleY;
      }
      for (const p of particles) {
        p.x *= scaleX;
        p.y *= scaleY;
        p.oldX *= scaleX;
        p.oldY *= scaleY;
        p.vx *= scaleX;
        p.vy *= scaleY;
      }
    }
    width = box.width;
    height = box.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Math.ceil(width / (spacing * interactionRange)) + 2;
    heads = new Int32Array(columns * (Math.ceil(height / (spacing * interactionRange)) + 2));
  }

  let navBottom = 0, arrowLeft = 0, arrowBottom = 0;

  function readHeaderBounds() {
    const box = canvas.getBoundingClientRect();
    const toggle = arrow.getBoundingClientRect();
    navBottom = Math.max(0, nav.getBoundingClientRect().bottom - box.top);
    arrowLeft = toggle.left - box.left;
    arrowBottom = toggle.bottom - box.top;
  }

  function confine(p, radius) {
    p.x = Math.max(radius, Math.min(width - radius, p.x));
    p.y = Math.max(navBottom + radius, Math.min(height - radius, p.y));

    // The arrow stays solid as the rest of the ceiling slides away.
    const left = arrowLeft - radius, bottom = arrowBottom + radius;
    if (p.x > left && p.y < bottom) {
      if (p.x - left < bottom - p.y) p.x = left;
      else p.y = bottom;
    }
  }

  function advance() {
    const reach = spacing * interactionRange;
    const radius = spacing * 0.64;
    const gravity = Math.max(420, Math.min(height * 2.8, 1700));
    const floor = height - radius;
    const right = width - radius;
    const speedLimit = Math.sqrt(2 * gravity * height);

    for (const p of particles) {
      p.oldX = p.x;
      p.oldY = p.y;
      p.vy += gravity * step;
    }
    if (grab && grab.drops.length) {
      // A soft pull inside the scoop lets drops slosh. A stronger pull outside
      // its natural radius helps the trailing water catch up on fast turns.
      const scoopRadius = spacing * Math.sqrt(grab.drops.length / Math.PI);
      const damping = Math.exp(-10 * step);
      for (const p of grab.drops) {
        const dx = grab.x - p.x, dy = grab.y - p.y;
        const distance = Math.hypot(dx, dy);
        const stretch = Math.max(0, distance - scoopRadius);
        const spring = 82 + 260 * stretch / Math.max(1, distance);
        p.vx = (p.vx + dx * spring * step) * damping;
        p.vy = (p.vy + (dy * spring - 0.75 * gravity) * step) * damping;
        const scale = Math.min(1, 2 * speedLimit / (Math.hypot(p.vx, p.vy) || 1));
        p.vx *= scale;
        p.vy *= scale;
      }
    }
    for (const p of particles) {
      p.smoothX = 0;
      p.smoothY = 0;
      p.x += p.vx * step;
      p.y += p.vy * step;
    }

    // Separate overlaps at the original sampling distance. Rebuild the neighbor
    // grid each pass so pressure can propagate through a letter as it lands.
    for (let pass = 0; pass < 3; pass++) {
      heads.fill(-1);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        confine(p, radius);
        p.cell = (Math.floor(p.y / reach) + 1) * columns + Math.floor(p.x / reach) + 1;
        p.next = heads[p.cell];
        heads[p.cell] = i;
      }
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        for (let row = -1; row <= 1; row++) {
          const middle = p.cell + row * columns;
          for (let cell = middle - 1; cell <= middle + 1; cell++) {
            for (let j = heads[cell]; j > i; j = particles[j].next) {
              const q = particles[j];
              const dx = q.x - p.x, dy = q.y - p.y;
              const d2 = dx * dx + dy * dy;
              if (d2 >= reach * reach) continue;
              const d = Math.sqrt(d2);
              if (d < spacing) {
                const correction = (spacing - d) * 0.45;
                const sx = d ? dx / d * correction : correction;
                const sy = d ? dy / d * correction : 0;
                p.x -= sx; q.x += sx;
                p.y -= sy; q.y += sy;
              }
              if (pass === 2) {
                // Viscosity transfers momentum between drops traveling together.
                const mix = 0.08 * (1 - d / reach);
                const vx = (q.vx - p.vx) * mix, vy = (q.vy - p.vy) * mix;
                p.smoothX += vx; q.smoothX -= vx;
                p.smoothY += vy; q.smoothY -= vy;
              }
            }
          }
        }
      }
    }
    for (const p of particles) {
      confine(p, radius);
      // Carry only part of the separation correction into the next step.
      p.vx += ((p.x - p.oldX) / step - p.vx) * 0.8;
      p.vy += ((p.y - p.oldY) / step - p.vy) * 0.8;
      p.vx += p.smoothX;
      p.vy += p.smoothY;
      if (p.y === floor) p.vy = Math.min(0, p.vy);
      if (p.y === navBottom + radius || (p.x > arrowLeft - radius && p.y === arrowBottom + radius)) {
        p.vy = Math.max(0, p.vy);
      }
      if (p.y < arrowBottom + radius && p.x === arrowLeft - radius) p.vx = Math.min(0, p.vx);
      if (p.x === right) p.vx = Math.min(0, p.vx);
      if (p.x === radius) p.vx = Math.max(0, p.vx);
      // Shallow water loses momentum to the bottom as the wave subsides.
      const bottomFriction = Math.max(0, 1 - (floor - p.y) / (spacing * 8));
      const drag = 0.998 - 0.055 * bottomFriction;
      const scale = drag * Math.min(1, speedLimit / (Math.hypot(p.vx, p.vy) || 1));
      p.vx *= scale;
      p.vy *= scale;
    }
  }

  function draw(blend = 1) {
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    const radius = spacing * 0.64;
    for (const p of particles) {
      const x = p.oldX + (p.x - p.oldX) * blend;
      const y = p.oldY + (p.y - p.oldY) * blend;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  function animate(time) {
    readHeaderBounds();
    elapsed += lastTime ? Math.min(0.034, (time - lastTime) / 1000) : 0;
    lastTime = time;
    while (elapsed >= step) {
      advance();
      elapsed -= step;
    }
    draw(elapsed / step);
    frame = requestAnimationFrame(animate);
  }

  button.hidden = false;
  button.addEventListener("click", () => {
    if (particles) {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      particles = null;
      grab = null;
    } else {
      const points = seed();
      if (!points.length) return;
      // Configure the canvas before assigning the freshly measured coordinates.
      size();
      particles = points;
      lastTime = elapsed = 0;
      draw();
      frame = requestAnimationFrame(animate);
    }
    windowBox.classList.toggle("is-water", !!particles);
    button.setAttribute("aria-pressed", String(!!particles));
    button.title = particles ? "Restore Weston Battles" : "Turn the name into water";
  });

  function moveGrab(event) {
    if (!grab || grab.pointerId !== event.pointerId) return;
    const box = canvas.getBoundingClientRect();
    grab.x = Math.max(0, Math.min(width, event.clientX - box.left));
    grab.y = Math.max(0, Math.min(height, event.clientY - box.top));
    if (grab.drops.length) return;

    const range = Math.max(32, Math.min(80, width / 12));
    for (const p of particles) {
      if (Math.hypot(p.x - grab.x, p.y - grab.y) <= range) grab.drops.push(p);
    }
  }

  canvas.addEventListener("pointerdown", event => {
    if (!particles || !event.isPrimary || event.button !== 0 || grab) return;
    canvas.setPointerCapture(event.pointerId);
    grab = { pointerId: event.pointerId, x: 0, y: 0, drops: [] };
    moveGrab(event);
  });
  canvas.addEventListener("pointermove", moveGrab);
  function releaseGrab(event) {
    if (grab && grab.pointerId === event.pointerId) grab = null;
  }
  canvas.addEventListener("pointerup", releaseGrab);
  canvas.addEventListener("pointercancel", releaseGrab);
  canvas.addEventListener("lostpointercapture", releaseGrab);
  new ResizeObserver(() => { if (particles) size(); }).observe(windowBox);
})();
