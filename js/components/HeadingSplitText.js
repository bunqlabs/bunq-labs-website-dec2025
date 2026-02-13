import { gsap, ScrollTrigger, SplitText } from '../modules.js';

export class HeadingSplitText {
  constructor() {
    this.instances = [];
  }

  init(container = document) {
    // Cleanup first to avoid duplicates if called multiple times on same container (e.g. barba)
    // although container usually changes, safe to be sure.
    // Actually, destroying ALL instances might be too aggressive if we only want to init new ones?
    // But typically we re-init per page.

    // Let's rely on manual destroy() called from main.js before init() or use a flag.
    // For now, let's just make sure we find elements.

    const selectors = ['.is-split'];

    const elements = container.querySelectorAll(selectors.join(', '));

    // Wait for fonts to be ready to ensure correct splitting dimensions
    document.fonts.ready.then(() => {
      elements.forEach((el) => {
        // Skip if already initialized
        if (el.dataset.splitTextInitialized) return;
        el.dataset.splitTextInitialized = 'true';

        // Split text by words
        const split = new SplitText(el, { type: 'words' });

        // Ensure parent is visible for measurement?
        // Barba transition might hide it with opacity, which is fine for dimension but not display:none.

        const anim = gsap.from(split.words, {
          scrollTrigger: {
            trigger: el,
            start: 'top 85%', // Trigger when top of element is at 85% of viewport height
            once: true,
          },
          duration: 1,
          y: 20,
          opacity: 0,
          stagger: 0.1,
          ease: 'power3.out',
        });

        this.instances.push({ split, anim, el });
      });

      // Refresh ScrollTrigger to ensure positions are correct after splitting
      ScrollTrigger.refresh();
    });
  }

  destroy() {
    this.instances.forEach(({ split, anim, el }) => {
      if (anim && anim.scrollTrigger) anim.scrollTrigger.kill();
      if (anim) anim.kill();
      if (split) split.revert();
      if (el) delete el.dataset.splitTextInitialized;
    });
    this.instances = [];
  }

  static animateElement(element) {
    if (!element) return;

    // Cleanup previous split if it exists (basic check)
    // For a more robust solution, we'd track instances, but for this specific use case,
    // we can just re-instantiate since SplitText usually handles revert via its API if we kept the ref.
    // However, since we don't store the ref on the element in this static context,
    // we assume the element content was just replaced (which destroys old DOM nodes)
    // OR we just run it on the new text.
    // If we just updated textual content, the old spans are gone.

    // Split text by words
    const split = new SplitText(element, { type: 'words' });

    gsap.from(split.words, {
      duration: 1,
      y: 20,
      opacity: 0,
      stagger: 0.1,
      ease: 'power3.out',
      // No ScrollTrigger, run immediately
    });
  }
}
