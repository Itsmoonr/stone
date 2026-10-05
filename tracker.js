/**
 * HandTracker — skeleton + companion videos (naruto / sasuke / katon).
 */
class HandTracker {
  constructor({ video, fxCanvas }) {
    this.video = video;
    this.fx = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d');

    this.pwr = { naruto: 0, sasuke: 0, katon: 0 };
    this.wasOpen = { naruto: false, sasuke: false, katon: false };

    this.videoEls = {
      naruto: document.getElementById('n'),
      sasuke: document.getElementById('s'),
      katon:  document.getElementById('katon')
    };
    this.videoReady = { naruto: false, sasuke: false, katon: false };

    for (const [key, el] of Object.entries(this.videoEls)) {
      if (!el) continue;
      el.addEventListener('loadeddata', () => { this.videoReady[key] = true; });
      el.addEventListener('error', () => {
        console.warn(`[HandTracker] Không tải được video ${key}`);
      });
    }
  }

  tick(res, seals) {
    const v = this.video;
    const c = this.fx;
    const ctx = this.fxCtx;

    if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    ctx.clearRect(0, 0, c.width, c.height);

    let fN = false, fS = false, fK = false;
    const n = this.videoEls.naruto;
    const s = this.videoEls.sasuke;
    const k = this.videoEls.katon;

    if (n) n.style.display = 'none';
    if (s) s.style.display = 'none';
    if (k) k.style.display = 'none';

    const aspect = v.videoWidth / v.videoHeight || 16 / 9;

    if (res.multiHandLandmarks && res.multiHandedness) {
      res.multiHandLandmarks.forEach((pts, i) => {
        const label = res.multiHandedness[i]?.label;
        const isR = label === 'Right';

        // ─── SKELETON (y bản gốc) ───
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00fbff';
        drawConnectors(ctx, pts, HAND_CONNECTIONS, { color: '#00d4ff', lineWidth: 3 });
        drawLandmarks(ctx, pts, { color: '#ffffff', lineWidth: 1, radius: 2 });
        ctx.restore();

        // ─── Naruto / Sasuke: ≥3 ngón duỗi ───
        // Chỉ chạy khi KHÔNG đang có katon (tránh conflict)
        if (!seals.katon) {
          const open = checkOpen(pts);
          const key = isR ? 'sasuke' : 'naruto';
          this.pwr[key] += open ? 0.05 : -0.15;
          this.pwr[key] = Math.max(0, Math.min(1, this.pwr[key]));

          if (open && !this.wasOpen[key]) {
            const vid = isR ? s : n;
            if (vid) {
              vid.style.display = 'block';
              vid.currentTime = 0;
              vid.play().catch(() => {});
            }
          }
          this.wasOpen[key] = open;

          const wrist = pts[0];
          const knk = pts[9];
          if (this.pwr[key] > 0.01) {
            if (isR) {
              fS = true;
              const tx = (wrist.x + knk.x) / 2;
              const ty = (wrist.y + knk.y) / 2;
              const pos = cameraPoint(tx, ty, v.videoWidth, v.videoHeight, innerWidth, innerHeight);
              if (s) {
                s.style.left = `${pos.x}px`;
                s.style.top = `${pos.y}px`;
                s.style.display = 'block';
                s.style.opacity = this.pwr[key];
              }
            } else {
              fN = true;
              const dx = knk.x - wrist.x;
              const dy = knk.y - wrist.y;
              const tx = knk.x + (dx * 0.8);
              const ty = knk.y + (dy * 0.8);
              const pos = cameraPoint(tx, ty, v.videoWidth, v.videoHeight, innerWidth, innerHeight);
              if (n) {
                n.style.left = `${pos.x}px`;
                n.style.top = `${pos.y - Math.min(120, innerWidth * .094)}px`;
                n.style.display = 'block';
                n.style.opacity = this.pwr[key];
              }
            }
          }
        }

        // ─── Katon: 1 ngón duỗi bất kỳ ───
        if (isOneFingerUp(pts, aspect)) {
          this.pwr.katon += 0.06;
          this.pwr.katon = Math.min(1, this.pwr.katon);

          if (!this.wasOpen.katon) {
            if (k) {
              k.style.display = 'block';
              k.currentTime = 0;
              k.play().catch(() => {});
            }
          }
          this.wasOpen.katon = true;

          fK = true;
          // Anchor tại đầu ngón đang duỗi
          const tipIdx = getUpFingerIndex(pts, aspect);
          const tip = tipIdx >= 0 ? pts[tipIdx] : pts[9];
          const pos = cameraPoint(tip.x, tip.y, v.videoWidth, v.videoHeight, innerWidth, innerHeight);
          if (k) {
            k.style.left = `${pos.x}px`;
            k.style.top = `${pos.y}px`;
            k.style.display = 'block';
            k.style.opacity = this.pwr.katon;
          }
        }
      });
    }

    // Fade out
    if (!fN) {
      this.pwr.naruto = Math.max(0, this.pwr.naruto - 0.15);
      if (this.pwr.naruto > 0.01 && n) {
        n.style.display = 'block';
        n.style.opacity = this.pwr.naruto;
      }
      this.wasOpen.naruto = false;
    }
    if (!fS) {
      this.pwr.sasuke = Math.max(0, this.pwr.sasuke - 0.15);
      if (this.pwr.sasuke > 0.01 && s) {
        s.style.display = 'block';
        s.style.opacity = this.pwr.sasuke;
      }
      this.wasOpen.sasuke = false;
    }
    if (!fK) {
      this.pwr.katon = Math.max(0, this.pwr.katon - 0.15);
      if (this.pwr.katon > 0.01 && k) {
        k.style.display = 'block';
        k.style.opacity = this.pwr.katon;
      }
      this.wasOpen.katon = false;
    }
  }

  getStates() {
    const n = this.videoEls.naruto;
    const s = this.videoEls.sasuke;
    const k = this.videoEls.katon;
    return {
      naruto: !!n && n.style.display === 'block' && this.pwr.naruto > 0.1,
      sasuke: !!s && s.style.display === 'block' && this.pwr.sasuke > 0.1,
      katon:  !!k && k.style.display === 'block' && this.pwr.katon  > 0.1
    };
  }
}

window.HandTracker = HandTracker;