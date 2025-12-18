/**
 * Page Visibility Manager
 * Pauses heavy animations and tick loops when the tab is inactive.
 */
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export function initPageVisibility(lenisInstance) {
  function handleVisibilityChange() {
    if (document.hidden) {
      console.log('[Visibility] Hidden - Pausing engine');
      gsap.ticker.sleep();
      if (lenisInstance) lenisInstance.stop();
    } else {
      console.log('[Visibility] Visible - Resuming engine');
      gsap.ticker.wake();
      if (lenisInstance) lenisInstance.start();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // No disposable needed for this global listener usually, but for consistency:
  if (window.addDisposable) {
    window.addDisposable(() => {
      // Actually, we usually keep this global, but if we wanted to be strict per page:
      // document.removeEventListener('visibilitychange', handleVisibilityChange);
      // However, visibility logic usually persists across the session.
    });
  }

  console.log('[Utils] Page Visibility Manager initialized');
}
