// Расчёт технических метрик
class Metrics {
    static calculateNATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) return null;
        
        let trSum = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const c = candles[i];
            const prevClose = i > 0 ? candles[i - 1].close : c.open;
            const tr = Math.max(
                c.high - c.low,
                Math.abs(c.high - prevClose),
                Math.abs(c.low - prevClose)
            );
            trSum += tr;
        }
        
        const atr = trSum / period;
        const lastClose = candles[candles.length - 1].close;
        return (atr / lastClose) * 100;
    }
    
    static calculateEMA(data, period) {
        if (data.length < period) return [];
        
        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((sum, d) => sum + d.close, 0) / period;
        
        const result = [{ time: data[period - 1].time, value: ema }];
        
        for (let i = period; i < data.length; i++) {
            ema = data[i].close * k + ema * (1 - k);
            result.push({ time: data[i].time, value: ema });
        }
        
        return result;
    }
    
    static calculateChangeForField(candles, intervalMinutes, field) {
        if (!candles || candles.length < 2) return null;
        
        const last = candles[candles.length - 1];
        const targetTime = last.time - intervalMinutes * 60;
        let prev = null;
        
        for (let i = candles.length - 1; i >= 0; i--) {
            if (candles[i].time <= targetTime) {
                prev = candles[i];
                break;
            }
        }
        
        if (!prev) return null;
        
        const lastVal = last[field];
        const prevVal = prev[field];
        
        if (prevVal === 0) return null;
        return ((lastVal - prevVal) / prevVal) * 100;
    }
    
    static calculateChange(candles, interval) {
        return this.calculateChangeForField(candles, interval, 'close');
    }
    
    static calculateVolumeChange(candles, interval) {
        return this.calculateChangeForField(candles, interval, 'volume');
    }
    
    static calculateTradesChange(candles, interval) {
        return this.calculateChangeForField(candles, interval, 'trades');
    }
    
    static calculateAllMetrics(candles) {
        const metrics = {};
        
        if (candles && candles.length) {
            metrics.natr = this.calculateNATR(candles, CONFIG.natrPeriod);
            metrics.change1m = this.calculateChange(candles, 1);
            metrics.change5m = this.calculateChange(candles, 5);
            metrics.change15m = this.calculateChange(candles, 15);
            metrics.change1h = this.calculateChange(candles, 60);
            metrics.volChange1m = this.calculateVolumeChange(candles, 1);
            metrics.volChange5m = this.calculateVolumeChange(candles, 5);
            metrics.volChange15m = this.calculateVolumeChange(candles, 15);
            metrics.volChange1h = this.calculateVolumeChange(candles, 60);
            metrics.tradesChange1m = this.calculateTradesChange(candles, 1);
            metrics.tradesChange5m = this.calculateTradesChange(candles, 5);
            metrics.tradesChange15m = this.calculateTradesChange(candles, 15);
            metrics.tradesChange1h = this.calculateTradesChange(candles, 60);
        }
        
        return metrics;
    }
}