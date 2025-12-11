export class Navigation {
  constructor() {
    this.init();
  }

  init() {
    // Toggle Navigation
    document
      .querySelectorAll('[data-navigation-toggle="toggle"]')
      .forEach((toggleBtn) => {
        toggleBtn.addEventListener('click', () => {
          this.toggle();
        });
      });

    // Close Navigation
    document
      .querySelectorAll('[data-navigation-toggle="close"]')
      .forEach((closeBtn) => {
        closeBtn.addEventListener('click', () => {
          this.close();
        });
      });

    // Key ESC - Close Navigation
    document.addEventListener('keydown', (e) => {
      if (e.keyCode === 27) {
        this.close();
      }
    });
  }

  toggle() {
    const navStatusEl = document.querySelector('[data-navigation-status]');
    if (!navStatusEl) return;

    if (navStatusEl.getAttribute('data-navigation-status') === 'not-active') {
      this.open(navStatusEl);
    } else {
      this.close(navStatusEl);
    }
  }

  open(navStatusEl = document.querySelector('[data-navigation-status]')) {
    if (!navStatusEl) return;
    navStatusEl.setAttribute('data-navigation-status', 'active');
    // Hook for Lenis or other scroll blockers if needed
    // if (window.lenis) window.lenis.stop();
  }

  close(navStatusEl = document.querySelector('[data-navigation-status]')) {
    if (!navStatusEl) return;
    // Only close if currently active/open to avoid unnecessary attribute sets
    if (navStatusEl.getAttribute('data-navigation-status') === 'active') {
      navStatusEl.setAttribute('data-navigation-status', 'not-active');
      // Hook for Lenis or other scroll blockers if needed
      // if (window.lenis) window.lenis.start();
    }
  }
}
