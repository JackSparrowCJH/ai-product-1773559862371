require('dotenv').config();
const { Client } = require('pg');

const SQL = `
-- 用户表：存储用户基本信息与功德数
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  openid        VARCHAR(64) NOT NULL UNIQUE,
  nickname      VARCHAR(128) DEFAULT '',
  avatar_url    TEXT DEFAULT '',
  merit         BIGINT DEFAULT 0,
  current_skin  VARCHAR(32) DEFAULT 'default',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 按 openid 查询用户（登录、同步功德）
CREATE INDEX IF NOT EXISTS idx_users_openid ON users (openid);

-- 按功德数降序排行
CREATE INDEX IF NOT EXISTS idx_users_merit_desc ON users (merit DESC);

-- 敲击记录表：用于数据校验与防作弊审计
CREATE TABLE IF NOT EXISTS merit_logs (
  id            BIGSERIAL PRIMARY KEY,
  openid        VARCHAR(64) NOT NULL,
  delta         INT NOT NULL,
  client_ts     BIGINT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merit_logs_openid ON merit_logs (openid);
CREATE INDEX IF NOT EXISTS idx_merit_logs_created ON merit_logs (created_at DESC);

-- 皮肤配置表
CREATE TABLE IF NOT EXISTS skins (
  id            VARCHAR(32) PRIMARY KEY,
  name          VARCHAR(64) NOT NULL,
  image_url     TEXT DEFAULT '',
  sound_url     TEXT DEFAULT '',
  sort_order    INT DEFAULT 0
);

-- 插入默认皮肤（幂等）
INSERT INTO skins (id, name, sort_order)
VALUES
  ('default',    '经典木鱼',    0),
  ('cyberpunk',  '赛博朋克',   10),
  ('crystal',    '水晶',       20)
ON CONFLICT (id) DO NOTHING;
`;

async function migrate() {
  const client = new Client({ connectionString: process.env.DB_URL });
  try {
    await client.connect();
    console.log('[migrate] connected');
    await client.query(SQL);
    console.log('[migrate] tables & indexes created');

    // 验证
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users','merit_logs','skins')
      ORDER BY table_name
    `);
    console.log('[migrate] verified tables:', rows.map(r => r.table_name));
  } catch (err) {
    console.error('[migrate] error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
