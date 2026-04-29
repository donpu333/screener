// WebSocket менеджер для real-time данных (Binance + Bybit)
class MarketWebSocket {
    constructor(screener) {
        this.screener = screener;
        this.wsBinance = null;
        this.wsBybit = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.pingTimer = null;
        
        this.init();
        
    }
    
    init() {
        this.connect();
    }
    
    connect() {
        this.cleanup();
        this.connectBinance();
        this.connectBybit();
    }
    
    // ========== BINANCE WEBSOCKET ==========
  connectBinance() {
    this._tradeSockets = new Map(); // symbol -> WebSocket
    
    // REST для цен всех карточек (каждую секунду)
    this._binanceInterval = setInterval(async () => {
        try {
            const response = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
            const data = await response.json();
            data.forEach(ticker => {
                const symbol = ticker.symbol;
                const price = parseFloat(ticker.price);
                
                // Обновляем цену в карточке
                this.updateCardPrice(symbol, price, 'Binance');
                
                // Если для этого символа есть активный график — обновляем свечу
                const activeCards = document.querySelectorAll('.chart-card');
                for (const card of activeCards) {
                    const symbolSpan = card.querySelector('.symbol-text');
                    if (symbolSpan && symbolSpan.textContent + 'USDT' === symbol) {
                        const container = card.querySelector('.chart-body');
                        if (container && container._chartObj) {
                            const chart = container._chartObj;
                            const last = chart.chartData[chart.chartData.length - 1];
                            if (last) {
                                last.close = price;
                                if (price > last.high) last.high = price;
                                if (price < last.low) last.low = price;
                                chart.currentRealPrice = price;
                                chart.lastCandle = last;
                                
                                const series = chart.currentChartType === 'candle' ? 
                                    chart.candleSeries : chart.barSeries;
                                if (series) {
                                    series.update(last);
                                    series.applyOptions({ priceLineSource: price });
                                }
                            }
                        }
                        break;
                    }
                }
            });
        } catch (e) {}
    }, 1000);
    
    console.log('✅ Binance REST + свечи запущены');
    this.updateStatus('🟢 REST онлайн (Binance)');
}
    
    setupBinanceHandlers() {
        this.wsBinance.onopen = () => {
            console.log('✅ Binance WebSocket connected');
            this.updateStatus('🟢 WebSocket онлайн (Binance)');
            this.startPing(this.wsBinance);
        };
        
        this.wsBinance.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                if (msg.ping) {
                    this.wsBinance.send(JSON.stringify({ pong: msg.ping }));
                    return;
                }
                
                if (msg.stream && msg.data) {
                    this.handleKlineMessage(msg, 'Binance');
                }
            } catch (e) {
                console.warn('Binance WS error', e);
            }
        };
        
        this.wsBinance.onclose = (event) => {
            console.log(`🔴 Binance WebSocket закрыт: код ${event.code}`);
            setTimeout(() => this.connectBinance(), 3000);
        };
        
        this.wsBinance.onerror = (err) => {
            console.error('⚠️ Binance WebSocket error:', err);
        };
    }
    
    // ========== BYBIT WEBSOCKET ==========
    connectBybit() {
        const interval = this.mapBybitInterval(this.screener.state.interval);
        const bybitSymbols = [];
        
        // Берём все USDT пары Bybit
        for (const ticker of this.screener.marketTickers.values()) {
            if (ticker.exchange === 'Bybit' && ticker.symbol.endsWith('USDT')) {
                bybitSymbols.push(ticker.symbol);
            }
        }
        
        if (bybitSymbols.length > 0) {
            // Bybit WebSocket публичный
            const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
            this.wsBybit = new WebSocket(wsUrl);
            this.setupBybitHandlers(bybitSymbols, interval);
        } else {
            console.log('⚠️ Нет пар Bybit для WebSocket');
        }
    }
setupBybitHandlers(symbols, interval) {
    this.wsBybit.onopen = () => {
        console.log(`✅ Bybit WebSocket connected, подписываем ${symbols.length} пар`);
        
        const args = symbols.map(s => `kline.${interval}.${s}`);
        
        // 🔥 Отправляем пакетами по 50
        const chunkSize = 50;
        for (let i = 0; i < args.length; i += chunkSize) {
            const chunk = args.slice(i, i + chunkSize);
            setTimeout(() => {
                if (this.wsBybit && this.wsBybit.readyState === WebSocket.OPEN) {
                    this.wsBybit.send(JSON.stringify({ op: "subscribe", args: chunk }));
                    console.log(`📤 Подписка на ${chunk.length} пар Bybit`);
                }
            }, i / chunkSize * 200); // задержка 200мс между пакетами
        }
        
        this.updateStatus('🟢 WebSocket онлайн (Binance+Bybit)');
    };
        
        this.wsBybit.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Обработка kline данных
                if (msg.topic && msg.topic.includes('kline')) {
                    this.handleBybitKlineMessage(msg);
                }
                
                // Понг на пинг
                if (msg.op === 'ping') {
                    this.wsBybit.send(JSON.stringify({ op: 'pong' }));
                }
            } catch (e) {
                console.warn('Bybit WS error', e);
            }
        };
        
        this.wsBybit.onclose = (event) => {
            console.log(`🔴 Bybit WebSocket закрыт: код ${event.code}`);
            setTimeout(() => this.connectBybit(), 3000);
        };
        
        this.wsBybit.onerror = (err) => {
            console.error('⚠️ Bybit WebSocket error:', err);
        };
    }
    
    handleBybitKlineMessage(msg) {
        try {
            const topic = msg.topic;
            const data = msg.data;
            
            if (!data) return;
            
            // Парсим символ из topic: "kline.15m.BTCUSDT"
            const match = topic.match(/kline\.\w+\.(\w+)/);
            if (!match) return;
            
            const symbol = match[1];
            const interval = this.screener.state.interval;
            
            const candle = {
                time: data.start,
                open: parseFloat(data.open),
                high: parseFloat(data.high),
                low: parseFloat(data.low),
                close: parseFloat(data.close),
                volume: parseFloat(data.volume),
                trades: null
            };
            
            const historyKey = `${symbol}:Bybit:${this.screener.state.marketType}:${interval}`;
            let candles = this.screener.marketHistory.get(historyKey) || [];
            
            const lastCandle = candles[candles.length - 1];
            
            if (lastCandle && lastCandle.time === candle.time) {
                candles[candles.length - 1] = candle;
                this.screener.marketHistory.set(historyKey, candles);
                this.updateChartCandle(symbol, candle, 'Bybit');
            } else if (data.confirm) {
                candles.push(candle);
                if (candles.length > CONFIG.candlesCount) {
                    candles.shift();
                }
                this.screener.marketHistory.set(historyKey, candles);
                this.updateChartCandle(symbol, candle, 'Bybit');
            }
            
            this.updateCardPrice(symbol, candle.close, 'Bybit');
            
        } catch (e) {
            console.warn('Bybit message error', e);
        }
    }
    
    mapBybitInterval(interval) {
        const map = {
            '1m': '1',
            '5m': '5',
            '15m': '15',
            '1h': '60',
            '4h': '240',
            '1d': 'D'
        };
        return map[interval] || '15';
    }
    
    // ========== ОБЩИЕ МЕТОДЫ ==========
    
    handleKlineMessage(msg, exchange) {
        const stream = msg.stream;
        const kline = msg.data.k;
        
        if (!kline) return;
        
        const symbol = stream.split('@')[0].toUpperCase();
        const interval = stream.split('@')[1].replace('kline_', '');
        
        const candle = {
            time: Math.floor(kline.t / 1000),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            trades: kline.n ? parseInt(kline.n) : null
        };
        
        const historyKey = `${symbol}:${exchange}:${this.screener.state.marketType}:${interval}`;
        let candles = this.screener.marketHistory.get(historyKey) || [];
        
        const lastCandle = candles[candles.length - 1];
        
        if (lastCandle && lastCandle.time === candle.time) {
            candles[candles.length - 1] = candle;
            this.screener.marketHistory.set(historyKey, candles);
            this.updateChartCandle(symbol, candle, exchange);
        } else if (kline.x) {
            candles.push(candle);
            if (candles.length > CONFIG.candlesCount) {
                candles.shift();
            }
            this.screener.marketHistory.set(historyKey, candles);
            this.updateChartCandle(symbol, candle, exchange);
        }
        
        this.updateCardPrice(symbol, candle.close, exchange);
    }
    
 updateChartCandle(symbol, candle, exchange) {
    const cards = document.querySelectorAll('.chart-card');
    
    for (const card of cards) {
        const symbolSpan = card.querySelector('.symbol-text');
        const exchangeSpan = card.querySelector('.exchange-badge');
        
        if (!symbolSpan || !exchangeSpan) continue;
        
        // 🔥 ИСПРАВИТЬ ЗДЕСЬ — ищем 'BINANCE' и 'BYBIT'
        let cardExchange = '';
        if (exchangeSpan.textContent === 'BINANCE') cardExchange = 'Binance';
        if (exchangeSpan.textContent === 'BYBIT') cardExchange = 'Bybit';
        
        const cardSymbol = symbolSpan.textContent + 'USDT';
        
        if (cardSymbol === symbol && cardExchange === exchange) {
            const container = card.querySelector('.chart-body');
            if (container && container._chartObj) {
                container._chartObj.updateLastCandle(candle);
            }
            break;
        }
    }
}
    
    updateCardPrice(symbol, price, exchange) {
        const cards = document.querySelectorAll('.chart-card');
        
        for (const card of cards) {
            const symbolSpan = card.querySelector('.symbol-text');
            const exchangeSpan = card.querySelector('.exchange-badge');
            
            if (!symbolSpan || !exchangeSpan) continue;
            
            let cardExchange = '';
            if (exchangeSpan.textContent === 'BIN') cardExchange = 'Binance';
            if (exchangeSpan.textContent === 'BYB') cardExchange = 'Bybit';
            
            const cardSymbol = symbolSpan.textContent + 'USDT';
            
            if (cardSymbol === symbol && cardExchange === exchange) {
                const priceSpan = card.querySelector('.chart-price');
                if (priceSpan) {
                    priceSpan.textContent = Utils.formatPrice(price);
                    
                    const changeSpan = card.querySelector('.chart-change');
                    if (changeSpan && this.screener) {
                        const tickerKey = `${symbol}:${exchange}:${this.screener.state.marketType}`;
                        const ticker = this.screener.marketTickers.get(tickerKey);
                        if (ticker && ticker.change24h) {
                            const pos = ticker.change24h >= 0;
                            priceSpan.className = `chart-price ${pos ? 'positive' : 'negative'}`;
                        }
                    }
                }
                break;
            }
        }
    }
    
    startPing(ws) {
        if (this.pingTimer) clearInterval(this.pingTimer);
        
        this.pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ ping: Date.now() }));
            }
        }, 180000);
    }
    
    updateStatus(text) {
        const statusEl = document.getElementById('wsStatus');
        if (statusEl) {
            statusEl.textContent = `🔌 ${text}`;
        }
    }
    
    resubscribe() {
        console.log('🔄 Resubscribe WebSocket с новым интервалом');
        this.updateStatus('🔄 Смена интервала...');
        this.connect();
    }
    
    cleanup() {
    if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
    }
    
    if (this._binanceInterval) {
        clearInterval(this._binanceInterval);
        this._binanceInterval = null;
    }
    
    if (this.wsBinance) {
        try { this.wsBinance.close(1000, 'Cleanup'); } catch(e) {}
        this.wsBinance = null;
    }
    
    if (this.wsBybit) {
        try { this.wsBybit.close(1000, 'Cleanup'); } catch(e) {}
        this.wsBybit = null;
    }
}
}