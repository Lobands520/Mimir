(function (global) {
  const CATEGORIES = [
    '编程与开发',
    '工作与生产力',
    '新闻与资讯',
    '娱乐与视频',
    '社交与社区',
    '生活与消费',
    '学术与教育',
    'NSFW',
    '其他'
  ];

  const DOMAIN_MAPPING = {
    '编程与开发': [
      'github.com', 'gitlab.com', 'stackoverflow.com', 'pypi.org', 'npmjs.com',
      'docs.python.org', 'developer.mozilla.org', 'go.dev', 'kaggle.com',
      'aistudio.google.com', 'ai.google.dev', 'console.cloud.google.com',
      'ollama.com', 'openwebui.com', 'cloud.google.com', 'console.aws.amazon.com',
      'vercel.com', 'netlify.com', 'heroku.com', 'docker.com'
    ],
    '工作与生产力': [
      'docs.google.com', 'drive.google.com', 'notion.so', 'miro.com',
      'trello.com', 'slack.com', 'mail.google.com', 'outlook.office.com',
      'feishu.cn', 'dingtalk.com', 'teams.microsoft.com', 'zoom.us',
      'office.com', 'sharepoint.com'
    ],
    '新闻与资讯': [
      'news.ycombinator.com', 'mp.weixin.qq.com', 'zhuanlan.zhihu.com',
      'blog.google', 'medium.com', 'theverge.com', 'bbc.com', 'cnn.com',
      'techcrunch.com', '36kr.com', 'sspai.com', 'infoq.cn'
    ],
    '娱乐与视频': [
      'bilibili.com', 'youtube.com', 'netflix.com', 'iqiyi.com',
      'youku.com', 'douyin.com', 'twitch.tv', 'tiktok.com',
      'spotify.com', 'music.163.com'
    ],
    '社交与社区': [
      'x.com', 'twitter.com', 'weibo.com', 'reddit.com', 'discord.com',
      'telegram.org', 'zhihu.com', 'v2ex.com', 'douban.com',
      'facebook.com', 'instagram.com'
    ],
    '生活与消费': [
      'amazon.com', 'taobao.com', 'tmall.com', 'jd.com', 'meituan.com',
      'ele.me', 'ctrip.com', 'booking.com', 'dianping.com', 'xiaohongshu.com',
      'pinduoduo.com', 'suning.com'
    ],
    '学术与教育': [
      'arxiv.org', 'acm.org', 'ieee.org', 'springer.com', 'nature.com',
      'science.org', 'coursera.org', 'edx.org', 'cnki.net', 'scholar.google.com',
      'researchgate.net', 'academia.edu'
    ]
  };

  const KEYWORD_MAPPING = {
    '编程与开发': ['API', 'SDK', 'Documentation', 'Docs', 'Dev', 'Repository', 'Issue', 'Pull Request', 'CLI', '云控制台', '控制台', '终端', '容器', '部署', '代码', '仓库'],
    '工作与生产力': ['文档', '表格', '幻灯片', '项目', '任务', '会议', '日报', '审批', '后台', '邮件', '协作'],
    '新闻与资讯': ['快讯', '要闻', '发布', '公告', '专栏', '博客', '评测', '长文', '新闻', '资讯'],
    '娱乐与视频': ['直播', '番剧', '电影', '综艺', '搞笑', 'MV', '预告', '视频', '音乐'],
    '社交与社区': ['讨论', '评论', '群组', '频道', '帖子', '动态', '聊天', '社区', '论坛'],
    '生活与消费': ['下单', '购物', '机票', '酒店', '餐厅', '外卖', '支付', '账单', '商品', '订单'],
    '学术与教育': ['论文', '期刊', '引用', '实验', '课程', '教程', 'Lecture', 'Syllabus', '学术', '研究']
  };

  const FILTER_PATTERNS = [
    'New tab', 'Blank', 'about:blank', '登录', 'Sign in', '正在跳转',
    '重定向', '验证码', 'auth', 'consent', 'callback', 'oauth',
    'localhost', '127.0.0.1', '192.168.', 'Just a moment'
  ];

  const EXCLUDED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://', 'edge://'];
  const EXCLUDED_TITLES = ['新标签页', 'New Tab', 'about:blank'];

  const DEFAULT_CONFIG = {
    enabled: true,
    useAIClassification: true,
    retentionDays: 30,
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    diaryModel: 'gpt-4',
    customPrompt: '',
    enableDiaryComparison: false,
    enableStreaming: true,
    customRules: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDate(value) {
    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value === 'number') {
      return new Date(value);
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00`);
    }

    return new Date(value);
  }

  function formatDateLocal(value) {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function normalizeDomain(value) {
    return String(value || '').replace(/^www\./, '').toLowerCase();
  }

  function startOfDay(dateString) {
    const date = toDate(dateString || new Date());
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function endOfDay(dateString) {
    const date = toDate(dateString || new Date());
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  function mergeConfig(storedConfig) {
    const merged = Object.assign({}, clone(DEFAULT_CONFIG), storedConfig || {});
    merged.customRules = Array.isArray(merged.customRules) ? merged.customRules : [];
    return merged;
  }

  function getBuiltInRules() {
    const rules = [];
    Object.entries(DOMAIN_MAPPING).forEach(([category, domains]) => {
      domains.forEach((domain) => {
        rules.push({ type: 'domain', value: domain, category: category });
      });
    });
    return rules;
  }

  global.MimirConfig = {
    CATEGORIES,
    DOMAIN_MAPPING,
    KEYWORD_MAPPING,
    FILTER_PATTERNS,
    EXCLUDED_URL_PREFIXES,
    EXCLUDED_TITLES,
    DEFAULT_CONFIG,
    clone,
    formatDateLocal,
    normalizeDomain,
    startOfDay,
    endOfDay,
    mergeConfig,
    getBuiltInRules
  };
})(typeof self !== 'undefined' ? self : window);
