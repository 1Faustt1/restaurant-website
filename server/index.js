const path = require('path');

// Ensure modules installed in public/node_modules are resolvable when server runs from ../server
// (Render runs build in /public, but server code lives in /server)
const extraNodeModules = path.join(__dirname, '..', 'public', 'node_modules');
if (!module.paths.includes(extraNodeModules)) {
  module.paths.push(extraNodeModules);
}

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Set it to your Neon connection string.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

const query = (sql, params = []) => pool.query(sql, params);
const rows = async (sql, params = []) => (await query(sql, params)).rows;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// --- Schema bootstrap -------------------------------------------------------
const init = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      weight TEXT DEFAULT '',
      price INTEGER NOT NULL,
      hidden INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL,
      customer TEXT DEFAULT '',
      table_no TEXT DEFAULT '',
      status TEXT NOT NULL,
      payment TEXT DEFAULT ''
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER DEFAULT 1
    );
  `);
};

init().catch((err) => console.error('DB init error', err));

// --- Helpers ----------------------------------------------------------------
const buildOrderDto = async (orders) => {
  const ids = orders.map((o) => o.id);
  if (!ids.length) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const items = await rows(
    `SELECT order_id, name, price, qty FROM order_items WHERE order_id IN (${placeholders})`,
    ids
  );
  return orders.map((o) => ({
    id: o.id,
    code: o.code,
    created_at: o.created_at,
    customer: o.customer,
    table_no: o.table_no,
    status: o.status,
    payment: o.payment,
    items: items.filter((it) => it.order_id === o.id),
  }));
};

const genCode = () => `#${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

// --- Staff ------------------------------------------------------------------
app.get('/api/staff', async (_req, res) => {
  try {
    const list = await rows('SELECT login, role, active FROM staff ORDER BY login');
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/staff', async (req, res) => {
  const { login, password, role, active = 1 } = req.body || {};
  if (!login || !password || !role) return res.status(400).json({ message: 'Заполните все поля' });
  try {
    await query('INSERT INTO staff (login, password, role, active) VALUES ($1, $2, $3, $4)', [
      login,
      password,
      role,
      active ? 1 : 0,
    ]);
    res.status(201).json({ login, role, active: active ? 1 : 0 });
  } catch (err) {
    if (err.message.includes('duplicate key')) return res.status(409).json({ message: 'Логин уже существует' });
    res.status(500).json({ message: 'DB error' });
  }
});

app.put('/api/staff/:login', async (req, res) => {
  const originalLogin = req.params.login;
  const { login, password, role, active } = req.body || {};
  if (!login || !role) return res.status(400).json({ message: 'Заполните логин и роль' });
  try {
    const updates = ['login = $1', 'role = $2'];
    const params = [login, role];
    let idx = params.length;
    if (password) {
      updates.push(`password = $${++idx}`);
      params.push(password);
    }
    if (active !== undefined) {
      updates.push(`active = $${++idx}`);
      params.push(active ? 1 : 0);
    }
    params.push(originalLogin);
    await query(`UPDATE staff SET ${updates.join(', ')} WHERE login = $${++idx}`, params);
    res.json({ login, role, active: active !== undefined ? (active ? 1 : 0) : undefined });
  } catch (err) {
    if (err.message.includes('duplicate key')) return res.status(409).json({ message: 'Логин уже существует' });
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/staff/:login', async (req, res) => {
  try {
    await query('DELETE FROM staff WHERE login = $1', [req.params.login]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ message: 'Введите логин и пароль' });
  try {
    const found = await rows(
      'SELECT login, role, active FROM staff WHERE login = $1 AND password = $2 LIMIT 1',
      [login, password]
    );
    if (!found.length) return res.status(401).json({ message: 'Неверный логин или пароль' });
    if (!found[0].active) return res.status(403).json({ message: 'Аккаунт деактивирован. Обратитесь к владельцу.' });
    res.json({ login: found[0].login, role: found[0].role });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// --- Menu -------------------------------------------------------------------
app.get('/api/menu', async (req, res) => {
  const all = req.query.all === '1';
  try {
    const list = all
      ? await rows('SELECT * FROM menu_items ORDER BY category, sort_order, id')
      : await rows('SELECT * FROM menu_items WHERE hidden = 0 ORDER BY category, sort_order, id');
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/menu', async (req, res) => {
  const { name, category, description = '', weight = '', price, hidden = 0 } = req.body || {};
  if (!name || !category || price === undefined) return res.status(400).json({ message: 'Заполните обязательные поля' });
  try {
    const maxRow = await rows('SELECT COALESCE(MAX(sort_order), 0) as m FROM menu_items WHERE category = $1', [
      category,
    ]);
    const nextOrder = (maxRow[0]?.m || 0) + 1;
    await query(
      'INSERT INTO menu_items (name, category, description, weight, price, hidden, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [name, category, description, weight, price, hidden ? 1 : 0, nextOrder]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.put('/api/menu/:id', async (req, res) => {
  const id = req.params.id;
  const { name, category, description = '', weight = '', price, hidden } = req.body || {};
  if (!name || !category || price === undefined) return res.status(400).json({ message: 'Заполните обязательные поля' });
  try {
    await query(
      'UPDATE menu_items SET name = $1, category = $2, description = $3, weight = $4, price = $5, hidden = COALESCE($6, hidden) WHERE id = $7',
      [name, category, description, weight, price, hidden !== undefined ? (hidden ? 1 : 0) : null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.patch('/api/menu/:id/hide', async (req, res) => {
  const id = req.params.id;
  const { hidden = 1 } = req.body || {};
  try {
    await query('UPDATE menu_items SET hidden = $1 WHERE id = $2', [hidden ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.patch('/api/menu/:id/move', async (req, res) => {
  const id = req.params.id;
  const { direction } = req.body || {};
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ message: 'Неверное направление' });
  try {
    const current = await rows('SELECT id, category, sort_order FROM menu_items WHERE id = $1', [id]);
    if (!current.length) return res.status(404).json({ message: 'Не найдено' });
    const item = current[0];
    const neighbor = await rows(
      `SELECT id, sort_order FROM menu_items
       WHERE category = $1 AND sort_order ${direction === 'up' ? '<' : '>'} $2
       ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1`,
      [item.category, item.sort_order]
    );
    if (!neighbor.length) return res.json({ ok: true });
    const nb = neighbor[0];
    await query('UPDATE menu_items SET sort_order = $1 WHERE id = $2', [nb.sort_order, item.id]);
    await query('UPDATE menu_items SET sort_order = $1 WHERE id = $2', [item.sort_order, nb.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// --- Orders -----------------------------------------------------------------
app.get('/api/orders', async (_req, res) => {
  try {
    const list = await rows('SELECT * FROM orders ORDER BY id DESC LIMIT 50');
    const dto = await buildOrderDto(list);
    res.json(dto);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/orders', async (req, res) => {
  const { customer = '', table_no = '', status = 'waiting', payment = 'cash', items = [] } = req.body || {};
  if (!items.length) return res.status(400).json({ message: 'Добавьте позиции' });
  const code = genCode();
  const created = new Date().toISOString();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: orderRows } = await client.query(
      'INSERT INTO orders (code, created_at, customer, table_no, status, payment) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [code, created, customer, table_no, status, payment]
    );
    const orderId = orderRows[0].id;
    for (const it of items) {
      await client.query('INSERT INTO order_items (order_id, name, price, qty) VALUES ($1, $2, $3, $4)', [
        orderId,
        it.name,
        it.price,
        it.qty || 1,
      ]);
    }
    await client.query('COMMIT');
    const dto = await buildOrderDto([{ id: orderId, code, created_at: created, customer, table_no, status, payment }]);
    res.status(201).json(dto[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'DB error' });
  } finally {
    client.release();
  }
});

app.get('/api/orders/code/:code', async (req, res) => {
  const code = decodeURIComponent(req.params.code || '').trim();
  if (!code) return res.status(400).json({ message: 'Укажите код' });
  try {
    const list = await rows('SELECT * FROM orders WHERE code = $1 LIMIT 1', [code]);
    const dto = await buildOrderDto(list);
    if (!dto.length) return res.status(404).json({ message: 'Не найдено' });
    res.json(dto[0]);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: 'Укажите статус' });
  try {
    await query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// --- Stats ------------------------------------------------------------------
app.get('/api/stats', async (_req, res) => {
  try {
    const ordersCount = await rows('SELECT COUNT(*)::int as cnt FROM orders');
    const revenue = await rows(
      `SELECT COALESCE(SUM(oi.price * oi.qty), 0)::int as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'closed'`
    );
    const menuCount = await rows('SELECT COUNT(*)::int as cnt FROM menu_items WHERE hidden = 0');
    const series = await rows(
      `SELECT DATE(o.created_at) as day,
              COALESCE(SUM(oi.price * oi.qty), 0)::int as revenue,
              COUNT(DISTINCT o.id)::int as orders
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE DATE(o.created_at) >= CURRENT_DATE - INTERVAL '13 days'
       GROUP BY day
       ORDER BY day ASC`
    );

    res.json({
      ordersCount: ordersCount?.[0]?.cnt || 0,
      revenueClosed: revenue?.[0]?.revenue || 0,
      menuCount: menuCount?.[0]?.cnt || 0,
      series,
    });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
