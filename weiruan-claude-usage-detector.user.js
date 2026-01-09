// ==UserScript==
// @name         威软Claude用量检测
// @namespace    https://github.com/weiruankeji2025
// @version      1.0.0
// @description  Claude AI 用量检测插件 - 实时监控使用量、显示恢复时间、使用统计等功能
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
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置项 ====================
    const CONFIG = {
        // 检测间隔（毫秒）
        CHECK_INTERVAL: 5000,
        // 存储键名前缀
        STORAGE_PREFIX: 'weiruan_claude_',
        // 版本号
        VERSION: '1.0.0',
        // 限制重置周期（小时）- Claude Pro 通常为 5 小时
        RESET_PERIOD_HOURS: 5,
        // 是否启用通知
        ENABLE_NOTIFICATIONS: true,
        // 调试模式
        DEBUG: false
    };

    // ==================== 工具函数 ====================
    const Utils = {
        log: (...args) => {
            if (CONFIG.DEBUG) {
                console.log('[威软Claude用量检测]', ...args);
            }
        },

        formatTime: (date) => {
            return date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },

        formatDuration: (ms) => {
            if (ms <= 0) return '即将恢复';
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((ms % (1000 * 60)) / 1000);
            if (hours > 0) {
                return `${hours}小时${minutes}分钟`;
            } else if (minutes > 0) {
                return `${minutes}分钟${seconds}秒`;
            } else {
                return `${seconds}秒`;
            }
        },

        storage: {
            get: (key, defaultValue = null) => {
                try {
                    const value = GM_getValue(CONFIG.STORAGE_PREFIX + key, null);
                    return value !== null ? JSON.parse(value) : defaultValue;
                } catch (e) {
                    return defaultValue;
                }
            },
            set: (key, value) => {
                try {
                    GM_setValue(CONFIG.STORAGE_PREFIX + key, JSON.stringify(value));
                } catch (e) {
                    Utils.log('存储失败:', e);
                }
            }
        },

        notify: (title, text) => {
            if (CONFIG.ENABLE_NOTIFICATIONS && typeof GM_notification !== 'undefined') {
                GM_notification({
                    title: title,
                    text: text,
                    timeout: 5000
                });
            }
        }
    };

    // ==================== 用量检测器 ====================
    class UsageDetector {
        constructor() {
            this.usageData = {
                isLimited: false,
                limitDetectedAt: null,
                estimatedResetTime: null,
                messageCount: 0,
                sessionStartTime: Date.now(),
                dailyStats: {},
                lastCheckTime: null,
                limitType: null, // 'rate_limit', 'quota_exceeded', 'unknown'
                limitMessage: ''
            };

            this.loadData();
            this.setupInterceptors();
        }

        loadData() {
            const saved = Utils.storage.get('usageData');
            if (saved) {
                this.usageData = { ...this.usageData, ...saved };
            }

            // 加载每日统计
            const today = new Date().toDateString();
            const dailyStats = Utils.storage.get('dailyStats', {});
            this.usageData.dailyStats = dailyStats;

            if (!dailyStats[today]) {
                dailyStats[today] = { messages: 0, limits: 0 };
            }
        }

        saveData() {
            Utils.storage.set('usageData', this.usageData);
            Utils.storage.set('dailyStats', this.usageData.dailyStats);
        }

        setupInterceptors() {
            // 拦截 fetch 请求以监控 API 调用
            const originalFetch = window.fetch;
            const self = this;

            window.fetch = async function(...args) {
                const response = await originalFetch.apply(this, args);

                try {
                    const url = args[0]?.url || args[0];

                    // 检测消息发送
                    if (typeof url === 'string' && url.includes('/api/') && url.includes('message')) {
                        self.onMessageSent();
                    }

                    // 克隆响应以检查内容
                    const clonedResponse = response.clone();

                    // 检查是否触发了限制
                    if (response.status === 429) {
                        self.onRateLimitDetected(clonedResponse);
                    }

                    // 检查响应头中的限制信息
                    self.checkRateLimitHeaders(response.headers);

                } catch (e) {
                    Utils.log('拦截器错误:', e);
                }

                return response;
            };

            // 拦截 XHR 请求
            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function(...args) {
                this.addEventListener('load', function() {
                    if (this.status === 429) {
                        self.onRateLimitDetected(null, this.responseText);
                    }
                });
                return originalXHR.apply(this, args);
            };
        }

        onMessageSent() {
            const today = new Date().toDateString();
            this.usageData.messageCount++;

            if (!this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today] = { messages: 0, limits: 0 };
            }
            this.usageData.dailyStats[today].messages++;

            this.saveData();
            this.updateUI();
            Utils.log('消息已发送，当前计数:', this.usageData.messageCount);
        }

        onRateLimitDetected(response, rawText = null) {
            const now = Date.now();
            this.usageData.isLimited = true;
            this.usageData.limitDetectedAt = now;
            this.usageData.estimatedResetTime = now + (CONFIG.RESET_PERIOD_HOURS * 60 * 60 * 1000);
            this.usageData.limitType = 'rate_limit';

            const today = new Date().toDateString();
            if (this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today].limits++;
            }

            this.saveData();
            this.updateUI();

            Utils.notify('⚠️ Claude 用量限制', `您已达到使用限制，预计 ${CONFIG.RESET_PERIOD_HOURS} 小时后恢复`);
            Utils.log('检测到速率限制');
        }

        checkRateLimitHeaders(headers) {
            // 检查常见的速率限制响应头
            const remaining = headers.get('x-ratelimit-remaining');
            const reset = headers.get('x-ratelimit-reset');
            const limit = headers.get('x-ratelimit-limit');

            if (remaining !== null) {
                Utils.log('剩余请求数:', remaining);
                if (parseInt(remaining) === 0) {
                    this.onRateLimitDetected();
                }
            }

            if (reset !== null) {
                const resetTime = parseInt(reset) * 1000;
                if (resetTime > Date.now()) {
                    this.usageData.estimatedResetTime = resetTime;
                    this.saveData();
                }
            }
        }

        checkPageForLimits() {
            // 检查页面中的限制提示
            const limitPatterns = [
                /you('ve| have) (reached|hit|exceeded)/i,
                /rate limit/i,
                /too many (requests|messages)/i,
                /usage limit/i,
                /please (wait|try again)/i,
                /限制/,
                /超出/,
                /稍后再试/
            ];

            const bodyText = document.body?.innerText || '';

            for (const pattern of limitPatterns) {
                if (pattern.test(bodyText)) {
                    // 查找包含限制信息的元素
                    const elements = document.querySelectorAll('div, p, span');
                    for (const el of elements) {
                        if (pattern.test(el.innerText) && el.innerText.length < 500) {
                            this.usageData.limitMessage = el.innerText.trim();

                            // 尝试从消息中提取恢复时间
                            this.parseResetTimeFromMessage(el.innerText);

                            if (!this.usageData.isLimited) {
                                this.onRateLimitDetected();
                            }
                            return true;
                        }
                    }
                }
            }

            // 如果之前被限制但现在没有检测到限制提示，检查是否已恢复
            if (this.usageData.isLimited && this.usageData.estimatedResetTime) {
                if (Date.now() >= this.usageData.estimatedResetTime) {
                    this.onLimitReset();
                }
            }

            return false;
        }

        parseResetTimeFromMessage(message) {
            // 尝试从消息中解析恢复时间
            const hourMatch = message.match(/(\d+)\s*(hour|小时)/i);
            const minMatch = message.match(/(\d+)\s*(minute|分钟)/i);

            let resetMs = 0;
            if (hourMatch) {
                resetMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
            }
            if (minMatch) {
                resetMs += parseInt(minMatch[1]) * 60 * 1000;
            }

            if (resetMs > 0) {
                this.usageData.estimatedResetTime = Date.now() + resetMs;
                this.saveData();
            }
        }

        onLimitReset() {
            this.usageData.isLimited = false;
            this.usageData.limitDetectedAt = null;
            this.usageData.limitMessage = '';
            this.saveData();
            this.updateUI();

            Utils.notify('✅ Claude 用量已恢复', '您现在可以继续使用 Claude 了！');
            Utils.log('限制已重置');
        }

        getStatus() {
            const now = Date.now();
            let remainingTime = 0;

            if (this.usageData.isLimited && this.usageData.estimatedResetTime) {
                remainingTime = Math.max(0, this.usageData.estimatedResetTime - now);

                // 如果剩余时间为0，自动重置状态
                if (remainingTime === 0) {
                    this.onLimitReset();
                }
            }

            const today = new Date().toDateString();
            const todayStats = this.usageData.dailyStats[today] || { messages: 0, limits: 0 };

            return {
                isLimited: this.usageData.isLimited,
                remainingTime: remainingTime,
                remainingTimeFormatted: Utils.formatDuration(remainingTime),
                estimatedResetTime: this.usageData.estimatedResetTime
                    ? Utils.formatTime(new Date(this.usageData.estimatedResetTime))
                    : '未知',
                messageCount: this.usageData.messageCount,
                todayMessages: todayStats.messages,
                todayLimits: todayStats.limits,
                sessionDuration: Utils.formatDuration(now - this.usageData.sessionStartTime),
                limitMessage: this.usageData.limitMessage,
                limitType: this.usageData.limitType
            };
        }

        updateUI() {
            if (window.weiruanUI) {
                window.weiruanUI.update(this.getStatus());
            }
        }

        resetStats() {
            this.usageData.messageCount = 0;
            this.usageData.isLimited = false;
            this.usageData.limitDetectedAt = null;
            this.usageData.estimatedResetTime = null;
            this.usageData.limitMessage = '';
            this.usageData.sessionStartTime = Date.now();
            this.saveData();
            this.updateUI();
            Utils.log('统计已重置');
        }

        clearAllData() {
            this.usageData = {
                isLimited: false,
                limitDetectedAt: null,
                estimatedResetTime: null,
                messageCount: 0,
                sessionStartTime: Date.now(),
                dailyStats: {},
                lastCheckTime: null,
                limitType: null,
                limitMessage: ''
            };
            this.saveData();
            this.updateUI();
            Utils.log('所有数据已清除');
        }
    }

    // ==================== UI 组件 ====================
    class UI {
        constructor(detector) {
            this.detector = detector;
            this.isExpanded = Utils.storage.get('uiExpanded', true);
            this.isDarkMode = this.detectDarkMode();
            this.createStyles();
            this.createPanel();
            this.setupEventListeners();
        }

        detectDarkMode() {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        createStyles() {
            GM_addStyle(`
                #weiruan-claude-panel {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    font-size: 13px;
                    transition: all 0.3s ease;
                }

                #weiruan-claude-panel.collapsed {
                    width: auto;
                }

                .weiruan-panel-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 10px 10px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    user-select: none;
                }

                #weiruan-claude-panel.collapsed .weiruan-panel-header {
                    border-radius: 10px;
                }

                .weiruan-panel-title {
                    font-weight: 600;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .weiruan-panel-title-icon {
                    font-size: 16px;
                }

                .weiruan-panel-controls {
                    display: flex;
                    gap: 8px;
                }

                .weiruan-panel-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    transition: background 0.2s;
                }

                .weiruan-panel-btn:hover {
                    background: rgba(255,255,255,0.3);
                }

                .weiruan-panel-body {
                    background: white;
                    border-radius: 0 0 10px 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    overflow: hidden;
                    max-height: 500px;
                    transition: max-height 0.3s ease, opacity 0.3s ease;
                }

                #weiruan-claude-panel.collapsed .weiruan-panel-body {
                    max-height: 0;
                    opacity: 0;
                }

                .weiruan-status-section {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .weiruan-status-row:last-child {
                    margin-bottom: 0;
                }

                .weiruan-status-label {
                    color: #666;
                    font-size: 12px;
                }

                .weiruan-status-value {
                    font-weight: 600;
                    color: #333;
                }

                .weiruan-status-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                }

                .weiruan-status-badge.normal {
                    background: #e8f5e9;
                    color: #2e7d32;
                }

                .weiruan-status-badge.limited {
                    background: #ffebee;
                    color: #c62828;
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                .weiruan-progress-section {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-progress-bar {
                    height: 8px;
                    background: #e0e0e0;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-top: 8px;
                }

                .weiruan-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }

                .weiruan-stats-section {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                }

                .weiruan-stat-item {
                    background: #f8f9fa;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                }

                .weiruan-stat-value {
                    font-size: 18px;
                    font-weight: 700;
                    color: #667eea;
                }

                .weiruan-stat-label {
                    font-size: 11px;
                    color: #888;
                    margin-top: 2px;
                }

                .weiruan-actions-section {
                    padding: 12px 15px;
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .weiruan-action-btn {
                    flex: 1;
                    min-width: 80px;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .weiruan-action-btn.primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .weiruan-action-btn.primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .weiruan-action-btn.secondary {
                    background: #f0f0f0;
                    color: #666;
                }

                .weiruan-action-btn.secondary:hover {
                    background: #e0e0e0;
                }

                .weiruan-footer {
                    padding: 10px 15px;
                    background: #f8f9fa;
                    text-align: center;
                    font-size: 11px;
                    color: #999;
                }

                .weiruan-footer a {
                    color: #667eea;
                    text-decoration: none;
                }

                .weiruan-footer a:hover {
                    text-decoration: underline;
                }

                .weiruan-countdown {
                    font-size: 20px;
                    font-weight: 700;
                    color: #c62828;
                    text-align: center;
                    padding: 10px;
                    background: #fff5f5;
                    border-radius: 8px;
                    margin-bottom: 10px;
                }

                .weiruan-reset-time {
                    font-size: 12px;
                    color: #888;
                    text-align: center;
                }

                /* 深色模式支持 */
                @media (prefers-color-scheme: dark) {
                    .weiruan-panel-body {
                        background: #1e1e1e;
                    }

                    .weiruan-status-section,
                    .weiruan-progress-section,
                    .weiruan-stats-section {
                        border-bottom-color: #333;
                    }

                    .weiruan-status-label {
                        color: #aaa;
                    }

                    .weiruan-status-value {
                        color: #eee;
                    }

                    .weiruan-stat-item {
                        background: #2d2d2d;
                    }

                    .weiruan-stat-label {
                        color: #aaa;
                    }

                    .weiruan-action-btn.secondary {
                        background: #333;
                        color: #ccc;
                    }

                    .weiruan-action-btn.secondary:hover {
                        background: #444;
                    }

                    .weiruan-footer {
                        background: #252525;
                    }

                    .weiruan-progress-bar {
                        background: #333;
                    }
                }

                /* 通知样式 */
                .weiruan-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #333;
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.3);
                    z-index: 999999;
                    animation: slideIn 0.3s ease;
                }

                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'weiruan-claude-panel';
            if (!this.isExpanded) {
                panel.classList.add('collapsed');
            }

            panel.innerHTML = `
                <div class="weiruan-panel-header">
                    <div class="weiruan-panel-title">
                        <span class="weiruan-panel-title-icon">📊</span>
                        <span>威软Claude用量检测</span>
                    </div>
                    <div class="weiruan-panel-controls">
                        <button class="weiruan-panel-btn" id="weiruan-refresh" title="刷新">🔄</button>
                        <button class="weiruan-panel-btn" id="weiruan-toggle" title="折叠/展开">${this.isExpanded ? '−' : '+'}</button>
                    </div>
                </div>
                <div class="weiruan-panel-body">
                    <div class="weiruan-status-section">
                        <div class="weiruan-status-row">
                            <span class="weiruan-status-label">当前状态</span>
                            <span class="weiruan-status-badge normal" id="weiruan-status">正常</span>
                        </div>
                    </div>
                    <div class="weiruan-progress-section" id="weiruan-countdown-section" style="display: none;">
                        <div class="weiruan-countdown" id="weiruan-countdown">--:--:--</div>
                        <div class="weiruan-reset-time">预计恢复时间: <span id="weiruan-reset-time">--</span></div>
                    </div>
                    <div class="weiruan-stats-section">
                        <div class="weiruan-stats-grid">
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-session-msgs">0</div>
                                <div class="weiruan-stat-label">会话消息数</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-today-msgs">0</div>
                                <div class="weiruan-stat-label">今日消息数</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-session-time">0分钟</div>
                                <div class="weiruan-stat-label">会话时长</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-today-limits">0</div>
                                <div class="weiruan-stat-label">今日限制次数</div>
                            </div>
                        </div>
                    </div>
                    <div class="weiruan-actions-section">
                        <button class="weiruan-action-btn primary" id="weiruan-export">导出统计</button>
                        <button class="weiruan-action-btn secondary" id="weiruan-reset">重置统计</button>
                    </div>
                    <div class="weiruan-footer">
                        v${CONFIG.VERSION} |
                        <a href="https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin" target="_blank">GitHub</a> |
                        威软科技出品
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;
            this.makeDraggable(panel);
        }

        setupEventListeners() {
            // 折叠/展开按钮
            document.getElementById('weiruan-toggle').addEventListener('click', () => {
                this.isExpanded = !this.isExpanded;
                this.panel.classList.toggle('collapsed');
                document.getElementById('weiruan-toggle').textContent = this.isExpanded ? '−' : '+';
                Utils.storage.set('uiExpanded', this.isExpanded);
            });

            // 刷新按钮
            document.getElementById('weiruan-refresh').addEventListener('click', () => {
                this.detector.checkPageForLimits();
                this.update(this.detector.getStatus());
                this.showNotification('已刷新状态');
            });

            // 导出统计按钮
            document.getElementById('weiruan-export').addEventListener('click', () => {
                this.exportStats();
            });

            // 重置统计按钮
            document.getElementById('weiruan-reset').addEventListener('click', () => {
                if (confirm('确定要重置所有统计数据吗？')) {
                    this.detector.resetStats();
                    this.showNotification('统计数据已重置');
                }
            });
        }

        makeDraggable(element) {
            const header = element.querySelector('.weiruan-panel-header');
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            header.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('weiruan-panel-btn')) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const rect = element.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            const onMouseMove = (e) => {
                if (!isDragging) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                element.style.left = (startLeft + deltaX) + 'px';
                element.style.top = (startTop + deltaY) + 'px';
                element.style.right = 'auto';
            };

            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        }

        update(status) {
            // 更新状态标签
            const statusEl = document.getElementById('weiruan-status');
            if (status.isLimited) {
                statusEl.textContent = '已限制';
                statusEl.className = 'weiruan-status-badge limited';
                document.getElementById('weiruan-countdown-section').style.display = 'block';
                document.getElementById('weiruan-countdown').textContent = status.remainingTimeFormatted;
                document.getElementById('weiruan-reset-time').textContent = status.estimatedResetTime;
            } else {
                statusEl.textContent = '正常';
                statusEl.className = 'weiruan-status-badge normal';
                document.getElementById('weiruan-countdown-section').style.display = 'none';
            }

            // 更新统计数据
            document.getElementById('weiruan-session-msgs').textContent = status.messageCount;
            document.getElementById('weiruan-today-msgs').textContent = status.todayMessages;
            document.getElementById('weiruan-session-time').textContent = status.sessionDuration;
            document.getElementById('weiruan-today-limits').textContent = status.todayLimits;
        }

        exportStats() {
            const status = this.detector.getStatus();
            const data = {
                exportTime: new Date().toISOString(),
                version: CONFIG.VERSION,
                currentStatus: status,
                dailyStats: this.detector.usageData.dailyStats
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `claude-usage-stats-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.showNotification('统计数据已导出');
        }

        showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'weiruan-notification';
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }
    }

    // ==================== 初始化 ====================
    function init() {
        Utils.log('初始化威软Claude用量检测...');

        // 创建检测器
        const detector = new UsageDetector();

        // 创建 UI
        const ui = new UI(detector);
        window.weiruanUI = ui;

        // 定期更新
        setInterval(() => {
            detector.checkPageForLimits();
            ui.update(detector.getStatus());
        }, CONFIG.CHECK_INTERVAL);

        // 初始更新
        ui.update(detector.getStatus());

        Utils.log('威软Claude用量检测已启动');
    }

    // 等待页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
