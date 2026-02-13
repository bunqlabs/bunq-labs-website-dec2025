import { gsap, ScrollTrigger } from '../modules.js';

export class StatsCounter {
  constructor() {
    this.selector = '.stats8_number';
    this.tweens = [];
  }

  init(container = document) {
    const elements = container.querySelectorAll(this.selector);

    elements.forEach((el) => {
      // Avoid double-initialization
      if (el.dataset.statsInitialized) return;
      el.dataset.statsInitialized = 'true';

      const rawText = el.textContent.trim();
      // Match number (integer or float with commas/dots) and suffix
      // Regex explanation:
      // ^([\d,.]+)  -> Capture group 1: digits, commas, dots at start
      // (.*)$       -> Capture group 2: anything defaulting to suffix
      const match = rawText.match(/^([\d,.]+)(.*)$/);

      if (!match) return; // fail safe

      const originalNumberStr = match[1];
      const suffix = match[2] || '';

      // Clean number for parsing (remove commas)
      // If using dots for thousands, this might need adjustment based on locale,
      // but usually for generic web '25', '5M', '90%' it works.
      // Assuming standard English format for now (1,000.00).
      // If the user has "5.000" as 5k, we might need a specific cleaner.
      // For now, let's just strip commas.
      const parsedValue = parseFloat(originalNumberStr.replace(/,/g, ''));

      if (isNaN(parsedValue)) return;

      // Set initial value to 0 + suffix
      el.textContent = '0' + suffix;

      // Animate
      // We use a proxy object to tween the value
      const proxy = { value: 0 };

      const tween = gsap.to(proxy, {
        value: parsedValue,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%', // Start when top of element hits 85% of viewport
          toggleActions: 'play none none none', // Play once
        },
        onUpdate: () => {
          const val = proxy.value;
          let currentVal;
          if (originalNumberStr.includes('.')) {
            const decimals = originalNumberStr.split('.')[1].length;
            currentVal = val.toFixed(decimals);
          } else {
            // Use Math.floor for integers
            currentVal = Math.floor(val).toLocaleString('en-US');
          }
          el.textContent = currentVal + suffix;
        },
        onComplete: () => {
          el.textContent = rawText; // Ensure exact final match
        },
      });

      this.tweens.push(tween);
    });
  }

  destroy() {
    if (this.tweens) {
      this.tweens.forEach((t) => {
        if (t.scrollTrigger) t.scrollTrigger.kill();
        t.kill();
      });
    }
    this.tweens = [];
  }
}
