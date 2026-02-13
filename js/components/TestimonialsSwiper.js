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

  destroy() {
    if (this.swiper) {
      this.swiper.destroy(true, true);
      this.swiper = null;
    }
  }
}
