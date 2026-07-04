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
        if (!data || data.length < period) return [];
        
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
        
        if (prevVal === 0 || prevVal === undefined || lastVal === undefined) return null;
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
    
    static calculateRange(candles) {
        if (!candles || candles.length === 0) return null;
        const last = candles[candles.length - 1];
        return ((last.high - last.low) / last.low) * 100;
    }
    
    static calculateRVOL(dayCandles, currentVolume) {
        if (!dayCandles || dayCandles.length < 21 || !currentVolume) return null;
        
        const avgVolume = dayCandles.slice(-21, -1).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
        
        if (avgVolume === 0) return 1;
        return currentVolume / avgVolume;
    }
    
    static calculateChangeMultiDay(dayCandles, days) {
        if (!dayCandles || dayCandles.length < days + 1) return null;
        
        const last = dayCandles[dayCandles.length - 1];
        const prev = dayCandles[dayCandles.length - 1 - days];
        
        if (!prev || prev.close === 0) return null;
        return ((last.close - prev.close) / prev.close) * 100;
    }
    
    static calculateAllMetrics(candles, dayCandles = null, ticker = null) {
        const metrics = {};
        
        if (candles && candles.length) {
            metrics.natr = this.calculateNATR(candles, CONFIG.natrPeriod);
            metrics.change1m = this.calculateChange(candles, 1);
            metrics.change5m = this.calculateChange(candles, 5);
            metrics.change15m = this.calculateChange(candles, 15);
            metrics.change1h = this.calculateChange(candles, 60);
            metrics.change4h = this.calculateChange(candles, 240);
            metrics.volChange1m = this.calculateVolumeChange(candles, 1);
            metrics.volChange5m = this.calculateVolumeChange(candles, 5);
            metrics.volChange15m = this.calculateVolumeChange(candles, 15);
            metrics.volChange1h = this.calculateVolumeChange(candles, 60);
            metrics.volChange4h = this.calculateVolumeChange(candles, 240);
            metrics.tradesChange1m = this.calculateTradesChange(candles, 1);
            metrics.tradesChange5m = this.calculateTradesChange(candles, 5);
            metrics.tradesChange15m = this.calculateTradesChange(candles, 15);
            metrics.tradesChange1h = this.calculateTradesChange(candles, 60);
            metrics.tradesChange4h = this.calculateTradesChange(candles, 240);
            metrics.range = this.calculateRange(candles);
        }
        
        // Дневные метрики
        if (dayCandles && dayCandles.length) {
            metrics.change3d = this.calculateChangeMultiDay(dayCandles, 3);
            metrics.change5d = this.calculateChangeMultiDay(dayCandles, 5);
            metrics.change7d = this.calculateChangeMultiDay(dayCandles, 7);
            
            if (ticker && ticker.volume24h) {
                metrics.rvol = this.calculateRVOL(dayCandles, ticker.volume24h);
            }
        }
        
        return metrics;
    }
}