import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';
import Draggable from 'https://unpkg.com/gsap@3.12.5/Draggable.js?module';

gsap.registerPlugin(Draggable);

export class FlickCards {
  constructor() {
    this.sliders = [];
  }

  init() {
    // Only run if we are on a page that actually has these elements
    // This check implicitly handles the "home or work page" requirement by existence of elements
    const sliders = document.querySelectorAll('[data-flick-cards-init]');
    if (sliders.length === 0) return;

    // Helper to find specific buttons if they exist
    const leftBtn = document.getElementById('flick-control-left');
    const rightBtn = document.getElementById('flick-control-right');

    sliders.forEach((slider) => {
      const list = slider.querySelector('[data-flick-cards-list]');
      if (!list) return;

      const cards = Array.from(
        list.querySelectorAll('[data-flick-cards-item]')
      );
      const total = cards.length;
      if (total < 7) {
        console.warn('[FlickCards] Not minimum of 7 cards');
        return;
      }

      let activeIndex = 0;
      const sliderWidth = slider.offsetWidth;
      const threshold = 0.1;

      // Cleanup old draggers if re-initializing on same DOM (unlikely in Barba but safe)
      cards.forEach((card) => {
        const existingInfo = card.querySelector('[data-flick-cards-dragger]');
        if (existingInfo) existingInfo.remove();
      });

      // Generate draggers inside each card and store references
      const draggers = [];
      cards.forEach((card) => {
        const dragger = document.createElement('div');
        dragger.setAttribute('data-flick-cards-dragger', '');
        card.appendChild(dragger);
        draggers.push(dragger);
      });

      // Set initial drag status
      slider.setAttribute('data-flick-drag-status', 'grab');

      const getConfig = (i, currentIndex) => {
        let diff = i - currentIndex;
        if (diff > total / 2) diff -= total;
        else if (diff < -total / 2) diff += total;

        switch (diff) {
          case 0:
            return { x: 0, y: 0, rot: 0, s: 1, o: 1, z: 5 };
          case 1:
            return { x: 25, y: 1, rot: 10, s: 0.9, o: 1, z: 4 };
          case -1:
            return { x: -25, y: 1, rot: -10, s: 0.9, o: 1, z: 4 };
          case 2:
            return { x: 45, y: 5, rot: 15, s: 0.8, o: 1, z: 3 };
          case -2:
            return { x: -45, y: 5, rot: -15, s: 0.8, o: 1, z: 3 };
          default:
            const dir = diff > 0 ? 1 : -1;
            return { x: 55 * dir, y: 5, rot: 20 * dir, s: 0.6, o: 0, z: 2 };
        }
      };

      const renderCards = (currentIndex) => {
        cards.forEach((card, i) => {
          const cfg = getConfig(i, currentIndex);
          let status;

          if (cfg.x === 0) status = 'active';
          else if (cfg.x === 25) status = '2-after';
          else if (cfg.x === -25) status = '2-before';
          else if (cfg.x === 45) status = '3-after';
          else if (cfg.x === -45) status = '3-before';
          else status = 'hidden';

          card.setAttribute('data-flick-cards-item-status', status);
          card.style.zIndex = cfg.z;

          gsap.to(card, {
            duration: 1,
            ease: 'expo.inOut',
            xPercent: cfg.x,
            yPercent: cfg.y,
            rotation: cfg.rot,
            scale: cfg.s,
            opacity: cfg.o,
          });
        });
      };

      renderCards(activeIndex);

      let pressClientX = 0;
      const draggableInstance = Draggable.create(draggers, {
        type: 'x',
        edgeResistance: 0.8,
        bounds: { minX: -sliderWidth / 2, maxX: sliderWidth / 2 },
        inertia: false,

        onPress: function () {
          pressClientX = this.pointerEvent.clientX;
          slider.setAttribute('data-flick-drag-status', 'grabbing');
        },

        onDrag: function () {
          const rawProgress = this.x / sliderWidth;
          const progress = Math.min(1, Math.abs(rawProgress));
          const direction = rawProgress > 0 ? -1 : 1;
          const nextIndex = (activeIndex + direction + total) % total;

          cards.forEach((card, i) => {
            const from = getConfig(i, activeIndex);
            const to = getConfig(i, nextIndex);
            const mix = (prop) =>
              from[prop] + (to[prop] - from[prop]) * progress;

            gsap.set(card, {
              xPercent: mix('x'),
              yPercent: mix('y'),
              rotation: mix('rot'),
              scale: mix('s'),
              opacity: mix('o'),
            });
          });
        },

        onRelease: function () {
          slider.setAttribute('data-flick-drag-status', 'grab');

          const releaseClientX = this.pointerEvent.clientX;
          const dragDistance = Math.abs(releaseClientX - pressClientX);

          const raw = this.x / sliderWidth;
          let shift = 0;
          if (raw > threshold) shift = -1;
          else if (raw < -threshold) shift = 1;

          if (shift !== 0) {
            activeIndex = (activeIndex + shift + total) % total;
            renderCards(activeIndex);
          } else {
            // Snap back
            renderCards(activeIndex);
          }

          gsap.to(this.target, {
            x: 0,
            duration: 0.3,
            ease: 'power1.out',
          });

          if (dragDistance < 4) {
            // Propagate click manually if it was a tap/click
            this.target.style.pointerEvents = 'none';
            // Using two RAFs to ensure pointer-events change takes effect
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const el = document.elementFromPoint(
                  releaseClientX,
                  this.pointerEvent.clientY
                );
                if (el && el !== this.target) {
                  el.click();
                }
                this.target.style.pointerEvents = 'auto';
              });
            });
          }
        },
      });

      // --- Control Buttons Handling ---
      const handleLeft = () => {
        activeIndex = (activeIndex - 1 + total) % total;
        renderCards(activeIndex);
      };

      const handleRight = () => {
        activeIndex = (activeIndex + 1) % total;
        renderCards(activeIndex);
      };

      if (leftBtn) leftBtn.addEventListener('click', handleLeft);
      if (rightBtn) rightBtn.addEventListener('click', handleRight);

      // Store instance for cleanup
      this.sliders.push({
        slider,
        draggables: draggableInstance,
        buttons: {
          left: leftBtn,
          right: rightBtn,
          handleLeft,
          handleRight,
        },
      });
    });
  }

  destroy() {
    this.sliders.forEach((item) => {
      // Draggable.create returns an array
      item.draggables.forEach((d) => d.kill());

      // Clean up button listeners
      if (item.buttons) {
        if (item.buttons.left) {
          item.buttons.left.removeEventListener('click', item.buttons.handleLeft);
        }
        if (item.buttons.right) {
          item.buttons.right.removeEventListener(
            'click',
            item.buttons.handleRight
          );
        }
      }

      // Clean up injected DOM if needed, but 'dragger' div removal is handled in init
    });
    this.sliders = [];
  }
}
