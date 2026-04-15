// js/screener.js — ПОЛНЫЙ КЛАСС С ИСПРАВЛЕНИЯМИ
class CryptoScreener {
    constructor() {
        // Инициализация адаптеров
        this.marketAdapters = ExchangeAdapters.createAdapters();
        
        // Хранилища данных
        this.marketTickers = new Map();
        this.marketHistory = new Map();
        this.signals = new Map();
        
        // Пул графиков
        this.pool = new ChartPool();
        
        // Кеш метрик
        this.metricsCache = new Map();
        
        // Observer для ленивой загрузки
        this.observer = null;
        
        // Загрузка сохранённых настроек
        const saved = Utils.loadSettings();
        
        // Состояние
        this.state = {
            filter: 'all',
            exchange: 'all',
            marketType: saved.marketType || 'futures',
            interval: saved.interval || CONFIG.defaultInterval,
            sortBy: saved.sortBy || 'default',
            sortDir: saved.sortDir || 'desc',
            limit: saved.limit === 'all' ? 'all' : (parseInt(saved.limit) || 100),
            minVolume: saved.minVolume || 1000000,
            displayPeriod: 'all',
            gridCols: saved.gridCols || 'auto'
        };
        
        // Элементы DOM
        this.elements = this.cacheElements();
        
        // Применяем сохранённые значения
        this.applySavedSettings();
        
        // Инициализация
        this.init();
    }
    
    cacheElements() {
        return {
            grid: document.getElementById('gridContainer'),
            marketStatus: document.getElementById('marketStatus'),
            filterBtns: document.querySelectorAll('.filter-btn'),
            intervalSelect: document.getElementById('intervalSelect'),
            exchangeSelect: document.getElementById('exchangeSelect'),
            marketTypeSelect: document.getElementById('marketTypeSelect'),
            sortSelect: document.getElementById('sortSelect'),
            sortDirSelect: document.getElementById('sortDirSelect'),
            limitSelect: document.getElementById('limitSelect'),
            minVolumeSelect: document.getElementById('minVolumeSelect'),
            refreshBtn: document.getElementById('refreshBtn'),
            periodBtns: document.querySelectorAll('.period-btn'),
            gridColsSelect: document.getElementById('gridColsSelect'),
            counts: {
                all: document.getElementById('count-all'),
                market: document.getElementById('count-market'),
                signals: document.getElementById('count-signals'),
                gainers: document.getElementById('count-gainers'),
                losers: document.getElementById('count-losers'),
                volume: document.getElementById('count-volume')
            }
        };
    }
    
    applySavedSettings() {
        if (this.elements.intervalSelect) {
            this.elements.intervalSelect.value = this.state.interval;
        }
        if (this.elements.exchangeSelect) {
            this.elements.exchangeSelect.value = this.state.exchange;
        }
        if (this.elements.marketTypeSelect) {
            this.elements.marketTypeSelect.value = this.state.marketType;
        }
        if (this.elements.sortSelect) {
            this.elements.sortSelect.value = this.state.sortBy;
        }
        if (this.elements.sortDirSelect) {
            this.elements.sortDirSelect.value = this.state.sortDir;
        }
        if (this.elements.limitSelect) {
            this.elements.limitSelect.value = this.state.limit === 'all' ? 'all' : this.state.limit;
        }
        if (this.elements.minVolumeSelect) {
            this.elements.minVolumeSelect.value = this.state.minVolume;
        }
        if (this.elements.gridColsSelect) {
            this.elements.gridColsSelect.value = this.state.gridCols;
        }
        
        this.applyGridCols(this.state.gridCols);
    }
    
    applyGridCols(cols) {
        const container = this.elements.grid;
        if (!container) return;
        
        if (cols === 'auto') {
            container.style.setProperty('--grid-cols', 'repeat(auto-fill, minmax(340px, 1fr))');
        } else {
            container.style.setProperty('--grid-cols', `repeat(${cols}, 1fr)`);
        }
    }
    
    async init() {
    // 🔥 СНАЧАЛА создаём Observer, чтобы он был доступен при renderGrid()
    this.setupIntersectionObserver();

    // Инициализация менеджера алертов
    this.alertManager = new AlertManager(this);
    
    // Привязка событий
    this.bindEvents();
    
    // Загрузка данных (внутри вызывает renderGrid, где используется this.observer)
    await this.loadMarketData();
    
    // Ждём отрисовки DOM
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Инициализация WebSocket после загрузки
    this.marketWS = new MarketWebSocket(this);
    
    // Принудительно загружаем видимые графики
    setTimeout(() => {
        this.forceLoadVisibleCharts();
    }, 200);
    
    // Заглушка для сигналов
    this.wsClient = {
        updateStatus: (text) => {
            const statusEl = document.getElementById('wsStatus');
            if (statusEl) statusEl.textContent = `🔌 ${text}`;
        }
    };
}
    
    // 🔥 НОВЫЙ МЕТОД (ВОТ СЮДА ВСТАВИТЬ)
    forceLoadVisibleCharts() {
        const cards = document.querySelectorAll('.chart-card:not(.signal-card)');
        let loaded = 0;
        
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                const symbol = card.dataset.symbol;
                const exchange = card.dataset.exchange;
                const marketType = card.dataset.marketType;
                const key = `${symbol}:${exchange}:${marketType}`;
                const ticker = this.marketTickers.get(key);
                
                if (ticker && !card.dataset.loaded) {
                    card.dataset.loaded = 'true';
                    this.loadMarketChart(card, ticker)
                        .then(() => this.getMetricsForTicker(ticker))
                        .then(metrics => {
                            this.updateMarketCardFooter(card, ticker, metrics);
                        })
                        .catch(() => {});
                    loaded++;
                }
            }
        });
        
        console.log(`📊 Принудительно загружено ${loaded} графиков`);
    }
    
    bindEvents() {
        const debouncedRender = Utils.debounce(() => this.renderGrid(), 300);
        
        // Фильтры
        this.elements.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.filter = btn.dataset.filter;
                debouncedRender();
            });
        });
        
        // Интервал
        if (this.elements.intervalSelect) {
            this.elements.intervalSelect.addEventListener('change', async (e) => {
                this.state.interval = e.target.value;
                this.marketHistory.clear();
                this.metricsCache.clear();
                Utils.saveSettings(this.state);
                
                if (this.marketWS) this.marketWS.resubscribe();
                
                await this.renderGrid();
            });
        }
        
        // Биржа
        if (this.elements.exchangeSelect) {
            this.elements.exchangeSelect.addEventListener('change', (e) => {
                this.state.exchange = e.target.value;
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        // Тип рынка (SPOT/FUTURES)
        if (this.elements.marketTypeSelect) {
            this.elements.marketTypeSelect.addEventListener('change', async (e) => {
                this.state.marketType = e.target.value;
                Utils.saveSettings(this.state);
                this.marketTickers.clear();
                this.marketHistory.clear();
                this.metricsCache.clear();
                
                if (this.elements.marketStatus) {
                    this.elements.marketStatus.textContent = '⏳ Загрузка...';
                }
                
                await this.loadMarketData();
                if (this.marketWS) this.marketWS.resubscribe();
            });
        }
        
        // Сортировка
        if (this.elements.sortSelect) {
            this.elements.sortSelect.addEventListener('change', (e) => {
                this.state.sortBy = e.target.value;
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        if (this.elements.sortDirSelect) {
            this.elements.sortDirSelect.addEventListener('change', (e) => {
                this.state.sortDir = e.target.value;
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        // Лимит
        if (this.elements.limitSelect) {
            this.elements.limitSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                this.state.limit = val === 'all' ? 'all' : parseInt(val);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        // Мин. объём
        if (this.elements.minVolumeSelect) {
            this.elements.minVolumeSelect.addEventListener('change', (e) => {
                this.state.minVolume = parseInt(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        // Обновить
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', async () => {
                if (this.elements.marketStatus) {
                    this.elements.marketStatus.textContent = '⏳ Обновление...';
                }
                this.marketTickers.clear();
                this.metricsCache.clear();
                
                await this.loadMarketData();
                if (this.marketWS) this.marketWS.resubscribe();
            });
        }
        
        // Период отображения метрик
        this.elements.periodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.periodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.displayPeriod = btn.dataset.period;
                this.rerenderMetrics();
            });
        });
        
        // Колонки
        if (this.elements.gridColsSelect) {
            this.elements.gridColsSelect.addEventListener('change', (e) => {
                const cols = e.target.value;
                this.state.gridCols = cols;
                Utils.saveSettings(this.state);
                this.applyGridCols(cols);
            });
        }
        
        // Ресайз
        window.addEventListener('resize', Utils.debounce(() => this.pool.resizeAll(), 200));
    }
    
    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const card = entry.target;
                    const symbol = card.dataset.symbol;
                    const exchange = card.dataset.exchange;
                    const marketType = card.dataset.marketType;
                    
                    if (!symbol || !exchange) return;
                    
                    const key = `${symbol}:${exchange}:${marketType}`;
                    const ticker = this.marketTickers.get(key);
                    if (!ticker) return;
                    
                    this.loadMarketChart(card, ticker)
                        .then(() => this.getMetricsForTicker(ticker))
                        .then(metrics => {
                            this.updateMarketCardFooter(card, ticker, metrics);
                            this.observer.unobserve(card);
                        })
                        .catch(() => {
                            console.warn('Повторная попытка при следующем появлении');
                        });
                }
            });
        }, { rootMargin: '200px' });
    }
    
  async loadMarketData() {
    try {
        console.log('🔄 Начинаем загрузку тикеров...');
        const promises = this.marketAdapters.map(async (adapter) => {
            try {
                console.log(`📡 Запрос к ${adapter.name} (${this.state.marketType})...`);
                const tickers = await adapter.fetchAllTickers(this.state.marketType);
                console.log(`✅ ${adapter.name}: получено ${Object.keys(tickers).length} тикеров`);
                
                Object.values(tickers).forEach(t => {
                    const key = `${t.symbol}:${t.exchange}:${t.marketType}`;
                    this.marketTickers.set(key, t);
                });
            } catch (e) {
                console.error(`❌ Ошибка в ${adapter.name}:`, e);
                throw e; // пробрасываем дальше
            }
        });
        
        await Promise.all(promises);
        
        console.log(`📊 Итого тикеров в marketTickers: ${this.marketTickers.size}`);
        
        if (this.elements.marketStatus) {
            this.elements.marketStatus.textContent = `✅ Загружено ${this.marketTickers.size} тикеров`;
        }
        
        this.updateCounts();
        await this.renderGrid();
    } catch (e) {
        console.error('💥 КРИТИЧЕСКАЯ ОШИБКА в loadMarketData:', e);
        if (this.elements.marketStatus) {
            this.elements.marketStatus.textContent = '❌ Ошибка загрузки';
        }
    }
}
    
    updateCounts() {
        const marketItems = [];
        for (const t of this.marketTickers.values()) {
            if (t.volume24h >= this.state.minVolume) marketItems.push(t);
        }
        
        const signalItems = Array.from(this.signals.values());
        
        if (this.elements.counts.all) {
            this.elements.counts.all.textContent = marketItems.length + signalItems.length;
        }
        if (this.elements.counts.market) {
            this.elements.counts.market.textContent = marketItems.length;
        }
        if (this.elements.counts.signals) {
            this.elements.counts.signals.textContent = signalItems.length;
        }
        if (this.elements.counts.gainers) {
            this.elements.counts.gainers.textContent = marketItems.filter(t => t.change24h > 0).length;
        }
        if (this.elements.counts.losers) {
            this.elements.counts.losers.textContent = marketItems.filter(t => t.change24h < 0).length;
        }
        if (this.elements.counts.volume) {
            this.elements.counts.volume.textContent = marketItems.filter(t => t.volume24h > 1e7).length;
        }
    }
    
    async getMetricsForTicker(ticker) {
        const cacheKey = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:${this.state.interval}`;
        const cached = this.metricsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < CONFIG.metricsCacheTime) {
            return cached.data;
        }
        
        const key = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:${this.state.interval}`;
        let candles = this.marketHistory.get(key);
        
        if (!candles) {
            const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
            if (adapter) {
                try {
                    candles = await adapter.fetchKlines(
                        ticker.symbol, 
                        this.state.interval, 
                        CONFIG.candlesCount,
                        null,
                        ticker.marketType
                    );
                    this.marketHistory.set(key, candles);
                } catch (e) {
                    candles = [];
                }
            }
        }
        
        const metrics = Metrics.calculateAllMetrics(candles);
        this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
        
        if (this.alertManager) {
            this.alertManager.checkAlerts(ticker, metrics);
        }
        
        return metrics;
    }
    
    async loadMarketChart(card, ticker) {
        const container = card.querySelector('.chart-body');
        container.innerHTML = '';
        
        // 🔥 ЖДЁМ РЕАЛЬНЫЙ РАЗМЕР КОНТЕЙНЕРА (ВОТ СЮДА ВСТАВИТЬ)
        await new Promise(resolve => {
            const check = () => {
                if (container.clientWidth > 0 && container.clientHeight > 0) {
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
        
        const showError = (message) => {
            container.innerHTML = `
                <div class="chart-placeholder" style="flex-direction: column; gap: 8px;">
                    <span>⚠️ ${message}</span>
                    <button class="retry-chart-btn">🔄 Повторить</button>
                </div>
            `;
            container.querySelector('.retry-chart-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadMarketChart(card, ticker);
            });
        };
        
        try {
            const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
            if (!adapter) throw new Error('Нет адаптера');
            
            const candles = await adapter.fetchKlines(
                ticker.symbol, 
                this.state.interval, 
                500,
                null,
                ticker.marketType
            );
            
            if (!candles || candles.length === 0) {
                throw new Error('Нет данных');
            }
            
            const chartObj = this.pool.acquire(container);
            chartObj.currentSymbol = ticker.symbol;
            chartObj.currentInterval = this.state.interval;
            chartObj.setData(candles);
            
            chartObj.setLoadMoreCallback(async (oldestTime, limit) => {
                const olderCandles = await adapter.fetchKlines(
                    ticker.symbol, 
                    this.state.interval, 
                    limit,
                    oldestTime,
                    ticker.marketType
                );
                return olderCandles;
            });
            
            return candles;
        } catch (error) {
            showError(error.message || 'Ошибка загрузки');
            throw error;
        }
    }
    
    updateMarketCardFooter(card, ticker, metrics) {
        const volumeBadge = card.querySelector('.volume-badge');
        if (volumeBadge) {
            volumeBadge.textContent = Utils.formatVolume(ticker.volume24h);
        }
    }
    
    async renderGrid() {
        this.pool.clear();
        this.elements.grid.innerHTML = '<div class="loading"><div class="spinner"></div>Обновление...</div>';
        
        const items = [];
        
        for (const ticker of this.marketTickers.values()) {
            if (this.shouldDisplayMarket(ticker)) {
                items.push({ type: 'market', data: ticker });
            }
        }
        
        for (const [id, signal] of this.signals.entries()) {
            if (this.shouldDisplaySignal(signal)) {
                items.push({ type: 'signal', data: signal, id });
            }
        }
        
        if (items.length === 0) {
            this.elements.grid.innerHTML = '<div class="loading">Нет данных</div>';
            return;
        }
        
        const sortedItems = await this.sortItems(items);
        const limit = this.state.limit === 'all' ? Infinity : this.state.limit;
        const limitedItems = sortedItems.slice(0, limit);
        
        this.elements.grid.innerHTML = '';
        
        for (const item of limitedItems) {
            if (item.type === 'market') {
                const card = this.createMarketCard(item.data);
                this.elements.grid.appendChild(card);
                this.observer.observe(card);
            }
        }
    }
    
    shouldDisplayMarket(ticker) {
        if (this.state.exchange !== 'all' && ticker.exchange !== this.state.exchange) {
            return false;
        }
        
        if (ticker.volume24h < this.state.minVolume) {
            return false;
        }
        
        const filter = this.state.filter;
        
        if (filter === 'signals') return false;
        if (filter === 'all' || filter === 'market') return true;
        if (filter === 'gainers') return ticker.change24h >= 3;
        if (filter === 'losers') return ticker.change24h <= -3;
        if (filter === 'volume') return ticker.volume24h > 1e7;
        
        return true;
    }
    
    shouldDisplaySignal(signal) {
        if (this.state.filter !== 'all' && this.state.filter !== 'signals') {
            return false;
        }
        
        const basic = signal.basic;
        if (this.state.exchange !== 'all' && basic.exchange !== this.state.exchange) {
            return false;
        }
        
        return true;
    }
    
    async sortItems(items) {
        const sortBy = this.state.sortBy;
        const dir = this.state.sortDir === 'desc' ? -1 : 1;
        
        if (sortBy === 'default') {
            items.sort((a, b) => {
                if (a.type === 'signal' && b.type === 'market') return -1;
                if (a.type === 'market' && b.type === 'signal') return 1;
                if (a.type === 'signal') {
                    return (b.data.timestamp || 0) - (a.data.timestamp || 0);
                }
                return Math.abs(b.data.change24h) - Math.abs(a.data.change24h);
            });
            return items;
        }
        
        const getValue = (item) => {
            if (item.type === 'signal') {
                const m = item.data.metrics?.market_context || {};
                if (sortBy === 'volume') return m.volume_24h_usdt || 0;
                if (sortBy === 'change24h') return m.change_24h_pct || 0;
                return 0;
            }
            
            const t = item.data;
            const m = t._metrics || {};
            
            switch (sortBy) {
                case 'volume': return t.volume24h;
                case 'trades': return t.tradesCount || 0;
                case 'change24h': return t.change24h;
                case 'change1h': return m.change1h ?? -999;
                case 'change15m': return m.change15m ?? -999;
                case 'change5m': return m.change5m ?? -999;
                case 'change1m': return m.change1m ?? -999;
                case 'volChange1m': return m.volChange1m ?? -999;
                case 'volChange5m': return m.volChange5m ?? -999;
                case 'volChange15m': return m.volChange15m ?? -999;
                case 'volChange1h': return m.volChange1h ?? -999;
                case 'tradesChange1m': return m.tradesChange1m ?? -999;
                case 'tradesChange5m': return m.tradesChange5m ?? -999;
                case 'tradesChange15m': return m.tradesChange15m ?? -999;
                case 'tradesChange1h': return m.tradesChange1h ?? -999;
                case 'natr': return m.natr || 0;
                default: return 0;
            }
        };
        
        items.sort((a, b) => {
            const va = getValue(a);
            const vb = getValue(b);
            return va === vb ? 0 : (va > vb ? 1 : -1) * dir;
        });
        
        return items;
    }
    
    createMarketCard(ticker) {
        const card = document.createElement('div');
        card.className = 'chart-card';
        card.dataset.symbol = ticker.symbol;
        card.dataset.exchange = ticker.exchange;
        card.dataset.marketType = ticker.marketType;
        
        const pos = ticker.change24h >= 0;
        const posClass = pos ? 'positive' : 'negative';
        const cleanSymbol = ticker.symbol.replace('USDT', '');
        const isSpot = ticker.marketType === 'spot';
        
        card.innerHTML = `
            <div class="chart-header">
                <span class="symbol-text">${cleanSymbol}</span>
                <span class="market-type-badge ${isSpot ? 'spot' : ''}">${isSpot ? 'S' : 'F'}</span>
                <span class="exchange-badge">${ticker.exchange === 'Binance' ? 'BIN' : 'BYB'}</span>
                <span class="chart-price ${posClass}">${Utils.formatPrice(ticker.price)}</span>
                <span class="chart-change ${posClass}">${Utils.formatChange(ticker.change24h)}</span>
                <span class="volume-badge">${Utils.formatVolume(ticker.volume24h)}</span>
                <button class="copy-symbol-btn" title="${ticker.symbol}">📋</button>
                <button class="alert-symbol-btn" title="Оповещение">🔔</button>
            </div>
            <div class="chart-body"></div>
        `;
        
        card.querySelector('.copy-symbol-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(ticker.symbol);
            const btn = e.target;
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = '📋', 800);
        });
        
        card.querySelector('.alert-symbol-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.alertManager.quickCreate(ticker.symbol, ticker.exchange);
        });
        
        return card;
    }
    
    rerenderMetrics() {
        document.querySelectorAll('.chart-card:not(.signal-card)').forEach(card => {
            const symbol = card.dataset.symbol;
            const exchange = card.dataset.exchange;
            const marketType = card.dataset.marketType;
            
            if (!symbol || !exchange) return;
            
            const key = `${symbol}:${exchange}:${marketType}`;
            const ticker = this.marketTickers.get(key);
            
            if (ticker) {
                this.getMetricsForTicker(ticker).then(metrics => {
                    this.updateMarketCardFooter(card, ticker, metrics);
                });
            }
        });
    }
}