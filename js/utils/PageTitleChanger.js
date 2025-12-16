/**
 * Page Title Changer
 * Alternates the document title when the tab loses focus to re-engage users.
 */
export function initPageTitleChanger() {
  let originalTitle = document.title;
  const alertTitle = "Wait! There's still more 👀";
  const brandTitle = 'BUNQ LABS';
  let intervalId = null;

  function startBlinking() {
    // Capture the current title in case it changed via navigation
    originalTitle = document.title;

    // Immediate toggle state
    let showAlert = true;
    document.title = alertTitle;

    intervalId = setInterval(() => {
      showAlert = !showAlert;
      document.title = showAlert ? alertTitle : brandTitle;
    }, 2000);
  }

  function stopBlinking() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // Restore original title
    if (originalTitle) {
      document.title = originalTitle;
    }
  }

  window.addEventListener('blur', startBlinking);
  window.addEventListener('focus', stopBlinking);

  console.log('[Utils] Page Title Changer initialized');
}
