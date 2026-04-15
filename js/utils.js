// Утилитарные функции
class Utils {
    static formatPrice(p) {
        if (p === undefined || p === null) return '—';
        if (p >= 1000) return p.toFixed(2);
        if (p >= 1) return p.toFixed(4);
        if (p >= 0.01) return p.toFixed(6);
        return p.toFixed(8);
    }
    
    static formatChange(c) {
        if (c === undefined || c === null) return '0.00%';
        return (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
    }
    
    static formatVolume(v) {
        if (!v) return '0';
        if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
        return v.toFixed(0);
    }
    
    static formatNumber(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toFixed(0);
    }
    
    static saveSettings(obj) {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(obj));
    }
    
    static loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {};
        } catch (e) {
            return {};
        }
    }
    
    static playBeep() {
        try {
            new Audio('data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoAAACAgICAf39/f39/f3+AgICAf39/f39/f3+AgICAf39/f39/f3+AgICAf39/f39/f3+AgICAf39/f39/f38=').play();
        } catch (e) {}
    }
    
    static async requestNotificationPermission() {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }
    
    static showNotification(title, body) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    }
    
    static debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    static async asyncPool(limit, items, iteratorFn) {
        const ret = [];
        const executing = [];
        for (const item of items) {
            const p = Promise.resolve().then(() => iteratorFn(item));
            ret.push(p);
            if (limit <= items.length) {
                const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                executing.push(e);
                if (executing.length >= limit) {
                    await Promise.race(executing);
                }
            }
        }
        return Promise.all(ret);
    }
    
    static getChangeClass(value) {
        return value >= 0 ? 'positive' : 'negative';
    }
}