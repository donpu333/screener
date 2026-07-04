// WebSocket менеджер для real-time данных (Binance + Bybit)
class MarketWebSocket {
    constructor(screener) {
        this.screener = screener;
        this.wsBinance = null;
        this.wsBybit = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this._binanceInterval = null;
        this._tradeSockets = new Map();
        
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
        // REST для цен всех карточек (каждую секунду)
        this._binanceInterval = setInterval(async () => {
            try {
                const response = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
                const data = await response.json();
                data.forEach(ticker => {
                    const symbol = ticker.symbol;
                    const price = parseFloat(ticker.price);
                    
                    // Обновляем цену в карточке и marketTickers
                    this.updateCardPrice(symbol, price, 'Binance');
                    
                    // Обновляем свечу для активных графиков
                    const activeCards = document.querySelectorAll('.chart-card');
                    for (const card of activeCards) {
                        const symbolSpan = card.querySelector('.symbol-text');
                        const exchangeBadge = card.querySelector('.exchange-badge');
                        
                        if (!symbolSpan || !exchangeBadge) continue;
                        
                        const cardSymbol = symbolSpan.textContent + 'USDT';
                        const cardExchange = exchangeBadge.textContent === 'BINANCE' ? 'Binance' : 'Bybit';
                        
                        if (cardSymbol === symbol && cardExchange === 'Binance') {
                            const container = card.querySelector('.chart-body');
                            if (container && container._chartObj) {
                                const chart = container._chartObj;
                                const last = chart.chartData[chart.chartData.length - 1];
                                if (last) {
                                    last.close = price;
                                    if (price > last.high) last.high = price;
                                    if (price < last.low) last.low = price;
                                    
                                    const series = chart.currentChartType === 'candle' ? 
                                        chart.candleSeries : chart.barSeries;
                                    if (series) {
                                        series.update(last);
                                    }
                                }
                            }
                            break;
                        }
                    }
                });
            } catch (e) {
                console.warn('⚠️ Binance REST error:', e.message);
            }
        }, 1000);
        
        console.log('✅ Binance REST запущен');
        this.updateStatus('🟢 REST онлайн (Binance)');
    }
    
    // ========== BYBIT WEBSOCKET ==========
    connectBybit() {
        const interval = this.mapBybitInterval(this.screener.state.interval);
        
        // Используем WebSocket для всех USDT пар Bybit
        const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
        this.wsBybit = new WebSocket(wsUrl);
        
        this.wsBybit.onopen = () => {
            console.log('✅ Bybit WebSocket connected');
            
            // Подписываемся на kline для всех пар
            const symbols = [];
            for (const ticker of this.screener.marketTickers.values()) {
                if (ticker.exchange === 'Bybit' && ticker.symbol.endsWith('USDT')) {
                    symbols.push(ticker.symbol);
                }
            }
            
            if (symbols.length > 0) {
                const args = symbols.map(s => `kline.${interval}.${s}`);
                
                // Отправляем пакетами по 50
                const chunkSize = 50;
                for (let i = 0; i < args.length; i += chunkSize) {
                    const chunk = args.slice(i, i + chunkSize);
                    setTimeout(() => {
                        if (this.wsBybit && this.wsBybit.readyState === WebSocket.OPEN) {
                            this.wsBybit.send(JSON.stringify({ op: "subscribe", args: chunk }));
                            console.log(`📤 Подписка Bybit: ${chunk.length} пар`);
                        }
                    }, i / chunkSize * 200);
                }
            }
            
            this.updateStatus('🟢 WebSocket онлайн (Binance+Bybit)');
        };
        
        this.wsBybit.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Понг на пинг
                if (msg.op === 'ping') {
                    this.wsBybit.send(JSON.stringify({ op: 'pong' }));
                    return;
                }
                
                // Обработка kline данных
                if (msg.topic && msg.topic.includes('kline') && msg.data) {
                    this.handleBybitKlineMessage(msg);
                }
            } catch (e) {
                console.warn('Bybit WS message error:', e);
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
            
            if (!data || !Array.isArray(data) || data.length === 0) return;
            
            // Парсим символ из topic: "kline.15.BTCUSDT"
            const match = topic.match(/kline\.\w+\.(\w+)/);
            if (!match) return;
            
            const symbol = match[1];
            const klineData = data[0]; // Первый элемент массива
            
            const candle = {
                time: Math.floor(klineData.start / 1000),
                open: parseFloat(klineData.open),
                high: parseFloat(klineData.high),
                low: parseFloat(klineData.low),
                close: parseFloat(klineData.close),
                volume: parseFloat(klineData.volume),
                trades: null
            };
            
            const interval = this.screener.state.interval;
            const historyKey = `${symbol}:Bybit:${this.screener.state.marketType}:${interval}`;
            let candles = this.screener.marketHistory.get(historyKey) || [];
            
            const lastCandle = candles[candles.length - 1];
            
            if (lastCandle && lastCandle.time === candle.time) {
                // Обновляем существующую свечу
                candles[candles.length - 1] = candle;
                this.screener.marketHistory.set(historyKey, candles);
                this.updateChartCandle(symbol, candle, 'Bybit');
            } else if (klineData.confirm) {
                // Новая закрытая свеча
                candles.push(candle);
                if (candles.length > CONFIG.candlesCount) {
                    candles.shift();
                }
                this.screener.marketHistory.set(historyKey, candles);
                this.updateChartCandle(symbol, candle, 'Bybit');
            }
            
            // Обновляем цену в карточке и marketTickers
            this.updateCardPrice(symbol, candle.close, 'Bybit');
            
        } catch (e) {
            console.warn('Bybit kline parse error:', e);
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
    
    // ========== ОБНОВЛЕНИЕ ГРАФИКОВ ==========
   updateChartCandle(symbol, candle, exchange) {
    const cards = document.querySelectorAll('.chart-card');
    
    for (const card of cards) {
        const symbolSpan = card.querySelector('.symbol-text');
        const exchangeBadge = card.querySelector('.exchange-badge');
        
        if (!symbolSpan || !exchangeBadge) continue;
        
        const cardExchange = exchangeBadge.textContent === 'BINANCE' ? 'Binance' : 'Bybit';
        const cardSymbol = symbolSpan.textContent + 'USDT';
        
        if (cardSymbol === symbol && cardExchange === exchange) {
            const container = card.querySelector('.chart-body');
            if (container && container._chartObj && container._chartObj.chart) {
                try {
                    container._chartObj.updateLastCandle(candle);
                } catch(e) {}
            }
            break;
        }
    }
}
    // 🔥 ПОЛНОСТЬЮ ИСПРАВЛЕННЫЙ МЕТОД
    updateCardPrice(symbol, price, exchange) {
        // Обновляем marketTickers
        const tickerKey = `${symbol}:${exchange}:${this.screener.state.marketType}`;
        const ticker = this.screener.marketTickers.get(tickerKey);
        if (ticker) {
            const oldPrice = ticker.price;
            ticker.price = price;
            
            // Пересчитываем change24h если есть старая цена
            if (oldPrice && ticker.openPrice24h) {
                ticker.change24h = ((price - ticker.openPrice24h) / ticker.openPrice24h) * 100;
            }
        }
        
        // Обновляем DOM
        const cards = document.querySelectorAll('.chart-card');
        
        for (const card of cards) {
            const symbolSpan = card.querySelector('.symbol-text');
            const exchangeBadge = card.querySelector('.exchange-badge');
            
            if (!symbolSpan || !exchangeBadge) continue;
            
            // 🔥 ИСПРАВЛЕНО: правильные названия бирж
            const cardExchange = exchangeBadge.textContent === 'BINANCE' ? 'Binance' : 'Bybit';
            const cardSymbol = symbolSpan.textContent + 'USDT';
            
            if (cardSymbol === symbol && cardExchange === exchange) {
                // Обновляем цену
                const priceSpan = card.querySelector('.chart-price');
                if (priceSpan) {
                    priceSpan.textContent = Utils.formatPrice(price);
                    
                    // Обновляем класс (цвет) на основе change24h
                    if (ticker && ticker.change24h !== undefined) {
                        const pos = ticker.change24h >= 0;
                        priceSpan.className = `chart-price ${pos ? 'positive' : 'negative'}`;
                        
                        // Обновляем процент изменения
                        const changeSpan = card.querySelector('.chart-change');
                        if (changeSpan) {
                            changeSpan.textContent = Utils.formatChange(ticker.change24h);
                            changeSpan.className = `chart-change ${pos ? 'positive' : 'negative'}`;
                        }
                    }
                }
                break;
            }
        }
    }
    
    // ========== УПРАВЛЕНИЕ ==========
    
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
        
        if (this._tradeSockets) {
            for (const ws of this._tradeSockets.values()) {
                try { ws.close(); } catch(e) {}
            }
            this._tradeSockets.clear();
        }
    }
}
