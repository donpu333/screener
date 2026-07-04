// Точка входа приложения
class AppCoordinator {
    constructor() {
        this.screener = null;
        this._isLoading = false;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Запуск CryptoScreener...');
        
        // Запрашиваем разрешение на уведомления
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        
        // Создаём скринер
        this.screener = new CryptoScreener();
        window.screener = this.screener;
        
        console.log('✅ CryptoScreener готов');
    }
}

// Запуск при загрузке DOM
window.addEventListener('DOMContentLoaded', () => {
    window.app = new AppCoordinator();
    // 🔥 Инициализация сравнения объёмов
    window.volumeCompare = new VolumeCompare();
});