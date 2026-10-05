class NinjutsuCamera {
  constructor(video, effects, onFrame, onUnlock) {
    this.video = video;
    this.effects = effects;
    this.onFrame = onFrame;
    this.onUnlock = onUnlock;
    this.stream = null;
    this.running = false;
    this.starting = false;
    this.busy = false;
    this.last = 0;

    this.overlay = document.getElementById('start-screen');
    this.button = document.getElementById('start-camera');
    this.message = document.getElementById('start-message');

    this.button.addEventListener('click', () => this.start());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('pagehide', () => { this.pause(); this.release(); });
    window.addEventListener('pageshow', () => {
      if (!this.running) this.overlay.hidden = false;
    });
  }

  release() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.effects.forEach(v => v.pause());
    this.overlay.hidden = false;
    this.button.textContent = 'Chạm để tiếp tục';
  }

  async start() {
    if (this.starting || this.running) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.message.textContent = 'Camera cần HTTPS. Hãy mở bằng https:// hoặc localhost.';
      return;
    }
    this.starting = true;
    this.button.disabled = true;
    this.message.textContent = 'Đang mở camera…';

    // iOS audio unlock phải gọi trực tiếp trong tap handler
    this.onUnlock();

    this.effects.forEach(v => {
      v.muted = true;
      v.playsInline = true;
      v.play().catch(() => {});
    });

    try {
      if (!this.stream || !this.stream.getVideoTracks().some(t => t.readyState === 'live')) {
        this.release();
        const mobile = matchMedia('(pointer: coarse)').matches;
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: mobile ? 640 : 1280 },
            height: { ideal: mobile ? 480 : 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        });
      }

      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;

      if (document.hidden) { this.release(); return; }
      await this.video.play();
      if (document.hidden) { this.pause(); return; }

      this.running = true;
      this.overlay.hidden = true;
      this.message.textContent = 'Camera trước · Âm thanh 100%';
      this.raf = requestAnimationFrame(t => this.frame(t));
    } catch (error) {
      this.release();
      this.overlay.hidden = false;
      this.message.textContent = error.name === 'NotAllowedError'
        ? 'Hãy cho phép camera trong cài đặt trình duyệt rồi chạm thử lại.'
        : 'Không mở được camera. Đóng ứng dụng đang dùng camera rồi thử lại.';
      console.error(error);
    } finally {
      this.starting = false;
      this.button.disabled = false;
    }
  }

  async frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(t => this.frame(t));
    if (this.busy || this.video.readyState < 2 || now - this.last < 42) return;
    this.busy = true;
    this.last = now;
    try {
      await this.onFrame();
    } catch (error) {
      this.pause();
      this.message.textContent = 'Không tải/xử lý được hiệu ứng.';
      console.error(error);
    } finally {
      this.busy = false;
    }
  }
}

window.NinjutsuCamera = NinjutsuCamera;