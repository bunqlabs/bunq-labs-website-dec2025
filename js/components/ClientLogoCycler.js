export class ClientLogoCycler {
  constructor() {
    this.logos = [
      'APTDC.png',
      'Ambrane.png',
      'Arthigamya.png',
      'Cosmo.png',
      'Creo.png',
      'FML.png',
      'Feemonk.png',
      'Kapil.png',
      'Nova nova.png',
      'Oneplus.png',
      'Pi.png',
      'Ramco.png',
      'Shlok.png',
      'Svayam.png',
      'Tedy.png',
    ];
    this.basePath =
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/images/client-logos/';
    this.cycleInterval = 3000;
    this.intervalId = null;
    this.slots = [];
    this.activeLogos = new Set();
  }

  init() {
    const elements = document.querySelectorAll('[data-client-logo]');
    if (elements.length === 0) {
      console.warn('[LogoCycler] No elements found with data-client-logo');
      return;
    }

    this.slots = Array.from(elements);

    // Initial Population
    this.slots.forEach((slot) => {
      const img = slot.querySelector('img');
      if (img) {
        const randomLogo = this.getUniqueRandomLogo();
        img.src = this.basePath + randomLogo;
        this.activeLogos.add(randomLogo);
        slot.dataset.currentLogo = randomLogo; // Track in DOM for safety
      }
    });

    this.preloadImages();
    this.startChecking();
  }

  preloadImages() {
    this.logos.forEach((logo) => {
      const img = new Image();
      img.src = this.basePath + logo;
    });
  }

  getUniqueRandomLogo() {
    // Filter out currently active logos
    const available = this.logos.filter((logo) => !this.activeLogos.has(logo));

    // Fallback if none available (shouldn't happen with 15 logos and 4 slots)
    if (available.length === 0)
      return this.logos[Math.floor(Math.random() * this.logos.length)];

    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  startChecking() {
    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      if (document.hidden) return; // Pause if tab hidden

      this.cycleOneSlot();
    }, this.cycleInterval);
  }

  cycleOneSlot() {
    if (this.slots.length === 0) return;

    // Prevention of consecutive slot updates
    let slotIndex;
    let attempts = 0;
    do {
      slotIndex = Math.floor(Math.random() * this.slots.length);
      attempts++;
    } while (this.lastUpdatedSlotIndex === slotIndex && attempts < 5);

    this.lastUpdatedSlotIndex = slotIndex;
    const slot = this.slots[slotIndex];
    const img = slot.querySelector('img');

    if (!img) return;

    // Remove current from active tracking
    const currentLogo = slot.dataset.currentLogo;
    if (currentLogo) this.activeLogos.delete(currentLogo);

    // Pick new
    const newLogo = this.getUniqueRandomLogo();

    // 1. Fade Out
    slot.classList.add('changing');

    // 2. Wait for fade out (500ms) AND ensure image is ready
    setTimeout(() => {
      // Pick new (Pass current to exclude explicitly, though logic below handles it too)
      // LOGIC FIX: Don't delete current from activeLogos yet.
      // If we keep it in activeLogos, getUniqueRandomLogo will exclude it automatically.

      const newLogo = this.getUniqueRandomLogo();

      // Update tracking NOW
      if (currentLogo) this.activeLogos.delete(currentLogo);
      this.activeLogos.add(newLogo);

      // Pre-fetch image to ensure smooth transition
      const tempImg = new Image();
      tempImg.onload = () => {
        // Only swap when ready
        if (slot.contains(img)) { // Safety check
          img.src = this.basePath + newLogo;
          slot.dataset.currentLogo = newLogo;

          // 3. Fade In
          requestAnimationFrame(() => {
            slot.classList.remove('changing');
          });
        }
      };
      // Handle error case to avoid stuck fade
      tempImg.onerror = () => {
        slot.classList.remove('changing'); // Revert if failed
        // Re-add old logo to active since we failed to switch? 
        // For simplicity, just let it be.
      };

      tempImg.src = this.basePath + newLogo;

    }, 500); // Wait for CSS opacity transition
  }

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
