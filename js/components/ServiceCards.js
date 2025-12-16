export class ServiceCards {
  constructor() {
    this.init();
  }

  init() {
    this.cards = document.querySelectorAll('.service-card');

    this.cards.forEach((card) => {
      // Remove old listener to prevent duplicates
      if (card.dataset.bound) return;

      card.dataset.bound = 'true';
      card.addEventListener('click', this.handleClick);

      // Remove GSAP perspective hacks if they existed,
      // rely on CSS classes now.
    });
  }

  handleClick = (e) => {
    const card = e.currentTarget;
    card.classList.toggle('is-flipped');
  };

  destroy() {
    // Optional cleanup
    this.cards.forEach((card) => {
      card.removeEventListener('click', this.handleClick);
      delete card.dataset.bound;
    });
  }
}
