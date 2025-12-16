/**
 * Global Disposable System
 * Allows components to register cleanup functions that run automatically on page transitions.
 */
export function initDisposables() {
  window._disposables = [];

  window.addDisposable = (callback) => {
    if (typeof callback === 'function') {
      window._disposables.push(callback);
    }
  };

  window.cleanupOnLeave = () => {
    if (window._disposables && window._disposables.length) {
      console.log(
        `[Disposables] Cleaning up ${window._disposables.length} items...`
      );
      window._disposables.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          console.warn('[Disposables] Error during cleanup:', err);
        }
      });
    }
    window._disposables = [];
  };

  console.log('[Utils] Disposable system initialized');
}
