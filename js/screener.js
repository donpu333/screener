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
       // constructor() — найти this.state
this.state = {
    filter: 'gainers',  // ← было 'all', стало 'gainers' (Лидеры роста)
    exchange: 'Binance',
    marketType: saved.marketType || 'futures',
    interval: saved.interval || CONFIG.defaultInterval,
    sortBy: saved.sortBy || 'default',
    sortDir: saved.sortDir || 'desc',
    limit: saved.limit === 'all' ? 'all' : (parseInt(saved.limit) || 100),
    minVolume: saved.minVolume || 100000000,
    displayPeriod: 'all',
    gridCols: '2'
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
    
    // 🔥 Убрал auto, теперь только конкретные значения
    if (cols == 1) {
        container.style.setProperty('--grid-cols', 'repeat(1, 1fr)');
    } else if (cols == 2) {
        container.style.setProperty('--grid-cols', 'repeat(2, 1fr)');  // ← исправлено
    } else if (cols == 3) {
        container.style.setProperty('--grid-cols', 'repeat(3, 1fr)');
    } else if (cols == 4) {
        container.style.setProperty('--grid-cols', 'repeat(4, 1fr)');
    } else if (cols == 6) {
        container.style.setProperty('--grid-cols', 'repeat(6, 1fr)');
    }
}
   async init() {
    // 🔥 СНАЧАЛА создаём Observer, чтобы он был доступен при renderGrid()
    this.setupIntersectionObserver();

    // Инициализация менеджера алертов
    this.alertManager = new AlertManager(this);
    
    // Привязка событий
    this.bindEvents();
    // Добавить в метод init() после bindEvents()
this.setupScrollToTop();
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
    
    // 🔥 УСТАНОВИТЬ АКТИВНУЮ КНОПКУ ФИЛЬТРА "ЛИДЕРЫ РОСТА"
    this.setActiveFilterButton('gainers');
}

// 🔥 ДОБАВИТЬ ЭТОТ МЕТОД В КЛАСС CryptoScreener
setActiveFilterButton(filterName) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        if (btn.dataset.filter === filterName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
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

        // В bindEvents добавь:
const flagFilterBtn = document.getElementById('flagFilterButton');
if (flagFilterBtn) {
    flagFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showFlagFilterPopup(e, flagFilterBtn);
    });
}

    }
    
    showFlagFilterPopup(e, button) {
    const existing = document.querySelector('.flag-filter-popup');
    if (existing) { existing.remove(); return; }
    
    const popup = document.createElement('div');
    popup.className = 'flag-filter-popup';
    const rect = button.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 5) + 'px';
    
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'lime'];
    
    // Кнопка "Все"
    const allBtn = document.createElement('div');
    allBtn.className = 'flag-all' + (this.state.flagFilter === 'all' ? ' active' : '');
    allBtn.textContent = '×';
    allBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.state.flagFilter = 'all';
        popup.remove();
        this.filterByFlag('all');
    });
    popup.appendChild(allBtn);
    
    // Цветные флажки
    colors.forEach(color => {
        const item = document.createElement('div');
        item.className = `flag-option flag-${color}` + (this.state.flagFilter === color ? ' active' : '');
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.state.flagFilter = color;
            popup.remove();
            this.filterByFlag(color);
        });
        popup.appendChild(item);
    });
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        const close = (ev) => {
            if (!popup.contains(ev.target) && ev.target !== button) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 10);
}

filterByFlag(flagColor) {
    this.state.flagFilter = flagColor;
    
    const cards = document.querySelectorAll('.chart-card');
    cards.forEach(card => {
        const flagEl = card.querySelector('.flag');
        
        if (flagColor === 'all') {
            card.style.display = '';
        } else if (flagEl && flagEl.classList.contains(`flag-${flagColor}`)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
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
    
    // Освобождаем старый график из пула перед очисткой
    this.pool.release(container);
    container.innerHTML = '';
    
    // Ждём реальный размер контейнера
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
        
        // 🔥 СОХРАНЯЕМ ВСЕ НЕОБХОДИМЫЕ ДАННЫЕ ДЛЯ ПОПАПА
        chartObj.currentSymbol = ticker.symbol;
        chartObj.currentInterval = this.state.interval;
        chartObj.currentExchange = ticker.exchange;      // ← ДОБАВИТЬ
        chartObj.currentMarketType = ticker.marketType;  // ← ДОБАВИТЬ
        chartObj.screenerAdapter = adapter;              // ← ДОБАВИТЬ
        
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
        
        // 🔥 КОЛБЭК ДЛЯ СМЕНЫ ТАЙМФРЕЙМА (только текущий график)
        chartObj.setOnIntervalChange(async (newInterval) => {
            const newCandles = await adapter.fetchKlines(
                ticker.symbol, 
                newInterval, 
                500,
                null,
                ticker.marketType
            );
            
            if (newCandles && newCandles.length) {
                chartObj.currentInterval = newInterval;
                chartObj.setData(newCandles);
                
                chartObj.setLoadMoreCallback(async (oldestTime, limit) => {
                    const olderCandles = await adapter.fetchKlines(
                        ticker.symbol, 
                        newInterval, 
                        limit,
                        oldestTime,
                        ticker.marketType
                    );
                    return olderCandles;
                });
            }
            return null;
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
    

setupScrollToTop() {
    // Создаём кнопку
    const scrollBtn = document.createElement('button');
    scrollBtn.innerHTML = '↑';
    scrollBtn.className = 'scroll-top-btn';
    scrollBtn.title = 'Наверх к настройкам';
    document.body.appendChild(scrollBtn);
    
    // Показываем кнопку только когда проскроллили больше 300px
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.style.display = 'flex';
        } else {
            scrollBtn.style.display = 'none';
        }
    });
    
    // При клике плавно скроллим наверх
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
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
 <button class="copy-symbol-btn" title="${ticker.symbol}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
</button>

    <button class="alert-symbol-btn" title="Оповещение">
    <svg width="14" height="14" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="#ffffff" d="M 126.5 0 L 134.5 1 L 144 6 L 150 17.5 L 150 39.5 L 151.5 41 L 158.5 43 Q 169.8 49.2 178 58.5 Q 187.1 67.9 192 81.5 L 195 93.5 L 195 145.5 Q 197.5 147 196 152.5 L 202 166.5 L 207.5 172 L 219 177 L 225 188.5 L 225 198.5 L 219 210 L 209.5 215 L 204.5 216 L 175 216 L 168 234.5 L 159.5 244 L 147.5 252 L 138.5 255 L 125.5 256 Q 123.7 253.3 117.5 255 L 108.5 252 L 93 240.5 Q 83.7 230.9 81 216 L 51.5 216 L 46.5 215 L 36 208.5 Q 30.1 202.4 31 189.5 Q 32.7 181.7 37.5 177 L 48.5 172 L 54 166.5 L 58 158.5 L 61 145.5 L 61 93.5 L 64 81.5 Q 70.9 63.4 84.5 52 L 97.5 43 L 106 39.5 L 106 17.5 L 112 6 L 121.5 1 L 126.5 0 Z M 126 15 L 124 16 L 120 20 L 121 21 L 120 22 L 120 37 L 125 36 Q 131 34 133 37 L 136 37 L 136 22 L 136 20 Q 134 14 126 15 Z M 120 51 Q 107 53 99 59 L 84 74 L 77 89 L 75 100 L 75 152 L 69 170 L 69 171 L 188 171 L 184 163 L 181 152 L 181 100 Q 178 98 180 92 L 172 74 L 158 59 L 153 56 L 138 51 L 120 51 Z M 51 186 L 49 187 L 45 193 L 47 199 L 51 201 L 206 201 L 208 200 L 211 197 L 210 196 L 211 193 L 211 191 L 206 186 L 51 186 Z M 97 216 L 100 227 Q 107 237 122 241 L 135 241 L 147 236 Q 157 230 160 217 L 97 216 Z" />
        <path fill="#ffffff" d="M 51.5 4 L 57 7.5 L 58 13.5 Q 42.5 27.5 31 45.5 Q 20.6 61.6 17 84.5 L 13.5 89 L 8.5 90 L 3 85.5 L 3 78.5 L 6 66.5 Q 10.3 50.8 18 38.5 Q 28 22.5 41.5 10 L 47.5 5 L 51.5 4 Z" />
        <path fill="#ffffff" d="M 204.5 4 L 208.5 5 L 223 18.5 Q 237.3 33.7 246 54.5 L 253 78.5 L 253 85.5 Q 250.9 89.9 244.5 90 L 240 86.5 L 233 61.5 L 225 45.5 Q 214.3 28.2 199 15.5 L 198 9.5 L 201.5 5 L 204.5 4 Z" />
        <path fill="#ffffff" d="M 66.5 28 Q 75.3 26.3 77 31.5 L 77 37.5 Q 63.1 49.1 54 65.5 L 51 74.5 L 49 76.5 L 47 88.5 L 43.5 94 L 37.5 95 L 33 91.5 L 32 85.5 Q 38.9 54.9 57.5 36 L 66.5 28 Z" />
        <path fill="#ffffff" d="M 182.5 28 L 189.5 28 L 201 38.5 Q 210.6 49.4 217 63.5 L 221 73.5 L 224 89.5 L 220.5 94 L 214.5 95 L 211 92.5 L 209 88.5 L 207 76.5 L 205 74.5 L 202 65.5 Q 192.9 49.1 179 37.5 L 179 31.5 L 182.5 28 Z" />
    </svg>
</button>


     <span class="market-type-badge ${isSpot ? 'spot' : ''}">${isSpot ? 'S' : 'F'}</span>
<span class="exchange-badge">${ticker.exchange === 'Binance' ? 'BINANCE' : 'BYBIT'}</span>
<span class="flag-container-inline" data-symbol="${ticker.symbol}" data-exchange="${ticker.exchange}" data-market-type="${ticker.marketType}">
    <span class="flag-placeholder"></span>
<span class="flag-arrow">▼</span>
</span>
<span class="chart-price ${posClass}">${Utils.formatPrice(ticker.price)}</span>
<span class="chart-change ${posClass}">${Utils.formatChange(ticker.change24h)}</span>
<span class="volume-badge">${Utils.formatVolume(ticker.volume24h)}</span>


         
            </div>
            <div class="chart-body"></div>
        `;
        // После card.innerHTML = `...`;
const flagContainer = card.querySelector('.flag-container-inline');
if (flagContainer) {
    flagContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = flagContainer.dataset.symbol;
        const exchange = flagContainer.dataset.exchange;
        const marketType = flagContainer.dataset.marketType;
        this.showFlagPopup(e, flagContainer, symbol, exchange, marketType);
    });
}
       card.querySelector('.copy-symbol-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ticker.symbol);
    
    const btn = e.currentTarget;
    btn.style.opacity = '0.5';
    setTimeout(() => {
        btn.style.opacity = '1';
    }, 300);
});
        
        card.querySelector('.alert-symbol-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.alertManager.quickCreate(ticker.symbol, ticker.exchange);
        });
        
        return card;
    }
    // Обновление цены в тикере
updateTickerPrice(symbol, price, volume) {
    // Ищем тикер в marketTickers
    for (const [key, ticker] of this.marketTickers.entries()) {
        if (ticker.symbol === symbol) {
            ticker.price = price;
            if (volume) ticker.volume24h = volume;
            
            // Обновляем отображение в карточке
            const card = document.querySelector(`.chart-card[data-symbol="${symbol}"]`);
            if (card) {
                const priceSpan = card.querySelector('.chart-price');
                if (priceSpan) {
                    priceSpan.textContent = Utils.formatPrice(price);
                }
            }
            break;
        }
    }
}
showFlagPopup(e, container, symbol, exchange, marketType) {
    const existing = document.querySelector('.flag-popup-menu');
    if (existing) existing.remove();
    
    const popup = document.createElement('div');
    popup.className = 'flag-popup-menu';
    popup.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
    popup.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
    
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'lime'];
    
    colors.forEach(color => {
        const item = document.createElement('div');
        item.className = `flag-popup-item flag-popup-${color}`;
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const flagKey = `${symbol}:${exchange}:${marketType}`;
            if (!this.state.flags) this.state.flags = {};
            this.state.flags[flagKey] = color;
            
            const flagEl = container.querySelector('.flag, .flag-placeholder');
            if (flagEl) {
                flagEl.className = `flag flag-${color}`;
            }
            
            popup.remove();
            this.saveFlags();
        });
        popup.appendChild(item);
    });
    
    // Кнопка сброса
    const reset = document.createElement('div');
    reset.className = 'flag-popup-reset';
    reset.textContent = '×';
    reset.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const flagKey = `${symbol}:${exchange}:${marketType}`;
        if (!this.state.flags) this.state.flags = {};
        delete this.state.flags[flagKey];
        
        const flagEl = container.querySelector('.flag, .flag-placeholder');
        if (flagEl) {
            flagEl.className = 'flag-placeholder';
        }
        
        popup.remove();
        this.saveFlags();
    });
    popup.appendChild(reset);
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        const close = (ev) => {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 10);
}
// Обновление свечи в реальном времени
updateCandleRealTime(symbol, price, volume) {
    // Получаем график из пула
    const chartObj = this.pool.getChartBySymbol(symbol);
    if (!chartObj) return;
    
    // Создаём новую свечу или обновляем текущую
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = this.getIntervalSeconds(this.state.interval);
    const currentCandleTime = Math.floor(now / intervalSeconds) * intervalSeconds;
    
    const newCandle = {
        time: currentCandleTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume || 0
    };
    
    // Получаем последнюю свечу
    const lastCandle = chartObj.chartData[chartObj.chartData.length - 1];
    
    if (lastCandle && lastCandle.time === currentCandleTime) {
        // Обновляем существующую свечу
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        lastCandle.close = price;
        lastCandle.volume += volume || 0;
        
        chartObj.updateLastCandle(lastCandle);
    } else {
        // Создаём новую свечу
        chartObj.updateLastCandle(newCandle);
    }
}

getIntervalSeconds(interval) {
    const map = {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        '4h': 14400,
        '1d': 86400
    };
    return map[interval] || 900;
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