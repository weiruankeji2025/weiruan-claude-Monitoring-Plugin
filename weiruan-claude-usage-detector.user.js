// ==UserScript==
// @name         威软Claude用量检测
// @namespace    https://github.com/weiruankeji2025
// @version      2.0.0
// @description  Claude AI 用量检测插件 - 实时监控使用量、显示恢复时间、版本检测、用量百分比统计等功能
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
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置项 ====================
    const CONFIG = {
        CHECK_INTERVAL: 5000,
        STORAGE_PREFIX: 'weiruan_claude_',
        VERSION: '2.0.0',
        ENABLE_NOTIFICATIONS: true,
        DEBUG: false,

        // 各版本用量限制配置（基于实际观察的估算值）
        PLAN_LIMITS: {
            free: {
                name: 'Free',
                displayName: '免费版',
                color: '#888',
                dailyMessages: 20,        // 每日消息限制
                weeklyMessages: 100,      // 每周消息限制
                resetPeriodHours: 24,     // 重置周期（小时）
                description: '基础免费版本'
            },
            pro: {
                name: 'Pro',
                displayName: 'Pro专业版',
                color: '#D97706',
                dailyMessages: 150,       // Pro用户每日估算
                weeklyMessages: 900,      // 每周估算
                resetPeriodHours: 5,      // 5小时重置周期
                description: '专业订阅版本'
            },
            team: {
                name: 'Team',
                displayName: 'Team团队版',
                color: '#7C3AED',
                dailyMessages: 200,
                weeklyMessages: 1200,
                resetPeriodHours: 5,
                description: '团队协作版本'
            },
            max: {
                name: 'Max',
                displayName: 'Max旗舰版',
                color: '#DC2626',
                dailyMessages: 500,       // Max用户限制更高
                weeklyMessages: 3000,
                resetPeriodHours: 5,
                description: '旗舰订阅版本'
            },
            enterprise: {
                name: 'Enterprise',
                displayName: '企业版',
                color: '#059669',
                dailyMessages: 1000,
                weeklyMessages: 5000,
                resetPeriodHours: 5,
                description: '企业级版本'
            }
        }
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
        },

        // 获取本周的起始日期
        getWeekStart: () => {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            return new Date(now.setDate(diff)).toDateString();
        },

        // 获取最近7天的日期列表
        getLast7Days: () => {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                days.push(date.toDateString());
            }
            return days;
        }
    };

    // ==================== 用户版本检测器 ====================
    class PlanDetector {
        constructor() {
            this.currentPlan = 'free';
            this.planInfo = null;
            this.detectionMethods = [];
        }

        async detectPlan() {
            Utils.log('开始检测用户版本...');

            // 方法1: 检查页面DOM元素
            let plan = this.detectFromDOM();
            if (plan) {
                this.currentPlan = plan;
                this.detectionMethods.push('DOM检测');
                Utils.log('通过DOM检测到版本:', plan);
                return plan;
            }

            // 方法2: 检查URL和路由
            plan = this.detectFromURL();
            if (plan) {
                this.currentPlan = plan;
                this.detectionMethods.push('URL检测');
                Utils.log('通过URL检测到版本:', plan);
                return plan;
            }

            // 方法3: 检查本地存储
            plan = this.detectFromStorage();
            if (plan) {
                this.currentPlan = plan;
                this.detectionMethods.push('存储检测');
                Utils.log('通过存储检测到版本:', plan);
                return plan;
            }

            // 方法4: 通过API响应检测
            plan = await this.detectFromAPI();
            if (plan) {
                this.currentPlan = plan;
                this.detectionMethods.push('API检测');
                Utils.log('通过API检测到版本:', plan);
                return plan;
            }

            // 方法5: 检查页面特征
            plan = this.detectFromFeatures();
            if (plan) {
                this.currentPlan = plan;
                this.detectionMethods.push('特征检测');
                Utils.log('通过特征检测到版本:', plan);
                return plan;
            }

            Utils.log('未能检测到版本，使用默认值');
            return this.currentPlan;
        }

        detectFromDOM() {
            // 检查订阅相关的DOM元素
            const selectors = [
                // 常见的订阅标识选择器
                '[data-testid*="subscription"]',
                '[data-testid*="plan"]',
                '[class*="subscription"]',
                '[class*="plan-badge"]',
                '[class*="pro-badge"]',
                '[class*="team-badge"]',
                '[class*="max-badge"]',
                // 检查导航栏或设置中的版本信息
                'nav [class*="pro"]',
                'nav [class*="team"]',
                '[class*="upgrade"]',
                // 检查用户菜单
                '[class*="user-menu"] [class*="plan"]',
                '[class*="account"] [class*="plan"]'
            ];

            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = (el.textContent || '').toLowerCase();
                        const className = (el.className || '').toLowerCase();
                        const dataAttrs = JSON.stringify(el.dataset || {}).toLowerCase();

                        if (text.includes('max') || className.includes('max') || dataAttrs.includes('max')) {
                            return 'max';
                        }
                        if (text.includes('enterprise') || className.includes('enterprise')) {
                            return 'enterprise';
                        }
                        if (text.includes('team') || className.includes('team') || dataAttrs.includes('team')) {
                            return 'team';
                        }
                        if (text.includes('pro') || className.includes('pro') || dataAttrs.includes('pro')) {
                            return 'pro';
                        }
                    }
                } catch (e) {
                    Utils.log('DOM选择器错误:', selector, e);
                }
            }

            // 检查页面文本内容
            const bodyText = document.body?.innerText?.toLowerCase() || '';

            // 检查是否有"升级到Pro"的提示（说明是免费版）
            if (bodyText.includes('upgrade to pro') || bodyText.includes('升级到 pro') || bodyText.includes('升级到pro')) {
                // 有升级提示，可能是免费版
                // 但需要进一步确认
            }

            // 检查是否显示Pro/Team/Max特有的功能
            const proFeatures = ['claude 3.5', 'opus', 'priority', '优先'];
            const hasProFeatures = proFeatures.some(f => bodyText.includes(f));

            if (hasProFeatures) {
                // 检查更具体的版本标识
                if (bodyText.includes('max plan') || bodyText.includes('max 订阅')) {
                    return 'max';
                }
                if (bodyText.includes('team plan') || bodyText.includes('team 订阅')) {
                    return 'team';
                }
                // 默认认为是Pro
                return 'pro';
            }

            return null;
        }

        detectFromURL() {
            const url = window.location.href.toLowerCase();
            const pathname = window.location.pathname.toLowerCase();

            // 检查URL中的版本标识
            if (url.includes('/team/') || url.includes('team.claude')) {
                return 'team';
            }
            if (url.includes('/enterprise/') || url.includes('enterprise.claude')) {
                return 'enterprise';
            }

            return null;
        }

        detectFromStorage() {
            try {
                // 检查localStorage中的用户信息
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    if (key.includes('user') || key.includes('auth') || key.includes('session') || key.includes('plan')) {
                        try {
                            const value = localStorage.getItem(key);
                            if (value) {
                                const lower = value.toLowerCase();
                                if (lower.includes('"max"') || lower.includes("'max'") || lower.includes(':max')) {
                                    return 'max';
                                }
                                if (lower.includes('"enterprise"') || lower.includes(':enterprise')) {
                                    return 'enterprise';
                                }
                                if (lower.includes('"team"') || lower.includes(':team')) {
                                    return 'team';
                                }
                                if (lower.includes('"pro"') || lower.includes(':pro') || lower.includes('pro_subscription')) {
                                    return 'pro';
                                }
                            }
                        } catch (e) {}
                    }
                }

                // 检查sessionStorage
                const sessionKeys = Object.keys(sessionStorage);
                for (const key of sessionKeys) {
                    if (key.includes('user') || key.includes('plan')) {
                        try {
                            const value = sessionStorage.getItem(key);
                            if (value) {
                                const lower = value.toLowerCase();
                                if (lower.includes('max')) return 'max';
                                if (lower.includes('enterprise')) return 'enterprise';
                                if (lower.includes('team')) return 'team';
                                if (lower.includes('pro')) return 'pro';
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                Utils.log('存储检测错误:', e);
            }

            return null;
        }

        async detectFromAPI() {
            // 设置API拦截器来捕获用户信息
            return new Promise((resolve) => {
                // 检查是否已有缓存的版本信息
                const cachedPlan = Utils.storage.get('detectedPlan');
                const cacheTime = Utils.storage.get('planDetectTime');

                // 缓存1小时内有效
                if (cachedPlan && cacheTime && (Date.now() - cacheTime < 3600000)) {
                    resolve(cachedPlan);
                    return;
                }

                // 等待一段时间看是否能从拦截器获取
                setTimeout(() => {
                    resolve(null);
                }, 100);
            });
        }

        detectFromFeatures() {
            // 检查页面上是否有Pro/Team特有的UI元素

            // 检查是否有模型选择器（Pro用户通常可以选择模型）
            const modelSelector = document.querySelector('[class*="model-select"], [class*="model-picker"], [data-testid*="model"]');
            if (modelSelector) {
                const modelText = modelSelector.textContent?.toLowerCase() || '';
                if (modelText.includes('opus') || modelText.includes('claude 3')) {
                    // 能选择Opus通常说明是付费用户
                    return 'pro';
                }
            }

            // 检查是否显示用量限制提示的样式
            const limitMessages = document.querySelectorAll('[class*="limit"], [class*="quota"], [class*="usage"]');
            for (const el of limitMessages) {
                const text = el.textContent?.toLowerCase() || '';
                // Pro用户的限制提示通常会提到小时
                if (text.includes('hour') || text.includes('小时')) {
                    return 'pro';
                }
                // 免费用户的限制提示通常提到天
                if (text.includes('day') || text.includes('天') || text.includes('tomorrow')) {
                    return 'free';
                }
            }

            // 检查是否有"剩余消息"的显示
            const remainingIndicator = document.querySelector('[class*="remaining"], [class*="messages-left"]');
            if (remainingIndicator) {
                // 有剩余消息指示器，说明是付费版本
                return 'pro';
            }

            return null;
        }

        // 手动设置版本（用户可以通过UI选择）
        setPlan(plan) {
            if (CONFIG.PLAN_LIMITS[plan]) {
                this.currentPlan = plan;
                Utils.storage.set('userSelectedPlan', plan);
                Utils.storage.set('detectedPlan', plan);
                Utils.storage.set('planDetectTime', Date.now());
                Utils.log('手动设置版本:', plan);
                return true;
            }
            return false;
        }

        getPlanConfig() {
            return CONFIG.PLAN_LIMITS[this.currentPlan] || CONFIG.PLAN_LIMITS.free;
        }
    }

    // ==================== 用量检测器 ====================
    class UsageDetector {
        constructor(planDetector) {
            this.planDetector = planDetector;
            this.usageData = {
                isLimited: false,
                limitDetectedAt: null,
                estimatedResetTime: null,
                messageCount: 0,
                sessionStartTime: Date.now(),
                dailyStats: {},
                weeklyStats: {},
                lastCheckTime: null,
                limitType: null,
                limitMessage: '',
                apiMessagesSent: 0
            };

            this.loadData();
            this.setupInterceptors();
            this.cleanOldStats();
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
        }

        saveData() {
            Utils.storage.set('usageData', this.usageData);
        }

        cleanOldStats() {
            // 清理超过30天的统计数据
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

        setupInterceptors() {
            const originalFetch = window.fetch;
            const self = this;

            window.fetch = async function(...args) {
                const response = await originalFetch.apply(this, args);

                try {
                    const url = args[0]?.url || args[0];

                    // 检测消息发送
                    if (typeof url === 'string') {
                        // 检测聊天消息API
                        if (url.includes('/api/') && (url.includes('message') || url.includes('chat') || url.includes('completion'))) {
                            const method = args[1]?.method?.toUpperCase() || 'GET';
                            if (method === 'POST') {
                                self.onMessageSent();
                            }
                        }

                        // 尝试从用户API获取版本信息
                        if (url.includes('/api/') && (url.includes('user') || url.includes('account') || url.includes('subscription'))) {
                            try {
                                const cloned = response.clone();
                                const data = await cloned.json();
                                self.parseUserInfo(data);
                            } catch (e) {}
                        }
                    }

                    // 检查429响应
                    if (response.status === 429) {
                        self.onRateLimitDetected(response.clone());
                    }

                    // 检查响应头
                    self.checkRateLimitHeaders(response.headers);

                } catch (e) {
                    Utils.log('拦截器错误:', e);
                }

                return response;
            };

            // 拦截XHR
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

        parseUserInfo(data) {
            try {
                // 尝试从API响应中解析用户版本
                const jsonStr = JSON.stringify(data).toLowerCase();

                let detectedPlan = null;
                if (jsonStr.includes('max')) {
                    detectedPlan = 'max';
                } else if (jsonStr.includes('enterprise')) {
                    detectedPlan = 'enterprise';
                } else if (jsonStr.includes('team')) {
                    detectedPlan = 'team';
                } else if (jsonStr.includes('pro') || jsonStr.includes('premium') || jsonStr.includes('paid')) {
                    detectedPlan = 'pro';
                }

                if (detectedPlan) {
                    this.planDetector.setPlan(detectedPlan);
                    Utils.log('从API响应检测到版本:', detectedPlan);
                }
            } catch (e) {}
        }

        onMessageSent() {
            const today = new Date().toDateString();
            this.usageData.messageCount++;
            this.usageData.apiMessagesSent++;

            if (!this.usageData.dailyStats[today]) {
                this.usageData.dailyStats[today] = { messages: 0, limits: 0, timestamp: Date.now() };
            }
            this.usageData.dailyStats[today].messages++;

            this.saveData();
            this.updateUI();
            Utils.log('消息已发送，当前计数:', this.usageData.messageCount);
        }

        onRateLimitDetected(response, rawText = null) {
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
            this.updateUI();

            Utils.notify('⚠️ Claude 用量限制',
                `您已达到使用限制，预计 ${planConfig.resetPeriodHours} 小时后恢复`);
            Utils.log('检测到速率限制');
        }

        checkRateLimitHeaders(headers) {
            const remaining = headers.get('x-ratelimit-remaining');
            const reset = headers.get('x-ratelimit-reset');

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
            const limitPatterns = [
                /you('ve| have) (reached|hit|exceeded)/i,
                /rate limit/i,
                /too many (requests|messages)/i,
                /usage limit/i,
                /please (wait|try again)/i,
                /限制/,
                /超出/,
                /稍后再试/,
                /out of messages/i,
                /message limit/i
            ];

            const bodyText = document.body?.innerText || '';

            for (const pattern of limitPatterns) {
                if (pattern.test(bodyText)) {
                    const elements = document.querySelectorAll('div, p, span');
                    for (const el of elements) {
                        if (pattern.test(el.innerText) && el.innerText.length < 500) {
                            this.usageData.limitMessage = el.innerText.trim();
                            this.parseResetTimeFromMessage(el.innerText);

                            if (!this.usageData.isLimited) {
                                this.onRateLimitDetected();
                            }
                            return true;
                        }
                    }
                }
            }

            if (this.usageData.isLimited && this.usageData.estimatedResetTime) {
                if (Date.now() >= this.usageData.estimatedResetTime) {
                    this.onLimitReset();
                }
            }

            return false;
        }

        parseResetTimeFromMessage(message) {
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

        // 计算用量百分比
        getUsagePercentage() {
            const planConfig = this.planDetector.getPlanConfig();
            const today = new Date().toDateString();
            const todayStats = this.usageData.dailyStats[today] || { messages: 0 };

            // 计算日用量百分比
            const dailyUsage = todayStats.messages;
            const dailyLimit = planConfig.dailyMessages;
            const dailyPercentage = Math.min(100, Math.round((dailyUsage / dailyLimit) * 100));

            // 计算周用量百分比
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
                daily: {
                    used: dailyUsage,
                    limit: dailyLimit,
                    percentage: dailyPercentage
                },
                weekly: {
                    used: weeklyUsage,
                    limit: weeklyLimit,
                    percentage: weeklyPercentage
                }
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
                limitMessage: this.usageData.limitMessage,
                limitType: this.usageData.limitType,
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
                limitMessage: '',
                apiMessagesSent: 0
            };
            this.saveData();
            this.updateUI();
            Utils.log('所有数据已清除');
        }
    }

    // ==================== UI 组件 ====================
    class UI {
        constructor(detector, planDetector) {
            this.detector = detector;
            this.planDetector = planDetector;
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
                    width: 280px;
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
                    max-height: 600px;
                    transition: max-height 0.3s ease, opacity 0.3s ease;
                }

                #weiruan-claude-panel.collapsed .weiruan-panel-body {
                    max-height: 0;
                    opacity: 0;
                }

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

                .weiruan-plan-badge {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }

                .weiruan-plan-badge:hover {
                    transform: scale(1.05);
                }

                .weiruan-plan-badge.free {
                    background: #f0f0f0;
                    color: #666;
                }

                .weiruan-plan-badge.pro {
                    background: #FEF3C7;
                    color: #D97706;
                }

                .weiruan-plan-badge.team {
                    background: #EDE9FE;
                    color: #7C3AED;
                }

                .weiruan-plan-badge.max {
                    background: #FEE2E2;
                    color: #DC2626;
                }

                .weiruan-plan-badge.enterprise {
                    background: #D1FAE5;
                    color: #059669;
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

                .weiruan-usage-section {
                    padding: 12px 15px;
                    border-bottom: 1px solid #eee;
                }

                .weiruan-usage-item {
                    margin-bottom: 15px;
                }

                .weiruan-usage-item:last-child {
                    margin-bottom: 0;
                }

                .weiruan-usage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                }

                .weiruan-usage-label {
                    font-size: 12px;
                    color: #666;
                }

                .weiruan-usage-value {
                    font-size: 12px;
                    font-weight: 600;
                    color: #333;
                }

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

                .weiruan-progress-fill.low {
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                }

                .weiruan-progress-fill.medium {
                    background: linear-gradient(90deg, #FFC107, #FF9800);
                }

                .weiruan-progress-fill.high {
                    background: linear-gradient(90deg, #FF5722, #F44336);
                }

                .weiruan-percentage {
                    font-size: 20px;
                    font-weight: 700;
                    text-align: center;
                    margin-bottom: 5px;
                }

                .weiruan-percentage.low {
                    color: #4CAF50;
                }

                .weiruan-percentage.medium {
                    color: #FF9800;
                }

                .weiruan-percentage.high {
                    color: #F44336;
                }

                .weiruan-countdown-section {
                    padding: 12px 15px;
                    border-bottom: 1px solid #eee;
                    background: #fff5f5;
                }

                .weiruan-countdown {
                    font-size: 20px;
                    font-weight: 700;
                    color: #c62828;
                    text-align: center;
                    margin-bottom: 5px;
                }

                .weiruan-reset-time {
                    font-size: 12px;
                    color: #888;
                    text-align: center;
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
                    min-width: 70px;
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
                    font-size: 10px;
                    color: #999;
                }

                .weiruan-footer a {
                    color: #667eea;
                    text-decoration: none;
                }

                .weiruan-footer a:hover {
                    text-decoration: underline;
                }

                /* 版本选择器弹窗 */
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

                .weiruan-plan-selector.show {
                    display: block;
                }

                .weiruan-plan-option {
                    padding: 8px 15px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .weiruan-plan-option:hover {
                    background: #f5f5f5;
                }

                .weiruan-plan-option.active {
                    background: #e8f5e9;
                }

                .weiruan-plan-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                /* 深色模式 */
                @media (prefers-color-scheme: dark) {
                    .weiruan-panel-body {
                        background: #1e1e1e;
                    }

                    .weiruan-section {
                        border-bottom-color: #333;
                    }

                    .weiruan-status-label,
                    .weiruan-usage-label {
                        color: #aaa;
                    }

                    .weiruan-status-value,
                    .weiruan-usage-value {
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

                    .weiruan-countdown-section {
                        background: #2d1f1f;
                    }

                    .weiruan-plan-selector {
                        background: #2d2d2d;
                    }

                    .weiruan-plan-option:hover {
                        background: #333;
                    }

                    .weiruan-plan-option.active {
                        background: #1e3a1e;
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
                        <span>📊</span>
                        <span>威软Claude用量检测</span>
                    </div>
                    <div class="weiruan-panel-controls">
                        <button class="weiruan-panel-btn" id="weiruan-refresh" title="刷新">🔄</button>
                        <button class="weiruan-panel-btn" id="weiruan-toggle" title="折叠/展开">${this.isExpanded ? '−' : '+'}</button>
                    </div>
                </div>
                <div class="weiruan-panel-body">
                    <!-- 版本与状态 -->
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

                    <!-- 用量百分比 -->
                    <div class="weiruan-usage-section">
                        <div class="weiruan-section-title">用量统计</div>

                        <!-- 日用量 -->
                        <div class="weiruan-usage-item">
                            <div class="weiruan-usage-header">
                                <span class="weiruan-usage-label">📅 今日用量</span>
                                <span class="weiruan-usage-value" id="weiruan-daily-usage">0 / 20</span>
                            </div>
                            <div class="weiruan-progress-bar">
                                <div class="weiruan-progress-fill low" id="weiruan-daily-progress" style="width: 0%"></div>
                            </div>
                            <div class="weiruan-percentage low" id="weiruan-daily-percentage">0%</div>
                        </div>

                        <!-- 周用量 -->
                        <div class="weiruan-usage-item">
                            <div class="weiruan-usage-header">
                                <span class="weiruan-usage-label">📊 本周用量</span>
                                <span class="weiruan-usage-value" id="weiruan-weekly-usage">0 / 100</span>
                            </div>
                            <div class="weiruan-progress-bar">
                                <div class="weiruan-progress-fill low" id="weiruan-weekly-progress" style="width: 0%"></div>
                            </div>
                            <div class="weiruan-percentage low" id="weiruan-weekly-percentage">0%</div>
                        </div>
                    </div>

                    <!-- 限制倒计时 -->
                    <div class="weiruan-countdown-section" id="weiruan-countdown-section" style="display: none;">
                        <div class="weiruan-countdown" id="weiruan-countdown">--:--:--</div>
                        <div class="weiruan-reset-time">预计恢复时间: <span id="weiruan-reset-time">--</span></div>
                    </div>

                    <!-- 详细统计 -->
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

                    <!-- 操作按钮 -->
                    <div class="weiruan-actions-section">
                        <button class="weiruan-action-btn primary" id="weiruan-export">导出</button>
                        <button class="weiruan-action-btn secondary" id="weiruan-reset">重置</button>
                        <button class="weiruan-action-btn secondary" id="weiruan-detect">检测版本</button>
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
            // 折叠/展开
            document.getElementById('weiruan-toggle').addEventListener('click', () => {
                this.isExpanded = !this.isExpanded;
                this.panel.classList.toggle('collapsed');
                document.getElementById('weiruan-toggle').textContent = this.isExpanded ? '−' : '+';
                Utils.storage.set('uiExpanded', this.isExpanded);
            });

            // 刷新
            document.getElementById('weiruan-refresh').addEventListener('click', () => {
                this.detector.checkPageForLimits();
                this.update(this.detector.getStatus());
                this.showNotification('已刷新状态');
            });

            // 导出
            document.getElementById('weiruan-export').addEventListener('click', () => {
                this.exportStats();
            });

            // 重置
            document.getElementById('weiruan-reset').addEventListener('click', () => {
                if (confirm('确定要重置所有统计数据吗？')) {
                    this.detector.resetStats();
                    this.showNotification('统计数据已重置');
                }
            });

            // 检测版本
            document.getElementById('weiruan-detect').addEventListener('click', async () => {
                this.showNotification('正在检测版本...');
                await this.planDetector.detectPlan();
                this.update(this.detector.getStatus());
                this.showNotification(`检测到版本: ${this.planDetector.getPlanConfig().displayName}`);
            });

            // 版本选择器
            const planBadge = document.getElementById('weiruan-plan');
            const planSelector = document.getElementById('weiruan-plan-selector');

            planBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                planSelector.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                planSelector.classList.remove('show');
            });

            // 版本选项点击
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

        getProgressClass(percentage) {
            if (percentage < 50) return 'low';
            if (percentage < 80) return 'medium';
            return 'high';
        }

        update(status) {
            // 更新版本标识
            const planBadge = document.getElementById('weiruan-plan');
            const planConfig = status.planConfig;
            planBadge.textContent = planConfig.displayName;
            planBadge.className = `weiruan-plan-badge ${status.plan}`;

            // 更新版本选择器中的active状态
            document.querySelectorAll('.weiruan-plan-option').forEach(option => {
                option.classList.toggle('active', option.dataset.plan === status.plan);
            });

            // 更新状态
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

            // 更新日用量
            const dailyUsage = status.usagePercentage.daily;
            const dailyClass = this.getProgressClass(dailyUsage.percentage);
            document.getElementById('weiruan-daily-usage').textContent = `${dailyUsage.used} / ${dailyUsage.limit}`;
            document.getElementById('weiruan-daily-progress').style.width = `${dailyUsage.percentage}%`;
            document.getElementById('weiruan-daily-progress').className = `weiruan-progress-fill ${dailyClass}`;
            document.getElementById('weiruan-daily-percentage').textContent = `${dailyUsage.percentage}%`;
            document.getElementById('weiruan-daily-percentage').className = `weiruan-percentage ${dailyClass}`;

            // 更新周用量
            const weeklyUsage = status.usagePercentage.weekly;
            const weeklyClass = this.getProgressClass(weeklyUsage.percentage);
            document.getElementById('weiruan-weekly-usage').textContent = `${weeklyUsage.used} / ${weeklyUsage.limit}`;
            document.getElementById('weiruan-weekly-progress').style.width = `${weeklyUsage.percentage}%`;
            document.getElementById('weiruan-weekly-progress').className = `weiruan-progress-fill ${weeklyClass}`;
            document.getElementById('weiruan-weekly-percentage').textContent = `${weeklyUsage.percentage}%`;
            document.getElementById('weiruan-weekly-percentage').className = `weiruan-percentage ${weeklyClass}`;

            // 更新详细统计
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
                plan: status.plan,
                planConfig: status.planConfig,
                currentStatus: status,
                usagePercentage: status.usagePercentage,
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
    async function init() {
        Utils.log('初始化威软Claude用量检测 v2.0...');

        // 创建版本检测器
        const planDetector = new PlanDetector();

        // 检查是否有用户手动选择的版本
        const userSelectedPlan = Utils.storage.get('userSelectedPlan');
        if (userSelectedPlan && CONFIG.PLAN_LIMITS[userSelectedPlan]) {
            planDetector.currentPlan = userSelectedPlan;
            Utils.log('使用用户选择的版本:', userSelectedPlan);
        } else {
            // 自动检测版本
            await planDetector.detectPlan();
        }

        // 创建用量检测器
        const detector = new UsageDetector(planDetector);

        // 创建 UI
        const ui = new UI(detector, planDetector);
        window.weiruanUI = ui;
        window.weiruanDetector = detector;
        window.weiruanPlanDetector = planDetector;

        // 定期更新
        setInterval(() => {
            detector.checkPageForLimits();
            ui.update(detector.getStatus());
        }, CONFIG.CHECK_INTERVAL);

        // 定期重新检测版本（每30分钟）
        setInterval(async () => {
            if (!Utils.storage.get('userSelectedPlan')) {
                await planDetector.detectPlan();
                ui.update(detector.getStatus());
            }
        }, 30 * 60 * 1000);

        // 初始更新
        ui.update(detector.getStatus());

        Utils.log('威软Claude用量检测已启动，当前版本:', planDetector.getPlanConfig().displayName);
    }

    // 等待页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500); // 延迟500ms确保Claude页面完全加载
    }
})();
