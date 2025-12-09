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
    this.basePath = 'assets/images/client-logos/';
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

    this.startChecking();
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

    // 2. Wait for fade out, THEN swap source
    setTimeout(() => {
      img.src = this.basePath + newLogo;

      // Update tracking
      this.activeLogos.add(newLogo);
      slot.dataset.currentLogo = newLogo;

      // 3. Fade In (small delay to ensure SRC swap is registered)
      requestAnimationFrame(() => {
        slot.classList.remove('changing');
      });
    }, 500); // Wait for CSS opacity transition
  }

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
