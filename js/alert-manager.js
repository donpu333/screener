// Управление алертами
class AlertManager {
    constructor(screener) {
        this.screener = screener;
        this.alerts = [];
        
        this.loadAlerts();
        this.initUI();
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
        
        this.updateAlertCount();
    }
    
    showModal() {
        const modal = document.getElementById('alertModal');
        if (modal) {
            modal.style.display = 'flex';
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