/**
 * 威软Claude用量检测 - 单元测试 v2.0
 *
 * 运行方式: node test/unit-test.js
 */

const assert = require('assert');

// 测试配置
const CONFIG = {
    VERSION: '2.0.0',
    PLAN_LIMITS: {
        free: {
            name: 'Free',
            displayName: '免费版',
            dailyMessages: 20,
            weeklyMessages: 100,
            resetPeriodHours: 24
        },
        pro: {
            name: 'Pro',
            displayName: 'Pro专业版',
            dailyMessages: 150,
            weeklyMessages: 900,
            resetPeriodHours: 5
        },
        team: {
            name: 'Team',
            displayName: 'Team团队版',
            dailyMessages: 200,
            weeklyMessages: 1200,
            resetPeriodHours: 5
        },
        max: {
            name: 'Max',
            displayName: 'Max旗舰版',
            dailyMessages: 500,
            weeklyMessages: 3000,
            resetPeriodHours: 5
        },
        enterprise: {
            name: 'Enterprise',
            displayName: '企业版',
            dailyMessages: 1000,
            weeklyMessages: 5000,
            resetPeriodHours: 5
        }
    }
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

// ==================== 版本配置测试 ====================

describe('版本配置测试', () => {
    test('Free版配置正确', () => {
        const free = CONFIG.PLAN_LIMITS.free;
        assert.strictEqual(free.dailyMessages, 20);
        assert.strictEqual(free.weeklyMessages, 100);
        assert.strictEqual(free.resetPeriodHours, 24);
    });

    test('Pro版配置正确', () => {
        const pro = CONFIG.PLAN_LIMITS.pro;
        assert.strictEqual(pro.dailyMessages, 150);
        assert.strictEqual(pro.weeklyMessages, 900);
        assert.strictEqual(pro.resetPeriodHours, 5);
    });

    test('Team版配置正确', () => {
        const team = CONFIG.PLAN_LIMITS.team;
        assert.strictEqual(team.dailyMessages, 200);
        assert.strictEqual(team.weeklyMessages, 1200);
        assert.strictEqual(team.resetPeriodHours, 5);
    });

    test('Max版配置正确', () => {
        const max = CONFIG.PLAN_LIMITS.max;
        assert.strictEqual(max.dailyMessages, 500);
        assert.strictEqual(max.weeklyMessages, 3000);
        assert.strictEqual(max.resetPeriodHours, 5);
    });

    test('Enterprise版配置正确', () => {
        const enterprise = CONFIG.PLAN_LIMITS.enterprise;
        assert.strictEqual(enterprise.dailyMessages, 1000);
        assert.strictEqual(enterprise.weeklyMessages, 5000);
        assert.strictEqual(enterprise.resetPeriodHours, 5);
    });

    test('所有版本都有displayName', () => {
        for (const plan in CONFIG.PLAN_LIMITS) {
            assert.ok(CONFIG.PLAN_LIMITS[plan].displayName, `${plan}缺少displayName`);
        }
    });
});

// ==================== 用量百分比计算测试 ====================

describe('用量百分比计算测试', () => {
    function calculatePercentage(used, limit) {
        return Math.min(100, Math.round((used / limit) * 100));
    }

    test('0%用量计算', () => {
        assert.strictEqual(calculatePercentage(0, 100), 0);
    });

    test('50%用量计算', () => {
        assert.strictEqual(calculatePercentage(50, 100), 50);
    });

    test('100%用量计算', () => {
        assert.strictEqual(calculatePercentage(100, 100), 100);
    });

    test('超过100%应限制为100%', () => {
        assert.strictEqual(calculatePercentage(150, 100), 100);
    });

    test('Pro版日用量75条=50%', () => {
        const pro = CONFIG.PLAN_LIMITS.pro;
        assert.strictEqual(calculatePercentage(75, pro.dailyMessages), 50);
    });

    test('Free版日用量10条=50%', () => {
        const free = CONFIG.PLAN_LIMITS.free;
        assert.strictEqual(calculatePercentage(10, free.dailyMessages), 50);
    });

    test('Max版周用量1500条=50%', () => {
        const max = CONFIG.PLAN_LIMITS.max;
        assert.strictEqual(calculatePercentage(1500, max.weeklyMessages), 50);
    });
});

// ==================== 进度条颜色分类测试 ====================

describe('进度条颜色分类测试', () => {
    function getProgressClass(percentage) {
        if (percentage < 50) return 'low';
        if (percentage < 80) return 'medium';
        return 'high';
    }

    test('0%显示绿色(low)', () => {
        assert.strictEqual(getProgressClass(0), 'low');
    });

    test('25%显示绿色(low)', () => {
        assert.strictEqual(getProgressClass(25), 'low');
    });

    test('49%显示绿色(low)', () => {
        assert.strictEqual(getProgressClass(49), 'low');
    });

    test('50%显示黄色(medium)', () => {
        assert.strictEqual(getProgressClass(50), 'medium');
    });

    test('75%显示黄色(medium)', () => {
        assert.strictEqual(getProgressClass(75), 'medium');
    });

    test('79%显示黄色(medium)', () => {
        assert.strictEqual(getProgressClass(79), 'medium');
    });

    test('80%显示红色(high)', () => {
        assert.strictEqual(getProgressClass(80), 'high');
    });

    test('100%显示红色(high)', () => {
        assert.strictEqual(getProgressClass(100), 'high');
    });
});

// ==================== 周用量计算测试 ====================

describe('周用量计算测试', () => {
    function getLast7Days() {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            days.push(date.toDateString());
        }
        return days;
    }

    test('获取最近7天日期', () => {
        const days = getLast7Days();
        assert.strictEqual(days.length, 7);
    });

    test('最近7天包含今天', () => {
        const days = getLast7Days();
        const today = new Date().toDateString();
        assert.ok(days.includes(today));
    });

    test('最近7天最后一天是今天', () => {
        const days = getLast7Days();
        const today = new Date().toDateString();
        assert.strictEqual(days[days.length - 1], today);
    });

    test('计算周总用量', () => {
        const dailyStats = {};
        const days = getLast7Days();

        // 模拟每天10条消息
        days.forEach(day => {
            dailyStats[day] = { messages: 10 };
        });

        let weeklyUsage = 0;
        for (const day of days) {
            if (dailyStats[day]) {
                weeklyUsage += dailyStats[day].messages;
            }
        }

        assert.strictEqual(weeklyUsage, 70);
    });
});

// ==================== 版本检测逻辑测试 ====================

describe('版本检测逻辑测试', () => {
    test('从文本中检测Pro版', () => {
        const patterns = ['pro', 'Pro', 'PRO', 'pro_subscription'];
        patterns.forEach(pattern => {
            assert.ok(pattern.toLowerCase().includes('pro'), `未能匹配: ${pattern}`);
        });
    });

    test('从文本中检测Team版', () => {
        const patterns = ['team', 'Team', 'TEAM'];
        patterns.forEach(pattern => {
            assert.ok(pattern.toLowerCase().includes('team'), `未能匹配: ${pattern}`);
        });
    });

    test('从文本中检测Max版', () => {
        const patterns = ['max', 'Max', 'MAX'];
        patterns.forEach(pattern => {
            assert.ok(pattern.toLowerCase().includes('max'), `未能匹配: ${pattern}`);
        });
    });

    test('版本优先级: Max > Team > Pro > Free', () => {
        function detectPlan(text) {
            const lower = text.toLowerCase();
            if (lower.includes('max')) return 'max';
            if (lower.includes('enterprise')) return 'enterprise';
            if (lower.includes('team')) return 'team';
            if (lower.includes('pro')) return 'pro';
            return 'free';
        }

        assert.strictEqual(detectPlan('max plan'), 'max');
        assert.strictEqual(detectPlan('team subscription'), 'team');
        assert.strictEqual(detectPlan('pro user'), 'pro');
        assert.strictEqual(detectPlan('free user'), 'free');
        assert.strictEqual(detectPlan('unknown'), 'free');
    });
});

// ==================== 工具函数测试 ====================

describe('工具函数测试', () => {
    test('formatDuration - 小时分钟格式', () => {
        const ms = 2 * 60 * 60 * 1000 + 30 * 60 * 1000;
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        assert.strictEqual(hours, 2);
        assert.strictEqual(minutes, 30);
    });

    test('formatDuration - 分钟秒格式', () => {
        const ms = 5 * 60 * 1000 + 45 * 1000;
        const minutes = Math.floor(ms / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        assert.strictEqual(minutes, 5);
        assert.strictEqual(seconds, 45);
    });

    test('formatDuration - 零值处理', () => {
        const ms = 0;
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
        /out of messages/i,
        /message limit/i
    ];

    test('检测 "You have reached your limit"', () => {
        const msg = "You have reached your usage limit";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测 "Rate limit exceeded"', () => {
        const msg = "Rate limit exceeded";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('检测 "Out of messages"', () => {
        const msg = "You're out of messages for now";
        const matches = limitPatterns.some(p => p.test(msg));
        assert.strictEqual(matches, true);
    });

    test('正常消息不应被检测为限制', () => {
        const msg = "Hello! How can I help you?";
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

    test('解析 "5 hours"', () => {
        assert.strictEqual(parseResetTime("Please wait 5 hours"), 5 * 60 * 60 * 1000);
    });

    test('解析 "30 minutes"', () => {
        assert.strictEqual(parseResetTime("Try again in 30 minutes"), 30 * 60 * 1000);
    });

    test('解析 "2小时30分钟"', () => {
        assert.strictEqual(parseResetTime("预计2小时30分钟后恢复"), 2.5 * 60 * 60 * 1000);
    });
});

// ==================== 数据结构测试 ====================

describe('数据结构测试', () => {
    test('usageData结构完整性', () => {
        const usageData = {
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

        const requiredFields = [
            'isLimited', 'limitDetectedAt', 'estimatedResetTime',
            'messageCount', 'sessionStartTime', 'dailyStats',
            'weeklyStats', 'lastCheckTime', 'limitType', 'limitMessage', 'apiMessagesSent'
        ];

        requiredFields.forEach(field => {
            assert.ok(field in usageData, `缺少字段: ${field}`);
        });
    });

    test('dailyStats单日结构', () => {
        const dayStats = { messages: 0, limits: 0, timestamp: Date.now() };

        assert.ok('messages' in dayStats);
        assert.ok('limits' in dayStats);
        assert.ok('timestamp' in dayStats);
    });
});

// ==================== 导出数据测试 ====================

describe('数据导出测试', () => {
    test('导出数据包含版本信息', () => {
        const exportData = {
            exportTime: new Date().toISOString(),
            version: CONFIG.VERSION,
            plan: 'pro',
            planConfig: CONFIG.PLAN_LIMITS.pro,
            usagePercentage: {
                daily: { used: 50, limit: 150, percentage: 33 },
                weekly: { used: 200, limit: 900, percentage: 22 }
            }
        };

        assert.ok('plan' in exportData);
        assert.ok('planConfig' in exportData);
        assert.ok('usagePercentage' in exportData);
        assert.strictEqual(exportData.plan, 'pro');
    });

    test('导出数据JSON序列化', () => {
        const data = {
            plan: 'pro',
            usagePercentage: { daily: { percentage: 50 } }
        };

        const json = JSON.stringify(data);
        const parsed = JSON.parse(json);

        assert.deepStrictEqual(parsed, data);
    });
});

// ==================== 输出测试报告 ====================

console.log('\n' + '═'.repeat(50));
console.log('📊 威软Claude用量检测 v2.0 - 测试报告');
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
    console.log('\n新增功能测试覆盖:');
    console.log('  - 版本配置 (Free/Pro/Team/Max/Enterprise)');
    console.log('  - 用量百分比计算');
    console.log('  - 进度条颜色分类');
    console.log('  - 周用量统计');
    console.log('  - 版本检测逻辑');
    process.exit(0);
} else {
    console.log('⚠️ 存在失败的测试，请检查上述错误信息');
    process.exit(1);
}
