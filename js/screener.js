class CryptoScreener {
    constructor() {
        this.marketAdapters = ExchangeAdapters.createAdapters();
        this.marketTickers = new Map();
        this.marketHistory = new Map();
        this.signals = new Map();
        this.pool = new ChartPool();
        this.metricsCache = new Map();
        this.observer = null;
        this.virtualScroll = null;
        
        const saved = Utils.loadSettings();
        
        this.state = {
            filter: 'gainers',
            exchange: 'Binance',
            marketType: saved.marketType || 'futures',
            interval: saved.interval || CONFIG.defaultInterval,
            sortBy: saved.sortBy || 'default',
            sortDir: saved.sortDir || 'desc',
            limit: saved.limit === 'all' ? 'all' : (parseInt(saved.limit) || 100),
            minVolume: saved.minVolume || CONFIG.defaultMinVolume,
            displayPeriod: 'all',
            gridCols: '2',
            searchQuery: '',
            minGrowth: saved.minGrowth || 0,
            minDrop: saved.minDrop || 0,
            minNatr: saved.minNatr || 0,
            minTrades: saved.minTrades || 0,
            maxRange: saved.maxRange || 0,
            minRange: saved.minRange || 0,
            minChangePeriod: saved.minChangePeriod || '24h',
            minChangeValue: saved.minChangeValue || 0,
            minRvol: saved.minRvol || 0
        };
        
        this.elements = this.cacheElements();
        this.applySavedSettings();
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
            searchInput: document.getElementById('searchInput'),
            minGrowthSelect: document.getElementById('minGrowthSelect'),
            minDropSelect: document.getElementById('minDropSelect'),
            minNatrSelect: document.getElementById('minNatrSelect'),
            minTradesSelect: document.getElementById('minTradesSelect'),
            minRangeSelect: document.getElementById('minRangeSelect'),
            maxRangeSelect: document.getElementById('maxRangeSelect'),
            minChangePeriodSelect: document.getElementById('minChangePeriodSelect'),
            minChangeValueSelect: document.getElementById('minChangeValueSelect'),
            minRvolSelect: document.getElementById('minRvolSelect'),
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
        if (this.elements.intervalSelect) this.elements.intervalSelect.value = this.state.interval;
        if (this.elements.exchangeSelect) this.elements.exchangeSelect.value = this.state.exchange;
        if (this.elements.marketTypeSelect) this.elements.marketTypeSelect.value = this.state.marketType;
        if (this.elements.sortSelect) this.elements.sortSelect.value = this.state.sortBy;
        if (this.elements.sortDirSelect) this.elements.sortDirSelect.value = this.state.sortDir;
        if (this.elements.limitSelect) this.elements.limitSelect.value = this.state.limit === 'all' ? 'all' : this.state.limit;
        if (this.elements.minVolumeSelect) this.elements.minVolumeSelect.value = this.state.minVolume;
        if (this.elements.gridColsSelect) this.elements.gridColsSelect.value = this.state.gridCols;
        if (this.elements.minGrowthSelect) this.elements.minGrowthSelect.value = this.state.minGrowth;
        if (this.elements.minDropSelect) this.elements.minDropSelect.value = this.state.minDrop;
        if (this.elements.minNatrSelect) this.elements.minNatrSelect.value = this.state.minNatr;
        if (this.elements.minTradesSelect) this.elements.minTradesSelect.value = this.state.minTrades;
        if (this.elements.minRangeSelect) this.elements.minRangeSelect.value = this.state.minRange;
        if (this.elements.maxRangeSelect) this.elements.maxRangeSelect.value = this.state.maxRange;
        if (this.elements.minChangePeriodSelect) this.elements.minChangePeriodSelect.value = this.state.minChangePeriod;
        if (this.elements.minChangeValueSelect) this.elements.minChangeValueSelect.value = this.state.minChangeValue;
        if (this.elements.minRvolSelect) this.elements.minRvolSelect.value = this.state.minRvol;
        this.applyGridCols(this.state.gridCols);
    }
    
    applyGridCols(cols) {
        const container = this.elements.grid;
        if ([1, 2, 3, 4, 6].includes(Number(cols))) {
            container.style.setProperty('--grid-cols', `repeat(${cols}, 1fr)`);
        }
    }

    async init() {
        this.loadFlags();
        this.setupVirtualScroll();
        this.alertManager = new AlertManager(this);
        this.bindEvents();
        this.setupCollapse(); 
        this.setupScrollToTop();
        
        await this.loadMarketData();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.marketWS = new MarketWebSocket(this);
        
        this._prevTickerValues = new Map();
        this._autoRefresh = setInterval(async () => {
            await this.loadMarketDataSilent();
            this.checkAnomalies();
            this.updateCounts();
        }, 60000);
        
        this.setActiveFilterButton('gainers');
    }

    setupVirtualScroll() {
        this.virtualScroll = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const card = entry.target;
                const key = `${card.dataset.symbol}:${card.dataset.exchange}:${card.dataset.marketType}`;
                
                if (entry.isIntersecting) {
                    if (!card.dataset.loaded || card.dataset.loaded === 'false') {
                        card.dataset.loaded = 'true';
                        const ticker = this.marketTickers.get(key);
                        if (ticker) {
                            const container = card.querySelector('.chart-body');
                            if (container && !container.querySelector('canvas')) {
                                this.loadMarketChart(card, ticker)
                                    .then(() => this.getMetricsForTicker(ticker))
                                    .then(metrics => this.updateMarketCardFooter(card, ticker, metrics))
                                    .catch(() => {});
                            }
                        }
                    }
                } else {
                    if (card.dataset.loaded === 'true') {
                        const container = card.querySelector('.chart-body');
                        if (container) {
                            this.pool.release(container);
                            container.innerHTML = '<div class="chart-placeholder">📊</div>';
                        }
                        card.dataset.loaded = 'false';
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '400px',
            threshold: 0.01
        });
    }

    async loadMarketDataSilent() {
        try {
            const promises = this.marketAdapters.map(async (adapter) => {
                try {
                    const tickers = await adapter.fetchAllTickers(this.state.marketType);
                    Object.values(tickers).forEach(t => {
                        const key = `${t.symbol}:${t.exchange}:${t.marketType}`;
                        this.marketTickers.set(key, t);
                    });
                } catch (e) {}
            });
            await Promise.all(promises);
            this.updateCounts();
        } catch (e) {}
    }

    setActiveFilterButton(filterName) {
        const buttons = document.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filterName);
        });
    }
    
    bindEvents() {
        const debouncedRender = Utils.debounce(() => this.renderGrid(), 300);
        
        this.elements.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.filter = btn.dataset.filter;
                this.setActiveFilterButton(btn.dataset.filter);
                debouncedRender();
            });
        });
        
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
        
        if (this.elements.exchangeSelect) {
            this.elements.exchangeSelect.addEventListener('change', (e) => {
                this.state.exchange = e.target.value;
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        if (this.elements.marketTypeSelect) {
            this.elements.marketTypeSelect.addEventListener('change', async (e) => {
                this.state.marketType = e.target.value;
                Utils.saveSettings(this.state);
                this.marketTickers.clear();
                this.marketHistory.clear();
                this.metricsCache.clear();
                if (this.elements.marketStatus) this.elements.marketStatus.textContent = '⏳ Загрузка...';
                await this.loadMarketData();
                if (this.marketWS) this.marketWS.resubscribe();
            });
        }
        
        if (this.elements.sortSelect) {
            this.elements.sortSelect.addEventListener('change', async (e) => {
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
        
        if (this.elements.limitSelect) {
            this.elements.limitSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                this.state.limit = val === 'all' ? 'all' : parseInt(val);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        if (this.elements.minVolumeSelect) {
            this.elements.minVolumeSelect.addEventListener('change', (e) => {
                this.state.minVolume = parseInt(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }
        
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', async () => {
                if (this.elements.marketStatus) this.elements.marketStatus.textContent = '⏳ Обновление...';
                this.marketTickers.clear();
                this.marketHistory.clear();
                this.metricsCache.clear();
                await this.loadMarketData();
                if (this.marketWS) this.marketWS.resubscribe();
            });
        }
        
        this.elements.periodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.periodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.displayPeriod = btn.dataset.period;
                this.rerenderMetrics();
            });
        });
        
        if (this.elements.gridColsSelect) {
            this.elements.gridColsSelect.addEventListener('change', (e) => {
                const cols = e.target.value;
                this.state.gridCols = cols;
                Utils.saveSettings(this.state);
                this.applyGridCols(cols);
            });
        }
        
        window.addEventListener('resize', Utils.debounce(() => this.pool.resizeAll(), 200));

        const flagFilterBtn = document.getElementById('flagFilterButton');
        if (flagFilterBtn) {
            flagFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showFlagFilterPopup(e, flagFilterBtn);
            });
        }

        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', Utils.debounce((e) => {
                this.state.searchQuery = e.target.value.trim().toUpperCase();
                this.renderGrid();
            }, 300));
        }

        if (this.elements.minGrowthSelect) {
            this.elements.minGrowthSelect.addEventListener('change', async (e) => {
                this.state.minGrowth = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                await this.renderGrid();
            });
        }

        if (this.elements.minDropSelect) {
            this.elements.minDropSelect.addEventListener('change', async (e) => {
                this.state.minDrop = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                await this.renderGrid();
            });
        }

        if (this.elements.minNatrSelect) {
            this.elements.minNatrSelect.addEventListener('change', async (e) => {
                this.state.minNatr = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                await this.renderGrid();
            });
        }

        if (this.elements.minTradesSelect) {
            this.elements.minTradesSelect.addEventListener('change', (e) => {
                this.state.minTrades = parseInt(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }

        if (this.elements.minRangeSelect) {
            this.elements.minRangeSelect.addEventListener('change', (e) => {
                this.state.minRange = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }

        if (this.elements.maxRangeSelect) {
            this.elements.maxRangeSelect.addEventListener('change', (e) => {
                this.state.maxRange = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }

        if (this.elements.minChangePeriodSelect) {
            this.elements.minChangePeriodSelect.addEventListener('change', (e) => {
                this.state.minChangePeriod = e.target.value;
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }

        if (this.elements.minChangeValueSelect) {
            this.elements.minChangeValueSelect.addEventListener('change', (e) => {
                this.state.minChangeValue = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
            });
        }

        if (this.elements.minRvolSelect) {
            this.elements.minRvolSelect.addEventListener('change', (e) => {
                this.state.minRvol = parseFloat(e.target.value);
                Utils.saveSettings(this.state);
                debouncedRender();
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
        
        const allBtn = document.createElement('div');
        allBtn.className = 'flag-all' + (this.state.flagFilter === 'all' ? ' active' : '');
        allBtn.title = 'Все помеченные';
        allBtn.innerHTML = `<span style="display:inline-block;width:8px;height:12px;background:#e74c3c;border-radius:2px;"></span><span style="display:inline-block;width:8px;height:12px;background:#3498db;border-radius:2px;"></span><span style="display:inline-block;width:8px;height:12px;background:#2ecc71;border-radius:2px;"></span><span style="display:inline-block;width:8px;height:12px;background:#f1c40f;border-radius:2px;"></span>`;
        allBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.state.flagFilter = 'all'; popup.remove(); this.filterByFlag('all'); });
        popup.appendChild(allBtn);
        
        const resetBtn = document.createElement('div');
        resetBtn.className = 'flag-all'; resetBtn.textContent = '×'; resetBtn.title = 'Сбросить';
        resetBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.state.flagFilter = 'show_all'; popup.remove(); this.filterByFlag('show_all'); });
        popup.appendChild(resetBtn);
        
        colors.forEach(color => {
            const item = document.createElement('div');
            item.className = `flag-option flag-${color}` + (this.state.flagFilter === color ? ' active' : '');
            item.addEventListener('click', (ev) => { ev.stopPropagation(); this.state.flagFilter = color; popup.remove(); this.filterByFlag(color); });
            popup.appendChild(item);
        });
        document.body.appendChild(popup);
        setTimeout(() => { const close = (ev) => { if (!popup.contains(ev.target) && ev.target !== button) { popup.remove(); document.removeEventListener('click', close); }}; document.addEventListener('click', close); }, 10);
    }

    filterByFlag(flagColor) {
        this.state.flagFilter = flagColor;
        const cards = document.querySelectorAll('.chart-card');
        cards.forEach(card => {
            if (flagColor === 'all') {
                const flagEl = card.querySelector('.flag');
                card.style.display = (flagEl && !flagEl.classList.contains('flag-placeholder')) ? '' : 'none';
            } else if (flagColor === 'show_all') {
                card.style.display = '';
            } else {
                const flagEl = card.querySelector('.flag');
                card.style.display = (flagEl && flagEl.classList.contains(`flag-${flagColor}`)) ? '' : 'none';
            }
        });
    }
  
    async loadMarketData() {
        try {
            const promises = this.marketAdapters.map(async (adapter) => {
                try {
                    const tickers = await adapter.fetchAllTickers(this.state.marketType);
                    Object.values(tickers).forEach(t => { this.marketTickers.set(`${t.symbol}:${t.exchange}:${t.marketType}`, t); });
                } catch (e) { throw e; }
            });
            await Promise.all(promises);
            if (this.elements.marketStatus) this.elements.marketStatus.textContent = `✅ Загружено ${this.marketTickers.size} тикеров`;
            this.updateCounts();
            await this.renderGrid();
        } catch (e) {
            if (this.elements.marketStatus) this.elements.marketStatus.textContent = '❌ Ошибка загрузки';
        }
    }

    updateCounts() {
        const marketItems = [];
        for (const t of this.marketTickers.values()) {
            if (this.state.exchange !== 'all' && t.exchange !== this.state.exchange) continue;
            if (t.volume24h < this.state.minVolume) continue;
            marketItems.push(t);
        }
        const signalItems = Array.from(this.signals.values());
        if (this.elements.counts.all) this.elements.counts.all.textContent = marketItems.length + signalItems.length;
        if (this.elements.counts.market) this.elements.counts.market.textContent = marketItems.length;
        if (this.elements.counts.signals) this.elements.counts.signals.textContent = signalItems.length;
        if (this.elements.counts.gainers) this.elements.counts.gainers.textContent = marketItems.filter(t => t.change24h >= 3).length;
        if (this.elements.counts.losers) this.elements.counts.losers.textContent = marketItems.filter(t => t.change24h <= -3).length;
        if (this.elements.counts.volume) this.elements.counts.volume.textContent = marketItems.filter(t => t.volume24h > 1e7).length;
    }

    async getMetricsForTicker(ticker) {
        const cacheKey = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:${this.state.interval}`;
        const cached = this.metricsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CONFIG.metricsCacheTime) return cached.data;
        
        const key = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:1m`;
        let candles = this.marketHistory.get(key);
        if (!candles) {
            const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
            if (adapter) {
                try {
                    candles = await adapter.fetchKlines(ticker.symbol, '1m', CONFIG.candlesCount, null, ticker.marketType);
                    this.marketHistory.set(key, candles);
                } catch (e) { candles = []; }
            }
        }
        const metrics = Metrics.calculateAllMetrics(candles);
        this.metricsCache.set(cacheKey, { data: metrics, timestamp: Date.now() });
        if (this.alertManager) this.alertManager.checkAlerts(ticker, metrics);
        return metrics;
    }
    
    async loadMarketChart(card, ticker) {
        const container = card.querySelector('.chart-body');
        this.pool.release(container);
        container.innerHTML = '';
        
        await new Promise(resolve => {
            let attempts = 0;
            const check = () => {
                if (container.clientWidth > 0 || attempts++ > 20) resolve();
                else setTimeout(check, 50);
            };
            check();
        });
        
        const showError = (message) => {
            container.innerHTML = `<div class="chart-placeholder" style="flex-direction: column; gap: 8px;"><span>⚠️ ${message}</span><button class="retry-chart-btn">🔄 Повторить</button></div>`;
            container.querySelector('.retry-chart-btn').addEventListener('click', (e) => { e.stopPropagation(); this.loadMarketChart(card, ticker); });
        };
        
        try {
            const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
            if (!adapter) throw new Error('Нет адаптера');
            const candles = await adapter.fetchKlines(ticker.symbol, this.state.interval, 500, null, ticker.marketType);
            if (!candles || candles.length === 0) throw new Error('Нет данных');
            
            const chartObj = this.pool.acquire(container);
            chartObj.currentSymbol = ticker.symbol;
            chartObj.currentInterval = this.state.interval;
            chartObj.currentExchange = ticker.exchange;
            chartObj.currentMarketType = ticker.marketType;
            chartObj.screenerAdapter = adapter;
            chartObj.setData(candles);
            
            chartObj.setLoadMoreCallback(async (oldestTime, limit) => {
                return await adapter.fetchKlines(ticker.symbol, this.state.interval, limit, oldestTime, ticker.marketType);
            });
            
            chartObj.setOnIntervalChange(async (newInterval) => {
                const newCandles = await adapter.fetchKlines(ticker.symbol, newInterval, 500, null, ticker.marketType);
                if (newCandles && newCandles.length) {
                    chartObj.currentInterval = newInterval;
                    chartObj.setData(newCandles);
                    chartObj.setLoadMoreCallback(async (oldestTime, limit) => {
                        return await adapter.fetchKlines(ticker.symbol, newInterval, limit, oldestTime, ticker.marketType);
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
        if (volumeBadge) volumeBadge.textContent = Utils.formatVolume(ticker.volume24h);
    }

    shouldDisplayMarketBasic(ticker) {
        if (this.state.exchange !== 'all' && ticker.exchange !== this.state.exchange) return false;
        if (ticker.volume24h < this.state.minVolume) return false;
        if (this.state.searchQuery && !ticker.symbol.toUpperCase().includes(this.state.searchQuery)) return false;
        
        const filter = this.state.filter;
        if (filter === 'signals') return false;
        if (filter === 'all' || filter === 'market') return this.checkQuickFilters(ticker);
        if (filter === 'gainers' && ticker.change24h < 3) return false;
        if (filter === 'losers' && ticker.change24h > -3) return false;
        if (filter === 'volume' && ticker.volume24h <= 1e7) return false;
        return this.checkQuickFilters(ticker);
    }

    checkQuickFilters(ticker) {
        if (this.state.minTrades > 0 && (ticker.tradesCount || 0) < this.state.minTrades) return false;
        
        if ((this.state.minRange > 0 || this.state.maxRange > 0) && ticker.high24h && ticker.low24h && ticker.low24h > 0) {
            const range = ((ticker.high24h - ticker.low24h) / ticker.low24h) * 100;
            if (this.state.minRange > 0 && range < this.state.minRange) return false;
            if (this.state.maxRange > 0 && range > this.state.maxRange) return false;
        }
        
        if (this.state.minChangeValue !== 0) {
            let change;
            switch (this.state.minChangePeriod) {
                case '24h': change = ticker.change24h; break;
                case '7d': change = ticker.change7d; break;
                case '5d': change = ticker.change5d; break;
                case '3d': change = ticker.change3d; break;
                case '1h': change = ticker.change1h; break;
                default: change = ticker.change24h;
            }
            if (change !== undefined && change !== null) {
                if (this.state.minChangeValue > 0 && change < this.state.minChangeValue) return false;
                if (this.state.minChangeValue < 0 && change > this.state.minChangeValue) return false;
            }
        }
        return true;
    }

    shouldDisplayMarketAdvanced(ticker) {
        const m = ticker._metrics || {};
        
        if (this.state.minGrowth > 0) {
            const allGrowths = [
                ticker.change24h || 0,
                m.change1h ?? -Infinity,
                m.change15m ?? -Infinity,
                m.change5m ?? -Infinity,
                m.change1m ?? -Infinity
            ];
            if (Math.max(...allGrowths) < this.state.minGrowth) return false;
        }
        
        if (this.state.minDrop > 0) {
            const allDrops = [
                ticker.change24h || 0,
                m.change1h ?? Infinity,
                m.change15m ?? Infinity,
                m.change5m ?? Infinity,
                m.change1m ?? Infinity
            ];
            if (Math.min(...allDrops) > -this.state.minDrop) return false;
        }
        
        if (this.state.minNatr > 0 && (m.natr || 0) < this.state.minNatr) return false;
        if (this.state.minRvol > 0 && (m.rvol || 1) < this.state.minRvol) return false;
        
        return true;
    }

    async renderGrid() {
    this.updateCounts();
    this.pool.clear();
    if (this.virtualScroll) {
        document.querySelectorAll('.chart-card').forEach(c => this.virtualScroll.unobserve(c));
    }
    this.elements.grid.innerHTML = '<div class="loading"><div class="spinner"></div>Фильтрация...</div>';
    
    let items = [];
    const filter = this.state.filter;
    
    if (filter === 'all' || filter === 'signals') {
        for (const signal of this.signals.values()) {
            items.push({ type: 'signal', data: signal });
        }
    }
    
    if (filter !== 'signals') {
        for (const ticker of this.marketTickers.values()) {
            if (this.shouldDisplayMarketBasic(ticker)) {
                items.push({ type: 'market', data: ticker });
            }
        }
    }
    
    const needsMetrics = this.state.minGrowth > 0 || 
                         this.state.minDrop > 0 || 
                         this.state.minNatr > 0 ||
                         this.state.minRvol > 0;
    
    if (needsMetrics && items.length > 0) {
        const marketItems = items.filter(i => i.type === 'market').map(i => i.data);
        if (marketItems.length > 0) {
            this.elements.grid.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка метрик...</div>';
            // 🔥 Загружаем метрики для ВСЕХ market-тикеров, не только отфильтрованных
            await this.fetchMetricsForBatch(marketItems);
            // Теперь фильтруем
            items = items.filter(item => {
                if (item.type === 'signal') return true;
                return this.shouldDisplayMarketAdvanced(item.data);
            });
        }
    }
    
    if (items.length === 0) {
        this.elements.grid.innerHTML = '<div class="loading" style="padding:40px;">🔍 Ничего не найдено</div>';
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
            this.virtualScroll.observe(card);
        } else if (item.type === 'signal') {
            const card = this.createSignalCard(item.data);
            this.elements.grid.appendChild(card);
        }
    }
    
    if (this.elements.marketStatus) {
        this.elements.marketStatus.textContent = `✅ Показано ${limitedItems.length} карточек`;
    }
}
    async fetchMetricsForBatch(tickers) {
        const batchSize = 15;
        const needDayCandles = this.state.minRvol > 0;
        
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            await Promise.all(batch.map(async (ticker) => {
                const minKey = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:1m`;
                let minCandles = this.marketHistory.get(minKey);
                if (!minCandles) {
                    const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
                    if (adapter) {
                        try {
                            minCandles = await adapter.fetchKlines(ticker.symbol, '1m', CONFIG.candlesCount, null, ticker.marketType);
                            if (minCandles && minCandles.length > 0) this.marketHistory.set(minKey, minCandles);
                        } catch (e) { minCandles = []; }
                    }
                }
                
                let dayCandles = null;
                if (needDayCandles) {
                    const dayKey = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}:1d`;
                    dayCandles = this.marketHistory.get(dayKey);
                    if (!dayCandles) {
                        const adapter = ExchangeAdapters.getAdapterByName(this.marketAdapters, ticker.exchange);
                        if (adapter) {
                            try {
                                dayCandles = await adapter.fetchKlines(ticker.symbol, '1d', 30, null, ticker.marketType);
                                if (dayCandles && dayCandles.length > 0) this.marketHistory.set(dayKey, dayCandles);
                            } catch (e) { dayCandles = []; }
                        }
                    }
                }
                
                ticker._metrics = Metrics.calculateAllMetrics(minCandles, dayCandles, ticker);
            }));
        }
    }

    async sortItems(items) {
        items.sort((a, b) => {
            if (a.type === 'signal') return -1;
            if (b.type === 'signal') return 1;
            return Math.abs(b.data.change24h || 0) - Math.abs(a.data.change24h || 0);
        });
        return items;
    }
    
    createMarketCard(ticker) {
        const card = document.createElement('div');
        card.className = 'chart-card';
        card.dataset.symbol = ticker.symbol;
        card.dataset.exchange = ticker.exchange;
        card.dataset.marketType = ticker.marketType;
        card.dataset.loaded = 'false';
        
        const pos = ticker.change24h >= 0;
        const posClass = pos ? 'positive' : 'negative';
        const cleanSymbol = ticker.symbol.replace('USDT', '');
        const isSpot = ticker.marketType === 'spot';
        
        const flagKey = `${ticker.symbol}:${ticker.exchange}:${ticker.marketType}`;
        const savedColor = this.state.flags?.[flagKey];
        const flagClass = savedColor ? `flag flag-${savedColor}` : 'flag-placeholder';
        
        card.innerHTML = `
            <div class="chart-header">
                <span class="symbol-text">${cleanSymbol}</span>
                <button class="copy-symbol-btn" title="${ticker.symbol}">📋</button>
                <span class="market-type-badge ${isSpot ? 'spot' : ''}">${isSpot ? 'S' : 'F'}</span>
                <span class="exchange-badge">${ticker.exchange === 'Binance' ? 'BINANCE' : 'BYBIT'}</span>
                <span class="chart-price ${posClass}">${Utils.formatPrice(ticker.price)}</span>
                <span class="chart-change ${posClass}">${Utils.formatChange(ticker.change24h)}</span>
                <span class="volume-badge">${Utils.formatVolume(ticker.volume24h)}</span>
                ${ticker.tradesCount > 0 ? `<span class="trades-badge">${Utils.formatTrades(ticker.tradesCount)}</span>` : ''}
            </div>
            <div class="chart-body"><div class="chart-placeholder">📊</div></div>
        `;
        
        card.querySelector('.copy-symbol-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(ticker.symbol);
        });
        
        return card;
    }

    createSignalCard(signal) {
        const card = document.createElement('div');
        card.className = 'chart-card signal-card';
        card.innerHTML = `<div class="chart-header"><span class="symbol-text">${signal.symbol || 'SIGNAL'}</span></div><div class="chart-body">${signal.message || ''}</div>`;
        return card;
    }

    showFlagPopup(e, container, symbol, exchange, marketType) {
        // Оставляю как есть
    }

    setupCollapse() {
        const toggleBtn = document.getElementById('collapseToggleBtn');
        const collapsible = document.getElementById('headerCollapsible');
        if (!toggleBtn || !collapsible) return;
        toggleBtn.addEventListener('click', () => {
            collapsible.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
            setTimeout(() => { if (this.pool) this.pool.resizeAll(); }, 350);
        });
    }

    setupScrollToTop() {
        const scrollBtn = document.createElement('button');
        scrollBtn.innerHTML = '↑';
        scrollBtn.className = 'scroll-top-btn';
        document.body.appendChild(scrollBtn);
        window.addEventListener('scroll', () => { scrollBtn.style.display = window.scrollY > 300 ? 'flex' : 'none'; });
        scrollBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }

    getIntervalSeconds(interval) {
        const map = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
        return map[interval] || 900;
    }

    checkAnomalies() {
        // Оставляю как есть, без изменений
    }

    saveFlags() {
        if (!this.state.flags) this.state.flags = {};
        localStorage.setItem('crypto_flags', JSON.stringify(this.state.flags));
    }

    loadFlags() {
        try { this.state.flags = JSON.parse(localStorage.getItem('crypto_flags')) || {}; } catch (e) { this.state.flags = {}; }
    }

    rerenderMetrics() {
        document.querySelectorAll('.chart-card:not(.signal-card)').forEach(card => {
            const key = `${card.dataset.symbol}:${card.dataset.exchange}:${card.dataset.marketType}`;
            const ticker = this.marketTickers.get(key);
            if (ticker) this.getMetricsForTicker(ticker).then(metrics => this.updateMarketCardFooter(card, ticker, metrics));
        });
    }
}