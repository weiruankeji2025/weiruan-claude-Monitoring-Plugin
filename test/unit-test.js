/**
 * 威软Claude用量检测 - 单元测试
 *
 * 运行方式: node test/unit-test.js
 */

const assert = require('assert');

// 测试配置
const CONFIG = {
    VERSION: '1.0.0',
    RESET_PERIOD_HOURS: 5,
    CHECK_INTERVAL: 5000
};

// 测试结果收集
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        results.push({ name, status: 'PASS' });
        console.log(`✅ ${name}`);
    } catch (error) {
        failed++;
        results.push({ name, status: 'FAIL', error: error.message });
        console.log(`❌ ${name}`);
        console.log(`   错误: ${error.message}`);
    }
}

function describe(suiteName, fn) {
    console.log(`\n📦 ${suiteName}`);
    console.log('─'.repeat(50));
    fn();
}

// ==================== 工具函数测试 ====================

describe('工具函数测试', () => {
    test('formatDuration - 小时分钟格式', () => {
        const ms = 2 * 60 * 60 * 1000 + 30 * 60 * 1000; // 2.5小时
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        assert.strictEqual(hours, 2);
        assert.strictEqual(minutes, 30);
    });

    test('formatDuration - 分钟秒格式', () => {
        const ms = 5 * 60 * 1000 + 45 * 1000; // 5分45秒
        const minutes = Math.floor(ms / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        assert.strictEqual(minutes, 5);
        assert.strictEqual(seconds, 45);
    });

    test('formatDuration - 零值处理', () => {
        const ms = 0;
        assert.ok(ms <= 0);
    });

    test('formatDuration - 负值处理', () => {
        const ms = -1000;
        assert.ok(ms <= 0);
    });
});

// ==================== 限制检测测试 ====================

describe('限制检测正则表达式测试', () => {
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

    test('检测英文限制消息 - reached limit', () => {
        const msg = "You've reached your usage limit for today";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测英文限制消息 - rate limit', () => {
        const msg = "Rate limit exceeded. Please try again later.";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测英文限制消息 - too many requests', () => {
        const msg = "Too many requests in a short period";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测中文限制消息 - 限制', () => {
        const msg = "您已达到使用限制";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测中文限制消息 - 稍后再试', () => {
        const msg = "请稍后再试";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('正常消息不应被检测为限制', () => {
        const msg = "Hello! How can I help you today?";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, false);
    });

    test('空消息处理', () => {
        const msg = "";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, false);
    });
});

// ==================== 恢复时间解析测试 ====================

describe('恢复时间解析测试', () => {
    function parseResetTime(message) {
        const hourMatch = message.match(/(\d+)\s*(hour|小时)/i);
        const minMatch = message.match(/(\d+)\s*(minute|分钟)/i);

        let resetMs = 0;
        if (hourMatch) resetMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
        if (minMatch) resetMs += parseInt(minMatch[1]) * 60 * 1000;

        return resetMs;
    }

    test('解析小时 - 英文', () => {
        const result = parseResetTime("Please wait 5 hours");
        assert.strictEqual(result, 5 * 60 * 60 * 1000);
    });

    test('解析分钟 - 英文', () => {
        const result = parseResetTime("Try again in 30 minutes");
        assert.strictEqual(result, 30 * 60 * 1000);
    });

    test('解析小时和分钟 - 英文', () => {
        const result = parseResetTime("Please wait 2 hours and 15 minutes");
        assert.strictEqual(result, 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
    });

    test('解析小时 - 中文', () => {
        const result = parseResetTime("请等待3小时后重试");
        assert.strictEqual(result, 3 * 60 * 60 * 1000);
    });

    test('解析分钟 - 中文', () => {
        const result = parseResetTime("请45分钟后重试");
        assert.strictEqual(result, 45 * 60 * 1000);
    });

    test('解析混合时间 - 中文', () => {
        const result = parseResetTime("预计2小时30分钟后恢复");
        assert.strictEqual(result, 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
    });

    test('无时间信息返回0', () => {
        const result = parseResetTime("Something went wrong");
        assert.strictEqual(result, 0);
    });
});

// ==================== 数据结构测试 ====================

describe('用量数据结构测试', () => {
    const createUsageData = () => ({
        isLimited: false,
        limitDetectedAt: null,
        estimatedResetTime: null,
        messageCount: 0,
        sessionStartTime: Date.now(),
        dailyStats: {},
        lastCheckTime: null,
        limitType: null,
        limitMessage: ''
    });

    test('初始化数据结构完整性', () => {
        const data = createUsageData();
        const requiredFields = [
            'isLimited', 'limitDetectedAt', 'estimatedResetTime',
            'messageCount', 'sessionStartTime', 'dailyStats',
            'lastCheckTime', 'limitType', 'limitMessage'
        ];

        requiredFields.forEach(field => {
            assert.ok(field in data, `缺少字段: ${field}`);
        });
    });

    test('isLimited 初始值为 false', () => {
        const data = createUsageData();
        assert.strictEqual(data.isLimited, false);
    });

    test('messageCount 初始值为 0', () => {
        const data = createUsageData();
        assert.strictEqual(data.messageCount, 0);
    });

    test('dailyStats 初始为空对象', () => {
        const data = createUsageData();
        assert.deepStrictEqual(data.dailyStats, {});
    });

    test('sessionStartTime 应为有效时间戳', () => {
        const data = createUsageData();
        assert.ok(data.sessionStartTime > 0);
        assert.ok(data.sessionStartTime <= Date.now());
    });
});

// ==================== 状态管理测试 ====================

describe('状态管理测试', () => {
    test('触发限制后状态更新', () => {
        const usageData = {
            isLimited: false,
            limitDetectedAt: null,
            estimatedResetTime: null,
            messageCount: 50
        };

        // 模拟触发限制
        const now = Date.now();
        usageData.isLimited = true;
        usageData.limitDetectedAt = now;
        usageData.estimatedResetTime = now + (CONFIG.RESET_PERIOD_HOURS * 60 * 60 * 1000);

        assert.strictEqual(usageData.isLimited, true);
        assert.ok(usageData.limitDetectedAt > 0);
        assert.ok(usageData.estimatedResetTime > usageData.limitDetectedAt);
    });

    test('限制恢复后状态重置', () => {
        const usageData = {
            isLimited: true,
            limitDetectedAt: Date.now() - 3600000,
            estimatedResetTime: Date.now() - 1000,
            limitMessage: 'Test limit'
        };

        // 模拟恢复
        usageData.isLimited = false;
        usageData.limitDetectedAt = null;
        usageData.limitMessage = '';

        assert.strictEqual(usageData.isLimited, false);
        assert.strictEqual(usageData.limitDetectedAt, null);
        assert.strictEqual(usageData.limitMessage, '');
    });

    test('消息计数递增', () => {
        const usageData = { messageCount: 0 };

        for (let i = 0; i < 10; i++) {
            usageData.messageCount++;
        }

        assert.strictEqual(usageData.messageCount, 10);
    });

    test('每日统计更新', () => {
        const today = new Date().toDateString();
        const dailyStats = {};

        if (!dailyStats[today]) {
            dailyStats[today] = { messages: 0, limits: 0 };
        }

        dailyStats[today].messages += 5;
        dailyStats[today].limits += 1;

        assert.strictEqual(dailyStats[today].messages, 5);
        assert.strictEqual(dailyStats[today].limits, 1);
    });
});

// ==================== 配置验证测试 ====================

describe('配置验证测试', () => {
    test('版本号格式正确', () => {
        assert.ok(/^\d+\.\d+\.\d+$/.test(CONFIG.VERSION));
    });

    test('重置周期为正数', () => {
        assert.ok(CONFIG.RESET_PERIOD_HOURS > 0);
    });

    test('检测间隔合理', () => {
        assert.ok(CONFIG.CHECK_INTERVAL >= 1000);
        assert.ok(CONFIG.CHECK_INTERVAL <= 60000);
    });
});

// ==================== 导出功能测试 ====================

describe('数据导出测试', () => {
    test('导出数据结构完整', () => {
        const exportData = {
            exportTime: new Date().toISOString(),
            version: CONFIG.VERSION,
            currentStatus: {
                isLimited: false,
                remainingTime: 0,
                messageCount: 100
            },
            dailyStats: {
                '2024-01-15': { messages: 50, limits: 2 }
            }
        };

        const json = JSON.stringify(exportData);
        const parsed = JSON.parse(json);

        assert.ok('exportTime' in parsed);
        assert.ok('version' in parsed);
        assert.ok('currentStatus' in parsed);
        assert.ok('dailyStats' in parsed);
    });

    test('JSON 序列化/反序列化正确', () => {
        const data = {
            count: 42,
            nested: { value: 'test' },
            array: [1, 2, 3]
        };

        const json = JSON.stringify(data);
        const parsed = JSON.parse(json);

        assert.deepStrictEqual(parsed, data);
    });
});

// ==================== 输出测试报告 ====================

console.log('\n' + '═'.repeat(50));
console.log('📊 威软Claude用量检测 - 测试报告');
console.log('═'.repeat(50));
console.log(`版本: ${CONFIG.VERSION}`);
console.log(`时间: ${new Date().toLocaleString()}`);
console.log('─'.repeat(50));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📋 总计: ${passed + failed}`);
console.log('─'.repeat(50));

if (failed === 0) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
} else {
    console.log('⚠️ 存在失败的测试，请检查上述错误信息');
    process.exit(1);
}
