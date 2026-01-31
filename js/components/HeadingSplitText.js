import { gsap, ScrollTrigger, SplitText } from '../modules.js';

export class HeadingSplitText {
  constructor() {
    this.instances = [];
  }

  init(container = document) {
    const selectors = [
      '.heading-style-h1',
      '.heading-style-h2',
      '.heading-style-h3',
      '.heading-style-h4',
      '.heading-style-h5',
      '.heading-style-h6',
    ];

    const elements = container.querySelectorAll(selectors.join(', '));

    elements.forEach((el) => {
      // Split text by words
      const split = new SplitText(el, { type: 'words' });

      const anim = gsap.from(split.words, {
        scrollTrigger: {
          trigger: el,
          start: 'top 85%', // Trigger when top of element is at 85% of viewport height
          once: true,
          // toggleActions: 'play none none reverse', // Removed to ensure it only plays once
        },
        duration: 1,
        y: 20,
        opacity: 0,
        stagger: 0.1,
        ease: 'power3.out',
      });

      this.instances.push({ split, anim });
    });
  }

  destroy() {
    this.instances.forEach(({ split, anim }) => {
      if (anim && anim.scrollTrigger) anim.scrollTrigger.kill();
      if (anim) anim.kill();
      if (split) split.revert();
    });
    this.instances = [];
  }
}
