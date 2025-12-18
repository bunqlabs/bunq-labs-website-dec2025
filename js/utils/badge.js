/**
 * Badge Remover
 * Aggressively hides the Webflow badge on page load.
 */
export function initBadgeRemover() {
  // Only run if not already ran
  if (window.__badgeRemoverInitialized) return;
  window.__badgeRemoverInitialized = true;

  const intervalTime = 100; // Check every 100ms
  const initialDuration = 2000; // 2 seconds during initial load
  const postLoadDuration = 2000; // 2 seconds after full load

  const applyStyles = function (intervalId, phase) {
    const elements = document.getElementsByClassName('w-webflow-badge');
    let allStylesApplied = true;

    for (let element of elements) {
      // Apply styles
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('opacity', '0', 'important');
      element.style.setProperty('max-width', '0', 'important');
      element.style.setProperty('max-height', '0', 'important');

      // Check computed styles
      const computedStyle = window.getComputedStyle(element);
      const isDisplayNone = computedStyle.display === 'none';
      const isOpacityZero = computedStyle.opacity === '0';
      const isMaxWidthZero = computedStyle.maxWidth === '0px';
      const isMaxHeightZero = computedStyle.maxHeight === '0px';

      // If any element doesn't have all styles applied, continue the loop
      if (
        !(isDisplayNone && isOpacityZero && isMaxWidthZero && isMaxHeightZero)
      ) {
        allStylesApplied = false;
      }
    }

    // If all styles are applied for all elements, log success and stop the interval
    if (allStylesApplied && elements.length > 0) {
      console.log(`[BadgeRemover] Success in ${phase} phase`);
      clearInterval(intervalId);
    }
  };

  function startInitial() {
    // Run immediately for initial 2 seconds
    const initialIntervalId = setInterval(
      () => applyStyles(initialIntervalId, 'initial'),
      intervalTime
    );

    // Stop initial interval after 2 seconds
    setTimeout(function () {
      clearInterval(initialIntervalId);
    }, initialDuration);

    // Initial application
    applyStyles(initialIntervalId, 'initial');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInitial);
  } else {
    startInitial();
  }

  // Run again for 2 seconds after window load
  window.addEventListener('load', function () {
    const postLoadIntervalId = setInterval(
      () => applyStyles(postLoadIntervalId, 'post-load'),
      intervalTime
    );
    setTimeout(function () {
      clearInterval(postLoadIntervalId);
    }, postLoadDuration);
    applyStyles(postLoadIntervalId, 'post-load');
  });
}
