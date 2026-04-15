// js/card-chart.js — С БЕСКОНЕЧНОЙ ПОДГРУЗКОЙ ИСТОРИИ
class CardChart {
    constructor(container) {
        this.container = container;
        this.chart = null;
        this.candleSeries = null;
        this.barSeries = null;
        this.currentChartType = 'candle';
        this.bullishColor = '#00bcd4';
        this.bearishColor = '#f23645';
        this.chartData = [];
        
        // 🔥 ДЛЯ БЕСКОНЕЧНОЙ ПОДГРУЗКИ
        this.isLoadingHistory = false;
        this.oldestTime = null;
        this.onLoadMoreCallback = null;
        this.minCandles = 500;  // МИНИМУМ 500 СВЕЧЕЙ ПРИ ЗАГРУЗКЕ
        this.loadMoreThreshold = 150;  // КОГДА ОСТАЛОСЬ 150 СВЕЧЕЙ ДО КОНЦА ИСТОРИИ
        
        this.initChart();
    }
    
    // js/card-chart.js — ИСПРАВЛЕННЫЙ initChart С ПЛОТНОЙ ШКАЛОЙ ЦЕНЫ
// js/card-chart.js — initChart ИСПРАВЛЕННЫЙ
initChart() {
    this.container.innerHTML = '';
    
    const height = this.container.clientHeight || 220;
    
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
            barSpacing: 6,           // 🔥 СВЕЧИ БЛИЖЕ
            minBarSpacing: 4,
            rightOffset: 10          // 🔥 ОТСТУП 10 СВЕЧЕЙ СПРАВА
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
        priceFormat: {               // 🔥 ФИКС 0.XXXXXX
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
    
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        this.checkAndLoadMore(range);
    });
    
    this.addButtons();
    this.setupResizeObserver();
}
    
    // 🔥 ПРОВЕРКА НЕОБХОДИМОСТИ ПОДГРУЗКИ
    checkAndLoadMore(range) {
        if (!range || this.isLoadingHistory) return;
        if (!this.onLoadMoreCallback) return;
        if (this.chartData.length === 0) return;
        
        const firstVisibleIndex = range.from;
        
        // ЕСЛИ ДО КОНЦА ИСТОРИИ ОСТАЛОСЬ МЕНЬШЕ 150 СВЕЧЕЙ
        if (firstVisibleIndex < this.loadMoreThreshold) {
            this.loadMoreHistory();
        }
    }
    
    // 🔥 ЗАГРУЗКА ЕЩЁ ИСТОРИИ
    async loadMoreHistory() {
        if (this.isLoadingHistory) return;
        if (!this.oldestTime) return;
        if (!this.onLoadMoreCallback) return;
        
        this.isLoadingHistory = true;
        
        try {
            // ВЫЗЫВАЕМ КОЛБЭК ДЛЯ ЗАГРУЗКИ БОЛЕЕ СТАРЫХ СВЕЧЕЙ
            const olderData = await this.onLoadMoreCallback(this.oldestTime, 200);
            
            if (olderData && olderData.length > 0) {
                // ОБЪЕДИНЯЕМ СТАРЫЕ И НОВЫЕ ДАННЫЕ
                const mergedData = [...olderData, ...this.chartData];
                
                // УДАЛЯЕМ ДУБЛИКАТЫ ПО ВРЕМЕНИ
                const uniqueData = [];
                const timeSet = new Set();
                for (const candle of mergedData) {
                    if (!timeSet.has(candle.time)) {
                        timeSet.add(candle.time);
                        uniqueData.push(candle);
                    }
                }
                
                // СОРТИРУЕМ ПО ВРЕМЕНИ
                uniqueData.sort((a, b) => a.time - b.time);
                
                this.chartData = uniqueData;
                this.oldestTime = uniqueData[0].time;
                
                // ОБНОВЛЯЕМ ГРАФИК
                this.candleSeries.setData(this.chartData);
                this.barSeries.setData(this.chartData);
                
                console.log(`📊 Подгружено ${olderData.length} свечей, всего ${this.chartData.length}`);
            }
        } catch (error) {
            console.warn('Ошибка подгрузки истории:', error);
        } finally {
            this.isLoadingHistory = false;
        }
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
        
        const scrollBtn = this.createButton('▶▶', 'К последней свече', () => {
            this.scrollToLast();
        });
        
        const autoScaleBtn = this.createButton('A', 'Автомасштаб', () => {
            this.autoScale();
        });
        
        const typeBtn = this.createButton('📊', 'Свечи/Бары', () => {
            this.toggleChartType();
        });
        
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
    
    setTimeout(() => {
        const timeScale = this.chart.timeScale();
        
        // 🔥 ПОКАЗЫВАЕМ 40 СВЕЧЕЙ + ОТСТУП 10 СПРАВА
        if (data.length > 40) {
            timeScale.setVisibleLogicalRange({
                from: data.length - 50,    // 40 + 10 отступ
                to: data.length - 1 + 10   // отступ 10 справа
            });
        } else {
            timeScale.fitContent();
        }
        
        const priceScale = this.chart.priceScale('right');
        if (priceScale) {
            priceScale.applyOptions({ autoScale: true });
        }
    }, 100);
    
    console.log(`📊 Загружено ${data.length} свечей`);
}
    // 🔥 УСТАНОВИТЬ КОЛБЭК ДЛЯ ПОДГРУЗКИ
    setLoadMoreCallback(callback) {
        this.onLoadMoreCallback = callback;
    }
    
    // 🔥 ОБНОВИТЬ СВЕЧУ В REAL-TIME
    updateLastCandle(candle) {
        if (this.chartData.length === 0) return;
        
        const lastIndex = this.chartData.length - 1;
        const lastCandle = this.chartData[lastIndex];
        
        if (candle.time === lastCandle.time) {
            // ОБНОВЛЯЕМ ТЕКУЩУЮ СВЕЧУ
            this.chartData[lastIndex] = candle;
        } else if (candle.time > lastCandle.time) {
            // ДОБАВЛЯЕМ НОВУЮ СВЕЧУ
            this.chartData.push(candle);
            this.oldestTime = this.chartData[0].time;
        }
        
        this.candleSeries.update(candle);
        this.barSeries.update(candle);
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
    // js/card-chart.js — добавить метод для автоопределения точности
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

// В setData вызывать после получения данных:

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
    
    destroy() {
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
    }
}