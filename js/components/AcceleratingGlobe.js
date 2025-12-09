import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class AcceleratingGlobe {
  constructor() {
    this.timelines = [];
    this.scrollHandler = null;
  }

  init() {
    const globes = document.querySelectorAll('[data-accelerating-globe]');
    if (globes.length === 0) return;

    globes.forEach((globe) => {
      const circles = globe.querySelectorAll(
        '[data-accelerating-globe-circle]'
      );
      if (circles.length < 8) return; // Min 8 for this specific animation logic

      const tl = gsap.timeline({
        repeat: -1,
        defaults: { duration: 1, ease: 'none' },
      });

      // Width transitions based on the 8-step cycle
      const widths = [
        ['50%', '37.5%'],
        ['37.5%', '25%'],
        ['25%', '12.5%'],
        ['calc(12.5% + 1px)', 'calc(0% + 1px)'],
        ['calc(0% + 1px)', 'calc(12.5% + 1px)'],
        ['12.5%', '25%'],
        ['25%', '37.5%'],
        ['37.5%', '50%'],
      ];

      // Apply animations to each circle index based on the widths map
      // Assuming circles are ordered correctly in DOM to match the phase
      circles.forEach((el, i) => {
        // Wrap index if more than 8 circles, or just guard
        const wIndex = i % 8;
        const [fromW, toW] = widths[wIndex];
        tl.fromTo(el, { width: fromW }, { width: toW }, i === 0 ? 0 : '<');
      });

      this.timelines.push(tl);
    });

    // Setup Scroll Listener for Acceleration
    let lastY = window.scrollY;
    let lastT = performance.now();
    let stopTimeout;

    this.scrollHandler = () => {
      // Only accelerate if we have active timelines
      if (this.timelines.length === 0) return;

      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = now - lastT;
      lastY = window.scrollY;
      lastT = now;

      // Calculate velocity (pixels per second), use absolute value for speed scalar
      const velocity = dt > 0 ? (dy / dt) * 1000 : 0;
      const boost = Math.abs(velocity * 0.005);
      const targetScale = boost + 1;

      // Apply timeScale to all active timelines
      this.timelines.forEach((tl) => tl.timeScale(targetScale));

      // Debounce return to normal speed
      clearTimeout(stopTimeout);
      stopTimeout = setTimeout(() => {
        this.timelines.forEach((tl) => {
          gsap.to(tl, {
            timeScale: 1,
            duration: 0.6,
            ease: 'power2.out',
            overwrite: true,
          });
        });
      }, 100);
    };

    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  destroy() {
    // Remove listener
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }

    // Kill timelines
    if (this.timelines.length > 0) {
      this.timelines.forEach((tl) => tl.kill());
      this.timelines = [];
    }
  }
}
