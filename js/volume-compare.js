class VolumeCompare {
    constructor() {
        this.chart = null;
        this.series = {};
        this.legendEls = [];
        this.exchanges = [
            { name: 'Binance', color: '#F0B90B' },
            { name: 'Bybit',   color: '#5096FF' }
        ];
        this.currentSymbol = '';
        this.currentInterval = '15m';
        this.currentMarketType = 'futures';
        this.isLoadingMore = false;
        this.loadThreshold = 200;
        this.maxLimit = { binance: 1500, bybit: 1000 };
        this.oldestTime = {};
        this.allData = {};
        this.resizeObserver = null;
        this.historyExhausted = {};
        this.init();
    }

    init() {
        const openBtn       = document.getElementById('volumeCompareBtn');
        const closeBtn      = document.getElementById('closeVolumeCompareBtn');
        const loadBtn       = document.getElementById('loadVolumeCompareBtn');
        const fullscreenBtn = document.getElementById('volumeFullscreenBtn');
        const modal         = document.getElementById('volumeCompareModal');
        const symbolInput   = document.getElementById('volumeSymbolInput');
        const intervalSelect = document.getElementById('volumeIntervalSelect');
        const spotBtn       = document.getElementById('volumeSpotBtn');
        const futBtn        = document.getElementById('volumeFutBtn');

        if (openBtn)       openBtn.addEventListener('click', () => this.show());
        if (closeBtn)      closeBtn.addEventListener('click', () => this.hide());
        if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => this.openFullscreen());
        if (modal)         modal.addEventListener('click', (e) => { if (e.target === modal) this.hide(); });
        if (loadBtn)       loadBtn.addEventListener('click', () => this.loadData());

        if (symbolInput) {
            symbolInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.loadData();
            });
        }

        if (intervalSelect) {
            intervalSelect.addEventListener('change', () => {
                if (this.currentSymbol) this.loadData();
            });
        }

        if (spotBtn) spotBtn.addEventListener('click', () => this.switchMarketType('spot'));
        if (futBtn)  futBtn.addEventListener('click', () => this.switchMarketType('futures'));
    }

    getBybitInterval(binanceInterval) {
        const map = {
            '1m': '1', '3m': '3', '5m': '5', '15m': '15',
            '30m': '30', '1h': '60', '2h': '120', '4h': '240',
            '6h': '360', '12h': '720', '1d': 'D',
            '1w': 'W', '1M': 'M'
        };
        return map[binanceInterval] || '15';
    }

    switchMarketType(type) {
        this.currentMarketType = type;
        const spotBtn = document.getElementById('volumeSpotBtn');
        const futBtn  = document.getElementById('volumeFutBtn');
        if (spotBtn) {
            spotBtn.style.background = type === 'spot' ? '#1a5c2a' : '#1e1e1e';
            spotBtn.style.borderColor = type === 'spot' ? '#0ECB81' : '#333';
            spotBtn.style.color = type === 'spot' ? '#0ECB81' : '#aaa';
        }
        if (futBtn) {
            futBtn.style.background = type === 'futures' ? '#1e3a5f' : '#1e1e1e';
            futBtn.style.borderColor = type === 'futures' ? '#5096FF' : '#333';
            futBtn.style.color = type === 'futures' ? '#5096FF' : '#aaa';
        }
        if (this.currentSymbol) this.loadData();
    }

    show() {
        const modal = document.getElementById('volumeCompareModal');
        if (modal) modal.style.display = 'flex';
        setTimeout(() => this.createChart(), 200);
    }

    hide() {
        const modal = document.getElementById('volumeCompareModal');
        if (modal) modal.style.display = 'none';
    }

    createChart() {
        const container = document.getElementById('volumeCompareChart');
        if (!container) return;

        container.innerHTML = '';
        container.style.position = 'relative';

        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }

        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { color: '#000000' }, textColor: '#808080' },
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            timeScale: {
                visible: true,
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#333333'
            },
            rightPriceScale: { visible: true, ticksVisible: true, scaleMargins: { top: 0.1, bottom: 0.05 } },
            crosshair: { mode: 1 },
            width: container.clientWidth,
            height: container.clientHeight
        });

        this.series = {};
        this.exchanges.forEach(ex => {
            this.series[ex.name] = this.chart.addHistogramSeries({
                color: ex.color + '99',
                priceFormat: { type: 'volume' },
                priceScaleId: 'right'
            });
        });

        this.renderLegend();

        this.chart.subscribeCrosshairMove((param) => {
            if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
                this.exchanges.forEach(ex => {
                    const span = document.querySelector(`.legend-vol[data-exchange="${ex.name}"]`);
                    if (span) span.textContent = '--';
                });
                return;
            }
            this.exchanges.forEach(ex => {
                const ser = this.series[ex.name];
                if (!ser) return;
                const data = ser.data();
                const bar = data ? data.find(d => d.time === param.time) : null;
                const span = document.querySelector(`.legend-vol[data-exchange="${ex.name}"]`);
                if (span) span.textContent = bar ? this.formatVol(bar.value) : '--';
            });
        });

        let scrollTimer = null;
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range || this.isLoadingMore) return;
            const fromIndex = Math.max(0, Math.floor(range.from));

            if (fromIndex < this.loadThreshold && !this.isLoadingMore) {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    console.log('Бесконечный скролл! fromIndex=', fromIndex);
                    this.loadMoreHistory();
                }, 300);
            }
        });

        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = new ResizeObserver(() => {
            if (this.chart && container.clientWidth > 0) {
                this.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
            }
        });
        this.resizeObserver.observe(container);

        if (this.allData['Binance'] && this.series['Binance']) {
            this.series['Binance'].setData(this.allData['Binance']);
        }
        if (this.allData['Bybit'] && this.series['Bybit']) {
            this.series['Bybit'].setData(this.allData['Bybit']);
        }
        if (this.allData['Binance'] || this.allData['Bybit']) {
            this.chart.timeScale().fitContent();
        }
    }

    renderLegend() {
        this.legendEls.forEach(el => el.remove());
        this.legendEls = [];
        const container = document.getElementById('volumeCompareChart');
        if (!container) return;

        this.exchanges.forEach((ex, i) => {
            const el = document.createElement('div');
            el.style.cssText = `
                position:absolute; top:${8 + i * 22}px; left:8px; z-index:10;
                color:${ex.color}; font-size:11px; font-weight:600;
                pointer-events:none; display:flex; align-items:center; gap:6px;
            `;
            el.innerHTML = `
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ex.color};"></span>
                ${ex.name}: <span class="legend-vol" data-exchange="${ex.name}" style="color:#fff;font-weight:400;">--</span>
            `;
            container.appendChild(el);
            this.legendEls.push(el);
        });
    }

    formatVol(v) {
        if (!v || isNaN(v)) return '0';
        if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
        if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
        if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
        return v.toFixed(0);
    }

    async loadData() {
        const si = document.getElementById('volumeSymbolInput');
        const ld = document.getElementById('volumeCompareLoader');
        if (!si) return;

        this.currentSymbol = si.value.toUpperCase().trim();
        const interval = document.getElementById('volumeIntervalSelect')?.value || '15m';
        this.currentInterval = interval;

        if (!this.currentSymbol) {
            alert('Введите символ (например BTCUSDT)');
            return;
        }

        if (ld) ld.style.display = 'inline';

        this.allData = {};
        this.oldestTime = {};
        this.historyExhausted = {};

        if (!this.chart) this.createChart();

        const mt = this.currentMarketType;

        try {
            const binanceUrl = mt === 'futures'
                ? `https://fapi.binance.com/fapi/v1/klines?symbol=${this.currentSymbol}&interval=${interval}&limit=1500`
                : `https://api.binance.com/api/v3/klines?symbol=${this.currentSymbol}&interval=${interval}&limit=1500`;
            const r = await fetch(binanceUrl);
            const d = await r.json();
            if (Array.isArray(d) && d.length > 0) {
                this.allData['Binance'] = d.map(c => ({
                    time: Math.floor(c[0] / 1000),
                    value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0
                })).sort((a, b) => a.time - b.time);
                this.oldestTime['Binance'] = this.allData['Binance'][0].time;
                console.log(`✅ Binance: ${this.allData['Binance'].length} candles`);
            }
        } catch (e) {
            console.error('Binance error:', e);
        }

        await this.loadBybitData(this.currentSymbol, this.currentInterval, this.maxLimit.bybit, true, null);

        if (this.series['Binance'] && this.allData['Binance']) {
            this.series['Binance'].setData(this.allData['Binance']);
        }
        if (this.series['Bybit'] && this.allData['Bybit']) {
            this.series['Bybit'].setData(this.allData['Bybit']);
        }

        if (this.chart) {
            this.chart.priceScale('right').applyOptions({ autoScale: true });
            this.chart.timeScale().fitContent();
        }

        if (ld) ld.style.display = 'none';
    }

 // 1. loadBybitData
async loadBybitData(symbol, interval, limit, isInitial = false, customEndTime = null) {
    const cat = this.currentMarketType === 'futures' ? 'linear' : 'spot';
    const int = this.getBybitInterval(interval);
    let all = [];
    let end = customEndTime;

    if (isInitial) {
        let rem = limit;
        while (rem > 0) {
            const lim = Math.min(rem, 200);
            let url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${int}&limit=${lim}`;
            if (end) url += `&end=${end}`;
            try {
                const r = await fetch(url);
                const d = await r.json();
                if (d.retCode === 0 && d.result?.list?.length > 0) {
                    const c = d.result.list.map(c => ({ time: Math.floor(parseInt(c[0])/1000), value: parseFloat(c[6])||parseFloat(c[5])*parseFloat(c[4])||0 }));
                    all = [...c, ...all];
                    end = c[0].time*1000-1;
                    rem -= c.length;
                    if (c.length < lim) break;
                } else break;
            } catch(e) { break; }
            await new Promise(r => setTimeout(r, 100));
        }
    } else {
        if (!end) return;
        const url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${int}&limit=200&end=${end}`;
        try {
            const r = await fetch(url);
            const d = await r.json();
            if (d.retCode === 0 && d.result?.list?.length > 0) {
                all = d.result.list.map(c => ({ time: Math.floor(parseInt(c[0])/1000), value: parseFloat(c[6])||parseFloat(c[5])*parseFloat(c[4])||0 }));
            }
        } catch(e) {}
    }

    if (all.length > 0) {
        all.sort((a,b) => a.time-b.time);
        if (isInitial) this.allData['Bybit'] = all;
        else {
            const merged = [...all, ...(this.allData['Bybit']||[])];
            this.allData['Bybit'] = [...new Map(merged.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time);
        }
        this.oldestTime['Bybit'] = this.allData['Bybit'][0].time;
    }
}
    async loadMoreBinance() {
        if (!this.oldestTime['Binance'] || this.historyExhausted['Binance']) return false;
        const mt = this.currentMarketType;
        const endTimeMs = (this.oldestTime['Binance'] * 1000) - 1;
        const url = mt === 'futures'
            ? `https://fapi.binance.com/fapi/v1/klines?symbol=${this.currentSymbol}&interval=${this.currentInterval}&limit=1000&endTime=${endTimeMs}`
            : `https://api.binance.com/api/v3/klines?symbol=${this.currentSymbol}&interval=${this.currentInterval}&limit=1000&endTime=${endTimeMs}`;

        try {
            const r = await fetch(url);
            const d = await r.json();
            if (!Array.isArray(d) || d.length === 0) {
                this.historyExhausted['Binance'] = true;
                return false;
            }
            const newData = d.map(c => ({
                time: Math.floor(c[0] / 1000),
                value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0
            }));
            const merged = [...newData, ...(this.allData['Binance'] || [])];
            this.allData['Binance'] = [...new Map(merged.map(c => [c.time, c])).values()]
                .sort((a, b) => a.time - b.time);
            this.oldestTime['Binance'] = this.allData['Binance'][0].time;
            if (this.series['Binance']) {
                this.series['Binance'].setData(this.allData['Binance']);
            }
            console.log(`✅ Binance MORE: +${newData.length} candles`);
            return true;
        } catch (e) {
            return false;
        }
    }

 // 2. loadMoreBybit - ЗАМЕНИ ПОЛНОСТЬЮ
// 2. loadMoreBybit
async loadMoreBybit() {
    if (!this.oldestTime['Bybit']) return;
    const end = (this.oldestTime['Bybit']*1000)-1;
    await this.loadBybitData(this.currentSymbol, this.currentInterval, 200, false, end);
    if (this.series['Bybit'] && this.allData['Bybit']) this.series['Bybit'].setData(this.allData['Bybit']);
}
   // 3. loadMoreHistory - ЗАМЕНИ ПОЛНОСТЬЮ
// 2. loadMoreBybit
async loadMoreBybit() {
    if (!this.oldestTime['Bybit']) return;
    const end = (this.oldestTime['Bybit']*1000)-1;
    await this.loadBybitData(this.currentSymbol, this.currentInterval, 200, false, end);
    if (this.series['Bybit'] && this.allData['Bybit']) this.series['Bybit'].setData(this.allData['Bybit']);
}
    openFullscreen() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:20000;display:flex;flex-direction:column;';

        const panel = document.createElement('div');
        panel.style.cssText = 'display:flex;gap:4px;padding:6px 10px;align-items:center;flex-wrap:nowrap;background:#0a0a0a;border-bottom:1px solid #2D2D2D;flex-shrink:0;';

        const symbolInput = document.createElement('input');
        symbolInput.type = 'text';
        symbolInput.value = this.currentSymbol;
        symbolInput.placeholder = 'BTCUSDT';
        symbolInput.style.cssText = 'background:#0e0e0e;border:1px solid #333;color:#fff;padding:4px 6px;border-radius:4px;font-size:12px;width:100px;text-transform:uppercase;';

        const intervalSelect = document.createElement('select');
        intervalSelect.style.cssText = 'background:#1e1e1e;border:1px solid #333;color:#fff;padding:4px 4px;border-radius:4px;font-size:11px;';
        ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w','1M'].forEach(tf => {
            const opt = document.createElement('option');
            opt.value = tf;
            opt.textContent = tf;
            if (tf === this.currentInterval) opt.selected = true;
            intervalSelect.appendChild(opt);
        });

        const spotBtn = document.createElement('button');
        spotBtn.textContent = 'S';
        spotBtn.title = 'Спот';
        spotBtn.style.cssText = `background:${this.currentMarketType==='spot'?'#1a5c2a':'#1e1e1e'};border:1px solid ${this.currentMarketType==='spot'?'#0ECB81':'#333'};color:${this.currentMarketType==='spot'?'#0ECB81':'#aaa'};padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:700;font-size:11px;`;

        const futBtn = document.createElement('button');
        futBtn.textContent = 'F';
        futBtn.title = 'Фьючерсы';
        futBtn.style.cssText = `background:${this.currentMarketType==='futures'?'#1e3a5f':'#1e1e1e'};border:1px solid ${this.currentMarketType==='futures'?'#5096FF':'#333'};color:${this.currentMarketType==='futures'?'#5096FF':'#aaa'};padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:700;font-size:11px;`;

        const switchMarket = (type) => {
            this.currentMarketType = type;
            spotBtn.style.background = type==='spot'?'#1a5c2a':'#1e1e1e';
            spotBtn.style.borderColor = type==='spot'?'#0ECB81':'#333';
            spotBtn.style.color = type==='spot'?'#0ECB81':'#aaa';
            futBtn.style.background = type==='futures'?'#1e3a5f':'#1e1e1e';
            futBtn.style.borderColor = type==='futures'?'#5096FF':'#333';
            futBtn.style.color = type==='futures'?'#5096FF':'#aaa';
            loadData();
        };
        spotBtn.addEventListener('click', () => switchMarket('spot'));
        futBtn.addEventListener('click', () => switchMarket('futures'));

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Загрузить';
        loadBtn.style.cssText = 'background:#b0b0b0;color:#000;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-weight:500;font-size:11px;';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;';

        panel.appendChild(symbolInput);
        panel.appendChild(intervalSelect);
        panel.appendChild(spotBtn);
        panel.appendChild(futBtn);
        panel.appendChild(loadBtn);
        panel.appendChild(closeBtn);

        const fsContainer = document.createElement('div');
        fsContainer.style.cssText = 'flex:1;width:100%;min-height:0;position:relative;';

        overlay.appendChild(panel);
        overlay.appendChild(fsContainer);
        document.body.appendChild(overlay);

        const fsChart = LightweightCharts.createChart(fsContainer, {
            layout: { background: { color: '#000000' }, textColor: '#808080' },
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            timeScale: { visible: true, timeVisible: true, secondsVisible: false, borderColor: '#333333' },
            rightPriceScale: { visible: true, ticksVisible: true, scaleMargins: { top: 0.1, bottom: 0.05 } },
            crosshair: { mode: 1 },
            width: fsContainer.clientWidth,
            height: fsContainer.clientHeight
        });

        const fsSeries = {};
        this.exchanges.forEach(ex => {
            fsSeries[ex.name] = fsChart.addHistogramSeries({
                color: ex.color + '99',
                priceFormat: { type: 'volume' },
                priceScaleId: 'right'
            });
            const data = this.series[ex.name]?.data();
            if (data) fsSeries[ex.name].setData(data);
        });

        this.exchanges.forEach((ex, i) => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute;top:${8 + i * 22}px;left:8px;z-index:10;color:${ex.color};font-size:11px;font-weight:600;pointer-events:none;display:flex;align-items:center;gap:6px;`;
            el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ex.color};"></span>${ex.name}: <span class="fs-legend-vol" data-exchange="${ex.name}" style="color:#fff;font-weight:400;">--</span>`;
            fsContainer.appendChild(el);
        });

        fsChart.subscribeCrosshairMove((param) => {
            if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
                this.exchanges.forEach(ex => {
                    const span = fsContainer.querySelector(`.fs-legend-vol[data-exchange="${ex.name}"]`);
                    if (span) span.textContent = '--';
                });
                return;
            }
            this.exchanges.forEach(ex => {
                const ser = fsSeries[ex.name];
                if (!ser) return;
                const data = ser.data();
                const bar = data ? data.find(d => d.time === param.time) : null;
                const span = fsContainer.querySelector(`.fs-legend-vol[data-exchange="${ex.name}"]`);
                if (span) span.textContent = bar ? this.formatVol(bar.value) : '--';
            });
        });

        fsChart.timeScale().fitContent();

        const loadData = async () => {
            const sym = symbolInput.value.toUpperCase().trim();
            const int = intervalSelect.value;
            if (!sym) {
                alert('Введите символ');
                return;
            }
            loadBtn.textContent = '⏳';
            loadBtn.disabled = true;
            const mt = this.currentMarketType;

            try {
                const binanceUrl = mt === 'futures'
                    ? `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${int}&limit=1500`
                    : `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${int}&limit=1500`;
                const r = await fetch(binanceUrl);
                const d = await r.json();
                if (Array.isArray(d) && d.length > 0 && fsSeries['Binance']) {
                    fsSeries['Binance'].setData(d.map(c => ({
                        time: Math.floor(c[0] / 1000),
                        value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0
                    })));
                }
            } catch(e) {
                console.error('Fullscreen Binance error:', e);
            }

            try {
                const bybitCategory = mt === 'futures' ? 'linear' : 'spot';
                const bybitInterval = this.getBybitInterval(int);
                let allCandles = [];
                let endTime = null;
                for (let i = 0; i < 8; i++) {
                    let url = `https://api.bybit.com/v5/market/kline?category=${bybitCategory}&symbol=${sym}&interval=${bybitInterval}&limit=200`;
                    if (endTime) url += `&end=${endTime}`;
                    const r = await fetch(url);
                    const d = await r.json();
                    if (d.retCode === 0 && d.result?.list && d.result.list.length > 0) {
                        const candles = d.result.list.map(c => ({
                            time: Math.floor(parseInt(c[0]) / 1000),
                            value: parseFloat(c[6]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0
                        }));
                        allCandles = [...candles, ...allCandles];
                        if (candles.length > 0) {
                            endTime = candles[0].time * 1000 - 1;
                        }
                        if (candles.length < 200) break;
                    } else {
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                if (allCandles.length > 0 && fsSeries['Bybit']) {
                    fsSeries['Bybit'].setData(allCandles.sort((a, b) => a.time - b.time));
                }
            } catch(e) {
                console.error('Fullscreen Bybit error:', e);
            }

            fsChart.timeScale().fitContent();
            loadBtn.textContent = 'Загрузить';
            loadBtn.disabled = false;
        };

        loadBtn.addEventListener('click', loadData);
        symbolInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadData(); });
        intervalSelect.addEventListener('change', loadData);

        const esc = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', esc);
            }
        };
        document.addEventListener('keydown', esc);
        closeBtn.addEventListener('click', () => overlay.remove());
    } 
}