// Управление алертами
class AlertManager {
    constructor(screener) {
        this.screener = screener;
        this.alerts = [];
        this.alertHistory = [];
        
        this.loadAlerts();
        this.loadHistory();
        this.initUI();
        this.autoSettings = this.loadAutoSettings();
    }
    
    loadAlerts() {
        try {
            const saved = localStorage.getItem(CONFIG.alertsStorageKey);
            if (saved) this.alerts = JSON.parse(saved);
        } catch (e) {
            this.alerts = [];
        }
    }
    
    saveAlerts() {
        localStorage.setItem(CONFIG.alertsStorageKey, JSON.stringify(this.alerts));
        this.updateAlertCount();
    }
    
    // 🔥 ИСТОРИЯ ОПОВЕЩЕНИЙ
    loadHistory() {
        try {
            const saved = localStorage.getItem('crypto_alert_history');
            if (saved) this.alertHistory = JSON.parse(saved);
        } catch (e) {
            this.alertHistory = [];
        }
    }
    
    saveHistory() {
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-100);
        }
        localStorage.setItem('crypto_alert_history', JSON.stringify(this.alertHistory));
        this.updateHistoryCount();
    }
    
    addHistoryEntry(entry) {
        this.alertHistory.push({
            ...entry,
            id: 'hist_' + Date.now(),
            time: new Date().toLocaleTimeString()
        });
        this.saveHistory();
    }
    
    updateHistoryCount() {
        const countEl = document.getElementById('historyTabCount');
        if (countEl) {
            countEl.textContent = this.alertHistory.length;
        }
    }
    
    renderHistory() {
        const container = document.getElementById('alertHistoryList');
        if (!container) return;
        
        if (this.alertHistory.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#555;">Нет оповещений</div>';
            return;
        }
        
        let html = '';
        const reversed = [...this.alertHistory].reverse();
        
        reversed.forEach(entry => {
            let typeClass = '';
            let typeIcon = '';
            
            switch (entry.type) {
                case 'price_up':
                    typeClass = 'hist-type-up';
                    typeIcon = '🚀';
                    break;
                case 'price_down':
                    typeClass = 'hist-type-down';
                    typeIcon = '📉';
                    break;
                case 'volume_surge':
                    typeClass = 'hist-type-volume';
                    typeIcon = '📊';
                    break;
                case 'trades_surge':
                    typeClass = 'hist-type-trades';
                    typeIcon = '🔄';
                    break;
            }
            
            html += `<div class="alert-history-item">
                <span class="hist-time">${entry.time}</span>
                <span class="hist-symbol">${entry.symbol}</span>
                <span class="${typeClass}">${typeIcon} ${entry.message}</span>
            </div>`;
        });
        
        container.innerHTML = html;
    }
    
    clearHistory() {
        this.alertHistory = [];
        this.saveHistory();
        this.renderHistory();
    }
    
loadAutoSettings() {
    try {
        return JSON.parse(localStorage.getItem('crypto_auto_alert_settings')) || {
            interval: '5m',
            priceUp: 2,
            priceDown: 2,
            volUp: 20,
            tradesUp: 20,
            sound: true
        };
    } catch (e) {
        return { interval: '5m', priceUp: 2, priceDown: 2, volUp: 20, tradesUp: 20, sound: true };
    }

    this.autoSettings = {
    interval: document.getElementById('autoAlertInterval')?.value || '5m',
    priceUp: parseInt(document.getElementById('autoPriceUpThreshold')?.value || 0),
    priceDown: parseInt(document.getElementById('autoPriceDownThreshold')?.value || 0),
    volUp: parseInt(document.getElementById('autoVolUpThreshold')?.value || 0),
    tradesUp: parseInt(document.getElementById('autoTradesUpThreshold')?.value || 0),
    sound: document.getElementById('autoAlertSoundCheck')?.checked || false
};
}

saveAutoSettings() {
    localStorage.setItem('crypto_auto_alert_settings', JSON.stringify(this.autoSettings));
}

applyAutoSettings() {
    const interval = document.getElementById('autoAlertInterval');
    const priceUp = document.getElementById('autoPriceUpThreshold');
    const priceDown = document.getElementById('autoPriceDownThreshold');
    const volUp = document.getElementById('autoVolUpThreshold');
    const tradesUp = document.getElementById('autoTradesUpThreshold');
    const sound = document.getElementById('autoAlertSoundCheck');
    
    if (interval) interval.value = this.autoSettings.interval || '5m';
    if (priceUp) priceUp.value = this.autoSettings.priceUp;
    if (priceDown) priceDown.value = this.autoSettings.priceDown;
    if (volUp) volUp.value = this.autoSettings.volUp;
    if (tradesUp) tradesUp.value = this.autoSettings.tradesUp;
    if (sound) sound.checked = this.autoSettings.sound;
}
// Обновить renderHistory для кнопки копирования:
renderHistory() {
    const container = document.getElementById('alertHistoryList');
    if (!container) return;
    
    if (this.alertHistory.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#555;">Нет оповещений</div>';
        return;
    }
    
    let html = '';
    const reversed = [...this.alertHistory].reverse();
    
    reversed.forEach(entry => {
        let typeClass = '';
        let typeIcon = '';
        
        switch (entry.type) {
            case 'price_up': typeClass = 'hist-type-up'; typeIcon = '🚀'; break;
            case 'price_down': typeClass = 'hist-type-down'; typeIcon = '📉'; break;
            case 'volume_surge': typeClass = 'hist-type-volume'; typeIcon = '📊'; break;
            case 'trades_surge': typeClass = 'hist-type-trades'; typeIcon = '🔄'; break;
        }
        
        html += `<div class="alert-history-item">
            <div>
                <span class="hist-time">${entry.time}</span>
                <span class="hist-symbol">${entry.symbol}</span>
                <span class="${typeClass}">${typeIcon} ${entry.message}</span>
            </div>
            <button class="hist-copy-btn" data-symbol="${entry.symbol}" title="Копировать тикер">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
        </div>`;
    });
    
    container.innerHTML = html;
    
    // Вешаем обработчики копирования
    container.querySelectorAll('.hist-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const symbol = btn.dataset.symbol;
            navigator.clipboard.writeText(symbol);
            
            // Показываем галочку
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<span style="color:#00c853;font-size:14px;">✓</span>';
            
            // Возвращаем иконку копирования через 1 секунду
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 1000);
        });
    });
}

initUI() {
    const modal = document.getElementById('alertModal');
    const alertBtn = document.getElementById('alertPanelBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const showCreateBtn = document.getElementById('showCreateAlertForm');
    const cancelCreateBtn = document.getElementById('cancelCreateBtn');
    const saveAlertBtn = document.getElementById('saveAlertBtn');
    
    if (alertBtn) {
        alertBtn.addEventListener('click', () => this.showModal());
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hideModal());
    }
    
    if (showCreateBtn) {
        showCreateBtn.addEventListener('click', () => {
            document.getElementById('createAlertForm').style.display = 'block';
            showCreateBtn.style.display = 'none';
            this.populateSymbolSelect();
        });
    }
    
    if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener('click', () => {
            document.getElementById('createAlertForm').style.display = 'none';
            showCreateBtn.style.display = 'block';
        });
    }
    
    if (saveAlertBtn) {
        saveAlertBtn.addEventListener('click', () => this.createAlert());
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideModal();
        });
    }
    
    // 🔥 ВКЛАДКИ (3 шт)
    const tabBtns = document.querySelectorAll('.alert-tab-btn');
    const alertsPanel = document.getElementById('alertAlertsPanel');
    const historyPanel = document.getElementById('alertHistoryPanel');
    const settingsPanel = document.getElementById('alertSettingsPanel');
    const createForm = document.getElementById('createAlertForm');
    const showBtn = document.getElementById('showCreateAlertForm');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.alertTab;
            
            if (tab === 'alerts') {
                if (alertsPanel) alertsPanel.style.display = 'block';
                if (historyPanel) historyPanel.style.display = 'none';
                if (settingsPanel) settingsPanel.style.display = 'none';
            } else if (tab === 'history') {
                if (alertsPanel) alertsPanel.style.display = 'none';
                if (historyPanel) historyPanel.style.display = 'block';
                if (settingsPanel) settingsPanel.style.display = 'none';
                if (createForm) createForm.style.display = 'none';
                if (showBtn) showBtn.style.display = 'block';
                this.renderHistory();
            } else if (tab === 'settings') {
                if (alertsPanel) alertsPanel.style.display = 'none';
                if (historyPanel) historyPanel.style.display = 'none';
                if (settingsPanel) settingsPanel.style.display = 'block';
                this.applyAutoSettings();
            }
        });
    });
    
    // 🔥 КНОПКА ОЧИСТКИ ИСТОРИИ
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => this.clearHistory());
    }
    
    // 🔥 КНОПКА СОХРАНЕНИЯ АВТОНАСТРОЕК
    const saveAutoBtn = document.getElementById('saveAutoSettingsBtn');
    if (saveAutoBtn) {
        saveAutoBtn.addEventListener('click', () => {
            this.autoSettings = {
                priceUp: parseInt(document.getElementById('autoPriceUpThreshold')?.value || 0),
                priceDown: parseInt(document.getElementById('autoPriceDownThreshold')?.value || 0),
                volUp: parseInt(document.getElementById('autoVolUpThreshold')?.value || 0),
                tradesUp: parseInt(document.getElementById('autoTradesUpThreshold')?.value || 0),
                sound: document.getElementById('autoAlertSoundCheck')?.checked || false
            };
            this.saveAutoSettings();
            Utils.showNotification('✅ Настройки сохранены', 'Автооповещения настроены');
        });
    }
    
    this.updateAlertCount();
    this.updateHistoryCount();
}
    showModal() {
        const modal = document.getElementById('alertModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Сброс на вкладку алертов
            const tabBtns = document.querySelectorAll('.alert-tab-btn');
            tabBtns.forEach(b => b.classList.remove('active'));
            const alertsTab = document.querySelector('[data-alert-tab="alerts"]');
            if (alertsTab) alertsTab.classList.add('active');
            
            const alertsPanel = document.getElementById('alertAlertsPanel');
            const historyPanel = document.getElementById('alertHistoryPanel');
            if (alertsPanel) alertsPanel.style.display = 'block';
            if (historyPanel) historyPanel.style.display = 'none';
            
            this.renderAlertList();
        }
    }
    
    hideModal() {
        const modal = document.getElementById('alertModal');
        const form = document.getElementById('createAlertForm');
        const showBtn = document.getElementById('showCreateAlertForm');
        
        if (modal) modal.style.display = 'none';
        if (form) form.style.display = 'none';
        if (showBtn) showBtn.style.display = 'block';
    }
    
    populateSymbolSelect() {
        const select = document.getElementById('alertSymbolSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="__ALL__">🌐 Все пары</option>';
        
        const symbols = new Set();
        for (const ticker of this.screener.marketTickers.values()) {
            symbols.add(ticker.symbol);
        }
        
        Array.from(symbols).sort().forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol;
            option.textContent = symbol;
            select.appendChild(option);
        });
    }
    
    createAlert() {
        const symbol = document.getElementById('alertSymbolSelect').value;
        const type = document.getElementById('alertTypeSelect').value;
        const operator = document.getElementById('alertOperatorSelect').value;
        const threshold = parseFloat(document.getElementById('alertThresholdInput').value);
        const sound = document.getElementById('alertSoundCheck').checked;
        
        if (isNaN(threshold)) {
            alert('Введите числовое значение порога');
            return;
        }
        
        const alert = {
            id: 'alert_' + Date.now(),
            symbol, type, operator, threshold, sound,
            enabled: true,
            createdAt: Date.now()
        };
        
        this.alerts.push(alert);
        this.saveAlerts();
        this.hideModal();
        
        Utils.showNotification('Алерт создан', `Алерт для ${symbol} успешно создан`);
    }
    
    renderAlertList() {
        const container = document.getElementById('alertListContainer');
        if (!container) return;
        
        if (this.alerts.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Нет активных оповещений</div>';
            return;
        }
        
        const typeLabels = {
            'price': 'Цена',
            'change_1m': 'Изменение 1м',
            'change_5m': 'Изменение 5м',
            'change_15m': 'Изменение 15м',
            'change_1h': 'Изменение 1ч',
            'volume_24h': 'Объём 24ч',
            'natr': 'NATR'
        };
        
        let html = '';
        
        this.alerts.forEach(alert => {
            const operatorSymbol = alert.operator === 'above' ? '>' : '<';
            const typeLabel = typeLabels[alert.type] || alert.type;
            
            html += `<div class="alert-item" data-alert-id="${alert.id}">
                <div class="alert-item-info">
                    <div><strong>${alert.symbol}</strong></div>
                    <div>${typeLabel} ${operatorSymbol} ${alert.threshold}</div>
                </div>
                <span class="alert-item-remove" data-id="${alert.id}">✕</span>
            </div>`;
        });
        
        container.innerHTML = html;
        
        container.querySelectorAll('.alert-item-remove').forEach(btn => {
            btn.addEventListener('click', () => this.removeAlert(btn.dataset.id));
        });
    }
    
    removeAlert(id) {
        this.alerts = this.alerts.filter(a => a.id !== id);
        this.saveAlerts();
        this.renderAlertList();
    }
    
    updateAlertCount() {
        const countEl = document.getElementById('alertCount');
        if (countEl) {
            countEl.textContent = this.alerts.length;
            countEl.style.display = this.alerts.length > 0 ? 'inline-flex' : 'none';
        }
        
        const tabCountEl = document.getElementById('alertTabCount');
        if (tabCountEl) {
            tabCountEl.textContent = this.alerts.length;
        }
    }
    
    quickCreate(symbol, exchange) {
        this.showModal();
        
        const form = document.getElementById('createAlertForm');
        const showBtn = document.getElementById('showCreateAlertForm');
        const select = document.getElementById('alertSymbolSelect');
        
        if (form) form.style.display = 'block';
        if (showBtn) showBtn.style.display = 'none';
        
        this.populateSymbolSelect();
        
        if (select) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === symbol) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    checkAlerts(ticker, metrics) {
        const triggered = [];
        
        for (const alert of this.alerts) {
            if (!alert.enabled) continue;
            if (alert.symbol !== '__ALL__' && alert.symbol !== ticker.symbol) continue;
            
            const value = this.getValueForAlert(ticker, metrics, alert.type);
            if (value === null) continue;
            
            const conditionMet = alert.operator === 'above' 
                ? value > alert.threshold 
                : value < alert.threshold;
            
            if (conditionMet) {
                triggered.push(alert);
                alert.enabled = false;
            }
        }
        
        if (triggered.length > 0) {
            this.saveAlerts();
            this.triggerAlerts(triggered, ticker);
        }
    }
    
    getValueForAlert(ticker, metrics, type) {
        switch (type) {
            case 'price': return ticker.price;
            case 'change_1m': return metrics.change1m;
            case 'change_5m': return metrics.change5m;
            case 'change_15m': return metrics.change15m;
            case 'change_1h': return metrics.change1h;
            case 'change_24h': return ticker.change24h;
            case 'volume_24h': return ticker.volume24h;
            case 'natr': return metrics.natr;
            default: return null;
        }
    }
    
    triggerAlerts(alerts, ticker) {
        for (const alert of alerts) {
            if (alert.sound) Utils.playBeep();
            
            const title = `🔔 Алерт: ${ticker.symbol}`;
            const body = `${this.getAlertDescription(alert)} | Текущее: ${Utils.formatPrice(ticker.price)}`;
            
            Utils.showNotification(title, body);
        }
    }
    
    getAlertDescription(alert) {
        const typeLabels = {
            'price': 'Цена',
            'change_1m': 'Изменение 1м',
            'change_5m': 'Изменение 5м',
            'change_15m': 'Изменение 15м',
            'change_1h': 'Изменение 1ч',
            'volume_24h': 'Объём 24ч',
            'natr': 'NATR'
        };
        
        const typeLabel = typeLabels[alert.type] || alert.type;
        const operator = alert.operator === 'above' ? '>' : '<';
        
        return `${typeLabel} ${operator} ${alert.threshold}`;
    }
}