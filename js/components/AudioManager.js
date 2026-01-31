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

    if (!this.audio) return;

    this.audio
      .play()
      .then(() => {
        console.log('[Audio] Unlocked successfully.');
        this.isPlaying = true;
        this.fadeTo(this.volume);
        this.updateUI();
      })
      .catch((err) => {
        console.warn('[Audio] Autoplay blocked:', err.message);
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

  setMute(shouldBeMuted) {
    this.isMuted = shouldBeMuted;
    if (this.isMuted) {
      this.fadeTo(0);
    } else {
      if (this.audio && this.audio.paused) {
        this.play();
      } else {
        this.fadeTo(this.volume);
      }
    }
    this.updateUI();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    // If turning sound ON, we must ensure it's playing
    if (!this.isMuted) {
      if (this.audio.paused) {
        this.play();
      } else {
        this.fadeTo(this.volume);
      }
    } else {
      this.fadeTo(0);
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
      const newText = this.isMuted ? 'SOUND OFF' : 'SOUND ON';
      btn.textContent = newText;
      btn.style.opacity = this.isMuted ? '0.5' : '1.0';

      // Sync with TextScrambler
      // We must update the cached base text so it doesn't revert on hover
      if (typeof btn.__baseText !== 'undefined') {
        btn.__baseText = newText;
      }

      // Reset width lock to force re-measurement for new text length
      if (btn.__widthLocked) {
        btn.__widthLocked = false;
        btn.style.width = '';
      }
    }
  }
}
