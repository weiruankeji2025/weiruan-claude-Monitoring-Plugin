// ==UserScript==
// @name         威软Claude用量检测
// @namespace    https://github.com/weiruankeji2025
// @version      3.1.0
// @description  Claude AI 用量检测插件 - 真实API用量监控、历史数据图表、现代化深色界面
// @author       威软科技 (WeiRuan Tech)
// @match        https://claude.ai/*
// @icon         https://claude.ai/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_addStyle
// @license      MIT
// @homepageURL  https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin
// @supportURL   https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin/issues
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        VERSION: '3.1.0',
        STORAGE_PREFIX: 'weiruan_claude_v3_',
        UPDATE_INTERVAL: 60000,
        HISTORY_DAYS: 30,
        DEBUG: false
    };

    // ==================== 威软AI Logo (SVG) ====================
    const WEIRUAN_LOGO = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 大脑图标 -->
        <path d="M50 8C35 8 25 18 25 30C25 35 27 40 30 44C28 48 26 53 26 58C26 70 35 80 50 80C65 80 74 70 74 58C74 53 72 48 70 44C73 40 75 35 75 30C75 18 65 8 50 8Z" fill="url(#brain-gradient)" opacity="0.9"/>
        <!-- 电路线条 -->
        <path d="M35 35H42M58 35H65M38 50H45M55 50H62M42 65H58" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <circle cx="42" cy="35" r="2" fill="white"/>
        <circle cx="58" cy="35" r="2" fill="white"/>
        <circle cx="45" cy="50" r="2" fill="white"/>
        <circle cx="55" cy="50" r="2" fill="white"/>
        <circle cx="50" cy="65" r="2" fill="white"/>
        <!-- WR 文字 -->
        <text x="50" y="95" text-anchor="middle" fill="white" font-family="Arial Black, sans-serif" font-size="14" font-weight="bold">WR</text>
        <defs>
            <linearGradient id="brain-gradient" x1="25" y1="8" x2="75" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#667eea"/>
                <stop offset="100%" stop-color="#764ba2"/>
            </linearGradient>
        </defs>
    </svg>`;

    // ==================== 工具函数 ====================
    const Utils = {
        log: (...args) => {
            if (CONFIG.DEBUG) {
                console.log('%c[威软Claude]', 'color: #667eea; font-weight: bold;', ...args);
            }
        },

        storage: {
            get: (key, defaultValue = null) => {
                try {
                    if (typeof GM_getValue !== 'undefined') {
                        const value = GM_getValue(CONFIG.STORAGE_PREFIX + key, null);
                        return value !== null ? JSON.parse(value) : defaultValue;
                    }
                    const value = localStorage.getItem(CONFIG.STORAGE_PREFIX + key);
                    return value !== null ? JSON.parse(value) : defaultValue;
                } catch (e) {
                    return defaultValue;
                }
            },
            set: (key, value) => {
                try {
                    const jsonValue = JSON.stringify(value);
                    if (typeof GM_setValue !== 'undefined') {
                        GM_setValue(CONFIG.STORAGE_PREFIX + key, jsonValue);
                    } else {
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + key, jsonValue);
                    }
                } catch (e) {
                    Utils.log('存储失败:', e);
                }
            }
        },

        getDateKey: (date = new Date()) => {
            const d = new Date(date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        },

        formatResetTime: (isoTime) => {
            if (!isoTime) return '未知';
            const diff = new Date(isoTime) - new Date();
            if (diff < 60000) return '即将重置';
            const minutes = Math.floor(diff / 60000) % 60;
            const hours = Math.floor(diff / 3600000) % 24;
            const days = Math.floor(diff / 86400000);
            if (days > 0) return `${days}天${hours}时`;
            if (hours > 0) return `${hours}时${minutes}分`;
            return `${minutes}分钟`;
        },

        // 节流函数 - 优化性能
        throttle: (fn, delay) => {
            let lastCall = 0;
            return (...args) => {
                const now = Date.now();
                if (now - lastCall >= delay) {
                    lastCall = now;
                    fn(...args);
                }
            };
        },

        // 防抖函数
        debounce: (fn, delay) => {
            let timer = null;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), delay);
            };
        }
    };

    // ==================== API 服务 ====================
    const ApiService = {
        orgId: null,
        cache: { usage: null, account: null, timestamp: 0 },
        CACHE_DURATION: 30000, // 30秒缓存

        async getOrgId() {
            if (this.orgId) return this.orgId;
            try {
                const response = await fetch('/api/organizations', { credentials: 'include' });
                const orgs = await response.json();
                this.orgId = orgs[0]?.uuid;
                return this.orgId;
            } catch (err) {
                Utils.log('获取组织ID失败:', err);
                return null;
            }
        },

        async getUsageData(forceRefresh = false) {
            // 使用缓存避免频繁请求
            if (!forceRefresh && this.cache.usage && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
                return this.cache.usage;
            }
            try {
                const orgId = await this.getOrgId();
                if (!orgId) return null;
                const response = await fetch(`/api/organizations/${orgId}/usage`, { credentials: 'include' });
                const data = await response.json();
                this.cache.usage = data;
                this.cache.timestamp = Date.now();
                return data;
            } catch (err) {
                Utils.log('获取用量数据失败:', err);
                return this.cache.usage; // 返回缓存数据
            }
        },

        async getAccountSettings(forceRefresh = false) {
            if (!forceRefresh && this.cache.account) {
                return this.cache.account;
            }
            try {
                const response = await fetch('/api/account', { credentials: 'include' });
                const data = await response.json();
                this.cache.account = data;
                return data;
            } catch (err) {
                Utils.log('获取账户设置失败:', err);
                return this.cache.account;
            }
        }
    };

    // ==================== 历史数据管理 ====================
    class HistoryManager {
        constructor() {
            this.historyMap = {};
            this.loadHistory();
        }

        loadHistory() {
            try {
                this.historyMap = Utils.storage.get('history', {}) || {};
                this.cleanOldHistory();
            } catch (e) {
                this.historyMap = {};
            }
        }

        saveHistory() {
            Utils.storage.set('history', this.historyMap);
        }

        cleanOldHistory() {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CONFIG.HISTORY_DAYS);
            const cutoffKey = Utils.getDateKey(cutoffDate);
            let changed = false;
            Object.keys(this.historyMap).forEach(key => {
                if (key < cutoffKey) {
                    delete this.historyMap[key];
                    changed = true;
                }
            });
            if (changed) this.saveHistory();
        }

        recordUsage(usageData) {
            if (!usageData) return;
            const today = Utils.getDateKey();
            this.historyMap[today] = {
                timestamp: Date.now(),
                fiveHour: Math.round((usageData.five_hour?.utilization || 0) * 100),
                sevenDay: Math.round((usageData.seven_day?.utilization || 0) * 100),
                sevenDayOpus: Math.round((usageData.seven_day_opus?.utilization || 0) * 100)
            };
            this.saveHistory();
        }

        getRecentHistory(days = 7) {
            const result = [];
            const today = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = Utils.getDateKey(date);
                const data = this.historyMap[dateKey] || {};
                result.push({
                    dateKey,
                    shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
                    dayName: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
                    fiveHour: data.fiveHour || 0,
                    sevenDay: data.sevenDay || 0
                });
            }
            return result;
        }
    }

    // ==================== 面板状态 ====================
    const PanelState = {
        isExpanded: Utils.storage.get('expanded', true),
        position: Utils.storage.get('position', { x: null, y: null }),
        save() {
            Utils.storage.set('expanded', this.isExpanded);
            Utils.storage.set('position', this.position);
        }
    };

    // ==================== 主应用 ====================
    class ClaudeUsagePanel {
        constructor() {
            this.historyManager = new HistoryManager();
            this.usageData = null;
            this.accountData = null;
            this.panel = null;
            this.historyDays = 7;
            this.isDragging = false;
            this.isRefreshing = false;
            this.dragOffset = { x: 0, y: 0 };
            this.animationFrame = null;
        }

        async init() {
            this.injectStyles();
            this.createPanel();
            await this.refreshData(true);
            // 定时更新 - 使用较长间隔减少资源占用
            setInterval(() => this.refreshData(false), CONFIG.UPDATE_INTERVAL);
        }

        async refreshData(forceRefresh = false) {
            if (this.isRefreshing) return;
            this.isRefreshing = true;
            this.showRefreshState(true);

            try {
                const [usageData, accountData] = await Promise.all([
                    ApiService.getUsageData(forceRefresh),
                    ApiService.getAccountSettings(forceRefresh)
                ]);
                this.usageData = usageData;
                this.accountData = accountData;
                if (usageData) {
                    this.historyManager.recordUsage(usageData);
                }
                this.updatePanelContent();
            } catch (e) {
                Utils.log('刷新数据失败:', e);
            } finally {
                this.isRefreshing = false;
                this.showRefreshState(false);
            }
        }

        showRefreshState(isRefreshing) {
            const btn = document.getElementById('weiruan-refresh');
            if (btn) {
                btn.classList.toggle('spinning', isRefreshing);
                btn.disabled = isRefreshing;
            }
        }

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                #weiruan-panel {
                    position: fixed;
                    z-index: 999999;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid #0f3460;
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #e0e0e0;
                    width: 320px;
                    max-height: 85vh;
                    overflow: hidden;
                    will-change: transform;
                    contain: layout style;
                    right: 20px;
                    bottom: 20px;
                }

                #weiruan-panel.dragging {
                    transition: none !important;
                    cursor: grabbing !important;
                    user-select: none;
                }

                #weiruan-panel.collapsed {
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    cursor: pointer;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                }

                #weiruan-panel.collapsed:hover {
                    transform: scale(1.08);
                    box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
                }

                #weiruan-panel.collapsed .panel-content,
                #weiruan-panel.collapsed .panel-header-title,
                #weiruan-panel.collapsed .panel-controls {
                    display: none !important;
                }

                #weiruan-panel.collapsed .panel-header {
                    padding: 0;
                    justify-content: center;
                    height: 52px;
                    background: transparent;
                    border: none;
                }

                #weiruan-panel.collapsed .collapsed-icon {
                    display: flex !important;
                }

                .collapsed-icon {
                    display: none !important;
                    width: 32px;
                    height: 32px;
                    align-items: center;
                    justify-content: center;
                }

                .collapsed-icon svg {
                    width: 100%;
                    height: 100%;
                }

                .panel-header {
                    padding: 12px 14px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: grab;
                    user-select: none;
                    border-radius: 15px 15px 0 0;
                }

                .panel-header:active {
                    cursor: grabbing;
                }

                .panel-header-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: white;
                }

                .panel-header-title .logo {
                    width: 24px;
                    height: 24px;
                    border-radius: 6px;
                    overflow: hidden;
                    background: rgba(255,255,255,0.15);
                    padding: 2px;
                }

                .panel-header-title .logo svg {
                    width: 100%;
                    height: 100%;
                }

                .panel-controls {
                    display: flex;
                    gap: 6px;
                }

                .panel-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    border-radius: 6px;
                    width: 26px;
                    height: 26px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 12px;
                    transition: background 0.2s, transform 0.15s;
                }

                .panel-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.1);
                }

                .panel-btn:active {
                    transform: scale(0.95);
                }

                .panel-btn.spinning {
                    animation: spin 0.8s linear infinite;
                }

                .panel-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .panel-content {
                    max-height: calc(85vh - 50px);
                    overflow-y: auto;
                    padding: 14px;
                    overscroll-behavior: contain;
                }

                .panel-content::-webkit-scrollbar {
                    width: 5px;
                }

                .panel-content::-webkit-scrollbar-track {
                    background: transparent;
                }

                .panel-content::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 3px;
                }

                .section {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 10px;
                    padding: 12px;
                    margin-bottom: 10px;
                }

                .section:last-child {
                    margin-bottom: 0;
                }

                .section-title {
                    font-size: 11px;
                    font-weight: 600;
                    color: #a0a0a0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                }

                .refresh-hint {
                    font-size: 10px;
                    color: #667eea;
                    cursor: pointer;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                }

                .refresh-hint:hover {
                    opacity: 1;
                    text-decoration: underline;
                }

                .usage-item {
                    margin-bottom: 12px;
                }

                .usage-item:last-child {
                    margin-bottom: 0;
                }

                .usage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                }

                .usage-label {
                    font-size: 12px;
                    font-weight: 500;
                    color: #e0e0e0;
                }

                .usage-time {
                    font-size: 10px;
                    color: #808080;
                }

                .usage-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 4px;
                }

                .usage-bar-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.4s ease-out;
                    will-change: width;
                }

                .usage-bar-fill.low { background: linear-gradient(90deg, #4ade80, #22c55e); }
                .usage-bar-fill.medium { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
                .usage-bar-fill.high { background: linear-gradient(90deg, #f87171, #ef4444); }

                .usage-percent {
                    text-align: right;
                    font-size: 11px;
                    color: #a0a0a0;
                }

                .history-tabs {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 10px;
                }

                .history-tab {
                    padding: 4px 10px;
                    border: none;
                    background: rgba(255, 255, 255, 0.08);
                    color: #a0a0a0;
                    border-radius: 5px;
                    font-size: 10px;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .history-tab:hover { background: rgba(255, 255, 255, 0.12); }
                .history-tab.active {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                }

                .chart-container {
                    height: 60px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 2px;
                    padding: 6px 0;
                }

                .chart-bar-wrapper {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                    min-width: 0;
                }

                .chart-bar-container {
                    flex: 1;
                    width: 100%;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                }

                .chart-bar {
                    width: 65%;
                    background: linear-gradient(180deg, #667eea, #764ba2);
                    border-radius: 2px 2px 0 0;
                    min-height: 2px;
                    position: relative;
                }

                .chart-bar.today {
                    background: linear-gradient(180deg, #4ade80, #22c55e);
                }

                .chart-bar::after {
                    content: attr(data-value);
                    position: absolute;
                    bottom: calc(100% + 4px);
                    left: 50%;
                    transform: translateX(-50%);
                    background: #333;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 9px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.15s;
                }

                .chart-bar:hover::after { opacity: 1; }

                .chart-label {
                    font-size: 8px;
                    color: #606060;
                    margin-top: 3px;
                }

                .chart-label.today {
                    color: #4ade80;
                    font-weight: 600;
                }

                .account-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }

                .account-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: white;
                    flex-shrink: 0;
                }

                .account-details { flex: 1; min-width: 0; }
                .account-name {
                    font-size: 12px;
                    font-weight: 600;
                    color: #e0e0e0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .account-email {
                    font-size: 10px;
                    color: #808080;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px;
                }

                .stat-item {
                    background: rgba(255, 255, 255, 0.03);
                    padding: 8px;
                    border-radius: 6px;
                    text-align: center;
                }

                .stat-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #667eea;
                }

                .stat-label {
                    font-size: 9px;
                    color: #808080;
                    margin-top: 2px;
                }

                .footer {
                    text-align: center;
                    padding: 8px;
                    font-size: 9px;
                    color: #505050;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    margin-top: 10px;
                }

                .footer a {
                    color: #667eea;
                    text-decoration: none;
                }

                .loading {
                    text-align: center;
                    padding: 24px;
                    color: #808080;
                }

                .loading-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #667eea;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto 8px;
                }

                .error-msg {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #f87171;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 11px;
                    text-align: center;
                }

                .manual-refresh-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 12px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border: none;
                    border-radius: 6px;
                    color: white;
                    font-size: 11px;
                    cursor: pointer;
                    margin-top: 10px;
                    transition: transform 0.15s, box-shadow 0.15s;
                }

                .manual-refresh-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .manual-refresh-btn:active {
                    transform: translateY(0);
                }
            `;
            document.head.appendChild(style);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'weiruan-panel';

            // 应用保存的位置，并校验是否在可视区域内
            if (PanelState.position.x !== null && PanelState.position.y !== null) {
                let x = PanelState.position.x;
                let y = PanelState.position.y;

                // 确保位置在可视区域内
                const maxX = window.innerWidth - 60;
                const maxY = window.innerHeight - 60;

                if (x >= 0 && x <= maxX && y >= 0 && y <= maxY) {
                    panel.style.left = x + 'px';
                    panel.style.top = y + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                } else {
                    // 位置无效，重置为默认
                    PanelState.position = { x: null, y: null };
                    PanelState.save();
                }
            }

            if (!PanelState.isExpanded) {
                panel.classList.add('collapsed');
            }

            panel.innerHTML = `
                <div class="panel-header">
                    <div class="collapsed-icon">${WEIRUAN_LOGO}</div>
                    <div class="panel-header-title">
                        <div class="logo">${WEIRUAN_LOGO}</div>
                        <span>威软监控</span>
                    </div>
                    <div class="panel-controls">
                        <button class="panel-btn" id="weiruan-refresh" title="刷新数据">🔄</button>
                        <button class="panel-btn" id="weiruan-toggle" title="折叠">−</button>
                    </div>
                </div>
                <div class="panel-content">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        加载中...
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;
            this.setupEventListeners();
        }

        setupEventListeners() {
            const header = this.panel.querySelector('.panel-header');
            const toggleBtn = document.getElementById('weiruan-toggle');
            const refreshBtn = document.getElementById('weiruan-refresh');

            // 折叠/展开
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCollapse();
            });

            // 手动刷新
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshData(true);
            });

            // 折叠状态点击展开
            this.panel.addEventListener('click', (e) => {
                if (this.panel.classList.contains('collapsed') && !this.isDragging) {
                    this.toggleCollapse();
                }
            });

            // 拖拽 - 优化性能
            this.setupDrag(header);
        }

        setupDrag(header) {
            let startX, startY, startLeft, startTop;

            const onMouseDown = (e) => {
                if (e.target.closest('.panel-btn')) return;
                if (e.button !== 0) return; // 只响应左键

                e.preventDefault();
                this.isDragging = false;

                const rect = this.panel.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;

                // 转换为 left/top 定位
                this.panel.style.right = 'auto';
                this.panel.style.bottom = 'auto';
                this.panel.style.left = startLeft + 'px';
                this.panel.style.top = startTop + 'px';

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            const onMouseMove = (e) => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // 超过5px才算拖拽
                if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    this.isDragging = true;
                    this.panel.classList.add('dragging');
                }

                if (this.isDragging) {
                    // 使用 requestAnimationFrame 优化
                    if (this.animationFrame) {
                        cancelAnimationFrame(this.animationFrame);
                    }
                    this.animationFrame = requestAnimationFrame(() => {
                        let newX = startLeft + dx;
                        let newY = startTop + dy;

                        // 边界限制
                        const panelRect = this.panel.getBoundingClientRect();
                        const maxX = window.innerWidth - panelRect.width;
                        const maxY = window.innerHeight - panelRect.height;

                        newX = Math.max(0, Math.min(newX, maxX));
                        newY = Math.max(0, Math.min(newY, maxY));

                        this.panel.style.left = newX + 'px';
                        this.panel.style.top = newY + 'px';
                    });
                }
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                if (this.animationFrame) {
                    cancelAnimationFrame(this.animationFrame);
                }

                this.panel.classList.remove('dragging');

                if (this.isDragging) {
                    // 保存位置
                    PanelState.position = {
                        x: parseInt(this.panel.style.left),
                        y: parseInt(this.panel.style.top)
                    };
                    PanelState.save();
                }

                // 延迟重置，防止触发点击事件
                setTimeout(() => {
                    this.isDragging = false;
                }, 50);
            };

            header.addEventListener('mousedown', onMouseDown);

            // 触摸支持
            header.addEventListener('touchstart', (e) => {
                if (e.target.closest('.panel-btn')) return;
                const touch = e.touches[0];
                onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0, preventDefault: () => {} });
            }, { passive: false });
        }

        toggleCollapse() {
            PanelState.isExpanded = !PanelState.isExpanded;
            PanelState.save();
            this.panel.classList.toggle('collapsed', !PanelState.isExpanded);
            document.getElementById('weiruan-toggle').textContent = PanelState.isExpanded ? '−' : '+';
        }

        getBarClass(percent) {
            if (percent >= 80) return 'high';
            if (percent >= 50) return 'medium';
            return 'low';
        }

        updatePanelContent() {
            const content = this.panel.querySelector('.panel-content');
            if (!content) return;

            if (!this.usageData && !this.accountData) {
                content.innerHTML = `
                    <div class="error-msg">
                        ❌ 无法获取数据<br>
                        <small>请确保已登录 Claude</small>
                    </div>
                    <button class="manual-refresh-btn" id="retry-btn">🔄 重试</button>
                `;
                content.querySelector('#retry-btn')?.addEventListener('click', () => this.refreshData(true));
                return;
            }

            const fragments = [];

            // 用量统计
            if (this.usageData) {
                let usageHtml = '<div class="section"><div class="section-title"><span>📊 实时用量</span><span class="refresh-hint" id="inline-refresh">点击刷新</span></div>';

                const items = [
                    { key: 'five_hour', label: '当前会话 (5小时)' },
                    { key: 'seven_day', label: '周用量 (全模型)' },
                    { key: 'seven_day_opus', label: '周用量 (Opus)' }
                ];

                items.forEach(item => {
                    const data = this.usageData[item.key];
                    if (data) {
                        const percent = Math.round((data.utilization || 0) * 100);
                        const barClass = this.getBarClass(percent);
                        usageHtml += `
                            <div class="usage-item">
                                <div class="usage-header">
                                    <span class="usage-label">${item.label}</span>
                                    <span class="usage-time">${Utils.formatResetTime(data.resets_at)}</span>
                                </div>
                                <div class="usage-bar">
                                    <div class="usage-bar-fill ${barClass}" style="width: ${percent}%"></div>
                                </div>
                                <div class="usage-percent">${percent}% 已使用</div>
                            </div>
                        `;
                    }
                });
                usageHtml += '</div>';
                fragments.push(usageHtml);
            }

            // 历史趋势
            fragments.push(`
                <div class="section">
                    <div class="section-title">📈 历史趋势</div>
                    <div class="history-tabs">
                        <button class="history-tab ${this.historyDays === 7 ? 'active' : ''}" data-days="7">7天</button>
                        <button class="history-tab ${this.historyDays === 14 ? 'active' : ''}" data-days="14">14天</button>
                        <button class="history-tab ${this.historyDays === 30 ? 'active' : ''}" data-days="30">30天</button>
                    </div>
                    <div class="chart-container" id="weiruan-chart"></div>
                </div>
            `);

            // 账户信息
            if (this.accountData) {
                const name = this.accountData.account?.display_name || this.accountData.name || '用户';
                const email = this.accountData.email || '';
                fragments.push(`
                    <div class="section">
                        <div class="section-title">👤 账户信息</div>
                        <div class="account-info">
                            <div class="account-avatar">${name.charAt(0).toUpperCase()}</div>
                            <div class="account-details">
                                <div class="account-name">${name}</div>
                                <div class="account-email">${email}</div>
                            </div>
                        </div>
                    </div>
                `);
            }

            // 统计摘要
            const historyData = this.historyManager.getRecentHistory(7);
            const avgUsage = Math.round(historyData.reduce((s, d) => s + d.fiveHour, 0) / 7);
            const maxUsage = Math.max(...historyData.map(d => d.fiveHour));

            fragments.push(`
                <div class="section">
                    <div class="section-title">📋 7天统计</div>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value">${avgUsage}%</div>
                            <div class="stat-label">日均用量</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${maxUsage}%</div>
                            <div class="stat-label">最高用量</div>
                        </div>
                    </div>
                </div>
            `);

            // 页脚
            fragments.push(`
                <div class="footer">
                    v${CONFIG.VERSION} · <a href="https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin" target="_blank">GitHub</a> · 威软科技
                </div>
            `);

            content.innerHTML = fragments.join('');

            // 绑定事件
            content.querySelector('#inline-refresh')?.addEventListener('click', () => this.refreshData(true));

            content.querySelectorAll('.history-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    content.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.historyDays = parseInt(tab.dataset.days);
                    this.updateChart();
                });
            });

            this.updateChart();
        }

        updateChart() {
            const container = document.getElementById('weiruan-chart');
            if (!container) return;

            const historyData = this.historyManager.getRecentHistory(this.historyDays);
            const today = Utils.getDateKey();
            const maxValue = Math.max(...historyData.map(d => d.fiveHour), 1);

            const chartHTML = historyData.map(data => {
                const height = Math.max(2, (data.fiveHour / maxValue) * 100);
                const isToday = data.dateKey === today;
                const displayLabel = this.historyDays <= 7 ? data.dayName : data.shortDate;

                return `
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar-container">
                            <div class="chart-bar${isToday ? ' today' : ''}" style="height: ${height}%" data-value="${data.shortDate}: ${data.fiveHour}%"></div>
                        </div>
                        <div class="chart-label${isToday ? ' today' : ''}">${displayLabel}</div>
                    </div>
                `;
            }).join('');

            container.innerHTML = chartHTML;
        }
    }

    // ==================== 初始化 ====================
    function init() {
        // 避免重复初始化
        if (document.getElementById('weiruan-panel')) return;

        const panel = new ClaudeUsagePanel();
        panel.init();
        window.weiruanPanel = panel;

        // 暴露手动刷新方法
        window.weiruanRefresh = () => panel.refreshData(true);

        // 暴露重置位置方法
        window.weiruanResetPosition = () => {
            PanelState.position = { x: null, y: null };
            PanelState.isExpanded = true;
            PanelState.save();
            const panelEl = document.getElementById('weiruan-panel');
            if (panelEl) {
                panelEl.style.left = '';
                panelEl.style.top = '';
                panelEl.style.right = '20px';
                panelEl.style.bottom = '20px';
                panelEl.classList.remove('collapsed');
            }
            console.log('%c[威软Claude监控] 位置已重置', 'color: #667eea;');
        };

        console.log('%c[威软Claude监控] v' + CONFIG.VERSION + ' 已启动', 'color: #667eea; font-weight: bold;');
        console.log('%c如果看不到悬浮窗，请在控制台执行: weiruanResetPosition()', 'color: #888;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }
})();
