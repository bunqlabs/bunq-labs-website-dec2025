
export const QualityProfiles = {
    ULTRA: {
        tier: 'ULTRA',
        grassCount: 25000,
        windResolution: 128,
        bladeSegments: 1, // Keep 1 for now, 3D adds up fast
        maxDPR: 2.0,
        shadows: true,
        postProcessing: true
    },
    HIGH: {
        tier: 'HIGH',
        grassCount: 15000,
        windResolution: 64, // Half res
        bladeSegments: 1,
        maxDPR: 1.5,
        shadows: false,
        postProcessing: true
    },
    MEDIUM: {
        tier: 'MEDIUM',
        grassCount: 8000,
        windResolution: 32,
        bladeSegments: 1,
        maxDPR: 1.25,
        shadows: false,
        postProcessing: false // Disable bloom etc
    },
    LOW: {
        tier: 'LOW',
        grassCount: 3000,
        windResolution: 16,
        bladeSegments: 1,
        maxDPR: 1.0,
        shadows: false,
        postProcessing: false
    },
    POTATO: {
        tier: 'POTATO',
        grassCount: 500,
        windResolution: 8,
        bladeSegments: 1,
        maxDPR: 0.8,
        shadows: false,
        postProcessing: false
    }
};

/**
 * Manages system quality state and notifies listeners.
 */
export class QualityManager {
    constructor() {
        this.currentTier = 'HIGH'; // Default start
        this.listeners = new Set();

        // Auto-detect start tier
        this.detectHardware();
    }

    detectHardware() {
        const isMobile = window.innerWidth < 768;
        const isRetina = window.devicePixelRatio > 1.5;

        // Simple heuristic
        if (isMobile) {
            this.setTier('MEDIUM');
        } else if (isRetina) {
            this.setTier('HIGH'); // Start high on desktop retina
        } else {
            this.setTier('MEDIUM'); // Safe default
        }

        console.log(`[QualityManager] Initial Hardware Detection: ${this.currentTier}`);
    }

    setTier(tierName) {
        if (!QualityProfiles[tierName]) {
            console.warn(`[QualityManager] Invalid tier: ${tierName}`);
            return;
        }
        if (this.currentTier === tierName) return;

        this.currentTier = tierName;
        const profile = QualityProfiles[tierName];
        console.log(`[QualityManager] Setting Tier: ${tierName}`, profile);

        // Notify all listeners
        this.listeners.forEach(callback => callback(profile));
    }

    getProfile() {
        return QualityProfiles[this.currentTier];
    }

    subscribe(callback) {
        this.listeners.add(callback);
        // Immediate callback with current state
        callback(this.getProfile());

        return () => this.listeners.delete(callback);
    }

    // Directions: -1 (Down), 1 (Up)
    adjustQuality(direction) {
        const tiers = ['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
        const currentIndex = tiers.indexOf(this.currentTier);

        let newIndex = currentIndex + direction;
        newIndex = Math.max(0, Math.min(newIndex, tiers.length - 1));

        if (newIndex !== currentIndex) {
            this.setTier(tiers[newIndex]);
            return true; // Changed
        }
        return false; // Cap hit
    }
}
