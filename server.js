require('dotenv').config();
const express = require('express');
const pool = require('./db/pool');

const app = express();
app.use(express.json());

// 健康检查
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 用户登录/注册（小程序端用 code 换 openid 后调用）
app.post('/api/user/login', async (req, res) => {
  const { openid, nickname, avatar_url } = req.body;
  if (!openid) return res.status(400).json({ error: 'openid required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (openid, nickname, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (openid) DO UPDATE SET
         nickname   = COALESCE(NULLIF($2,''), users.nickname),
         avatar_url = COALESCE(NULLIF($3,''), users.avatar_url),
         updated_at = NOW()
       RETURNING id, openid, nickname, avatar_url, merit, current_skin`,
      [openid, nickname || '', avatar_url || '']
    );
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 同步功德（客户端批量上报增量）
app.post('/api/merit/sync', async (req, res) => {
  const { openid, delta, client_ts } = req.body;
  if (!openid || !delta) return res.status(400).json({ error: 'openid and delta required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO merit_logs (openid, delta, client_ts) VALUES ($1, $2, $3)`,
      [openid, delta, client_ts || Date.now()]
    );
    const { rows } = await client.query(
      `UPDATE users SET merit = merit + $1, updated_at = NOW()
       WHERE openid = $2 RETURNING merit`,
      [delta, openid]
    );
    await client.query('COMMIT');
    res.json({ merit: rows[0]?.merit ?? 0 });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// 排行榜（取前50）
app.get('/api/rank', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT openid, nickname, avatar_url, merit
       FROM users ORDER BY merit DESC LIMIT 50`
    );
    res.json({ list: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 皮肤列表
app.get('/api/skins', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM skins ORDER BY sort_order');
    res.json({ list: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 切换皮肤
app.post('/api/user/skin', async (req, res) => {
  const { openid, skin_id } = req.body;
  if (!openid || !skin_id) return res.status(400).json({ error: 'openid and skin_id required' });

  try {
    await pool.query(
      `UPDATE users SET current_skin = $1, updated_at = NOW() WHERE openid = $2`,
      [skin_id, openid]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`server running on :${PORT}`));
