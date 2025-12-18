/**
 * Observer Hub
 * Centralizes IntersectionObservers to reduce memory overhead by reusing instances.
 */
export function initObserverHub() {
  const observers = new Map();

  function getObserverKey(opts) {
    return JSON.stringify({
      root: opts.root ? opts.root.id || 'window' : null,
      rootMargin: opts.rootMargin || '0px',
      threshold: opts.threshold || 0,
    });
  }

  window.observeWith = (el, opts = {}, onIntersect) => {
    if (!el) return;

    // Defaults
    if (!opts.threshold) opts.threshold = 0;
    if (!opts.rootMargin) opts.rootMargin = '0px';

    const key = getObserverKey(opts);
    let observer;

    if (observers.has(key)) {
      observer = observers.get(key);
    } else {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          // Dispatch to the callback stored on the element
          if (entry.target._onIntersect) {
            entry.target._onIntersect(entry);
          }
        });
      }, opts);
      observers.set(key, observer);
    }

    // Attach callback to element
    el._onIntersect = onIntersect;
    observer.observe(el);

    // Auto-register cleanup
    if (window.addDisposable) {
      window.addDisposable(() => {
        if (el && observer) observer.unobserve(el);
        if (el) delete el._onIntersect;
      });
    }

    return observer;
  };

  console.log('[Utils] Observer Hub initialized');
}
