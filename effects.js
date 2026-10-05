/**
 * NinjutsuEngine — orchestrates video overlays + canvas effects.
 * Reads JUTSU_CONFIG and drives all jutsu logic.
 */

class NinjutsuEngine {
  constructor({ video, fxCanvas, cloneCanvas, videoLayer, hudTitle, hudDesc, config, globalConfig }) {
    this.video = video;
    this.fx = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d');
    this.cloneCanvas = cloneCanvas;
    this.cloneCtx = cloneCanvas.getContext('2d');
    this.videoLayer = videoLayer;
    this.hudTitle = hudTitle;
    this.hudDesc = hudDesc;
    this.config = config;
    this.global = globalConfig || {};

    // Map id → jutsu state
    this.jutsu = {};
    this.videoEls = {};
    this.videoLoaded = {};

    // Particle pool
    this.particles = [];

    // Selfie segmentation for clone effect
    this.segmenter = null;
    this.cloneCutout = document.createElement('canvas');
    this.cloneCutout.width = 640;
    this.cloneCutout.height = 360;
    this.cloneCutCtx = this.cloneCutout.getContext('2d');
    this.cloneInput = document.createElement('canvas');
    this.cloneInput.width = 640;
    this.cloneInput.height = 360;
    this.cloneInputCtx = this.cloneInput.getContext('2d');
    this.cloneReady = false;
    this.cloneAlpha = 0;
    this.cloneLastSeg = -Infinity;

    this._initJutsu();
    this._initSegmenter();

    this.lastFrame = 0;
    requestAnimationFrame(t => this._frame(t));
  }

  _initJutsu() {
    for (const j of this.config) {
      this.jutsu[j.id] = {
        ...j,
        active: false,
        charging: false,
        progress: 0,
        since: null,
        lastSeen: -Infinity,
        started: 0,
        until: 0,
        pos: { x: 0.5, y: 0.5 }
      };
      this._buildVideoEl(j);
    }
  }

  _buildVideoEl(j) {
    if (!j.video) return;
    const v = document.createElement('video');
    v.src = j.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.className = 'jutsu-video' + (j.videoMode === 'screen' ? ' full' : '');
    if (j.videoMode === 'overlay') {
      v.style.width = `min(${j.videoSize}vw, ${j.videoSize * 16}px)`;
      v.style.height = 'auto';
    }
    this.videoLayer.appendChild(v);
    this.videoEls[j.id] = v;
    this.videoLoaded[j.id] = false;

    v.addEventListener('loadeddata', () => { this.videoLoaded[j.id] = true; });
    v.addEventListener('error', () => {
      console.warn(`[NinjutsuEngine] Không tải được video ${j.video} cho ${j.id}. Sẽ dùng procedural fallback.`);
    });
  }

  _initSegmenter() {
    try {
      this.segmenter = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${f}`
      });
      this.segmenter.setOptions({ modelSelection: 1 });
      this.segmenter.onResults(res => {
        const c = this.cloneCutCtx;
        const w = this.cloneCutout.width, h = this.cloneCutout.height;
        c.clearRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        c.drawImage(res.segmentationMask, 0, 0, w, h);
        c.globalCompositeOperation = 'source-in';
        c.drawImage(res.image, 0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        this.cloneReady = true;
      });
    } catch (e) {
      console.warn('[NinjutsuEngine] Selfie segmentation unavailable:', e);
    }
  }

  async segmentFrame() {
    const bunshin = this.jutsu['bunshin'];
    if (!bunshin || !this.segmenter) return;
    if (!bunshin.active && this.cloneAlpha < 0.01) return;
    if (performance.now() - this.cloneLastSeg < 66) return;
    this.cloneLastSeg = performance.now();
    const v = this.video;
    if (!v.videoWidth || !v.videoHeight) return;
    const maxEdge = matchMedia('(pointer: coarse)').matches ? 384 : 640;
    const ratio = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.max(1, Math.round(v.videoWidth * ratio));
    const h = Math.max(1, Math.round(v.videoHeight * ratio));
    if (!h) return;
    if (this.cloneInput.width !== w || this.cloneInput.height !== h) {
      this.cloneInput.width = this.cloneCutout.width = w;
      this.cloneInput.height = this.cloneCutout.height = h;
    }
    this.cloneInputCtx.drawImage(v, 0, 0, w, h);
    try { await this.segmenter.send({ image: this.cloneInput }); }
    catch (e) { /* ignore */ }
  }

  /* ---- per-frame tick ---- */

tick(seals, res) {
  const now = performance.now();
  const result = {};

  for (const j of this.config) {
    const state = this.jutsu[j.id];
    const detected = this._matchSeal(j, seals);
    const pos = this._sealPos(j, seals);

    if (detected) {
      if (state.since === null || now - state.lastSeen > 200) state.since = now;
      state.lastSeen = now;
      if (pos) state.pos = pos;
      state.progress = Math.min(100, Math.round((now - state.since) / j.holdMs * 100));

      if (now - state.since >= j.holdMs && now >= state.until) {
        state.started = now;
        state.until = now + j.durationMs;
        state.active = true;
        this._onActivate(j, state);
      }
    } else if (now - state.lastSeen > 200) {
      state.since = null;
      state.progress = 0;
    }

    state.active = now < state.until;

    // ⭐ DEBOUNCE: holding chỉ tắt sau 200ms không thấy seal
    //    Trong 200ms đó, holding giữ nguyên giá trị trước đó
    if (detected) {
      state.holding = true;
    } else if (now - state.lastSeen > 200) {
      state.holding = false;
    }
    // else: giữ nguyên state.holding (chưa quá 200ms)

    result[j.id] = { active: state.active, holding: state.holding };

    // Sync video overlay (giữ nguyên)
    const v = this.videoEls[j.id];
    if (v) {
      if (state.active && this.videoLoaded[j.id]) {
        v.classList.add('on');
        if (v.paused) v.play().catch(() => {});
        if (j.videoMode === 'overlay') {
          const sx = innerWidth - state.pos.x * innerWidth;
          const sy = state.pos.y * innerHeight + (j.videoOffsetY || 0);
          v.style.left = sx + 'px';
          v.style.top = sy + 'px';
          v.style.transform = 'translate(-50%, -50%)';
        }
      } else {
        v.classList.remove('on');
        if (!v.paused && !state.active) v.pause();
      }
    }
  }

  return result;
}

  _matchSeal(j, seals) {
    if (j.hand === 'any') return !!seals[j.id];
    // Config-driven: jutsu.id phải trùng với key được set bởi readGestures
    return !!seals[j.id];
  }

  _sealPos(j, seals) {
    const posKey = j.id + 'Pos';
    const info = seals[posKey];
    if (!info) return null;
    return info.palm;
  }

  _onActivate(j, state) {
    // Spawn canvas particles per jutsu
    const kind = j.canvasFX;
    if (!kind) return;
    const cx = innerWidth - state.pos.x * innerWidth;
    const cy = state.pos.y * innerHeight;
    this.particles.push(...this._spawnParticles(kind, cx, cy, j.color));
  }

  _spawnParticles(kind, cx, cy, color) {
    const list = [];
    switch (kind) {
      case 'spiral':
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 60;
          list.push({
            kind: 'spiral',
            cx, cy,
            angle: a, radius: r, spin: (Math.random() < 0.5 ? 1 : -1) * 4,
            life: 1, decay: 0.012 + Math.random() * 0.01,
            color
          });
        }
        break;
      case 'bolt':
        for (let i = 0; i < 4; i++) {
          list.push({
            kind: 'bolt',
            x: cx, y: cy,
            tx: cx + (Math.random() - 0.5) * innerWidth * 1.2,
            ty: cy + (Math.random() - 0.5) * innerHeight * 1.2,
            life: 1, decay: 0.05 + Math.random() * 0.03,
            color
          });
        }
        break;
      case 'crystal':
        for (let i = 0; i < 20; i++) {
          list.push({
            kind: 'crystal',
            x: cx + (Math.random() - 0.5) * 120,
            y: cy + (Math.random() - 0.5) * 120,
            r: 10 + Math.random() * 40,
            rot: Math.random() * Math.PI,
            life: 1, decay: 0.008,
            color
          });
        }
        break;
      case 'blackFlame':
        for (let i = 0; i < 50; i++) {
          list.push({
            kind: 'blackFlame',
            x: cx, y: cy,
            vx: (Math.random() - 0.5) * 2,
            vy: -1 - Math.random() * 3,
            life: 1, decay: 0.015,
            size: 6 + Math.random() * 12,
            color
          });
        }
        break;
      case 'aura':
        for (let i = 0; i < 30; i++) {
          list.push({
            kind: 'aura',
            x: cx + (Math.random() - 0.5) * 100,
            y: cy + (Math.random() - 0.5) * 100,
            r: 20 + Math.random() * 60,
            life: 1, decay: 0.01,
            color
          });
        }
        break;
      case 'slash':
        for (let i = 0; i < 8; i++) {
          list.push({
            kind: 'slash',
            x: cx, y: cy,
            angle: Math.random() * Math.PI * 2,
            len: 80 + Math.random() * 200,
            life: 1, decay: 0.04,
            color
          });
        }
        break;
    }
    return list;
  }

  _frame(now) {
    requestAnimationFrame(t => this._frame(t));
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    const w = innerWidth, h = innerHeight;
    if (this.fx.width !== w || this.fx.height !== h) {
      this.fx.width = w; this.fx.height = h;
    }
    if (this.cloneCanvas.width !== w || this.cloneCanvas.height !== h) {
      this.cloneCanvas.width = w; this.cloneCanvas.height = h;
    }

    // Clone layer
    this._renderClone(dt, w, h);

    // FX layer
    this.fxCtx.clearRect(0, 0, w, h);

    // Particles
    const alive = [];
    for (const p of this.particles) {
      p.life -= p.decay;
      if (p.life > 0) { alive.push(p); this._renderParticle(p, dt); }
    }
    this.particles = alive;

    // Ambient overlays
    for (const j of this.config) {
      const s = this.jutsu[j.id];
      if (s.active) this._renderAmbient(j, s, now, w, h);
    }
  }

  _renderClone(dt, w, h) {
    const bunshin = this.jutsu['bunshin'];
    if (!bunshin) return;

    const target = (bunshin.active && this.cloneReady) ? 1 : 0;
    this.cloneAlpha += (target - this.cloneAlpha) * Math.min(1, dt * 8);

    this.cloneCtx.clearRect(0, 0, w, h);
    if (!this.cloneReady || this.cloneAlpha < 0.01) return;

    const cut = this.cloneCutout;
    const scale = Math.max(w / cut.width, h / cut.height);
    const dw = cut.width * scale;
    const dh = cut.height * scale;
    const x0 = (w - dw) / 2;
    const y0 = (h - dh) / 2;

    this.cloneCtx.save();
    this.cloneCtx.translate(w, 0);
    this.cloneCtx.scale(-1, 1);

    // 4 ghost clones
    const ghosts = [
      [-0.38, 0.65], [0.38, 0.65],
      [-0.20, 0.82], [0.20, 0.82]
    ];
    for (const [offset, size] of ghosts) {
      this.cloneCtx.globalAlpha = this.cloneAlpha * 0.88;
      this.cloneCtx.drawImage(
        cut,
        x0 + dw * (1 - size) / 2 + offset * w * this.cloneAlpha,
        y0 + dh * (1 - size),
        dw * size, dh * size
      );
    }
    // Main person
    this.cloneCtx.globalAlpha = this.cloneAlpha;
    this.cloneCtx.drawImage(cut, x0, y0, dw, dh);
    this.cloneCtx.restore();
  }

  _renderParticle(p, dt) {
    const c = this.fxCtx;
    switch (p.kind) {
      case 'spiral': {
        p.angle += p.spin * dt;
        p.radius *= 0.985;
        const x = p.cx + Math.cos(p.angle) * p.radius;
        const y = p.cy + Math.sin(p.angle) * p.radius;
        c.save();
        c.globalAlpha = p.life;
        c.strokeStyle = p.color || '#4ea8ff';
        c.lineWidth = 2;
        c.shadowColor = p.color || '#4ea8ff';
        c.shadowBlur = 14;
        c.beginPath();
        c.arc(x, y, 3 * p.life, 0, 6.28);
        c.stroke();
        c.restore();
        break;
      }
      case 'bolt': {
        if (p.life < 1 && p.life > 0.4) break;
        c.save();
        c.globalAlpha = p.life;
        c.strokeStyle = p.color || '#a77cff';
        c.lineWidth = 2.5 * p.life;
        c.shadowColor = p.color || '#a77cff';
        c.shadowBlur = 20;
        c.beginPath();
        const steps = 12;
        c.moveTo(p.x, p.y);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          c.lineTo(
            p.x + (p.tx - p.x) * t + (Math.random() - 0.5) * 60,
            p.y + (p.ty - p.y) * t + (Math.random() - 0.5) * 60
          );
        }
        c.stroke();
        c.restore();
        break;
      }
      case 'crystal': {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.globalAlpha = p.life;
        c.strokeStyle = p.color || '#7dd8ff';
        c.fillStyle = (p.color || '#7dd8ff') + '55';
        c.lineWidth = 2;
        c.shadowColor = p.color || '#7dd8ff';
        c.shadowBlur = 14;
        const r = p.r * p.life;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.closePath();
        c.fill(); c.stroke();
        c.restore();
        break;
      }
      case 'blackFlame': {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vy *= 0.97;
        const r = p.size * p.life;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,80,0,${p.life})`);
        g.addColorStop(0.5, `rgba(60,0,80,${p.life * 0.7})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, r, 0, 6.28);
        c.fill();
        break;
      }
      case 'aura': {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * p.life);
        g.addColorStop(0, (p.color || '#ff4d6d') + 'aa');
        g.addColorStop(1, 'transparent');
        c.save();
        c.globalAlpha = p.life * 0.6;
        c.fillStyle = g;
        c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        c.restore();
        break;
      }
      case 'slash': {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.angle);
        c.globalAlpha = p.life;
        c.strokeStyle = p.color || '#c8b8ff';
        c.lineWidth = 3;
        c.shadowColor = p.color || '#c8b8ff';
        c.shadowBlur = 18;
        c.beginPath();
        c.moveTo(-p.len * p.life, 0);
        c.lineTo(p.len * p.life, 0);
        c.stroke();
        c.restore();
        break;
      }
    }
  }

  _renderAmbient(j, s, now, w, h) {
    const elapsed = now - s.started;
    const remain = s.until - now;
    const alpha = Math.max(0, Math.min(1, elapsed / 250, remain / 350));
    const c = this.fxCtx;

    // Color tint overlay
    c.save();
    c.globalAlpha = alpha * 0.12;
    c.fillStyle = j.color;
    c.fillRect(0, 0, w, h);
    c.restore();
  }

  updateHud() {
    const now = performance.now();
    let active = null, charging = null;

    for (const j of this.config) {
      const s = this.jutsu[j.id];
      if (now < s.until) { active = j; break; }
      if (s.since !== null && now - s.lastSeen <= 200) {
        if (!charging) charging = j;
      }
    }

    if (active) {
      this.hudTitle.textContent = active.name;
      this.hudTitle.style.color = active.color;
      this.hudDesc.textContent = 'Ấn quyết đã khai mở';
    } else if (charging) {
      const s = this.jutsu[charging.id];
      this.hudTitle.textContent = `${charging.name} · ${s.progress}%`;
      this.hudTitle.style.color = charging.color;
      this.hudDesc.textContent = 'Giữ yên tay thêm một chút';
    } else {
      this.hudTitle.textContent = 'Sẵn sàng';
      this.hudTitle.style.color = '#4ea8ff';
      this.hudDesc.textContent = 'Kết ấn bằng tay để triệu hồi';
    }
  }
}