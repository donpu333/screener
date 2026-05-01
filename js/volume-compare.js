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
        this.loadThreshold = 50; // Триггер подгрузки (50 свечей)
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
        const intervalSelect= document.getElementById('volumeIntervalSelect');
        const spotBtn       = document.getElementById('volumeSpotBtn');
        const futBtn        = document.getElementById('volumeFutBtn');

        if (openBtn)       openBtn.addEventListener('click', () => this.show());
        if (closeBtn)      closeBtn.addEventListener('click', () => this.hide());
        if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => this.openFullscreen());
        if (modal)         modal.addEventListener('click', (e) => { if (e.target === modal) this.hide(); });
        if (loadBtn)       loadBtn.addEventListener('click', () => this.loadData());
        if (symbolInput)   symbolInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.loadData(); });
        if (intervalSelect)intervalSelect.addEventListener('change', () => { if (this.currentSymbol) this.loadData(); });
        if (spotBtn)       spotBtn.addEventListener('click', () => this.switchMarketType('spot'));
        if (futBtn)        futBtn.addEventListener('click', () => this.switchMarketType('futures'));
    }

    getBybitInterval(binanceInterval) {
        const map = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '1w': 'W', '1M': 'M' };
        return map[binanceInterval] || '15';
    }

    switchMarketType(type) {
        this.currentMarketType = type;
        const spotBtn = document.getElementById('volumeSpotBtn');
        const futBtn  = document.getElementById('volumeFutBtn');
        if (spotBtn) { spotBtn.style.background = type === 'spot' ? '#1a5c2a' : '#1e1e1e'; spotBtn.style.borderColor = type === 'spot' ? '#0ECB81' : '#333'; spotBtn.style.color = type === 'spot' ? '#0ECB81' : '#aaa'; }
        if (futBtn)  { futBtn.style.background = type === 'futures' ? '#1e3a5f' : '#1e1e1e'; futBtn.style.borderColor = type === 'futures' ? '#5096FF' : '#333'; futBtn.style.color = type === 'futures' ? '#5096FF' : '#aaa'; }
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
        if (this.chart) { this.chart.remove(); this.chart = null; }

        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { color: '#000000' }, textColor: '#808080' },
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            timeScale: { visible: true, timeVisible: true, secondsVisible: false, borderColor: '#333333' },
            rightPriceScale: { visible: true, ticksVisible: true, scaleMargins: { top: 0.1, bottom: 0.05 } },
            crosshair: { mode: 1 },
            width: container.clientWidth,
            height: container.clientHeight
        });

        this.series = {};
        this.exchanges.forEach(ex => {
            this.series[ex.name] = this.chart.addHistogramSeries({ color: ex.color + '99', priceFormat: { type: 'volume' }, priceScaleId: 'right' });
        });

        this.renderLegend();
        this.setupCrosshair(this.chart, '.legend-vol');
        this.setupInfiniteScroll(this.chart);

        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = new ResizeObserver(() => { if (this.chart && container.clientWidth > 0) this.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }); });
        this.resizeObserver.observe(container);

        if (this.allData['Binance'] && this.series['Binance']) this.series['Binance'].setData(this.allData['Binance']);
        if (this.allData['Bybit'] && this.series['Bybit']) this.series['Bybit'].setData(this.allData['Bybit']);
        if (this.allData['Binance'] || this.allData['Bybit']) this.chart.timeScale().fitContent();
    }

    setupCrosshair(chartInstance, selectorPrefix) {
        chartInstance.subscribeCrosshairMove((param) => {
            if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
                this.exchanges.forEach(ex => { const span = document.querySelector(`${selectorPrefix}[data-exchange="${ex.name}"]`); if (span) span.textContent = '--'; });
                return;
            }
            this.exchanges.forEach(ex => {
                const ser = this.series[ex.name];
                if (!ser) return;
                const data = ser.data();
                const bar = data ? data.find(d => d.time === param.time) : null;
                const span = document.querySelector(`${selectorPrefix}[data-exchange="${ex.name}"]`);
                if (span) span.textContent = bar ? this.formatVol(bar.value) : '--';
            });
        });
    }

    setupInfiniteScroll(chartInstance) {
        let scrollTimer = null;
        chartInstance.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range || this.isLoadingMore) return;
            if (this.historyExhausted['Binance'] && this.historyExhausted['Bybit']) return;
            
            if (range.from <= this.loadThreshold) {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    if (chartInstance === this.chart) this.loadMoreHistory();
                }, 300);
            }
        });
    }

    renderLegend() {
        this.legendEls.forEach(el => el.remove());
        this.legendEls = [];
        const container = document.getElementById('volumeCompareChart');
        if (!container) return;
        this.exchanges.forEach((ex, i) => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute; top:${8 + i * 22}px; left:8px; z-index:10; color:${ex.color}; font-size:11px; font-weight:600; pointer-events:none; display:flex; align-items:center; gap:6px;`;
            el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ex.color};"></span> ${ex.name}: <span class="legend-vol" data-exchange="${ex.name}" style="color:#fff;font-weight:400;">--</span>`;
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
        if (!this.currentSymbol) { alert('Введите символ'); return; }
        if (ld) ld.style.display = 'inline';

        this.allData = {}; this.oldestTime = {}; this.historyExhausted = {};
        if (!this.chart) this.createChart();
        const mt = this.currentMarketType;

        try {
            const binanceUrl = mt === 'futures' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${this.currentSymbol}&interval=${interval}&limit=1500` : `https://api.binance.com/api/v3/klines?symbol=${this.currentSymbol}&interval=${interval}&limit=1500`;
            const r = await fetch(binanceUrl); const d = await r.json();
            if (Array.isArray(d) && d.length > 0) {
                this.allData['Binance'] = d.map(c => ({ time: Math.floor(c[0] / 1000), value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0 })).sort((a, b) => a.time - b.time);
                this.oldestTime['Binance'] = this.allData['Binance'][0].time;
            }
        } catch (e) { console.error('Binance error:', e); }

        await this.loadBybitData(this.currentSymbol, this.currentInterval, this.maxLimit.bybit, true, null);

        if (this.series['Binance'] && this.allData['Binance']) this.series['Binance'].setData(this.allData['Binance']);
        if (this.series['Bybit'] && this.allData['Bybit']) this.series['Bybit'].setData(this.allData['Bybit']);
        
        if (this.chart) { this.chart.priceScale('right').applyOptions({ autoScale: true }); this.chart.timeScale().fitContent(); }
        if (ld) ld.style.display = 'none';
    }

    // ИДЕАЛЬНАЯ ПАГИНАЦИЯ BYBIT
    async loadBybitData(symbol, interval, limit, isInitial = false, customEndTime = null) {
        const cat = this.currentMarketType === 'futures' ? 'linear' : 'spot';
        const int = this.getBybitInterval(interval);
        let all = []; let end = customEndTime;

        if (isInitial) {
            let fetched = 0;
            while (fetched < limit) {
                const lim = Math.min(limit - fetched, 200);
                let url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${int}&limit=${lim}`;
                if (end) url += `&end=${end}`; // ТОЛЬКО end, БЕЗ -1 и БЕЗ start

                try {
                    const r = await fetch(url); const d = await r.json();
                    if (d.retCode !== 0 || !d.result?.list?.length) break;
                    
                    const c = d.result.list.map(k => ({ time: Math.floor(parseInt(k[0]) / 1000), value: parseFloat(k[6]) || (parseFloat(k[5]) || 0) * (parseFloat(k[4]) || 0) || 0 }));
                    const prevUniqueCount = all.length;
                    
                    const merged = [...c, ...all];
                    all = [...new Map(merged.map(item => [item.time, item])).values()].sort((a, b) => a.time - b.time);
                    const newUniqueCount = all.length - prevUniqueCount;
                    
                    if (newUniqueCount === 0) break; // Если только дубликаты - выходим

                    end = all[0].time * 1000; // Точное время старой свечи
                    fetched += newUniqueCount;
                } catch (e) { break; }
                await new Promise(r => setTimeout(r, 100));
            }
        } else {
            if (!end) return 0;
            const url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${int}&limit=200&end=${end}`;
            try {
                const r = await fetch(url); const d = await r.json();
                if (d.retCode === 0 && d.result?.list?.length > 0) {
                    all = d.result.list.map(k => ({ time: Math.floor(parseInt(k[0]) / 1000), value: parseFloat(k[6]) || (parseFloat(k[5]) || 0) * (parseFloat(k[4]) || 0) || 0 }));
                } else { this.historyExhausted['Bybit'] = true; }
            } catch (e) { this.historyExhausted['Bybit'] = true; }
        }

        if (all.length > 0) {
            if (isInitial) this.allData['Bybit'] = all;
            else {
                const merged = [...all, ...(this.allData['Bybit'] || [])];
                this.allData['Bybit'] = [...new Map(merged.map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
            }
            this.oldestTime['Bybit'] = this.allData['Bybit'][0].time;
        }
        return all.length;
    }

    async loadMoreBinance() {
        if (!this.oldestTime['Binance'] || this.historyExhausted['Binance']) return 0;
        const mt = this.currentMarketType;
        const url = mt === 'futures' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${this.currentSymbol}&interval=${this.currentInterval}&limit=1000&endTime=${(this.oldestTime['Binance'] * 1000) - 1}` : `https://api.binance.com/api/v3/klines?symbol=${this.currentSymbol}&interval=${this.currentInterval}&limit=1000&endTime=${(this.oldestTime['Binance'] * 1000) - 1}`;
        try {
            const r = await fetch(url); const d = await r.json();
            if (!Array.isArray(d) || d.length === 0) { this.historyExhausted['Binance'] = true; return 0; }
            const newData = d.map(c => ({ time: Math.floor(c[0] / 1000), value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0 }));
            this.allData['Binance'] = [...new Map([...newData, ...(this.allData['Binance'] || [])].map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
            this.oldestTime['Binance'] = this.allData['Binance'][0].time;
            if (this.series['Binance']) this.series['Binance'].setData(this.allData['Binance']);
            return newData.length;
        } catch (e) { return 0; }
    }

    async loadMoreBybit() {
        if (!this.oldestTime['Bybit'] || this.historyExhausted['Bybit']) return 0;
        let totalAdded = 0;
        for (let i = 0; i < 5; i++) {
            if (this.historyExhausted['Bybit']) break;
            const prevLength = this.allData['Bybit']?.length || 0;
            await this.loadBybitData(this.currentSymbol, this.currentInterval, 200, false, this.oldestTime['Bybit'] * 1000);
            const newLength = this.allData['Bybit']?.length || 0;
            totalAdded += (newLength - prevLength);
            if (newLength === prevLength) { this.historyExhausted['Bybit'] = true; break; }
        }
        if (this.series['Bybit'] && this.allData['Bybit']) this.series['Bybit'].setData(this.allData['Bybit']);
        return totalAdded;
    }

    async loadMoreHistory() {
        if (this.isLoadingMore) return;
        if (this.historyExhausted['Binance'] && this.historyExhausted['Bybit']) return;
        this.isLoadingMore = true;
        
        let visibleTimeRange = null;
        try {
            const range = this.chart.timeScale().getVisibleLogicalRange();
            if (range) {
                const ts = this.chart.timeScale();
                visibleTimeRange = { from: ts.coordinateToTime(ts.logicalToCoordinate(range.from)), to: ts.coordinateToTime(ts.logicalToCoordinate(range.to)) };
            }
        } catch(e) {}

        try { await Promise.all([this.loadMoreBinance(), this.loadMoreBybit()]); } catch(e) { console.error(e); }

        if (visibleTimeRange) { try { this.chart.timeScale().setVisibleTimeRange(visibleTimeRange); } catch(e) {} }
        this.isLoadingMore = false;
    }

    openFullscreen() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:20000;display:flex;flex-direction:column;';
        
        const panel = document.createElement('div');
        panel.style.cssText = 'display:flex;gap:4px;padding:6px 10px;align-items:center;flex-wrap:nowrap;background:#0a0a0a;border-bottom:1px solid #2D2D2D;flex-shrink:0;';
        
        const symbolInput = document.createElement('input'); symbolInput.type = 'text'; symbolInput.value = this.currentSymbol; symbolInput.placeholder = 'BTCUSDT';
        symbolInput.style.cssText = 'background:#0e0e0e;border:1px solid #333;color:#fff;padding:4px 6px;border-radius:4px;font-size:12px;width:100px;text-transform:uppercase;';
        
        const intervalSelect = document.createElement('select'); intervalSelect.style.cssText = 'background:#1e1e1e;border:1px solid #333;color:#fff;padding:4px 4px;border-radius:4px;font-size:11px;';
        ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w','1M'].forEach(tf => { const opt = document.createElement('option'); opt.value = tf; opt.textContent = tf; if (tf === this.currentInterval) opt.selected = true; intervalSelect.appendChild(opt); });
        
        const spotBtn = document.createElement('button'); spotBtn.textContent = 'S'; spotBtn.title = 'Спот';
        const futBtn = document.createElement('button'); futBtn.textContent = 'F'; futBtn.title = 'Фьючерсы';
        const setBtnStyles = (btn, type, c1, c2) => { btn.style.cssText = `background:${this.currentMarketType===type?c1:'#1e1e1e'};border:1px solid ${this.currentMarketType===type?c2:'#333'};color:${this.currentMarketType===type?c2:'#aaa'};padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:700;font-size:11px;`; };
        setBtnStyles(spotBtn, 'spot', '#1a5c2a', '#0ECB81'); setBtnStyles(futBtn, 'futures', '#1e3a5f', '#5096FF');
        
        const loadBtn = document.createElement('button'); loadBtn.textContent = 'Загрузить'; loadBtn.style.cssText = 'background:#b0b0b0;color:#000;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-weight:500;font-size:11px;';
        const closeBtn = document.createElement('button'); closeBtn.innerHTML = '✕'; closeBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;';
        
        panel.append(symbolInput, intervalSelect, spotBtn, futBtn, loadBtn, closeBtn);
        const fsContainer = document.createElement('div'); fsContainer.style.cssText = 'flex:1;width:100%;min-height:0;position:relative;';
        overlay.append(panel, fsContainer); document.body.appendChild(overlay);

        const fsChart = LightweightCharts.createChart(fsContainer, { layout: { background: { color: '#000000' }, textColor: '#808080' }, grid: { vertLines: { visible: false }, horzLines: { visible: false } }, timeScale: { visible: true, timeVisible: true, secondsVisible: false, borderColor: '#333333' }, rightPriceScale: { visible: true, ticksVisible: true, scaleMargins: { top: 0.1, bottom: 0.05 } }, crosshair: { mode: 1 }, width: fsContainer.clientWidth, height: fsContainer.clientHeight });
        
        const fsSeries = {};
        this.exchanges.forEach(ex => { fsSeries[ex.name] = fsChart.addHistogramSeries({ color: ex.color + '99', priceFormat: { type: 'volume' }, priceScaleId: 'right' }); const data = this.series[ex.name]?.data(); if (data) fsSeries[ex.name].setData(data); });
        this.exchanges.forEach((ex, i) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;top:${8 + i * 22}px;left:8px;z-index:10;color:${ex.color};font-size:11px;font-weight:600;pointer-events:none;display:flex;align-items:center;gap:6px;`; el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ex.color};"></span>${ex.name}: <span class="fs-legend-vol" data-exchange="${ex.name}" style="color:#fff;font-weight:400;">--</span>`; fsContainer.appendChild(el); });
        
        this.setupCrosshair(fsChart, '.fs-legend-vol');

        // БЕСКОНЕЧНЫЙ СКРОЛЛ ДЛЯ ПОЛНОЭКРАННОГО РЕЖИМА
        let fsIsLoading = false;
        let fsExhausted = { Binance: false, Bybit: false };
        let fsOldestTime = { Binance: fsSeries['Binance'].data()?.[0]?.time, Bybit: fsSeries['Bybit'].data()?.[0]?.time };

        fsChart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
            if (!range || fsIsLoading || (fsExhausted.Binance && fsExhausted.Bybit)) return;
            if (range.from > 50) return;
            
            fsIsLoading = true;
            let vTime = null;
            try {
                const r = fsChart.timeScale().getVisibleLogicalRange();
                if(r) vTime = { from: fsChart.timeScale().coordinateToTime(fsChart.timeScale().logicalToCoordinate(r.from)), to: fsChart.timeScale().coordinateToTime(fsChart.timeScale().logicalToCoordinate(r.to)) };
            } catch(e){}

            const mt = this.currentMarketType; const int = intervalSelect.value;
            
            // Binance FS Scroll
            if(fsOldestTime.Binance && !fsExhausted.Binance) {
                try {
                    const url = mt === 'futures' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbolInput.value.toUpperCase()}&interval=${int}&limit=1000&endTime=${(fsOldestTime.Binance * 1000) - 1}` : `https://api.binance.com/api/v3/klines?symbol=${symbolInput.value.toUpperCase()}&interval=${int}&limit=1000&endTime=${(fsOldestTime.Binance * 1000) - 1}`;
                    const res = await fetch(url); const d = await res.json();
                    if(Array.isArray(d) && d.length > 0) {
                        const nd = d.map(c=>({time:Math.floor(c[0]/1000), value:parseFloat(c[7])||(parseFloat(c[5])||0)*(parseFloat(c[4])||0)||0}));
                        const old = fsSeries['Binance'].data()||[]; const merged = [...nd, ...old]; fsSeries['Binance'].setData([...new Map(merged.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time)); fsOldestTime.Binance = nd[0].time;
                    } else fsExhausted.Binance = true;
                } catch(e) { fsExhausted.Binance = true; }
            }

            // Bybit FS Scroll
            if(fsOldestTime.Bybit && !fsExhausted.Bybit) {
                const bybitInt = this.getBybitInterval(int); const cat = mt === 'futures' ? 'linear' : 'spot';
                for(let i=0; i<3; i++) {
                    if(fsExhausted.Bybit) break;
                    const prevLen = fsSeries['Bybit'].data()?.length || 0;
                    const end = fsOldestTime.Bybit * 1000; 
                    try {
                        const url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbolInput.value.toUpperCase()}&interval=${bybitInt}&limit=200&end=${end}`;
                        const res = await fetch(url); const d = await res.json();
                        if(d.retCode === 0 && d.result?.list?.length > 0) {
                            const nd = d.result.list.map(c=>({time:Math.floor(parseInt(c[0])/1000), value:parseFloat(c[6])||parseFloat(c[5])*parseFloat(c[4])||0}));
                            const old = fsSeries['Bybit'].data()||[]; const merged = [...nd, ...old]; fsSeries['Bybit'].setData([...new Map(merged.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time)); 
                            const newLen = fsSeries['Bybit'].data()?.length || 0;
                            if(newLen === prevLen) { fsExhausted.Bybit = true; break; }
                            fsOldestTime.Bybit = fsSeries['Bybit'].data()[0].time;
                        } else fsExhausted.Bybit = true;
                    } catch(e) { fsExhausted.Bybit = true; }
                }
            }
            if(vTime) try { fsChart.timeScale().setVisibleTimeRange(vTime); } catch(e){}
            fsIsLoading = false;
        });

        const loadData = async () => {
            const sym = symbolInput.value.toUpperCase().trim(); const int = intervalSelect.value; if (!sym) return;
            loadBtn.textContent = '⏳'; loadBtn.disabled = true; const mt = this.currentMarketType;
            
            try { 
                const url = mt === 'futures' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${int}&limit=1500` : `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${int}&limit=1500`; 
                const r = await fetch(url); const d = await r.json(); 
                if (Array.isArray(d) && d.length > 0) { 
                    fsSeries['Binance'].setData(d.map(c => ({ time: Math.floor(c[0] / 1000), value: parseFloat(c[7]) || (parseFloat(c[5]) || 0) * (parseFloat(c[4]) || 0) || 0 }))); 
                    fsOldestTime.Binance = fsSeries['Binance'].data()[0]?.time; fsExhausted.Binance = false; 
                } 
            } catch(e) {}
            
            try { 
                const cat = mt === 'futures' ? 'linear' : 'spot'; const bybitInt = this.getBybitInterval(int); 
                let all = []; let end = null; 
                for (let i = 0; i < 8; i++) { 
                    let url = `https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${sym}&interval=${bybitInt}&limit=200`; 
                    if (end) url += `&end=${end}`; 
                    const r = await fetch(url); const d = await r.json(); 
                    if (d.retCode === 0 && d.result?.list?.length > 0) { 
                        const c = d.result.list.map(k => ({ time: Math.floor(parseInt(k[0]) / 1000), value: parseFloat(k[6]) || (parseFloat(k[5]) || 0) * (parseFloat(k[4]) || 0) || 0 })); 
                        const prevCount = all.length;
                        const merged = [...c, ...all];
                        all = [...new Map(merged.map(it=>[it.time, it])).values()].sort((a, b) => a.time - b.time);
                        if(all.length === prevCount) break;
                        end = all[0].time * 1000; 
                        if (c.length < 200) break; 
                    } else break; 
                    await new Promise(r => setTimeout(r, 100)); 
                } 
                if (all.length > 0) { fsSeries['Bybit'].setData(all); fsOldestTime.Bybit = all[0].time; fsExhausted.Bybit = false; } 
            } catch(e) {}
            
            fsChart.timeScale().fitContent(); loadBtn.textContent = 'Загрузить'; loadBtn.disabled = false;
        };

        const switchMarket = (type) => { this.currentMarketType = type; setBtnStyles(spotBtn, 'spot', '#1a5c2a', '#0ECB81'); setBtnStyles(futBtn, 'futures', '#1e3a5f', '#5096FF'); loadData(); };
        spotBtn.addEventListener('click', () => switchMarket('spot')); futBtn.addEventListener('click', () => switchMarket('futures'));
        loadBtn.addEventListener('click', loadData); symbolInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadData(); }); intervalSelect.addEventListener('change', loadData);
        const esc = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } }; document.addEventListener('keydown', esc); closeBtn.addEventListener('click', () => overlay.remove());
    } 
}
