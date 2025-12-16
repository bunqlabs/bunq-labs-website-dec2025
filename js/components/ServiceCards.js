export class ServiceCards {
  constructor() {
    this.boundHandleClick = this.handleClick.bind(this);
    this.isInitialized = false;
    this.init();
  }

  init() {
    if (this.isInitialized) return;
    document.addEventListener('click', this.boundHandleClick);
    this.isInitialized = true;
  }

  handleClick(e) {
    const card = e.target.closest('.service-card');
    if (!card) return;

    // Prevent interference if there are interactive elements inside (unless we want them to trigger flip?)
    // For now, any click on card flips it.

    card.classList.toggle('is-flipped');
  }

  destroy() {
    document.removeEventListener('click', this.boundHandleClick);
    this.isInitialized = false;
  }
}
