// Конфигурация приложения
const CONFIG = {
    chartHeight: 150,
    candlesCount: 100,
    defaultInterval: '15m',
    wsUrl: 'ws://localhost:8765',
    natrPeriod: 14,
    emaPeriods: [20, 50],
    storageKey: 'crypto_screener_settings',
    alertsStorageKey: 'crypto_alerts',
    metricsCacheTime: 60000,
    candleCacheTTL: 60000,
    wsReconnectDelay: 3000,
    
    intervals: {
        '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440
    },
    
    exchanges: ['Binance', 'Bybit']
};