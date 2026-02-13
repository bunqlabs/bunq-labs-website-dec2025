export class TestimonialsSwiper {
  constructor() {
    this.swiper = null;
  }

  init() {
    // Ensure Swiper is loaded globally (from CDN in HTML)
    if (typeof Swiper === 'undefined') {
      console.warn('Swiper not loaded via CDN');
      return;
    }

    const container = document.querySelector('.testimonials_swiper');
    if (!container) return;

    this.injectStyles();

    // Destroy existing instance if any
    if (this.swiper) {
      this.swiper.destroy(true, true);
    }

    this.swiper = new Swiper('.testimonials_swiper', {
      loop: true,
      centeredSlides: true,
      spaceBetween: 0,
      wrapperClass: 'testimonials_swiper-wrapper',
      slideClass: 'testimonials_swiper-slide',
      navigation: {
        nextEl: '.testimonials_swiper-button-next',
        prevEl: '.testimonials_swiper-button-prev',
      },
      speed: 1000,
      breakpoints: {
        0: {
          slidesPerView: 1,
        },
        768: {
          slidesPerView: 3,
        },
        992: {
          slidesPerView: 3,
        },
      },
      // Ensure it updates on window resize
      resizeObserver: true,
    });
  }

  injectStyles() {
    const styleId = 'testimonials-swiper-styles';
    if (document.getElementById(styleId)) return;

    const css = `
      .testimonials_swiper-wrapper {
        transition-timing-function: cubic-bezier(0.85, 0, 0.15, 1);
      }

      .testimonials_swiper-slide {
        transition: transform 1s cubic-bezier(0.85, 0, 0.15, 1), opacity 1s cubic-bezier(0.85, 0, 0.15, 1), filter 1s cubic-bezier(0.85, 0, 0.15, 1);
        transform: scale(0.5);
        opacity: 0;
      }

      .testimonials_swiper-slide.swiper-slide-active {
        transform: scale(1);
        opacity: 1;
      }

      .testimonials_swiper-slide.swiper-slide-prev,
      .testimonials_swiper-slide.swiper-slide-next {
        opacity: 1;
        filter: brightness(0.5);
        transform: scale(0.7);
      }

      .testimonials_swiper-buttons {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin-top: 40px;
        pointer-events: auto;
      }

      .testimonials_swiper {
        width: 100%;
        padding: 50px 0;
        overflow: hidden;
        pointer-events: auto;
      }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  destroy() {
    if (this.swiper) {
      this.swiper.destroy(true, true);
      this.swiper = null;
    }
  }
}
