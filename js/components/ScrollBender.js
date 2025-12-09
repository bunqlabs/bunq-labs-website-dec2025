export class ScrollBender {
  constructor() {
    this.cache = [];
    this.resize();
    this.initEvents();
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.cache = [];
    const els = document.querySelectorAll('[data-bend-on-scroll]');
    // Get scrolling container offset if any, usually window.scrollY
    const docScroll = window.scrollY || document.documentElement.scrollTop;

    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Store absolute top position
      const top = rect.top + docScroll;

      // Get max degrees from attribute or default
      let maxDeg = parseFloat(el.dataset.bendMax);
      if (isNaN(maxDeg)) maxDeg = -8;

      this.cache.push({
        el,
        top,
        height: rect.height,
        maxDeg,
      });
    });
  }

  update(currentScrollY) {
    if (!this.cache.length) return;
    if (window.innerWidth < 768) return; // Disable bending on mobile for performance

    const viewportHeight = window.innerHeight;
    // Zone starts at 70% down the screen (bottom 30%)
    const zoneStart = viewportHeight * 0.5;
    const zoneHeight = viewportHeight * 0.5;

    for (let i = 0; i < this.cache.length; i++) {
      const item = this.cache[i];

      // Position of element center relative to viewport
      const elTopInViewport = item.top - currentScrollY;
      const elCenterInViewport = elTopInViewport + item.height / 2;

      let angle = 0;

      // Only apply effect if in the bottom 30% (below zoneStart)
      if (elCenterInViewport > zoneStart) {
        // Calculate normalized progress (0 at zoneStart, 1 at bottom of screen)
        const dist = elCenterInViewport - zoneStart;
        const ratio = Math.min(1, dist / zoneHeight);

        // Interpolate:
        // Bottom of screen (ratio 1) -> maxDeg
        // Top of zone (ratio 0) -> 0 deg
        angle = ratio * item.maxDeg;
      }

      // Optimization: Only write to DOM if angle changed significantly
      const lastAngle = item.lastAngle || 0;
      if (Math.abs(angle - lastAngle) > 0.1) {
        item.el.style.transform = `perspective(1000px) rotateX(${angle.toFixed(
          2
        )}deg)`;
        item.lastAngle = angle;
      }
    }
  }
}
