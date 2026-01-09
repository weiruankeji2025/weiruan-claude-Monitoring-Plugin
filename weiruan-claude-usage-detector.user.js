// ==UserScript==
// @name         威软Claude用量检测
// @namespace    https://github.com/weiruankeji2025
// @version      2.2.0
// @description  Claude AI 用量检测插件 - 实时监控使用量、显示恢复时间、版本检测、用量百分比统计、历史数据图表等功能
// @author       威软科技 (WeiRuan Tech)
// @match        https://claude.ai/*
// @icon         https://claude.ai/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @license      MIT
// @homepageURL  https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin
// @supportURL   https://github.com/weiruankeji2025/weiruan-claude-Monitoring-Plugin/issues
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置项 ====================
    const CONFIG = {
        CHECK_INTERVAL: 3000,
        STORAGE_PREFIX: 'weiruan_claude_',
        VERSION: '2.2.0',
        HISTORY_DAYS: 30, // 保留历史数据天数
        ENABLE_NOTIFICATIONS: true,
        DEBUG: true, // 开启调试模式便于排查

        // 各版本用量限制配置（基于实际观察的估算值）
        PLAN_LIMITS: {
            free: {
                name: 'Free',
                displayName: '免费版',
                color: '#888',
                dailyMessages: 10,
                weeklyMessages: 50,
                resetPeriodHours: 8,
                description: '基础免费版本'
            },
            pro: {
                name: 'Pro',
                displayName: 'Pro专业版',
                color: '#D97706',
                dailyMessages: 100,
                weeklyMessages: 600,
                resetPeriodHours: 5,
                description: '专业订阅版本'
            },
            team: {
                name: 'Team',
                displayName: 'Team团队版',
                color: '#7C3AED',
                dailyMessages: 150,
                weeklyMessages: 900,
                resetPeriodHours: 5,
                description: '团队协作版本'
            },
            max: {
                name: 'Max',
                displayName: 'Max旗舰版',
                color: '#DC2626',
                dailyMessages: 300,
                weeklyMessages: 2000,
                resetPeriodHours: 5,
                description: '旗舰订阅版本'
            },
            enterprise: {
                name: 'Enterprise',
                displayName: '企业版',
                color: '#059669',
                dailyMessages: 500,
                weeklyMessages: 3000,
                resetPeriodHours: 5,
                description: '企业级版本'
            }
        }
    };

    // ==================== 工具函数 ====================
    const Utils = {
        log: (...args) => {
            if (CONFIG.DEBUG) {
                console.log('%c[威软Claude用量检测]', 'color: #667eea; font-weight: bold;', ...args);
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
        },

        getLast7Days: () => {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                days.push(date.toDateString());
            }
            return days;
        },

        // 防抖函数
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };

    // ==================== 消息检测器（核心改进） ====================
    class MessageDetector {
        constructor(onMessageCallback) {
            this.onMessage = onMessageCallback;
            this.lastMessageCount = 0;
            this.lastUserMessageTime = 0;
            this.observedMessages = new Set();
            this.isProcessing = false;

            Utils.log('消息检测器初始化');
        }

        // 初始化所有检测方法
        init() {
            this.setupFetchInterceptor();
            this.setupXHRInterceptor();
            this.setupDOMObserver();
            this.setupEventListeners();
            this.countExistingMessages();

            Utils.log('所有消息检测方法已初始化');
        }

        // 方法1: 拦截Fetch请求（改进版）
        setupFetchInterceptor() {
            const self = this;
            const originalFetch = window.fetch;

            window.fetch = async function(...args) {
                const [url, options] = args;
                const urlStr = typeof url === 'string' ? url : url?.url || '';
                const method = options?.method?.toUpperCase() || 'GET';

                // 在请求发送前检测
                if (method === 'POST' && self.isMessageRequest(urlStr)) {
                    Utils.log('检测到消息请求 (Fetch):', urlStr);
                }

                try {
                    const response = await originalFetch.apply(this, args);

                    // 检测消息API请求
                    if (method === 'POST' && self.isMessageRequest(urlStr)) {
                        // 检查响应状态
                        if (response.ok || response.status === 200) {
                            Utils.log('消息请求成功，触发计数');
                            self.triggerMessageSent('fetch');
                        } else if (response.status === 429) {
                            Utils.log('检测到速率限制 (429)');
                            self.triggerRateLimit();
                        }
                    }

                    return response;
                } catch (error) {
                    throw error;
                }
            };

            Utils.log('Fetch拦截器已设置');
        }

        // 判断是否为消息请求
        isMessageRequest(url) {
            const messagePatterns = [
                /\/api\/.*\/chat_conversations\/.*\/completion/i,
                /\/api\/.*\/completion/i,
                /\/api\/append_message/i,
                /\/api\/.*\/messages/i,
                /\/api\/chat/i,
                /\/api\/v1\/.*\/messages/i,
                /completion$/i
            ];

            return messagePatterns.some(pattern => pattern.test(url));
        }

        // 方法2: 拦截XHR请求
        setupXHRInterceptor() {
            const self = this;
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._method = method;
                this._url = url;
                return originalOpen.apply(this, [method, url, ...rest]);
            };

            XMLHttpRequest.prototype.send = function(body) {
                const xhr = this;

                if (this._method?.toUpperCase() === 'POST' && self.isMessageRequest(this._url)) {
                    Utils.log('检测到消息请求 (XHR):', this._url);

                    xhr.addEventListener('load', function() {
                        if (xhr.status === 200) {
                            self.triggerMessageSent('xhr');
                        } else if (xhr.status === 429) {
                            self.triggerRateLimit();
                        }
                    });
                }

                return originalSend.apply(this, arguments);
            };

            Utils.log('XHR拦截器已设置');
        }

        // 方法3: DOM变化监听（监听新消息出现）
        setupDOMObserver() {
            const self = this;

            const observerCallback = Utils.debounce((mutations) => {
                self.checkForNewMessages();
            }, 500);

            // 等待DOM加载完成后再设置观察器
            const setupObserver = () => {
                const chatContainer = document.querySelector(
                    '[class*="conversation"], [class*="chat"], [class*="messages"], main, [role="main"]'
                );

                if (chatContainer) {
                    const observer = new MutationObserver(observerCallback);
                    observer.observe(chatContainer, {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });
                    Utils.log('DOM观察器已设置，监听容器:', chatContainer.className || chatContainer.tagName);
                } else {
                    // 如果找不到容器，监听整个body
                    const observer = new MutationObserver(observerCallback);
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    Utils.log('DOM观察器已设置，监听body');
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupObserver);
            } else {
                setTimeout(setupObserver, 1000);
            }
        }

        // 检查新消息
        checkForNewMessages() {
            // 查找用户消息元素
            const userMessageSelectors = [
                '[data-testid*="user-message"]',
                '[class*="user-message"]',
                '[class*="human-message"]',
                '[class*="from-user"]',
                '.human-turn',
                '[data-is-streaming="false"][class*="human"]',
                // Claude.ai 特定选择器
                'div[class*="font-user-message"]',
                'div[class*="human"]'
            ];

            let userMessages = [];
            for (const selector of userMessageSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        userMessages = elements;
                        break;
                    }
                } catch (e) {}
            }

            // 如果找不到特定选择器，尝试通过内容结构判断
            if (userMessages.length === 0) {
                // 查找所有可能的消息容器
                const allMessages = document.querySelectorAll('[class*="message"], [class*="turn"], [class*="chat-"]');
                // 这里可以根据Claude的具体DOM结构进一步筛选
            }

            const currentCount = userMessages.length;

            if (currentCount > this.lastMessageCount) {
                const newMessages = currentCount - this.lastMessageCount;
                Utils.log(`检测到 ${newMessages} 条新用户消息 (DOM), 总计: ${currentCount}`);

                for (let i = 0; i < newMessages; i++) {
                    this.triggerMessageSent('dom');
                }
                this.lastMessageCount = currentCount;
            }
        }

        // 统计现有消息
        countExistingMessages() {
            setTimeout(() => {
                const userMessageSelectors = [
                    '[data-testid*="user-message"]',
                    '[class*="user-message"]',
                    '[class*="human-message"]',
                    '.human-turn',
                    'div[class*="font-user-message"]'
                ];

                for (const selector of userMessageSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            this.lastMessageCount = elements.length;
                            Utils.log(`初始化: 检测到 ${this.lastMessageCount} 条现有用户消息`);
                            break;
                        }
                    } catch (e) {}
                }
            }, 2000);
        }

        // 方法4: 事件监听（发送按钮、键盘事件）
        setupEventListeners() {
            const self = this;

            // 监听键盘事件（Enter发送）
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const activeElement = document.activeElement;
                    const isInTextarea = activeElement?.tagName === 'TEXTAREA' ||
                                        activeElement?.getAttribute('contenteditable') === 'true' ||
                                        activeElement?.closest('[contenteditable="true"]');

                    if (isInTextarea) {
                        const hasContent = activeElement.value?.trim() ||
                                          activeElement.textContent?.trim() ||
                                          activeElement.innerText?.trim();

                        if (hasContent) {
                            Utils.log('检测到Enter键发送');
                            // 延迟触发，等待实际发送完成
                            setTimeout(() => self.triggerMessageSent('keyboard'), 500);
                        }
                    }
                }
            }, true);

            // 监听点击事件（发送按钮）
            document.addEventListener('click', (e) => {
                const target = e.target;
                const isSendButton =
                    target.closest('button[type="submit"]') ||
                    target.closest('[class*="send"]') ||
                    target.closest('[aria-label*="Send"]') ||
                    target.closest('[aria-label*="发送"]') ||
                    target.closest('button[class*="submit"]');

                if (isSendButton) {
                    Utils.log('检测到发送按钮点击');
                    setTimeout(() => self.triggerMessageSent('click'), 500);
                }
            }, true);

            Utils.log('事件监听器已设置');
        }

        // 触发消息发送
        triggerMessageSent(source) {
            const now = Date.now();

            // 防止短时间内重复计数（1秒内的重复触发视为同一条消息）
            if (now - this.lastUserMessageTime < 1000) {
                Utils.log(`忽略重复触发 (来源: ${source})`);
                return;
            }

            this.lastUserMessageTime = now;
            Utils.log(`消息计数 +1 (来源: ${source})`);

            if (this.onMessage) {
                this.onMessage();
            }
        }

        // 触发速率限制
        triggerRateLimit() {
            Utils.log('触发速率限制处理');
            if (this.onRateLimit) {
                this.onRateLimit();
            }
        }
    }

    // ==================== 用户版本检测器 ====================
    class PlanDetector {
        constructor() {
            this.currentPlan = 'free';
            this.planInfo = null;
        }

        async detectPlan() {
            Utils.log('开始检测用户版本...');

            // 方法1: 从页面文本检测
            let plan = this.detectFromPageText();
            if (plan) {
                this.currentPlan = plan;
                Utils.log('通过页面文本检测到版本:', plan);
                return plan;
            }

            // 方法2: 从URL检测
            plan = this.detectFromURL();
            if (plan) {
                this.currentPlan = plan;
                Utils.log('通过URL检测到版本:', plan);
                return plan;
            }

            // 方法3: 从localStorage检测
            plan = this.detectFromStorage();
            if (plan) {
                this.currentPlan = plan;
                Utils.log('通过存储检测到版本:', plan);
                return plan;
            }

            Utils.log('未能检测到版本，使用默认值:', this.currentPlan);
            return this.currentPlan;
        }

        detectFromPageText() {
            const bodyText = document.body?.innerText?.toLowerCase() || '';
            const htmlText = document.documentElement?.innerHTML?.toLowerCase() || '';

            // 检查是否有升级提示（说明是免费版）
            if (bodyText.includes('upgrade') && bodyText.includes('pro')) {
                // 可能是免费版，但继续检查是否有其他标识
            }

            // 检测特定版本标识
            if (htmlText.includes('"max"') || bodyText.includes('max plan') || bodyText.includes('claude max')) {
                return 'max';
            }
            if (htmlText.includes('"enterprise"') || bodyText.includes('enterprise')) {
                return 'enterprise';
            }
            if (htmlText.includes('"team"') || bodyText.includes('team plan')) {
                return 'team';
            }
            if (htmlText.includes('"pro"') || htmlText.includes('pro_subscription') ||
                bodyText.includes('pro plan') || bodyText.includes('claude pro')) {
                return 'pro';
            }

            return null;
        }

        detectFromURL() {
            const url = window.location.href.toLowerCase();

            if (url.includes('/team')) return 'team';
            if (url.includes('/enterprise')) return 'enterprise';

            return null;
        }

        detectFromStorage() {
            try {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    const value = localStorage.getItem(key)?.toLowerCase() || '';
                    if (value.includes('"max"') || value.includes(':max')) return 'max';
                    if (value.includes('"enterprise"')) return 'enterprise';
                    if (value.includes('"team"')) return 'team';
                    if (value.includes('"pro"') || value.includes('pro_subscription')) return 'pro';
                }
            } catch (e) {}

            return null;
        }

        setPlan(plan) {
            if (CONFIG.PLAN_LIMITS[plan]) {
                this.currentPlan = plan;
                Utils.storage.set('userSelectedPlan', plan);
                Utils.log('手动设置版本:', plan);
                return true;
            }
            return false;
        }

        getPlanConfig() {
            return CONFIG.PLAN_LIMITS[this.currentPlan] || CONFIG.PLAN_LIMITS.free;
        }
    }

    // ==================== 历史数据管理器 ====================
    class HistoryManager {
        constructor() {
            this.historyData = [];
            this.loadHistory();
        }

        loadHistory() {
            const saved = Utils.storage.get('historyData', []);
            this.historyData = Array.isArray(saved) ? saved : [];
            this.cleanOldHistory();
            Utils.log('加载历史数据:', this.historyData.length, '条记录');
        }

        saveHistory() {
            Utils.storage.set('historyData', this.historyData);
        }

        cleanOldHistory() {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CONFIG.HISTORY_DAYS);
            const cutoffTime = cutoffDate.getTime();

            this.historyData = this.historyData.filter(record => record.timestamp >= cutoffTime);
            this.saveHistory();
        }

        // 记录每日汇总数据
        recordDailySummary(dailyStats) {
            const today = new Date().toDateString();
            const todayTimestamp = new Date(today).getTime();

            // 检查今天是否已有记录
            const existingIndex = this.historyData.findIndex(r =>
                new Date(r.timestamp).toDateString() === today
            );

            const record = {
                timestamp: todayTimestamp,
                date: today,
                messages: dailyStats.messages || 0,
                limits: dailyStats.limits || 0,
                updatedAt: Date.now()
            };

            if (existingIndex >= 0) {
                this.historyData[existingIndex] = record;
            } else {
                this.historyData.push(record);
            }

            // 按时间排序
            this.historyData.sort((a, b) => a.timestamp - b.timestamp);
            this.saveHistory();
        }

        // 获取最近N天的历史数据
        getRecentHistory(days = 7) {
            const result = [];
            const now = new Date();

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateStr = date.toDateString();

                const record = this.historyData.find(r =>
                    new Date(r.timestamp).toDateString() === dateStr
                );

                result.push({
                    date: dateStr,
                    shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
                    dayName: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
                    messages: record?.messages || 0,
                    limits: record?.limits || 0
                });
            }

            return result;
        }

        // 获取统计摘要
        getStatsSummary() {
            const last7Days = this.getRecentHistory(7);
            const last30Days = this.getRecentHistory(30);

            const sum7 = last7Days.reduce((acc, d) => acc + d.messages, 0);
            const sum30 = last30Days.reduce((acc, d) => acc + d.messages, 0);
            const limits7 = last7Days.reduce((acc, d) => acc + d.limits, 0);
            const limits30 = last30Days.reduce((acc, d) => acc + d.limits, 0);

            const avg7 = Math.round(sum7 / 7);
            const avg30 = Math.round(sum30 / 30);
            const max7 = Math.max(...last7Days.map(d => d.messages));
            const maxDay = last7Days.find(d => d.messages === max7);

            return {
                totalMessages7Days: sum7,
                totalMessages30Days: sum30,
                avgMessages7Days: avg7,
                avgMessages30Days: avg30,
                maxMessages7Days: max7,
                maxMessagesDay: maxDay?.shortDate || '-',
                totalLimits7Days: limits7,
                totalLimits30Days: limits30
            };
        }

        // 获取用于图表的数据
        getChartData(days = 7) {
            const history = this.getRecentHistory(days);
            const maxMessages = Math.max(...history.map(d => d.messages), 1);

            return history.map(d => ({
                ...d,
                percentage: Math.round((d.messages / maxMessages) * 100)
            }));
        }
    }

    // ==================== 用量检测器 ====================
    class UsageDetector {
        constructor(planDetector) {
            this.planDetector = planDetector;
            this.historyManager = new HistoryManager();
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

            this.loadData();
            this.cleanOldStats();

            // 初始化消息检测器
            this.messageDetector = new MessageDetector(() => this.onMessageSent());
            this.messageDetector.onRateLimit = () => this.onRateLimitDetected();
        }

        init() {
            this.messageDetector.init();
        }

        loadData() {
            const saved = Utils.storage.get('usageData');
            if (saved) {
                this.usageData = { ...this.usageData, ...saved };
            }

            const today = new Date().toDateString();
            if (!this.usageData.dailyStats) {
                this.usageData.dailyStats = {};
            }
            if (!this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today] = { messages: 0, limits: 0, timestamp: Date.now() };
            }

            Utils.log('加载数据:', this.usageData.dailyStats[today]);
        }

        saveData() {
            Utils.storage.set('usageData', this.usageData);
        }

        cleanOldStats() {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const dailyStats = this.usageData.dailyStats;

            for (const dateStr in dailyStats) {
                const stat = dailyStats[dateStr];
                if (stat.timestamp && stat.timestamp < thirtyDaysAgo) {
                    delete dailyStats[dateStr];
                }
            }

            this.saveData();
        }

        onMessageSent() {
            const today = new Date().toDateString();
            this.usageData.messageCount++;

            if (!this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today] = { messages: 0, limits: 0, timestamp: Date.now() };
            }
            this.usageData.dailyStats[today].messages++;

            this.saveData();

            // 记录到历史数据
            this.historyManager.recordDailySummary(this.usageData.dailyStats[today]);

            this.updateUI();

            Utils.log('消息计数更新:', {
                session: this.usageData.messageCount,
                today: this.usageData.dailyStats[today].messages
            });
        }

        onRateLimitDetected() {
            const now = Date.now();
            const planConfig = this.planDetector.getPlanConfig();

            this.usageData.isLimited = true;
            this.usageData.limitDetectedAt = now;
            this.usageData.estimatedResetTime = now + (planConfig.resetPeriodHours * 60 * 60 * 1000);
            this.usageData.limitType = 'rate_limit';

            const today = new Date().toDateString();
            if (this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today].limits++;
            }

            this.saveData();

            // 记录到历史数据
            this.historyManager.recordDailySummary(this.usageData.dailyStats[today]);

            this.updateUI();

            Utils.notify('⚠️ Claude 用量限制',
                `您已达到使用限制，预计 ${planConfig.resetPeriodHours} 小时后恢复`);
        }

        checkPageForLimits() {
            const limitPatterns = [
                /you('ve| have) (reached|hit|exceeded)/i,
                /rate limit/i,
                /too many (requests|messages)/i,
                /usage limit/i,
                /out of messages/i,
                /message limit/i,
                /限制/,
                /超出/
            ];

            const bodyText = document.body?.innerText || '';

            for (const pattern of limitPatterns) {
                if (pattern.test(bodyText)) {
                    if (!this.usageData.isLimited) {
                        this.onRateLimitDetected();
                    }
                    return true;
                }
            }

            // 检查是否已恢复
            if (this.usageData.isLimited && this.usageData.estimatedResetTime) {
                if (Date.now() >= this.usageData.estimatedResetTime) {
                    this.onLimitReset();
                }
            }

            return false;
        }

        onLimitReset() {
            this.usageData.isLimited = false;
            this.usageData.limitDetectedAt = null;
            this.usageData.limitMessage = '';
            this.saveData();
            this.updateUI();

            Utils.notify('✅ Claude 用量已恢复', '您现在可以继续使用 Claude 了！');
        }

        getUsagePercentage() {
            const planConfig = this.planDetector.getPlanConfig();
            const today = new Date().toDateString();
            const todayStats = this.usageData.dailyStats[today] || { messages: 0 };

            const dailyUsage = todayStats.messages;
            const dailyLimit = planConfig.dailyMessages;
            const dailyPercentage = Math.min(100, Math.round((dailyUsage / dailyLimit) * 100));

            const last7Days = Utils.getLast7Days();
            let weeklyUsage = 0;
            for (const day of last7Days) {
                if (this.usageData.dailyStats[day]) {
                    weeklyUsage += this.usageData.dailyStats[day].messages;
                }
            }
            const weeklyLimit = planConfig.weeklyMessages;
            const weeklyPercentage = Math.min(100, Math.round((weeklyUsage / weeklyLimit) * 100));

            return {
                daily: { used: dailyUsage, limit: dailyLimit, percentage: dailyPercentage },
                weekly: { used: weeklyUsage, limit: weeklyLimit, percentage: weeklyPercentage }
            };
        }

        getStatus() {
            const now = Date.now();
            let remainingTime = 0;
            const planConfig = this.planDetector.getPlanConfig();

            if (this.usageData.isLimited && this.usageData.estimatedResetTime) {
                remainingTime = Math.max(0, this.usageData.estimatedResetTime - now);
                if (remainingTime === 0) {
                    this.onLimitReset();
                }
            }

            const today = new Date().toDateString();
            const todayStats = this.usageData.dailyStats[today] || { messages: 0, limits: 0 };
            const usagePercentage = this.getUsagePercentage();

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
                plan: this.planDetector.currentPlan,
                planConfig: planConfig,
                usagePercentage: usagePercentage
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
        }

        // 手动增加计数（用于测试或手动调整）
        manualAddMessage(count = 1) {
            for (let i = 0; i < count; i++) {
                this.onMessageSent();
            }
            Utils.log(`手动增加 ${count} 条消息`);
        }

        // 获取历史数据
        getHistoryData(days = 7) {
            return this.historyManager.getChartData(days);
        }

        // 获取历史统计摘要
        getHistorySummary() {
            return this.historyManager.getStatsSummary();
        }
    }

    // ==================== UI 组件 ====================
    class UI {
        constructor(detector, planDetector) {
            this.detector = detector;
            this.planDetector = planDetector;
            this.isExpanded = Utils.storage.get('uiExpanded', true);
            this.createStyles();
            this.createPanel();
            this.setupEventListeners();
        }

        createStyles() {
            GM_addStyle(`
                #weiruan-claude-panel {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 13px;
                    transition: all 0.3s ease;
                    width: 280px;
                }

                #weiruan-claude-panel.collapsed { width: auto; }

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

                #weiruan-claude-panel.collapsed .weiruan-panel-header { border-radius: 10px; }

                .weiruan-panel-title {
                    font-weight: 600;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .weiruan-panel-controls { display: flex; gap: 8px; }

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

                .weiruan-panel-btn:hover { background: rgba(255,255,255,0.3); }

                .weiruan-panel-body {
                    background: white;
                    border-radius: 0 0 10px 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    overflow: hidden;
                    max-height: 600px;
                    transition: max-height 0.3s ease, opacity 0.3s ease;
                }

                #weiruan-claude-panel.collapsed .weiruan-panel-body { max-height: 0; opacity: 0; }

                .weiruan-section {
                    padding: 12px 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-section-title {
                    font-size: 11px;
                    color: #888;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                    font-weight: 600;
                }

                .weiruan-status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .weiruan-status-row:last-child { margin-bottom: 0; }

                .weiruan-status-label { color: #666; font-size: 12px; }
                .weiruan-status-value { font-weight: 600; color: #333; }

                .weiruan-plan-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }

                .weiruan-plan-badge:hover { transform: scale(1.05); }
                .weiruan-plan-badge.free { background: #f0f0f0; color: #666; }
                .weiruan-plan-badge.pro { background: #FEF3C7; color: #D97706; }
                .weiruan-plan-badge.team { background: #EDE9FE; color: #7C3AED; }
                .weiruan-plan-badge.max { background: #FEE2E2; color: #DC2626; }
                .weiruan-plan-badge.enterprise { background: #D1FAE5; color: #059669; }

                .weiruan-status-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                }

                .weiruan-status-badge.normal { background: #e8f5e9; color: #2e7d32; }
                .weiruan-status-badge.limited { background: #ffebee; color: #c62828; animation: pulse 2s infinite; }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                .weiruan-usage-section { padding: 12px 15px; border-bottom: 1px solid #eee; }
                .weiruan-usage-item { margin-bottom: 15px; }
                .weiruan-usage-item:last-child { margin-bottom: 0; }

                .weiruan-usage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                }

                .weiruan-usage-label { font-size: 12px; color: #666; }
                .weiruan-usage-value { font-size: 12px; font-weight: 600; color: #333; }

                .weiruan-progress-bar {
                    height: 8px;
                    background: #e0e0e0;
                    border-radius: 4px;
                    overflow: hidden;
                }

                .weiruan-progress-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }

                .weiruan-progress-fill.low { background: linear-gradient(90deg, #4CAF50, #8BC34A); }
                .weiruan-progress-fill.medium { background: linear-gradient(90deg, #FFC107, #FF9800); }
                .weiruan-progress-fill.high { background: linear-gradient(90deg, #FF5722, #F44336); }

                .weiruan-percentage { font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 5px; }
                .weiruan-percentage.low { color: #4CAF50; }
                .weiruan-percentage.medium { color: #FF9800; }
                .weiruan-percentage.high { color: #F44336; }

                .weiruan-countdown-section { padding: 12px 15px; border-bottom: 1px solid #eee; background: #fff5f5; }
                .weiruan-countdown { font-size: 20px; font-weight: 700; color: #c62828; text-align: center; margin-bottom: 5px; }
                .weiruan-reset-time { font-size: 12px; color: #888; text-align: center; }

                .weiruan-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

                .weiruan-stat-item {
                    background: #f8f9fa;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                }

                .weiruan-stat-value { font-size: 18px; font-weight: 700; color: #667eea; }
                .weiruan-stat-label { font-size: 11px; color: #888; margin-top: 2px; }

                .weiruan-actions-section { padding: 12px 15px; display: flex; gap: 8px; flex-wrap: wrap; }

                .weiruan-action-btn {
                    flex: 1;
                    min-width: 60px;
                    padding: 8px 10px;
                    border: none;
                    border-radius: 6px;
                    font-size: 11px;
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

                .weiruan-action-btn.secondary { background: #f0f0f0; color: #666; }
                .weiruan-action-btn.secondary:hover { background: #e0e0e0; }

                .weiruan-footer {
                    padding: 10px 15px;
                    background: #f8f9fa;
                    text-align: center;
                    font-size: 10px;
                    color: #999;
                }

                .weiruan-footer a { color: #667eea; text-decoration: none; }
                .weiruan-footer a:hover { text-decoration: underline; }

                .weiruan-plan-selector {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.15);
                    padding: 8px 0;
                    z-index: 1000;
                    min-width: 150px;
                    display: none;
                }

                .weiruan-plan-selector.show { display: block; }

                .weiruan-plan-option {
                    padding: 8px 15px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .weiruan-plan-option:hover { background: #f5f5f5; }
                .weiruan-plan-option.active { background: #e8f5e9; }

                .weiruan-plan-dot { width: 8px; height: 8px; border-radius: 50%; }

                @media (prefers-color-scheme: dark) {
                    .weiruan-panel-body { background: #1e1e1e; }
                    .weiruan-section { border-bottom-color: #333; }
                    .weiruan-status-label, .weiruan-usage-label { color: #aaa; }
                    .weiruan-status-value, .weiruan-usage-value { color: #eee; }
                    .weiruan-stat-item { background: #2d2d2d; }
                    .weiruan-stat-label { color: #aaa; }
                    .weiruan-action-btn.secondary { background: #333; color: #ccc; }
                    .weiruan-action-btn.secondary:hover { background: #444; }
                    .weiruan-footer { background: #252525; }
                    .weiruan-progress-bar { background: #333; }
                    .weiruan-countdown-section { background: #2d1f1f; }
                    .weiruan-plan-selector { background: #2d2d2d; }
                    .weiruan-plan-option:hover { background: #333; }
                    .weiruan-plan-option.active { background: #1e3a1e; }
                }

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
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* 历史数据图表样式 */
                .weiruan-history-section {
                    padding: 12px 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-history-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .weiruan-history-tabs {
                    display: flex;
                    gap: 5px;
                }

                .weiruan-history-tab {
                    padding: 4px 10px;
                    border: none;
                    background: #f0f0f0;
                    color: #666;
                    border-radius: 12px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .weiruan-history-tab.active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .weiruan-history-tab:hover:not(.active) {
                    background: #e0e0e0;
                }

                .weiruan-chart-container {
                    height: 120px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 4px;
                    padding: 10px 0;
                }

                .weiruan-chart-bar-wrapper {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                }

                .weiruan-chart-bar-container {
                    flex: 1;
                    width: 100%;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                }

                .weiruan-chart-bar {
                    width: 80%;
                    max-width: 30px;
                    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
                    border-radius: 4px 4px 0 0;
                    min-height: 4px;
                    transition: height 0.3s ease;
                    cursor: pointer;
                    position: relative;
                }

                .weiruan-chart-bar:hover {
                    opacity: 0.8;
                }

                .weiruan-chart-bar.today {
                    background: linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%);
                }

                .weiruan-chart-bar.has-limit {
                    background: linear-gradient(180deg, #FF5722 0%, #F44336 100%);
                }

                .weiruan-chart-bar-tooltip {
                    position: absolute;
                    bottom: 100%;
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

                .weiruan-chart-bar:hover .weiruan-chart-bar-tooltip {
                    opacity: 1;
                }

                .weiruan-chart-label {
                    font-size: 9px;
                    color: #888;
                    margin-top: 4px;
                    text-align: center;
                }

                .weiruan-chart-label.today {
                    color: #4CAF50;
                    font-weight: 600;
                }

                .weiruan-history-summary {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid #eee;
                }

                .weiruan-summary-item {
                    text-align: center;
                    padding: 8px;
                    background: #f8f9fa;
                    border-radius: 6px;
                }

                .weiruan-summary-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #667eea;
                }

                .weiruan-summary-label {
                    font-size: 10px;
                    color: #888;
                    margin-top: 2px;
                }

                @media (prefers-color-scheme: dark) {
                    .weiruan-history-section { border-bottom-color: #333; }
                    .weiruan-history-tab { background: #333; color: #ccc; }
                    .weiruan-history-tab:hover:not(.active) { background: #444; }
                    .weiruan-chart-label { color: #aaa; }
                    .weiruan-history-summary { border-top-color: #333; }
                    .weiruan-summary-item { background: #2d2d2d; }
                }
            `);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'weiruan-claude-panel';
            if (!this.isExpanded) panel.classList.add('collapsed');

            panel.innerHTML = `
                <div class="weiruan-panel-header">
                    <div class="weiruan-panel-title">
                        <span>📊</span>
                        <span>威软Claude用量检测</span>
                    </div>
                    <div class="weiruan-panel-controls">
                        <button class="weiruan-panel-btn" id="weiruan-refresh" title="刷新">🔄</button>
                        <button class="weiruan-panel-btn" id="weiruan-toggle" title="折叠/展开">${this.isExpanded ? '−' : '+'}</button>
                    </div>
                </div>
                <div class="weiruan-panel-body">
                    <div class="weiruan-section">
                        <div class="weiruan-status-row">
                            <span class="weiruan-status-label">订阅版本</span>
                            <div style="position: relative;">
                                <span class="weiruan-plan-badge free" id="weiruan-plan" title="点击切换版本">免费版</span>
                                <div class="weiruan-plan-selector" id="weiruan-plan-selector">
                                    <div class="weiruan-plan-option" data-plan="free">
                                        <span class="weiruan-plan-dot" style="background: #888"></span>
                                        <span>Free 免费版</span>
                                    </div>
                                    <div class="weiruan-plan-option" data-plan="pro">
                                        <span class="weiruan-plan-dot" style="background: #D97706"></span>
                                        <span>Pro 专业版</span>
                                    </div>
                                    <div class="weiruan-plan-option" data-plan="team">
                                        <span class="weiruan-plan-dot" style="background: #7C3AED"></span>
                                        <span>Team 团队版</span>
                                    </div>
                                    <div class="weiruan-plan-option" data-plan="max">
                                        <span class="weiruan-plan-dot" style="background: #DC2626"></span>
                                        <span>Max 旗舰版</span>
                                    </div>
                                    <div class="weiruan-plan-option" data-plan="enterprise">
                                        <span class="weiruan-plan-dot" style="background: #059669"></span>
                                        <span>Enterprise 企业版</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="weiruan-status-row">
                            <span class="weiruan-status-label">当前状态</span>
                            <span class="weiruan-status-badge normal" id="weiruan-status">正常</span>
                        </div>
                    </div>

                    <div class="weiruan-usage-section">
                        <div class="weiruan-section-title">用量统计</div>
                        <div class="weiruan-usage-item">
                            <div class="weiruan-usage-header">
                                <span class="weiruan-usage-label">📅 今日用量</span>
                                <span class="weiruan-usage-value" id="weiruan-daily-usage">0 / 10</span>
                            </div>
                            <div class="weiruan-progress-bar">
                                <div class="weiruan-progress-fill low" id="weiruan-daily-progress" style="width: 0%"></div>
                            </div>
                            <div class="weiruan-percentage low" id="weiruan-daily-percentage">0%</div>
                        </div>
                        <div class="weiruan-usage-item">
                            <div class="weiruan-usage-header">
                                <span class="weiruan-usage-label">📊 本周用量</span>
                                <span class="weiruan-usage-value" id="weiruan-weekly-usage">0 / 50</span>
                            </div>
                            <div class="weiruan-progress-bar">
                                <div class="weiruan-progress-fill low" id="weiruan-weekly-progress" style="width: 0%"></div>
                            </div>
                            <div class="weiruan-percentage low" id="weiruan-weekly-percentage">0%</div>
                        </div>
                    </div>

                    <div class="weiruan-countdown-section" id="weiruan-countdown-section" style="display: none;">
                        <div class="weiruan-countdown" id="weiruan-countdown">--:--:--</div>
                        <div class="weiruan-reset-time">预计恢复时间: <span id="weiruan-reset-time">--</span></div>
                    </div>

                    <div class="weiruan-history-section">
                        <div class="weiruan-history-header">
                            <div class="weiruan-section-title" style="margin-bottom: 0;">历史趋势</div>
                            <div class="weiruan-history-tabs">
                                <button class="weiruan-history-tab active" data-days="7">7天</button>
                                <button class="weiruan-history-tab" data-days="14">14天</button>
                                <button class="weiruan-history-tab" data-days="30">30天</button>
                            </div>
                        </div>
                        <div class="weiruan-chart-container" id="weiruan-history-chart">
                            <!-- 图表将通过JS动态生成 -->
                        </div>
                        <div class="weiruan-history-summary" id="weiruan-history-summary">
                            <div class="weiruan-summary-item">
                                <div class="weiruan-summary-value" id="weiruan-avg-messages">0</div>
                                <div class="weiruan-summary-label">日均消息</div>
                            </div>
                            <div class="weiruan-summary-item">
                                <div class="weiruan-summary-value" id="weiruan-total-messages">0</div>
                                <div class="weiruan-summary-label">周期总量</div>
                            </div>
                            <div class="weiruan-summary-item">
                                <div class="weiruan-summary-value" id="weiruan-max-messages">0</div>
                                <div class="weiruan-summary-label">单日最高</div>
                            </div>
                            <div class="weiruan-summary-item">
                                <div class="weiruan-summary-value" id="weiruan-total-limits">0</div>
                                <div class="weiruan-summary-label">触发限制</div>
                            </div>
                        </div>
                    </div>

                    <div class="weiruan-section">
                        <div class="weiruan-section-title">详细数据</div>
                        <div class="weiruan-stats-grid">
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-session-msgs">0</div>
                                <div class="weiruan-stat-label">会话消息</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-today-msgs">0</div>
                                <div class="weiruan-stat-label">今日消息</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-session-time">0分钟</div>
                                <div class="weiruan-stat-label">会话时长</div>
                            </div>
                            <div class="weiruan-stat-item">
                                <div class="weiruan-stat-value" id="weiruan-today-limits">0</div>
                                <div class="weiruan-stat-label">今日限制</div>
                            </div>
                        </div>
                    </div>

                    <div class="weiruan-actions-section">
                        <button class="weiruan-action-btn primary" id="weiruan-add">+1</button>
                        <button class="weiruan-action-btn secondary" id="weiruan-export">导出</button>
                        <button class="weiruan-action-btn secondary" id="weiruan-reset">重置</button>
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
            document.getElementById('weiruan-toggle').addEventListener('click', () => {
                this.isExpanded = !this.isExpanded;
                this.panel.classList.toggle('collapsed');
                document.getElementById('weiruan-toggle').textContent = this.isExpanded ? '−' : '+';
                Utils.storage.set('uiExpanded', this.isExpanded);
            });

            document.getElementById('weiruan-refresh').addEventListener('click', () => {
                this.detector.checkPageForLimits();
                this.update(this.detector.getStatus());
                this.showNotification('已刷新状态');
            });

            document.getElementById('weiruan-add').addEventListener('click', () => {
                this.detector.manualAddMessage(1);
                this.showNotification('手动 +1');
            });

            document.getElementById('weiruan-export').addEventListener('click', () => {
                this.exportStats();
            });

            document.getElementById('weiruan-reset').addEventListener('click', () => {
                if (confirm('确定要重置所有统计数据吗？')) {
                    this.detector.resetStats();
                    this.showNotification('统计数据已重置');
                }
            });

            const planBadge = document.getElementById('weiruan-plan');
            const planSelector = document.getElementById('weiruan-plan-selector');

            planBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                planSelector.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                planSelector.classList.remove('show');
            });

            planSelector.querySelectorAll('.weiruan-plan-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const plan = option.dataset.plan;
                    this.planDetector.setPlan(plan);
                    this.update(this.detector.getStatus());
                    planSelector.classList.remove('show');
                    this.showNotification(`已切换到 ${CONFIG.PLAN_LIMITS[plan].displayName}`);
                });
            });

            // 历史图表标签切换
            this.currentHistoryDays = 7;
            document.querySelectorAll('.weiruan-history-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.weiruan-history-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentHistoryDays = parseInt(tab.dataset.days);
                    this.updateHistoryChart();
                });
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
                element.style.left = (startLeft + e.clientX - startX) + 'px';
                element.style.top = (startTop + e.clientY - startY) + 'px';
                element.style.right = 'auto';
            };

            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        }

        getProgressClass(percentage) {
            if (percentage < 50) return 'low';
            if (percentage < 80) return 'medium';
            return 'high';
        }

        update(status) {
            const planBadge = document.getElementById('weiruan-plan');
            const planConfig = status.planConfig;
            planBadge.textContent = planConfig.displayName;
            planBadge.className = `weiruan-plan-badge ${status.plan}`;

            document.querySelectorAll('.weiruan-plan-option').forEach(option => {
                option.classList.toggle('active', option.dataset.plan === status.plan);
            });

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

            const dailyUsage = status.usagePercentage.daily;
            const dailyClass = this.getProgressClass(dailyUsage.percentage);
            document.getElementById('weiruan-daily-usage').textContent = `${dailyUsage.used} / ${dailyUsage.limit}`;
            document.getElementById('weiruan-daily-progress').style.width = `${dailyUsage.percentage}%`;
            document.getElementById('weiruan-daily-progress').className = `weiruan-progress-fill ${dailyClass}`;
            document.getElementById('weiruan-daily-percentage').textContent = `${dailyUsage.percentage}%`;
            document.getElementById('weiruan-daily-percentage').className = `weiruan-percentage ${dailyClass}`;

            const weeklyUsage = status.usagePercentage.weekly;
            const weeklyClass = this.getProgressClass(weeklyUsage.percentage);
            document.getElementById('weiruan-weekly-usage').textContent = `${weeklyUsage.used} / ${weeklyUsage.limit}`;
            document.getElementById('weiruan-weekly-progress').style.width = `${weeklyUsage.percentage}%`;
            document.getElementById('weiruan-weekly-progress').className = `weiruan-progress-fill ${weeklyClass}`;
            document.getElementById('weiruan-weekly-percentage').textContent = `${weeklyUsage.percentage}%`;
            document.getElementById('weiruan-weekly-percentage').className = `weiruan-percentage ${weeklyClass}`;

            document.getElementById('weiruan-session-msgs').textContent = status.messageCount;
            document.getElementById('weiruan-today-msgs').textContent = status.todayMessages;
            document.getElementById('weiruan-session-time').textContent = status.sessionDuration;
            document.getElementById('weiruan-today-limits').textContent = status.todayLimits;

            // 更新历史图表
            this.updateHistoryChart();
        }

        updateHistoryChart() {
            const days = this.currentHistoryDays || 7;
            const historyData = this.detector.getHistoryData(days);
            const chartContainer = document.getElementById('weiruan-history-chart');

            if (!chartContainer) return;

            const today = new Date().toDateString();
            const maxMessages = Math.max(...historyData.map(d => d.messages), 1);

            // 生成柱状图
            let chartHTML = '';
            historyData.forEach((data, index) => {
                const height = Math.max(4, (data.messages / maxMessages) * 100);
                const isToday = data.date === today;
                const hasLimit = data.limits > 0;

                let barClass = 'weiruan-chart-bar';
                if (isToday) barClass += ' today';
                if (hasLimit) barClass += ' has-limit';

                const labelClass = isToday ? 'weiruan-chart-label today' : 'weiruan-chart-label';
                const displayLabel = days <= 7 ? `${data.shortDate}<br>${data.dayName}` : data.shortDate;

                chartHTML += `
                    <div class="weiruan-chart-bar-wrapper">
                        <div class="weiruan-chart-bar-container">
                            <div class="${barClass}" style="height: ${height}%">
                                <div class="weiruan-chart-bar-tooltip">
                                    ${data.shortDate}: ${data.messages}条消息${hasLimit ? ` (${data.limits}次限制)` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="${labelClass}">${displayLabel}</div>
                    </div>
                `;
            });

            chartContainer.innerHTML = chartHTML;

            // 更新统计摘要
            const summary = this.detector.getHistorySummary();
            const totalMessages = historyData.reduce((sum, d) => sum + d.messages, 0);
            const avgMessages = Math.round(totalMessages / days);
            const maxDayMessages = Math.max(...historyData.map(d => d.messages));
            const totalLimits = historyData.reduce((sum, d) => sum + d.limits, 0);

            document.getElementById('weiruan-avg-messages').textContent = avgMessages;
            document.getElementById('weiruan-total-messages').textContent = totalMessages;
            document.getElementById('weiruan-max-messages').textContent = maxDayMessages;
            document.getElementById('weiruan-total-limits').textContent = totalLimits;
        }

        exportStats() {
            const status = this.detector.getStatus();
            const data = {
                exportTime: new Date().toISOString(),
                version: CONFIG.VERSION,
                plan: status.plan,
                planConfig: status.planConfig,
                currentStatus: status,
                usagePercentage: status.usagePercentage,
                dailyStats: this.detector.usageData.dailyStats,
                historyData: {
                    last7Days: this.detector.getHistoryData(7),
                    last14Days: this.detector.getHistoryData(14),
                    last30Days: this.detector.getHistoryData(30),
                    summary: this.detector.getHistorySummary()
                }
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
    async function init() {
        Utils.log('初始化威软Claude用量检测 v2.2...');

        const planDetector = new PlanDetector();

        const userSelectedPlan = Utils.storage.get('userSelectedPlan');
        if (userSelectedPlan && CONFIG.PLAN_LIMITS[userSelectedPlan]) {
            planDetector.currentPlan = userSelectedPlan;
            Utils.log('使用用户选择的版本:', userSelectedPlan);
        } else {
            await planDetector.detectPlan();
        }

        const detector = new UsageDetector(planDetector);
        detector.init();

        const ui = new UI(detector, planDetector);
        window.weiruanUI = ui;
        window.weiruanDetector = detector;
        window.weiruanPlanDetector = planDetector;
        window.weiruanHistoryManager = detector.historyManager;

        // 暴露手动添加方法到控制台
        window.weiruanAddMessage = (count) => detector.manualAddMessage(count || 1);
        window.weiruanGetHistory = (days) => detector.getHistoryData(days || 7);

        setInterval(() => {
            detector.checkPageForLimits();
            ui.update(detector.getStatus());
        }, CONFIG.CHECK_INTERVAL);

        ui.update(detector.getStatus());

        Utils.log('威软Claude用量检测已启动');
        Utils.log('提示: 可在控制台使用以下命令:');
        Utils.log('  - weiruanAddMessage(n): 手动添加n条消息计数');
        Utils.log('  - weiruanGetHistory(days): 获取历史数据');
    }

    // 等待页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
    } else {
        setTimeout(init, 1000);
    }
})();
