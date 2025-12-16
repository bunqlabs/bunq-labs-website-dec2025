import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class TextScrambler {
  constructor() {
    this.lockedElements = new Set();
    this.prefersReduced = false;
    this.CHARS = '!%#?*+-$=<>';
  }

  init() {
    // Check for reduced motion preference
    this.prefersReduced = matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // Bind methods
    this.boundRelockAll = this.relockAll.bind(this);
    this.boundPointerOver = this.handlePointerOver.bind(this);
    this.boundFocusIn = this.handleFocusIn.bind(this);
    this.boundResizeRef = this.boundResize.bind(this);

    // Event Listeners
    window.addEventListener('resize', this.boundResizeRef, { passive: true });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() =>
        requestAnimationFrame(this.boundRelockAll)
      );
    }

    document.addEventListener('pointerover', this.boundPointerOver, true);
    document.addEventListener('focusin', this.boundFocusIn);
  }

  lockWidth(el) {
    if (!el || el.__widthLocked) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline') el.style.display = 'inline-block';
    if (cs.whiteSpace !== 'nowrap') el.style.whiteSpace = 'nowrap';

    const w = el.getBoundingClientRect().width;
    if (w > 0) {
      el.style.width = Math.ceil(w) + 'px';
      el.__widthLocked = true;
      this.lockedElements.add(el);
    }
  }

  relockAll() {
    this.lockedElements.forEach((el) => {
      // If element is detached, remove from set
      if (!document.contains(el)) {
        this.lockedElements.delete(el);
        return;
      }

      el.style.width = '';
      const w = el.getBoundingClientRect().width;
      if (w > 0) el.style.width = Math.ceil(w) + 'px';
    });
  }

  boundResize() {
    requestAnimationFrame(this.boundRelockAll);
  }

  scrambleTo(el, finalText, duration = 0.5) {
    if (!el) return;
    this.lockWidth(el);

    // Store the original text the first time we see the element
    if (!el.__baseText) {
      el.__baseText = (el.textContent || '').trim();
    }
    // If we passed specific text, use it, otherwise revert to base
    finalText = finalText || el.__baseText;

    if (this.prefersReduced) {
      el.textContent = finalText;
      return;
    }

    // Custom Scramble Logic
    const startText = el.textContent;
    const length = Math.max(startText.length, finalText.length);
    const obj = { value: 0 };

    gsap.killTweensOf(obj);
    gsap.to(obj, {
      value: 1,
      duration: duration,
      ease: 'none',
      onUpdate: () => {
        const progress = obj.value;
        let result = '';
        for (let i = 0; i < length; i++) {
          if (progress * length > i) {
            // Character is resolved
            result += finalText[i] || '';
          } else {
            // Character is scrambled
            result += this.CHARS[Math.floor(Math.random() * this.CHARS.length)];
          }
        }
        el.textContent = result;
      },
      onComplete: () => {
        el.textContent = finalText;
      },
    });
  }

  handlePointerOver(e) {
    const el = e.target.closest('.hover-scramble-text');
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;

    this.scrambleTo(el, el.__baseText || el.textContent.trim());
  }

  handleFocusIn(e) {
    const el = e.target.closest('.hover-scramble-text');
    if (!el) return;
    this.scrambleTo(el, el.__baseText || el.textContent.trim());
  }

  destroy() {
    // Clean up listeners
    window.removeEventListener('resize', this.boundResizeRef);
    document.removeEventListener('pointerover', this.boundPointerOver, true);
    document.removeEventListener('focusin', this.boundFocusIn);

    this.lockedElements.clear();
  }
}
