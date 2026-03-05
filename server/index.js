const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);
console.log(`DB path: ${dbPath}`);
console.log(`Booting server on PORT=${PORT}, HOST=${HOST}`);

app.use(cors());
app.use(express.json());
// static assets (serve project root to avoid path issues)
app.use(express.static(path.join(__dirname, '..')));

// minimal favicon
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Helpers
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const allRows = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// Ensure table
run(
  `CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );`
).catch(console.error);

// add active column if missing
db.all('PRAGMA table_info(staff)', (err, rows) => {
  if (err || !rows) return;
  const hasActive = rows.some((c) => c.name === 'active');
  if (!hasActive) {
    run("ALTER TABLE staff ADD COLUMN active INTEGER DEFAULT 1").catch(() => {});
  }
});

run(
  `CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT DEFAULT '',
    weight TEXT DEFAULT '',
    price INTEGER NOT NULL,
    hidden INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );`
).catch(console.error);

// add sort_order if missing (safe no-op if exists)
db.get("PRAGMA table_info(menu_items)", (err, row) => {
  if (err) return;
  // naive check: try add column if not found
  db.all("PRAGMA table_info(menu_items)", (e, rows) => {
    if (e) return;
    const hasSort = rows.some((c) => c.name === 'sort_order');
    if (!hasSort) {
      run("ALTER TABLE menu_items ADD COLUMN sort_order INTEGER DEFAULT 0").catch(() => {});
    }
  });
});

// orders tables
run(
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    customer TEXT DEFAULT '',
    table_no TEXT DEFAULT '',
    status TEXT NOT NULL,
    payment TEXT DEFAULT ''
  );`
).catch(console.error);

run(
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER DEFAULT 1,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );`
).catch(console.error);

// add payment column to orders if missing (safe no-op if exists)
db.all('PRAGMA table_info(orders)', (err, rows) => {
  if (err || !rows) return;
  const hasPayment = rows.some((c) => c.name === 'payment');
  if (!hasPayment) {
    run("ALTER TABLE orders ADD COLUMN payment TEXT DEFAULT ''").catch(() => {});
  }
});

// API
app.get('/api/staff', async (req, res) => {
  try {
    const rows = await allRows('SELECT login, role, active FROM staff ORDER BY login');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/staff', async (req, res) => {
  const { login, password, role, active = 1 } = req.body || {};
  if (!login || !password || !role) return res.status(400).json({ message: 'Заполните все поля' });
  try {
    await run('INSERT INTO staff (login, password, role, active) VALUES (?, ?, ?, ?)', [
      login,
      password,
      role,
      active ? 1 : 0,
    ]);
    res.status(201).json({ login, role, active: active ? 1 : 0 });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ message: 'Логин уже существует' });
    res.status(500).json({ message: 'DB error' });
  }
});

app.put('/api/staff/:login', async (req, res) => {
  const originalLogin = req.params.login;
  const { login, password, role, active } = req.body || {};
  if (!login || !role) return res.status(400).json({ message: 'Заполните логин и роль' });
  try {
    const updates = ['login = ?', 'role = ?'];
    const params = [login, role];
    if (password) {
      updates.push('password = ?');
      params.push(password);
    }
    if (active !== undefined) {
      updates.push('active = ?');
      params.push(active ? 1 : 0);
    }
    params.push(originalLogin);
    await run(`UPDATE staff SET ${updates.join(', ')} WHERE login = ?`, params);
    res.json({ login, role, active: active !== undefined ? (active ? 1 : 0) : undefined });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ message: 'Логин уже существует' });
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/staff/:login', async (req, res) => {
  const login = req.params.login;
  try {
    await run('DELETE FROM staff WHERE login = ?', [login]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ message: 'Введите логин и пароль' });
  try {
    const rows = await allRows(
      'SELECT login, role, active FROM staff WHERE login = ? AND password = ? LIMIT 1',
      [login, password]
    );
    if (!rows.length) return res.status(401).json({ message: 'Неверный логин или пароль' });
    if (!rows[0].active) return res.status(403).json({ message: 'Аккаунт деактивирован. Обратитесь к владельцу.' });
    res.json({ login: rows[0].login, role: rows[0].role });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// Menu API
app.get('/api/menu', async (req, res) => {
  const all = req.query.all === '1';
  try {
    const rows = all
      ? await allRows('SELECT * FROM menu_items ORDER BY category, sort_order, id')
      : await allRows('SELECT * FROM menu_items WHERE hidden = 0 ORDER BY category, sort_order, id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.post('/api/menu', async (req, res) => {
  const { name, category, description = '', weight = '', price, hidden = 0 } = req.body || {};
  if (!name || !category || price === undefined) return res.status(400).json({ message: 'Заполните обязательные поля' });
  try {
    const maxRow = await allRows('SELECT MAX(sort_order) as m FROM menu_items WHERE category = ?', [category]);
    const nextOrder = (maxRow[0]?.m || 0) + 1;
    await run(
      'INSERT INTO menu_items (name, category, description, weight, price, hidden, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
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
    await run(
      'UPDATE menu_items SET name = ?, category = ?, description = ?, weight = ?, price = ?, hidden = COALESCE(?, hidden) WHERE id = ?',
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
    await run('UPDATE menu_items SET hidden = ? WHERE id = ?', [hidden ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.patch('/api/menu/:id/move', async (req, res) => {
  const id = req.params.id;
  const { direction } = req.body || {}; // 'up' | 'down'
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ message: 'Неверное направление' });
  try {
    const rows = await allRows('SELECT id, category, sort_order FROM menu_items WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Не найдено' });
    const item = rows[0];
    const neighbor = await allRows(
      `SELECT id, sort_order FROM menu_items WHERE category = ? AND sort_order ${direction === 'up' ? '<' : '>'} ? ORDER BY sort_order ${
        direction === 'up' ? 'DESC' : 'ASC'
      } LIMIT 1`,
      [item.category, item.sort_order]
    );
    if (!neighbor.length) return res.json({ ok: true }); // nothing to swap
    const nb = neighbor[0];
    await run('UPDATE menu_items SET sort_order = ? WHERE id = ?', [nb.sort_order, item.id]);
    await run('UPDATE menu_items SET sort_order = ? WHERE id = ?', [item.sort_order, nb.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await run('DELETE FROM menu_items WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// Orders API
const buildOrderDto = async (rows) => {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const items = await allRows(
    `SELECT order_id, name, price, qty FROM order_items WHERE order_id IN (${ids
      .map(() => '?')
      .join(',')})`,
    ids
  );
  return rows.map((o) => ({
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

app.get('/api/orders', async (_req, res) => {
  try {
    const rows = await allRows('SELECT * FROM orders ORDER BY id DESC LIMIT 50');
    const dto = await buildOrderDto(rows);
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
  try {
    const result = await run(
      'INSERT INTO orders (code, created_at, customer, table_no, status, payment) VALUES (?, ?, ?, ?, ?, ?)',
      [code, created, customer, table_no, status, payment]
    );
    const orderId = result.lastID;
    for (const it of items) {
      await run('INSERT INTO order_items (order_id, name, price, qty) VALUES (?, ?, ?, ?)', [
        orderId,
        it.name,
        it.price,
        it.qty || 1,
      ]);
    }
    const dto = await buildOrderDto([{ id: orderId, code, created_at: created, customer, table_no, status }]);
    res.status(201).json(dto[0]);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// public lookup by code (for гостей)
app.get('/api/orders/code/:code', async (req, res) => {
  const code = decodeURIComponent(req.params.code || '').trim();
  if (!code) return res.status(400).json({ message: 'Укажите код' });
  try {
    const rows = await allRows('SELECT * FROM orders WHERE code = ? LIMIT 1', [code]);
    const dto = await buildOrderDto(rows);
    if (!dto.length) return res.status(404).json({ message: 'Не найдено' });
    res.json(dto[0]);
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: 'Укажите статус' });
  try {
    await run('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await run('DELETE FROM orders WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

// Stats API
app.get('/api/stats', async (_req, res) => {
  try {
    const ordersCountRow = await allRows('SELECT COUNT(*) as cnt FROM orders');
    const revenueRow = await allRows(
      `SELECT COALESCE(SUM(oi.price * oi.qty), 0) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'closed'`
    );
    const menuCountRow = await allRows('SELECT COUNT(*) as cnt FROM menu_items WHERE hidden = 0');

    const series = await allRows(
      `SELECT date(o.created_at) as day,
              COALESCE(SUM(oi.price * oi.qty), 0) as revenue,
              COUNT(DISTINCT o.id) as orders
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE date(o.created_at) >= date('now', '-13 day')
       GROUP BY day
       ORDER BY day ASC`
    );

    res.json({
      ordersCount: ordersCountRow?.[0]?.cnt || 0,
      revenueClosed: revenueRow?.[0]?.revenue || 0,
      menuCount: menuCountRow?.[0]?.cnt || 0,
      series,
    });
  } catch (err) {
    res.status(500).json({ message: 'DB error' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
