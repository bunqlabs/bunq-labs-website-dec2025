
export class CaseStudyNavigation {
    constructor() {
        this.wrapper = null;
        this.indicators = [];
        this.sections = [];
        this.lenis = null;
        this.boundUpdate = null;
    }

    init(lenis) {
        this.lenis = lenis;
        this.wrapper = document.querySelector('.case-study_section-indicator-wrapper');
        this.sections = document.querySelectorAll('.case-study_section[data-section-name]');

        if (!this.wrapper || this.sections.length === 0) return;

        // Clear existing (if any re-init happens without full page reload clearing DOM)
        this.wrapper.innerHTML = '';
        this.indicators = [];

        this.sections.forEach((section, idx) => {
            // Ensure ID exists
            const sectionId = section.id || `section-${idx + 1}`;
            section.id = sectionId;

            // Create Indicator
            const link = document.createElement('a');
            link.className = 'case-study_section-indicator';
            link.href = `#${sectionId}`;
            link.setAttribute('tabindex', '0');
            link.title = section.getAttribute('data-section-name');

            // Number Span
            const numSpan = document.createElement('span');
            numSpan.textContent = idx + 1;
            link.appendChild(numSpan);

            // Tooltip Div
            const nameDiv = document.createElement('div');
            nameDiv.className = 'case-study-section-indicator-name';
            nameDiv.textContent = section.getAttribute('data-section-name');
            link.appendChild(nameDiv);

            this.wrapper.appendChild(link);
            this.indicators.push({ link, section });

            // Click Handler (Smooth Scroll)
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.lenis) {
                    this.lenis.scrollTo(section, { offset: 0 }); // Adjustable offset if needed
                } else {
                    section.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // Scroll Listener
        this.boundUpdate = this.updateIndicator.bind(this);
        window.addEventListener('scroll', this.boundUpdate, { passive: true });
        window.addEventListener('resize', this.boundUpdate, { passive: true });

        // Initial check
        this.updateIndicator();
    }

    updateIndicator() {
        if (!this.sections.length) return;

        const scrollMiddle = window.scrollY + (window.innerHeight / 2);
        let activeIndex = -1;

        // Find custom active section logic
        this.sections.forEach((section, idx) => {
            const rect = section.getBoundingClientRect();
            const top = window.scrollY + rect.top; // Absolute top
            const bottom = window.scrollY + rect.bottom; // Absolute bottom

            if (scrollMiddle >= top && scrollMiddle < bottom) {
                activeIndex = idx;
            }
        });

        // Boundary Checks (Above first or Below last)
        if (this.sections.length > 0) {
            const firstTop = window.scrollY + this.sections[0].getBoundingClientRect().top;
            const lastBottom = window.scrollY + this.sections[this.sections.length - 1].getBoundingClientRect().bottom;

            if (scrollMiddle < firstTop || scrollMiddle >= lastBottom) {
                activeIndex = -1;
            }
        }

        // Update Classes
        this.indicators.forEach((item, idx) => {
            if (idx === activeIndex) {
                item.link.classList.add('case-study-indicator-active');
            } else {
                item.link.classList.remove('case-study-indicator-active');
            }
        });
    }

    destroy() {
        if (this.boundUpdate) {
            window.removeEventListener('scroll', this.boundUpdate);
            window.removeEventListener('resize', this.boundUpdate);
        }
        this.indicators = [];
        this.sections = [];
        this.wrapper = null;
        this.lenis = null;
    }
}
