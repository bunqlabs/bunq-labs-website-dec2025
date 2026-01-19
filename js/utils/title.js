/**
 * Page Title Changer
 * Changes the document title when the tab loses focus.
 */
export function initPageTitleChanger() {
  const documentTitleStore = document.title;
  const documentTitleOnBlur = "Wait! There's still more 👀";

  // Set original title if user is on the site
  window.addEventListener('focus', () => {
    document.title = documentTitleStore;
  });

  // If user leaves tab, set the alternative title
  window.addEventListener('blur', () => {
    document.title = documentTitleOnBlur;
  });

  console.log('[Utils] Page Title Changer initialized');
}
