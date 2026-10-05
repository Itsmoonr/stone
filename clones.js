class SealTimer {
  constructor() { this.since = null; this.lastSeen = -Infinity; this.until = 0; }
  update(detected, now) {
    if (detected) {
      if (this.since === null || now - this.lastSeen > 180) this.since = now;
      this.lastSeen = now;
      if (now - this.since >= 650) this.until = now + 4500;
    } else if (now - this.lastSeen > 180) this.since = null;
    return now < this.until;
  }
}

class ShadowClones {
  constructor(video, canvas, status) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.status = status;
    this.timer = new SealTimer();
    this.cutout = document.createElement('canvas');
    this.cutout.width = 640;
    this.cutout.height = 360;
    this.cutCtx = this.cutout.getContext('2d');
    this.input = document.createElement('canvas');
    this.input.width = 640;
    this.input.height = 360;
    this.inputCtx = this.input.getContext('2d');
    this.active = false;
    this.alpha = 0;
    this.ready = false;
    this.failed = false;
    this.lastSegment = -Infinity;
    this.lastRender = 0;

    try {
      this.segmenter = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${f}`
      });
      this.segmenter.setOptions({ modelSelection: 1 });
      this.segmenter.onResults(res => {
        const c = this.cutCtx, w = this.cutout.width, h = this.cutout.height;
        c.clearRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        c.drawImage(res.segmentationMask, 0, 0, w, h);
        c.globalCompositeOperation = 'source-in';
        c.drawImage(res.image, 0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        this.ready = true;
      });
    } catch (error) { this.fail(error); }

    requestAnimationFrame(t => this.render(t));
  }

  fail(error) {
    console.error('Shadow clone segmentation failed:', error);
    this.failed = true;
    this.active = false;
    this.ready = false;
    if (this.status) this.status.textContent = 'Không tải được phân thân.';
  }

  update(detected) {
    if (this.failed) return;
    const now = performance.now();
    this.active = this.timer.update(detected, now);
    if (this.status) {
      this.status.textContent = this.active
        ? (this.ready ? 'Đa trọng ảnh phân thân!' : 'Đang tải phân thân…')
        : detected ? 'Đang kết ấn…' : 'Tay phải: chữ V • Giữ 0,7 giây';
    }
  }

  async frame() {
    if (this.failed || (!this.active && this.alpha < 0.01) ||
        performance.now() - this.lastSegment < 66) return;
    this.lastSegment = performance.now();
    if (!this.video.videoWidth || !this.video.videoHeight) return;

    const maxEdge = matchMedia('(pointer: coarse)').matches ? 384 : 640;
    const ratio = Math.min(1, maxEdge / Math.max(this.video.videoWidth, this.video.videoHeight));
    const width = Math.max(1, Math.round(this.video.videoWidth * ratio));
    const height = Math.max(1, Math.round(this.video.videoHeight * ratio));
    if (!height) return;

    if (this.input.width !== width || this.input.height !== height) {
      this.input.width = this.cutout.width = width;
      this.input.height = this.cutout.height = height;
    }
    this.inputCtx.drawImage(this.video, 0, 0, width, height);
    try { await this.segmenter.send({ image: this.input }); }
    catch (error) { this.fail(error); }
  }

  render(now) {
    const dt = Math.min((now - this.lastRender) / 1000, 0.1);
    this.lastRender = now;
    if (now >= this.timer.until) this.active = false;
    const target = this.active && this.ready && !this.failed ? 1 : 0;
    this.alpha += (target - this.alpha) * Math.min(1, dt * 8);

    const w = innerWidth, h = innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const c = this.ctx;
    c.clearRect(0, 0, w, h);

    if (this.ready && this.alpha > 0.01) {
      const scale = Math.max(w / this.cutout.width, h / this.cutout.height);
      const dw = this.cutout.width * scale, dh = this.cutout.height * scale;
      const x = (w - dw) / 2, y = (h - dh) / 2;
      c.save();
      c.translate(w, 0);
      c.scale(-1, 1);
      for (const [offset, size] of [[-0.39, 0.64], [0.39, 0.64], [-0.22, 0.82], [0.22, 0.82]]) {
        c.globalAlpha = this.alpha * 0.92;
        c.drawImage(
          this.cutout,
          x + dw * (1 - size) / 2 + offset * w * this.alpha,
          y + dh * (1 - size),
          dw * size, dh * size
        );
      }
      c.globalAlpha = this.alpha;
      c.drawImage(this.cutout, x, y, dw, dh);
      c.restore();
    }
    requestAnimationFrame(t => this.render(t));
  }
}

window.ShadowClones = ShadowClones;