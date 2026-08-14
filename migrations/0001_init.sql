-- 开源雷达 StarRadar · 初始化迁移（权威 schema 见本文件，变更须新增编号迁移）
-- 对齐 docs/ARCHITECTURE.md §5 数据模型

-- 项目表：每日抓取快照，(date, repo) 同日去重
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- 抓取日（北京时区 YYYY-MM-DD）
    run_hour TEXT NOT NULL,           -- 抓取批次（05）
    rank INTEGER,                     -- 当日排名
    repo TEXT NOT NULL,               -- owner/repo 全名
    description TEXT,
    language TEXT,
    stars_total INTEGER DEFAULT 0,    -- 抓取时刻总星数
    url TEXT,
    detail_json TEXT,                 -- AI 生成的 6 维度详解 JSON
    detail_status TEXT DEFAULT 'pending',  -- pending | generating | done | error | failed_perm
    detail_fail_count INTEGER DEFAULT 0,
    detail_trigger TEXT DEFAULT 'cron',    -- cron | manual（manual 不做超时回退）
    detail_updated_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, repo)
);
CREATE INDEX IF NOT EXISTS idx_projects_date ON projects(date);
CREATE INDEX IF NOT EXISTS idx_projects_repo ON projects(repo);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(detail_status);

-- 收藏表：跨设备同步（收藏即追踪，ADR-0003）
CREATE TABLE IF NOT EXISTS favs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL UNIQUE,
    snapshot_json TEXT,               -- 最新快照（含 latest_release）
    saved_at TEXT DEFAULT (datetime('now'))
);

-- 追踪时间序列：每个收藏仓库每天 1 行（L1）
CREATE TABLE IF NOT EXISTS star_history (
    repo TEXT NOT NULL,
    date TEXT NOT NULL,
    stars INTEGER DEFAULT 0,
    PRIMARY KEY(repo, date)
);
CREATE INDEX IF NOT EXISTS idx_star_history_repo ON star_history(repo);

-- AI 供应商：数据驱动，支持 openai-compatible / gemini-native
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,              -- 形如 p_xxxx
    name TEXT NOT NULL,               -- 自定义显示名
    type TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url TEXT NOT NULL,
    model TEXT,
    api_key TEXT DEFAULT '',          -- GET 一律脱敏
    enabled INTEGER DEFAULT 0,
    tag TEXT DEFAULT '',              -- 可选标签（免费/主力/备用）
    sort INTEGER DEFAULT 0
);

-- 杂项配置
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- cron 审计表（可观测性，PLAYBOOK 故障检测依赖它）
CREATE TABLE IF NOT EXISTS cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,          -- scrape | ai_generate | tracker_sync | catchup
    date TEXT,
    run_hour TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    items_ok INTEGER DEFAULT 0,
    items_dup INTEGER DEFAULT 0,
    items_fail INTEGER DEFAULT 0,
    ai_ok INTEGER DEFAULT 0,
    ai_fail INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',    -- running | done | error
    error_msg TEXT
);
