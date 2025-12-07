export class PerformanceMonitor {
    constructor(onDrop) {
        this.onDrop = onDrop;
        this.frames = 0;
        this.timeAccum = 0;
        this.checkInterval = 5.0; // Check every 5s
        this.warmupTime = 3.0; // Ignore first 3s
        this.totalTime = 0;
        console.log('[PerformanceMonitor] Initialized');
    }

    update(dt) {
        this.totalTime += dt;
        if (this.totalTime < this.warmupTime) return;

        this.frames++;
        this.timeAccum += dt;

        if (this.timeAccum >= this.checkInterval) {
            const avgFps = this.frames / this.timeAccum;
            // Log every interval check for visibility
            console.log(`[PerformanceMonitor] Check: ${avgFps.toFixed(1)} FPS`);

            if (avgFps < 20) {
                console.warn(`[PerformanceMonitor] FPS Low (${avgFps.toFixed(1)}). Triggering drop handler.`);
                this.onDrop(avgFps);
            }
            // Reset for next interval
            this.frames = 0;
            this.timeAccum = 0;
        }
    }
}
