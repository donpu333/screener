// js/adapters.js — ПОЛНЫЙ ФАЙЛ С ИСПРАВЛЕННЫМ await
class BaseAdapter {
    constructor(name) {
        this.name = name;
    }
}

// Binance адаптер
class BinanceAdapter extends BaseAdapter {
    constructor() {
        super('Binance');
        this.activeSymbolsCache = {
            spot: null,
            futures: null,
            timestamp: 0
        };
    }
    
    // 🔥 Получить список ТОЛЬКО АКТИВНЫХ символов (STATUS = TRADING)
    async fetchActiveSymbols(marketType = 'futures') {
        const cacheKey = marketType;
        const now = Date.now();
        
        // Кеш на 5 минут
        if (this.activeSymbolsCache[cacheKey] && (now - this.activeSymbolsCache.timestamp) < 300000) {
            return this.activeSymbolsCache[cacheKey];
        }
        
        const baseUrl = marketType === 'spot'
            ? 'https://api.binance.com/api/v3/exchangeInfo'
            : 'https://fapi.binance.com/fapi/v1/exchangeInfo';
        
        const res = await fetch(baseUrl);
        const data = await res.json();
        
        // 🔥 Фильтруем: только USDT пары И статус TRADING
        const activeSymbols = new Set();
        
        data.symbols.forEach(s => {
            if (s.symbol.endsWith('USDT') && s.status === 'TRADING') {
                activeSymbols.add(s.symbol);
            }
        });
        
        this.activeSymbolsCache[cacheKey] = activeSymbols;
        this.activeSymbolsCache.timestamp = now;
        
        console.log(`📊 Binance ${marketType}: ${activeSymbols.size} активных USDT пар`);
        
        return activeSymbols;
    }
    
    async fetchAllTickers(marketType = 'futures') {
        // 🔥 ВАЖНО: await — дожидаемся загрузки активных символов
        const activeSymbols = await this.fetchActiveSymbols(marketType);
        
        const baseUrl = marketType === 'spot'
            ? 'https://api.binance.com/api/v3/ticker/24hr'
            : 'https://fapi.binance.com/fapi/v1/ticker/24hr';
        
        const res = await fetch(baseUrl);
        const data = await res.json();
        const result = {};
        
        data.forEach(t => {
            const symbol = t.symbol;
            
            // 🔥 СТРОГАЯ ПРОВЕРКА: USDT + есть в списке активных + объём > 0
            if (!symbol.endsWith('USDT')) return;
            if (!activeSymbols.has(symbol)) return;
            
            const volume = parseFloat(t.quoteVolume || t.volume);
            if (volume <= 0) return;
            
            result[symbol] = {
                symbol: symbol,
                exchange: this.name,
                marketType: marketType,
                price: parseFloat(t.lastPrice),
                change24h: parseFloat(t.priceChangePercent || t.priceChange),
                volume24h: volume,
                high24h: parseFloat(t.highPrice || t.high),
                low24h: parseFloat(t.lowPrice || t.low),
                tradesCount: t.count,
                lastUpdate: Date.now()
            };
        });
        
        console.log(`📊 Binance ${marketType}: загружено ${Object.keys(result).length} тикеров`);
        
        return result;
    }
    
    async fetchKlines(symbol, interval, limit = 500, endTime = null, marketType = 'futures') {
        const baseUrl = marketType === 'spot'
            ? 'https://api.binance.com/api/v3/klines'
            : 'https://fapi.binance.com/fapi/v1/klines';
        
        let url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        if (endTime) url += `&endTime=${endTime * 1000}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        // 🔥 Фильтруем свечи с нулевым объёмом
        return data
            .map(d => ({
                time: Math.floor(d[0] / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5]),
                trades: parseInt(d[8])
            }))
            .filter(c => c.volume > 0 && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));
    }
}

// Bybit адаптер
class BybitAdapter extends BaseAdapter {
    constructor() {
        super('Bybit');
    }
    
    async fetchAllTickers(marketType = 'futures') {
        const category = marketType === 'spot' ? 'spot' : 'linear';
        const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`);
        const data = await res.json();
        
        if (data.retCode !== 0 || !data.result?.list) return {};
        
        const result = {};
        data.result.list.forEach(t => {
            const symbol = t.symbol;
            
            // 🔥 Только USDT пары
            if (!symbol.endsWith('USDT')) return;
            
            // 🔥 Фильтруем по объёму > 0
            const volume = parseFloat(t.turnover24h || t.volume24h || 0);
            if (volume <= 0) return;
            
            result[symbol] = {
                symbol: symbol,
                exchange: this.name,
                marketType: marketType,
                price: parseFloat(t.lastPrice),
                change24h: parseFloat(t.price24hPcnt) * 100,
                volume24h: volume,
                high24h: parseFloat(t.highPrice24h || t.high),
                low24h: parseFloat(t.lowPrice24h || t.low),
                tradesCount: null,
                lastUpdate: Date.now()
            };
        });
        
        console.log(`📊 Bybit ${marketType}: загружено ${Object.keys(result).length} тикеров`);
        
        return result;
    }
    
    async fetchKlines(symbol, interval, limit = 500, endTime = null, marketType = 'futures') {
        const intervalMap = {
            '1m': '1', '5m': '5', '15m': '15',
            '1h': '60', '4h': '240', '1d': 'D'
        };
        
        const bybitInterval = intervalMap[interval] || interval;
        const category = marketType === 'spot' ? 'spot' : 'linear';
        let url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;
        if (endTime) url += `&end=${endTime * 1000}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.retCode !== 0 || !data.result?.list) return [];
        
        return data.result.list
            .map(d => ({
                time: Math.floor(parseInt(d[0]) / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5]),
                trades: null
            }))
            .filter(c => c.volume > 0 && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close))
            .reverse();
    }
}

// Фабрика адаптеров
class ExchangeAdapters {
    static createAdapters() {
        return [new BinanceAdapter(), new BybitAdapter()];
    }
    
    static getAdapterByName(adapters, name) {
        return adapters.find(a => a.name === name) || null;
    }
}