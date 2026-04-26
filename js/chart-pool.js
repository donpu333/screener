// js/chart-pool.js
class ChartPool {
    constructor() {
        this.active = new Map();
    }
    
    acquire(container) {
        if (this.active.has(container)) {
            return this.active.get(container);
        }
        const cardChart = new CardChart(container);
        this.active.set(container, cardChart);
        return cardChart;
    }
    
    release(container) {
        const chart = this.active.get(container);
        if (chart) {
            chart.destroy();
            this.active.delete(container);
        }
    }
    
    clear() {
        for (const chart of this.active.values()) {
            chart.destroy();
        }
        this.active.clear();
    }
    
    resizeAll() {
        for (const chart of this.active.values()) {
            chart.resize();
        }
    }
}