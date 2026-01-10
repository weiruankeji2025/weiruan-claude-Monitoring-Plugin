// ==UserScript==
// @name         威软Claude用量检测
// @namespace    https://github.com/weiruankeji2025
// @version      3.0.0
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
        VERSION: '3.0.0',
        STORAGE_PREFIX: 'weiruan_claude_v3_',
        UPDATE_INTERVAL: 60000, // 1分钟更新一次
        HISTORY_DAYS: 30,
        DEBUG: false
    };

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
            const date = new Date(isoTime);
            const now = new Date();
            const diff = date - now;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return '即将重置';
            if (minutes < 60) return `${minutes}分钟后`;
            if (hours < 24) return `${hours}小时${minutes % 60}分后`;
            return `${days}天后`;
        },

        formatTime: (isoTime) => {
            if (!isoTime) return '未知';
            const date = new Date(isoTime);
            return date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    };

    // ==================== API 服务 ====================
    const ApiService = {
        orgId: null,

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

        async getUsageData() {
            try {
                const orgId = await this.getOrgId();
                if (!orgId) return null;

                const response = await fetch(`/api/organizations/${orgId}/usage`, {
                    credentials: 'include'
                });
                return await response.json();
            } catch (err) {
                Utils.log('获取用量数据失败:', err);
                return null;
            }
        },

        async getAccountSettings() {
            try {
                const response = await fetch('/api/account', { credentials: 'include' });
                const data = await response.json();
                return data;
            } catch (err) {
                Utils.log('获取账户设置失败:', err);
                return null;
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
                const saved = Utils.storage.get('history', {});
                this.historyMap = saved || {};
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

            Object.keys(this.historyMap).forEach(key => {
                if (key < cutoffKey) delete this.historyMap[key];
            });
            this.saveHistory();
        }

        recordUsage(usageData) {
            if (!usageData) return;

            const today = Utils.getDateKey();
            this.historyMap[today] = {
                timestamp: Date.now(),
                fiveHour: usageData.five_hour?.utilization || 0,
                sevenDay: usageData.seven_day?.utilization || 0,
                sevenDayOpus: usageData.seven_day_opus?.utilization || 0
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

    // ==================== 面板状态管理 ====================
    const PanelState = {
        isExpanded: Utils.storage.get('expanded', true),
        position: Utils.storage.get('position', { right: '20px', bottom: '20px' }),

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
        }

        async init() {
            this.injectStyles();
            this.createPanel();
            await this.refreshData();

            // 定时更新
            setInterval(() => this.refreshData(), CONFIG.UPDATE_INTERVAL);
        }

        async refreshData() {
            const [usageData, accountData] = await Promise.all([
                ApiService.getUsageData(),
                ApiService.getAccountSettings()
            ]);

            this.usageData = usageData;
            this.accountData = accountData;

            if (usageData) {
                this.historyManager.recordUsage(usageData);
            }

            this.updatePanelContent();
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
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #e0e0e0;
                    width: 340px;
                    max-height: 90vh;
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(10px);
                }

                #weiruan-panel.collapsed {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    cursor: pointer;
                }

                #weiruan-panel.collapsed .panel-content,
                #weiruan-panel.collapsed .panel-header-title {
                    display: none;
                }

                #weiruan-panel.collapsed .panel-header {
                    padding: 0;
                    justify-content: center;
                    height: 56px;
                    border: none;
                }

                .panel-header {
                    padding: 14px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: move;
                    user-select: none;
                    border-radius: 15px 15px 0 0;
                }

                .panel-header-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    color: white;
                }

                .panel-header-title svg {
                    width: 20px;
                    height: 20px;
                }

                .panel-controls {
                    display: flex;
                    gap: 8px;
                }

                .panel-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    border-radius: 8px;
                    width: 28px;
                    height: 28px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 14px;
                    transition: all 0.2s;
                }

                .panel-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.05);
                }

                .panel-content {
                    max-height: calc(90vh - 60px);
                    overflow-y: auto;
                    padding: 16px;
                }

                .panel-content::-webkit-scrollbar {
                    width: 6px;
                }

                .panel-content::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                }

                .panel-content::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                }

                .section {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    padding: 14px;
                    margin-bottom: 12px;
                }

                .section:last-child {
                    margin-bottom: 0;
                }

                .section-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #a0a0a0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .usage-item {
                    margin-bottom: 14px;
                }

                .usage-item:last-child {
                    margin-bottom: 0;
                }

                .usage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .usage-label {
                    font-size: 13px;
                    font-weight: 500;
                    color: #e0e0e0;
                }

                .usage-time {
                    font-size: 11px;
                    color: #808080;
                }

                .usage-bar {
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 4px;
                }

                .usage-bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }

                .usage-bar-fill.low {
                    background: linear-gradient(90deg, #4ade80 0%, #22c55e 100%);
                }

                .usage-bar-fill.medium {
                    background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
                }

                .usage-bar-fill.high {
                    background: linear-gradient(90deg, #f87171 0%, #ef4444 100%);
                }

                .usage-percent {
                    text-align: right;
                    font-size: 12px;
                    color: #a0a0a0;
                }

                .history-tabs {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 12px;
                }

                .history-tab {
                    padding: 5px 12px;
                    border: none;
                    background: rgba(255, 255, 255, 0.08);
                    color: #a0a0a0;
                    border-radius: 6px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .history-tab:hover {
                    background: rgba(255, 255, 255, 0.12);
                }

                .history-tab.active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .chart-container {
                    height: 80px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 4px;
                    padding: 8px 0;
                }

                .chart-bar-wrapper {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                }

                .chart-bar-container {
                    flex: 1;
                    width: 100%;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                }

                .chart-bar {
                    width: 70%;
                    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
                    border-radius: 3px 3px 0 0;
                    min-height: 3px;
                    transition: height 0.3s ease;
                    cursor: pointer;
                    position: relative;
                }

                .chart-bar:hover {
                    opacity: 0.8;
                }

                .chart-bar.today {
                    background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
                }

                .chart-bar-tooltip {
                    position: absolute;
                    bottom: calc(100% + 5px);
                    left: 50%;
                    transform: translateX(-50%);
                    background: #333;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.2s;
                    z-index: 10;
                }

                .chart-bar:hover .chart-bar-tooltip {
                    opacity: 1;
                }

                .chart-label {
                    font-size: 9px;
                    color: #707070;
                    margin-top: 4px;
                }

                .chart-label.today {
                    color: #4ade80;
                    font-weight: 600;
                }

                .account-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                }

                .account-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    color: white;
                }

                .account-details {
                    flex: 1;
                }

                .account-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #e0e0e0;
                }

                .account-email {
                    font-size: 11px;
                    color: #808080;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }

                .stat-item {
                    background: rgba(255, 255, 255, 0.03);
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                }

                .stat-value {
                    font-size: 18px;
                    font-weight: 700;
                    color: #667eea;
                }

                .stat-label {
                    font-size: 10px;
                    color: #808080;
                    margin-top: 2px;
                }

                .action-btn {
                    width: 100%;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #e0e0e0;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }

                .action-btn:hover {
                    background: rgba(255, 255, 255, 0.12);
                    transform: translateY(-1px);
                }

                .footer {
                    text-align: center;
                    padding: 10px;
                    font-size: 10px;
                    color: #606060;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    margin-top: 12px;
                }

                .footer a {
                    color: #667eea;
                    text-decoration: none;
                }

                .footer a:hover {
                    text-decoration: underline;
                }

                .loading {
                    text-align: center;
                    padding: 30px;
                    color: #808080;
                }

                .loading-spinner {
                    width: 24px;
                    height: 24px;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 10px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .error-msg {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #f87171;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    text-align: center;
                }
            `;
            document.head.appendChild(style);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'weiruan-panel';

            // 设置位置
            if (PanelState.position.left) {
                panel.style.left = PanelState.position.left;
                panel.style.top = PanelState.position.top;
            } else {
                panel.style.right = PanelState.position.right;
                panel.style.bottom = PanelState.position.bottom;
            }

            if (!PanelState.isExpanded) {
                panel.classList.add('collapsed');
            }

            panel.innerHTML = `
                <div class="panel-header">
                    <div class="panel-header-title">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <span>威软Claude监控</span>
                    </div>
                    <div class="panel-controls">
                        <button class="panel-btn" id="weiruan-refresh" title="刷新">🔄</button>
                        <button class="panel-btn" id="weiruan-toggle" title="折叠">${PanelState.isExpanded ? '−' : '+'}</button>
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
            this.makeDraggable(panel);
        }

        setupEventListeners() {
            // 折叠/展开
            document.getElementById('weiruan-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                PanelState.isExpanded = !PanelState.isExpanded;
                PanelState.save();
                this.panel.classList.toggle('collapsed');
                document.getElementById('weiruan-toggle').textContent = PanelState.isExpanded ? '−' : '+';
            });

            // 刷新
            document.getElementById('weiruan-refresh').addEventListener('click', async (e) => {
                e.stopPropagation();
                const btn = e.target;
                btn.style.animation = 'spin 1s linear infinite';
                await this.refreshData();
                btn.style.animation = '';
            });

            // 折叠状态点击展开
            this.panel.addEventListener('click', (e) => {
                if (this.panel.classList.contains('collapsed')) {
                    PanelState.isExpanded = true;
                    PanelState.save();
                    this.panel.classList.remove('collapsed');
                    document.getElementById('weiruan-toggle').textContent = '−';
                }
            });
        }

        makeDraggable(element) {
            const header = element.querySelector('.panel-header');
            let isDragging = false;
            let startX, startY, initialX, initialY;

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.panel-btn')) return;
                if (element.classList.contains('collapsed')) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initialX = element.offsetLeft;
                initialY = element.offsetTop;

                element.style.right = 'auto';
                element.style.bottom = 'auto';
                element.style.left = initialX + 'px';
                element.style.top = initialY + 'px';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                element.style.left = (initialX + dx) + 'px';
                element.style.top = (initialY + dy) + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    PanelState.position = {
                        left: element.style.left,
                        top: element.style.top
                    };
                    PanelState.save();
                }
            });
        }

        getBarClass(percent) {
            if (percent >= 80) return 'high';
            if (percent >= 50) return 'medium';
            return 'low';
        }

        updatePanelContent() {
            const content = this.panel.querySelector('.panel-content');

            if (!this.usageData && !this.accountData) {
                content.innerHTML = `
                    <div class="error-msg">
                        ❌ 无法获取数据<br>
                        <small>请确保已登录 Claude</small>
                    </div>
                    <button class="action-btn" style="margin-top: 12px;" onclick="window.weiruanPanel.refreshData()">
                        🔄 重试
                    </button>
                `;
                return;
            }

            let html = '';

            // 用量统计
            if (this.usageData) {
                html += '<div class="section"><div class="section-title">📊 实时用量</div>';

                // 5小时用量
                if (this.usageData.five_hour) {
                    const percent = Math.round(this.usageData.five_hour.utilization || 0);
                    const barClass = this.getBarClass(percent);
                    html += `
                        <div class="usage-item">
                            <div class="usage-header">
                                <span class="usage-label">当前会话</span>
                                <span class="usage-time">${Utils.formatResetTime(this.usageData.five_hour.resets_at)}</span>
                            </div>
                            <div class="usage-bar">
                                <div class="usage-bar-fill ${barClass}" style="width: ${percent}%"></div>
                            </div>
                            <div class="usage-percent">${percent}% 已使用</div>
                        </div>
                    `;
                }

                // 7天用量
                if (this.usageData.seven_day) {
                    const percent = Math.round(this.usageData.seven_day.utilization || 0);
                    const barClass = this.getBarClass(percent);
                    html += `
                        <div class="usage-item">
                            <div class="usage-header">
                                <span class="usage-label">周用量(全模型)</span>
                                <span class="usage-time">${Utils.formatResetTime(this.usageData.seven_day.resets_at)}</span>
                            </div>
                            <div class="usage-bar">
                                <div class="usage-bar-fill ${barClass}" style="width: ${percent}%"></div>
                            </div>
                            <div class="usage-percent">${percent}% 已使用</div>
                        </div>
                    `;
                }

                // 7天 Opus 用量
                if (this.usageData.seven_day_opus) {
                    const percent = Math.round(this.usageData.seven_day_opus.utilization || 0);
                    const barClass = this.getBarClass(percent);
                    html += `
                        <div class="usage-item">
                            <div class="usage-header">
                                <span class="usage-label">周用量(Opus)</span>
                                <span class="usage-time">${Utils.formatResetTime(this.usageData.seven_day_opus.resets_at)}</span>
                            </div>
                            <div class="usage-bar">
                                <div class="usage-bar-fill ${barClass}" style="width: ${percent}%"></div>
                            </div>
                            <div class="usage-percent">${percent}% 已使用</div>
                        </div>
                    `;
                }

                html += '</div>';
            }

            // 历史趋势
            html += `
                <div class="section">
                    <div class="section-title">📈 历史趋势</div>
                    <div class="history-tabs">
                        <button class="history-tab ${this.historyDays === 7 ? 'active' : ''}" data-days="7">7天</button>
                        <button class="history-tab ${this.historyDays === 14 ? 'active' : ''}" data-days="14">14天</button>
                        <button class="history-tab ${this.historyDays === 30 ? 'active' : ''}" data-days="30">30天</button>
                    </div>
                    <div class="chart-container" id="weiruan-chart"></div>
                </div>
            `;

            // 账户信息
            if (this.accountData) {
                const name = this.accountData.account?.display_name || this.accountData.name || '用户';
                const email = this.accountData.email || '';
                const initial = name.charAt(0).toUpperCase();

                html += `
                    <div class="section">
                        <div class="section-title">👤 账户信息</div>
                        <div class="account-info">
                            <div class="account-avatar">${initial}</div>
                            <div class="account-details">
                                <div class="account-name">${name}</div>
                                <div class="account-email">${email}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 统计摘要
            const historyData = this.historyManager.getRecentHistory(7);
            const avgUsage = Math.round(historyData.reduce((s, d) => s + d.fiveHour, 0) / 7);
            const maxUsage = Math.max(...historyData.map(d => d.fiveHour));

            html += `
                <div class="section">
                    <div class="section-title">📋 统计摘要</div>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value">${avgUsage}%</div>
                            <div class="stat-label">7天平均</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${maxUsage}%</div>
                            <div class="stat-label">7天最高</div>
                        </div>
                    </div>
                </div>
            `;

            // 页脚
            html += `
                <div class="footer">
                    v${CONFIG.VERSION} ·
                    <a href="https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin" target="_blank">GitHub</a>
                    · 威软科技
                </div>
            `;

            content.innerHTML = html;

            // 绑定历史标签事件
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

            let chartHTML = '';
            historyData.forEach(data => {
                const height = Math.max(3, (data.fiveHour / maxValue) * 100);
                const isToday = data.dateKey === today;
                const barClass = isToday ? 'chart-bar today' : 'chart-bar';
                const labelClass = isToday ? 'chart-label today' : 'chart-label';
                const displayLabel = this.historyDays <= 7 ? data.dayName : data.shortDate;

                chartHTML += `
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar-container">
                            <div class="${barClass}" style="height: ${height}%">
                                <div class="chart-bar-tooltip">${data.shortDate}: ${data.fiveHour}%</div>
                            </div>
                        </div>
                        <div class="${labelClass}">${displayLabel}</div>
                    </div>
                `;
            });

            container.innerHTML = chartHTML;
        }
    }

    // ==================== 初始化 ====================
    function init() {
        const panel = new ClaudeUsagePanel();
        panel.init();
        window.weiruanPanel = panel;

        console.log('%c[威软Claude监控] v' + CONFIG.VERSION + ' 已启动', 'color: #667eea; font-weight: bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }
})();
