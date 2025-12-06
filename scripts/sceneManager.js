export function observeScenes(entries, options = {}) {
  const observer = new IntersectionObserver((list) => {
    list.forEach((entry) => {
      const record = entries.find((item) => item.element === entry.target);
      if (!record) return;
      const shouldRun = entry.isIntersecting || entry.intersectionRatio > 0;
      if (shouldRun) {
        record.instance.start?.();
      } else {
        record.instance.stop?.();
      }
    });
  }, options);

  entries.forEach((item) => {
    observer.observe(item.element);
    const rect = item.element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      item.instance.start?.();
    }
  });

  return observer;
}
