// js/card-chart.js — ПОЛНЫЙ ФАЙЛ С ТАЙМФРЕЙМ СЕЛЕКТОРОМ + ОБЪЁМ

class CardChart {
    constructor(container) {
        this.container = container;
        this.chart = null;
        this.candleSeries = null;
        this.barSeries = null;
        this.volumeSeries = null;
        this.currentChartType = 'candle';
        this.bullishColor = '#00bcd4';
        this.bearishColor = '#f23645';
        this.chartData = [];
        
        this.isLoadingHistory = false;
        this.oldestTime = null;
        this.onLoadMoreCallback = null;
        this.minCandles = 500;
        this.loadMoreThreshold = 150;
        
        this.onIntervalChangeCallback = null;
        
        this.initChart();
    }
    
    setOnIntervalChange(callback) {
        this.onIntervalChangeCallback = callback;
    }
    
    initChart() {
        this.container.innerHTML = '';
        const height = this.container.clientHeight || 360;  
        
        this.chart = LightweightCharts.createChart(this.container, {
            layout: {
                background: { color: '#000000' },
                textColor: '#808080'
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal
            },
            timeScale: {
                timeVisible: false,
                secondsVisible: false,
                borderColor: '#333333',
                barSpacing: 6,
                minBarSpacing: 4,
                rightOffset: 10
            },
            rightPriceScale: {
                borderColor: '#333333',
                scaleMargins: { top: 0.05, bottom: 0.05 },
                autoScale: true,
                ticksVisible: true,
                minimumWidth: 60
            },
            width: this.container.clientWidth,
            height: height,
            autoSize: true
        });
        
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: this.bullishColor,
            downColor: this.bearishColor,
            borderVisible: false,
            wickUpColor: this.bullishColor,
            wickDownColor: this.bearishColor,
            visible: true,
            priceFormat: {
                type: 'price',
                precision: 6,
                minMove: 0.000001
            }
        });
        
        this.barSeries = this.chart.addBarSeries({
            upColor: this.bullishColor,
            downColor: this.bearishColor,
            openVisible: true,
            thinBars: true,
            visible: false,
            priceFormat: {
                type: 'price',
                precision: 6,
                minMove: 0.000001
            }
        });
        
        this.volumeSeries = this.chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        
        const volumeScale = this.chart.priceScale('volume');
        volumeScale.applyOptions({
            scaleMargins: {
                top: 0.85,
                bottom: 0,
            },
            visible: false,
            ticksVisible: false,
        });
        
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            this.checkAndLoadMore(range);
        });
        
        this.addButtons();
        this.setupResizeObserver();
        
        this.addTimeframeSelector();
        
        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openPopup();
        });
    }
    
    addTimeframeSelector() {
        const selectorContainer = document.createElement('div');
        selectorContainer.style.cssText = `
            position: absolute;
            top: 8px;
            left: 8px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 500;
            color: #b0b0b0;
            font-family: monospace;
            border: 1px solid #444;
            z-index: 10;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        
        const intervalText = this.currentInterval || '15m';
        
        selectorContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 -960 960 960" fill="#b0b0b0">
                <path d="M339.5-108.5q-65.5-28.5-114-77t-77-114Q120-365 120-440t28.5-140.5q28.5-65.5 77-114t114-77Q405-800 480-800t140.5 28.5q65.5 28.5 114 77t77 114Q840-515 840-440t-28.5 140.5q-28.5 65.5-77 114t-114 77Q555-80 480-80t-140.5-28.5ZM480-440Zm112 168 56-56-128-128v-184h-80v216l152 152ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56ZM480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Z"/>
            </svg>
            ${intervalText}
        `;
        
        selectorContainer.addEventListener('mouseenter', () => {
            selectorContainer.style.background = '#b0b0b0';
            selectorContainer.style.color = '#000';
            const svg = selectorContainer.querySelector('svg');
            if (svg) svg.style.fill = '#000';
        });
        selectorContainer.addEventListener('mouseleave', () => {
            selectorContainer.style.background = 'rgba(0, 0, 0, 0.7)';
            selectorContainer.style.color = '#b0b0b0';
            const svg = selectorContainer.querySelector('svg');
            if (svg) svg.style.fill = '#b0b0b0';
        });
        
        selectorContainer.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            const menu = document.createElement('div');
            menu.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                background: #1a1a1a;
                border: 1px solid #b0b0b0;
                border-radius: 8px;
                padding: 8px;
                z-index: 20001;
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 120px;
            `;
            
            const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
            intervals.forEach(tf => {
                const btn = document.createElement('button');
                btn.textContent = tf;
                btn.style.cssText = `
                    background: ${tf === this.currentInterval ? '#b0b0b0' : '#2a2a2a'};
                    color: ${tf === this.currentInterval ? '#000' : '#fff'};
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                `;
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    menu.remove();
                    await this.switchInterval(tf);
                });
                menu.appendChild(btn);
            });
            
            selectorContainer.appendChild(menu);
            
            const closeMenu = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 10);
        });
        
        this.container.style.position = 'relative';
        this.container.appendChild(selectorContainer);
        this.timeframeSelector = selectorContainer;
    }
    
    async switchInterval(newInterval) {
        if (this.timeframeSelector) {
            this.timeframeSelector.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 -960 960 960" fill="#b0b0b0">
                    <path d="M339.5-108.5q-65.5-28.5-114-77t-77-114Q120-365 120-440t28.5-140.5q28.5-65.5 77-114t114-77Q405-800 480-800t140.5 28.5q65.5 28.5 114 77t77 114Q840-515 840-440t-28.5 140.5q-28.5 65.5-77 114t-114 77Q555-80 480-80t-140.5-28.5ZM480-440Zm112 168 56-56-128-128v-184h-80v216l152 152ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56ZM480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Z"/>
                </svg>
                ${newInterval}
            `;
        }
        this.currentInterval = newInterval;
        
        if (this.onIntervalChangeCallback) {
            this.isLoadingHistory = true;
            try {
                const newData = await this.onIntervalChangeCallback(newInterval);
                if (newData && newData.length) {
                    this.chartData = newData;
                    this.oldestTime = newData[0].time;
                    this.candleSeries.setData(newData);
                    this.barSeries.setData(newData);
                    this.setVolumeData(newData);
                }
            } catch (error) {
                console.warn('Ошибка смены таймфрейма:', error);
            } finally {
                this.isLoadingHistory = false;
            }
        }
    }
    
    checkAndLoadMore(range) {
        if (!range || this.isLoadingHistory) return;
        if (!this.onLoadMoreCallback) return;
        if (this.chartData.length === 0) return;
        
        const firstVisibleIndex = range.from;
        
        if (firstVisibleIndex < this.loadMoreThreshold) {
            this.loadMoreHistory();
        }
    }
    
    async loadMoreHistory() {
        if (this.isLoadingHistory) return;
        if (!this.oldestTime) return;
        if (!this.onLoadMoreCallback) return;
        
        this.isLoadingHistory = true;
        
        try {
            const olderData = await this.onLoadMoreCallback(this.oldestTime, 200);
            
            if (olderData && olderData.length > 0) {
                const mergedData = [...olderData, ...this.chartData];
                const uniqueData = [];
                const timeSet = new Set();
                for (const candle of mergedData) {
                    if (!timeSet.has(candle.time)) {
                        timeSet.add(candle.time);
                        uniqueData.push(candle);
                    }
                }
                uniqueData.sort((a, b) => a.time - b.time);
                
                this.chartData = uniqueData;
                this.oldestTime = uniqueData[0].time;
                this.candleSeries.setData(this.chartData);
                this.barSeries.setData(this.chartData);
                this.setVolumeData(this.chartData);
            }
        } catch (error) {
            console.warn('Ошибка подгрузки истории:', error);
        } finally {
            this.isLoadingHistory = false;
        }
    }
    
    setVolumeData(data) {
        if (!this.volumeSeries) return;
        const volumeData = data.map(candle => ({
            time: candle.time,
            value: candle.volume || 0,
            color: candle.close >= candle.open 
                ? this.bullishColor + '55' 
                : this.bearishColor + '55'
        }));
        this.volumeSeries.setData(volumeData);
    }
    
    addButtons() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'chart-card-buttons';
        btnContainer.style.cssText = `
            position: absolute;
            bottom: 5px;
            right: 5px;
            display: flex;
            gap: 4px;
            z-index: 10;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        
        this.container.addEventListener('mouseenter', () => {
            btnContainer.style.opacity = '1';
        });
        this.container.addEventListener('mouseleave', () => {
            btnContainer.style.opacity = '0';
        });
        
        const fullscreenBtn = this.createButton('⛶', 'На весь экран', () => {
            this.openFullscreen();
        });
        
        const scrollBtn = this.createButton('▶', 'К последней свече', () => {
            this.scrollToLast();
        });
        
        const autoScaleBtn = this.createButton('A', 'Автомасштаб', () => {
            this.autoScale();
        });
        
        const typeBtn = this.createButton('', 'Свечи/Бары', () => {
            this.toggleChartType();
        });
        
        typeBtn.innerHTML = '';
        const typeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        typeSvg.setAttribute('width', '14');
        typeSvg.setAttribute('height', '14');
        typeSvg.setAttribute('viewBox', '0 -960 960 960');
        typeSvg.setAttribute('fill', 'currentColor');
        typeSvg.style.display = 'block';
        typeSvg.innerHTML = `
            <path d="M280-160v-80h-80v-480h80v-80h80v80h80v480h-80v80h-80Zm0-160h80v-320h-80v320Z"/>
            <path d="M200-640h80v-80h-80v80Zm0 480h80v-80h-80v80Z" opacity="0.5"/>
            <path d="M600-160v-200h-80v-280h80v-160h80v160h80v280h-80v200h-80Zm0-280h80v-120h-80v120Z"/>
            <path d="M520-640h80v-80h-80v80Zm0 480h80v-80h-80v80Z" opacity="0.5"/>
        `;
        typeBtn.appendChild(typeSvg);
        
        btnContainer.appendChild(typeBtn);
        btnContainer.appendChild(fullscreenBtn);
        btnContainer.appendChild(scrollBtn);
        btnContainer.appendChild(autoScaleBtn);
        
        this.container.style.position = 'relative';
        this.container.appendChild(btnContainer);
    }
    
    createButton(text, title, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.title = title;
        btn.style.cssText = `
            width: 24px;
            height: 24px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #404040;
            border-radius: 4px;
            color: #B0B0B0;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#2D2D2D';
            btn.style.color = '#FFFFFF';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(0, 0, 0, 0.8)';
            btn.style.color = '#B0B0B0';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }
    
    setupResizeObserver() {
        const resizeObserver = new ResizeObserver(() => {
            this.resize();
        });
        resizeObserver.observe(this.container);
    }
    
    setData(data) {
        if (!data || data.length === 0) return;
        
        this.chartData = data;
        this.oldestTime = data[0].time;
        
        this.candleSeries.setData(data);
        this.barSeries.setData(data);
        this.setVolumeData(data);
        
        if (!this.onIntervalChangeCallback) {
            this.onIntervalChangeCallback = async (newInterval) => {
                const symbol = this.currentSymbol;
                const exchange = this.currentExchange || 'Binance';
                const marketType = this.currentMarketType || 'futures';
                
                let url;
                if (exchange === 'Binance') {
                    url = marketType === 'futures' 
                        ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${newInterval}&limit=500`
                        : `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${newInterval}&limit=500`;
                } else {
                    const intervalMap = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
                    const bybitInterval = intervalMap[newInterval] || '15';
                    url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=200`;
                }
                
                const response = await fetch(url);
                const rawData = await response.json();
                
                let formattedData = [];
                if (exchange === 'Binance') {
                    formattedData = rawData.map(item => ({
                        time: Math.floor(item[0] / 1000),
                        open: parseFloat(item[1]),
                        high: parseFloat(item[2]),
                        low: parseFloat(item[3]),
                        close: parseFloat(item[4]),
                        volume: parseFloat(item[5])
                    }));
                } else {
                    if (rawData.retCode === 0 && rawData.result?.list) {
                        formattedData = rawData.result.list.map(item => ({
                            time: Math.floor(parseInt(item[0]) / 1000),
                            open: parseFloat(item[1]),
                            high: parseFloat(item[2]),
                            low: parseFloat(item[3]),
                            close: parseFloat(item[4]),
                            volume: parseFloat(item[5] || 0)
                        })).reverse();
                    }
                }
                
                const step = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[newInterval] || 900;
                formattedData = formattedData.map(c => ({ ...c, time: Math.floor(c.time / step) * step }));
                
                this.setPrecisionByPrice(formattedData[0]?.close || 0);
                
                return formattedData;
            };
        }
        
        if (this.timeframeSelector && this.currentInterval) {
            this.timeframeSelector.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 -960 960 960" fill="#b0b0b0">
                    <path d="M339.5-108.5q-65.5-28.5-114-77t-77-114Q120-365 120-440t28.5-140.5q28.5-65.5 77-114t114-77Q405-800 480-800t140.5 28.5q65.5 28.5 114 77t77 114Q840-515 840-440t-28.5 140.5q-28.5 65.5-77 114t-114 77Q555-80 480-80t-140.5-28.5ZM480-440Zm112 168 56-56-128-128v-184h-80v216l152 152ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56ZM480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Z"/>
                </svg>
                ${this.currentInterval}
            `;
        }
        
        this.container._chartObj = this;
        
        setTimeout(() => {
            const timeScale = this.chart.timeScale();
            if (data.length > 40) {
                timeScale.setVisibleLogicalRange({
                    from: data.length - 50,
                    to: data.length - 1 + 10
                });
            } else {
                timeScale.fitContent();
            }
            
            const priceScale = this.chart.priceScale('right');
            if (priceScale) {
                priceScale.applyOptions({ autoScale: true });
            }
        }, 100);
    }
    
    setLoadMoreCallback(callback) {
        this.onLoadMoreCallback = callback;
    }
    
    updateLastCandle(candle) {
        if (this.chartData.length === 0) return;
        
        const lastIndex = this.chartData.length - 1;
        const lastCandle = this.chartData[lastIndex];
        
        if (candle.time === lastCandle.time) {
            this.chartData[lastIndex] = candle;
        } else if (candle.time > lastCandle.time) {
            this.chartData.push(candle);
            this.oldestTime = this.chartData[0].time;
        }
        
        this.candleSeries.update(candle);
        this.barSeries.update(candle);
        
        if (this.volumeSeries) {
            const volColor = candle.close >= candle.open 
                ? this.bullishColor + '55' 
                : this.bearishColor + '55';
            this.volumeSeries.update({
                time: candle.time,
                value: candle.volume || 0,
                color: volColor
            });
        }
    }
    
    setChartType(type) {
        this.currentChartType = type;
        this.candleSeries.applyOptions({ visible: type === 'candle' });
        this.barSeries.applyOptions({ visible: type === 'bar' });
    }
    
    toggleChartType() {
        this.setChartType(this.currentChartType === 'candle' ? 'bar' : 'candle');
    }
    
    autoScale() {
        const priceScale = this.chart.priceScale('right');
        if (priceScale) {
            priceScale.applyOptions({ autoScale: true });
        }
    }
    
    scrollToLast() {
        if (this.chartData.length > 0) {
            this.chart.timeScale().scrollToRealTime();
        }
    }
    
    resize() {
        if (this.chart && this.container) {
            this.chart.applyOptions({
                width: this.container.clientWidth,
                height: CONFIG.chartHeight
            });
        }
    }
    
    setPrecisionByPrice(price) {
        let precision, minMove;
        
        if (price >= 1000) {
            precision = 2;
            minMove = 0.01;
        } else if (price >= 1) {
            precision = 4;
            minMove = 0.0001;
        } else if (price >= 0.01) {
            precision = 6;
            minMove = 0.000001;
        } else {
            precision = 8;
            minMove = 0.00000001;
        }
        
        this.candleSeries.applyOptions({
            priceFormat: { type: 'price', precision, minMove }
        });
        this.barSeries.applyOptions({
            priceFormat: { type: 'price', precision, minMove }
        });
    }
    
    openFullscreen() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000000;
            z-index: 10000;
            display: flex;
            flex-direction: column;
        `;
        
        const header = document.createElement('div');
        header.style.cssText = `
            height: 40px;
            background: #000000;
            border-bottom: 1px solid #2D2D2D;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            flex-shrink: 0;
        `;
        
        const title = document.createElement('span');
        title.textContent = `${this.currentSymbol || ''} · ${this.currentInterval || ''}`;
        title.style.cssText = 'color: #FFFFFF; font-weight: 600;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #808080;
            font-size: 20px;
            cursor: pointer;
            padding: 8px;
        `;
        closeBtn.addEventListener('click', () => {
            modal.remove();
            bigChart.destroy();
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        const chartContainer = document.createElement('div');
        chartContainer.style.cssText = 'flex: 1; width: 100%;';
        
        modal.appendChild(header);
        modal.appendChild(chartContainer);
        document.body.appendChild(modal);
        
        const bigChart = new CardChart(chartContainer);
        bigChart.currentSymbol = this.currentSymbol;
        bigChart.currentInterval = this.currentInterval;
        bigChart.setData(this.chartData);
        bigChart.setLoadMoreCallback(this.onLoadMoreCallback);
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                bigChart.destroy();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    openPopup() {
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(5px);
        `;
        
        const popupContainer = document.createElement('div');
        popupContainer.className = 'popup-container';
        popupContainer.style.cssText = `
            width: 85%;
            height: 85%;
            background: #000000;
            border-radius: 12px;
            border: 1px solid #b0b0b0;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            overflow: hidden;
            animation: slideIn 0.3s ease-out;
            display: flex;
            flex-direction: column;
        `;
        
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background: #141414;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        
        const title = document.createElement('span');
        title.textContent = `${this.currentSymbol || 'График'}`;
        title.style.cssText = 'color: #fff; font-weight: 600; font-size: 14px;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #aaa;
            font-size: 20px;
            cursor: pointer;
            padding: 4px 8px;
            z-index: 20002;
        `;
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        const chartContainer = document.createElement('div');
        chartContainer.style.cssText = 'flex: 1; width: 100%; min-height: 0;';
        
        popupContainer.appendChild(header);
        popupContainer.appendChild(chartContainer);
        overlay.appendChild(popupContainer);
        document.body.appendChild(overlay);
        
        let popupChart = new CardChart(chartContainer);
        popupChart.currentSymbol = this.currentSymbol;
        popupChart.currentInterval = this.currentInterval;
        popupChart.setData([...this.chartData]);
        
        const closePopup = () => {
            popupContainer.style.animation = 'slideOut 0.2s ease-out';
            setTimeout(() => {
                overlay.remove();
                if (popupChart) popupChart.destroy();
            }, 200);
        };
        
        closeBtn.addEventListener('click', closePopup);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePopup();
        });
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    destroy() {
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
    }
}
