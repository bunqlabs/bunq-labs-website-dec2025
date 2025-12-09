import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class AudioManager {
  constructor() {
    this.audio = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.5; // Target volume
    this.trackUrl =
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/audio/ambient_audio.mp4'; // Placeholder

    this.init();
  }

  init() {
    // Create audio element programmatically to ensure it exists
    this.audio = new Audio(this.trackUrl);
    this.audio.loop = true;
    this.audio.volume = 0; // Start silent for fade-in
    this.audio.preload = 'auto';

    // "Unlock" audio on first interaction
    this.unlockHandler = this.unlock.bind(this);
    window.addEventListener('click', this.unlockHandler, { once: true });
    window.addEventListener('touchstart', this.unlockHandler, { once: true });
    window.addEventListener('keydown', this.unlockHandler, { once: true });

    // Visibility API for pausing (optional, but good for background)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.fadeTo(0);
        if (this.audio) this.audio.pause();
      } else {
        if (this.isPlaying && !this.isMuted) {
          this.audio.play().catch(() => {});
          this.fadeTo(this.volume);
        }
      }
    });
  }

  unlock() {
    if (this.isPlaying) return;

    // Try to play. If it works, WE ARE GOOD.
    // If it fails (NotAllowed), we stay in "locked" state and wait for next event.

    if (!this.audio) return;

    this.audio
      .play()
      .then(() => {
        console.log('[Audio] Unlocked successfully.');
        this.isPlaying = true;

        // Remove listeners only AFTER success
        window.removeEventListener('click', this.unlockHandler);
        window.removeEventListener('touchstart', this.unlockHandler);
        window.removeEventListener('keydown', this.unlockHandler);

        this.fadeTo(this.volume);
        this.updateUI();
      })
      .catch((err) => {
        console.warn(
          '[Audio] Autoplay blocked (retry on next interaction):',
          err.message
        );
        // Do NOT set isPlaying = true.
        // Do NOT remove listeners.
        // Let the next click/touch try again.
      });
  }

  play() {
    // Public method to resume manually (e.g. from UI)
    if (!this.audio) return;
    if (this.audio.paused) {
      this.audio
        .play()
        .then(() => {
          this.isPlaying = true;
          this.fadeTo(this.volume);
        })
        .catch((e) => console.warn(e));
    }
  }

  pause() {
    if (!this.audio) return;
    this.fadeTo(0, () => {
      this.audio.pause();
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.fadeTo(0);
    } else {
      this.fadeTo(this.volume);
    }
    this.updateUI();
    return this.isMuted;
  }

  fadeTo(val, onComplete) {
    gsap.to(this.audio, {
      volume: val,
      duration: 1.5,
      ease: 'power1.inOut',
      onComplete: onComplete,
    });
  }

  updateUI() {
    const btn = document.getElementById('audio-toggle');
    if (btn) {
      btn.textContent = this.isMuted ? 'SOUND OFF' : 'SOUND ON';
      btn.style.opacity = this.isMuted ? '0.5' : '1.0';
    }
  }
}
