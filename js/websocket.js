// WebSocket менеджер для real-time данных
class MarketWebSocket {
    constructor(screener) {
        this.screener = screener;
        this.ws = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.connectionStable = false;
        this.stabilityCheckTimer = null;
        
        this.init();
    }
    
    init() {
        this.connect();
    }
    
    connect() {
        // Очищаем старое соединение
        this.cleanup();
        
        const interval = this.screener.state.interval;
        const binanceSymbols = [];
        
        // БЕРЁМ ТОЛЬКО USDT пары и ОГРАНИЧИВАЕМ количество
        for (const ticker of this.screener.marketTickers.values()) {
            if (ticker.exchange === 'Binance' && ticker.symbol.endsWith('USDT')) {
                binanceSymbols.push(ticker.symbol.toLowerCase() + '@kline_' + interval);
            }
        }
        
        // 🔥 ВАЖНО: Ограничиваем до 50 потоков для стабильности
        const MAX_STREAMS = 50;
        const limitedSymbols = binanceSymbols.slice(0, MAX_STREAMS);
        
        if (limitedSymbols.length > 0) {
            // Используем комбинированный поток
            const streamUrl = `wss://fstream.binance.com/stream?streams=${limitedSymbols.join('/')}`;
            console.log(`🔌 Подключаем WebSocket с ${limitedSymbols.length} потоками...`);
            
            this.ws = new WebSocket(streamUrl);
            this.setupEventHandlers();
        } else {
            this.updateStatus('⚠️ Нет пар Binance для WebSocket');
        }
    }
    
    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('✅ Market WebSocket connected');
            this.connected = true;
            this.connectionStable = true;
            this.updateStatus('🟢 WebSocket онлайн');
            
            // Запускаем пинг для поддержания соединения
            this.startPing();
            
            // Проверяем стабильность через 2 секунды
            this.checkStability();
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Обработка пинг-понга
                if (msg.ping) {
                    this.ws.send(JSON.stringify({ pong: msg.ping }));
                    return;
                }
                
                if (msg.stream && msg.data) {
                    this.handleKlineMessage(msg);
                }
            } catch (e) {
                console.warn('WS message error', e);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log(`🔴 WebSocket закрыт: код ${event.code}, причина: ${event.reason}`);
            this.connected = false;
            this.connectionStable = false;
            this.updateStatus('🔴 WebSocket отключён');
            this.stopPing();
            
            // Переподключаемся только если не было нормального закрытия
            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };
        
        this.ws.onerror = (err) => {
            console.error('⚠️ WebSocket error:', err);
            // НЕ МЕНЯЕМ СТАТУС СРАЗУ - ждём onclose
        };
    }
    
    handleKlineMessage(msg) {
        const stream = msg.stream;
        const kline = msg.data.k;
        
        if (!kline || !kline.x) return; // Игнорируем незакрытые свечи
        
        const symbol = stream.split('@')[0].toUpperCase();
        const interval = stream.split('@')[1].replace('kline_', '');
        
        const tickerKey = `${symbol}:Binance`;
        const ticker = this.screener.marketTickers.get(tickerKey);
        
        if (!ticker) return;
        
        const candle = {
            time: Math.floor(kline.t / 1000),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            trades: kline.n ? parseInt(kline.n) : null
        };
        
        const historyKey = `${symbol}:Binance:${interval}`;
        let candles = this.screener.marketHistory.get(historyKey) || [];
        
        const lastCandle = candles[candles.length - 1];
        
        if (lastCandle && lastCandle.time === candle.time) {
            // Обновляем существующую свечу
            candles[candles.length - 1] = candle;
        } else {
            // Добавляем новую свечу
            candles.push(candle);
            if (candles.length > CONFIG.candlesCount) {
                candles.shift();
            }
        }
        
        this.screener.marketHistory.set(historyKey, candles);
        this.updateChartIfVisible(symbol, 'Binance', interval, candles);
    }
    
    startPing() {
        this.stopPing();
        
        // Отправляем пинг каждые 3 минуты (Binance отключает через 5 минут бездействия)
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ ping: Date.now() }));
            }
        }, 180000); // 3 минуты
    }
    
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
    
    checkStability() {
        if (this.stabilityCheckTimer) {
            clearTimeout(this.stabilityCheckTimer);
        }
        
        this.stabilityCheckTimer = setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.connectionStable = true;
                this.updateStatus('🟢 WebSocket онлайн');
            } else if (this.connected) {
                // Было открыто, но закрылось - переподключаем
                this.connected = false;
                this.updateStatus('🔄 WebSocket переподключение...');
                this.scheduleReconnect();
            }
        }, 2000);
    }
    
  // js/websocket.js — метод updateChartIfVisible
updateChartIfVisible(symbol, exchange, interval, candles) {
    const cards = document.querySelectorAll('.chart-card:not(.signal-card)');
    
    for (const card of cards) {
        const symEl = card.querySelector('.chart-symbol');
        if (!symEl) continue;
        
        const symText = symEl.childNodes[0]?.nodeValue?.trim() || '';
        const exchEl = card.querySelector('.chart-exchange');
        const exch = exchEl ? exchEl.textContent : '';
        
        if (symText + 'USDT' === symbol && exch === exchange) {
            const container = card.querySelector('.chart-body');
            if (!container) continue;
            
            try {
                // ✅ НОВОЕ: обновляем через setData
                const chartObj = this.screener.pool.acquire(container);
                chartObj.setData(candles);
            } catch (e) {}
            
            break;
        }
    }
}
    
    scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        this.updateStatus('🔄 Переподключение через 3с...');
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            console.log('🔄 Попытка переподключения WebSocket...');
            this.connect();
        }, 3000);
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
        
        // Плавное переподключение
        if (this.ws) {
            this.ws.close(1000, 'Changing interval');
        }
        
        // Небольшая задержка перед новым подключением
        setTimeout(() => {
            this.connect();
        }, 500);
    }
    
    cleanup() {
        this.stopPing();
        
        if (this.stabilityCheckTimer) {
            clearTimeout(this.stabilityCheckTimer);
            this.stabilityCheckTimer = null;
        }
        
        if (this.ws) {
            try {
                this.ws.close(1000, 'Cleanup');
            } catch (e) {
                // Игнорируем
            }
            this.ws = null;
        }
        
        this.connected = false;
        this.connectionStable = false;
    }
}