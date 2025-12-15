import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class TextScrambler {
    constructor() {
        this.lockedElements = new Set();
        this.prefersReduced = false;
        this.boundRelockAll = null;
        this.boundPointerOver = null;
        this.boundFocusIn = null;
    }

    init() {
        // Check for plugin availability
        // Note: ScrambleTextPlugin is a paid Club GreenSock plugin.
        // It must be loaded globally via script tag for this to work.
        if (!window.ScrambleTextPlugin) {
            console.warn('TextScrambler: ScrambleTextPlugin not found on window. Text scrambling will be disabled.');
            return;
        }

        gsap.registerPlugin(window.ScrambleTextPlugin);

        this.CHARS = '!%#?*+-$=<>';
        this.DUR = 0.2;
        this.prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Bind methods
        this.boundRelockAll = this.relockAll.bind(this);
        this.boundPointerOver = this.handlePointerOver.bind(this);
        this.boundFocusIn = this.handleFocusIn.bind(this);
        this.boundResizeRef = this.boundResize.bind(this);

        // Event Listeners
        window.addEventListener('resize', this.boundResizeRef, { passive: true });

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => requestAnimationFrame(this.boundRelockAll));
        }

        document.addEventListener('pointerover', this.boundPointerOver, true);
        document.addEventListener('focusin', this.boundFocusIn);
    }

    lockWidth(el) {
        if (!el || el.__widthLocked) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'inline') el.style.display = 'inline-block';
        if (cs.whiteSpace !== 'nowrap') el.style.whiteSpace = 'nowrap';

        const w = el.getBoundingClientRect().width;
        if (w > 0) {
            el.style.width = Math.ceil(w) + 'px';
            el.__widthLocked = true;
            this.lockedElements.add(el);
        }
    }

    relockAll() {
        this.lockedElements.forEach((el) => {
            // If element is detached, remove from set
            if (!document.contains(el)) {
                this.lockedElements.delete(el);
                return;
            }

            el.style.width = '';
            const w = el.getBoundingClientRect().width;
            if (w > 0) el.style.width = Math.ceil(w) + 'px';
        });
    }

    boundResize() {
        requestAnimationFrame(this.boundRelockAll);
    }

    scrambleTo(el, finalText, duration = this.DUR) {
        if (!el) return;

        this.lockWidth(el);
        gsap.killTweensOf(el);

        // Store the original text the first time we see the element
        if (!el.__baseText) {
            el.__baseText = (el.textContent || '').trim();
        }

        if (this.prefersReduced) {
            el.textContent = finalText;
            return;
        }

        gsap.to(el, {
            duration,
            ease: 'none',
            scrambleText: {
                text: finalText,
                chars: this.CHARS,
                speed: 3,
                revealDelay: duration,
                rightToLeft: false,
                tweenLength: false,
            },
            onComplete: () => {
                el.textContent = finalText; // ensure clean final state
            },
        });
    }

    handlePointerOver(e) {
        const el = e.target.closest('.scramble-text');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;

        this.scrambleTo(el, el.__baseText || el.textContent.trim());
    }

    handleFocusIn(e) {
        const el = e.target.closest('.scramble-text');
        if (!el) return;
        this.scrambleTo(el, el.__baseText || el.textContent.trim());
    }

    destroy() {
        // Clean up listeners
        window.removeEventListener('resize', this.boundResizeRef);
        document.removeEventListener('pointerover', this.boundPointerOver, true);
        document.removeEventListener('focusin', this.boundFocusIn);

        this.lockedElements.clear();
    }
}
