document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'shaurmechka_session';
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  const role = session.role;

  const redirectToLogin = () => {
    window.location.href = 'login.html?from=' + encodeURIComponent(window.location.pathname);
  };
  if (!role) {
    redirectToLogin();
    return;
  }

  const access = {
    'Официант': ['tab-orders', 'tab-hall', 'tab-create'],
    'Повар': ['tab-orders'],
    'Администратор': ['tab-orders', 'tab-hall', 'tab-stock', 'tab-stats', 'tab-staff', 'tab-menu', 'tab-create'],
    'Владелец': ['tab-orders', 'tab-hall', 'tab-stock', 'tab-stats', 'tab-staff', 'tab-menu', 'tab-create'],
  };

  let buttons = Array.from(document.querySelectorAll('.main__nav-btn'));
  let panels = Array.from(document.querySelectorAll('.main__panel'));
  let allowedTabs = [];

  if (role === 'Владелец') {
    allowedTabs = panels.map((p) => p.id);
  } else {
    allowedTabs = access[role] || [];
    buttons.forEach((btn) => {
      if (!allowedTabs.includes(btn.dataset.tabTarget)) btn.remove();
    });
    panels.forEach((panel) => {
      if (!allowedTabs.includes(panel.id)) panel.remove();
    });
    buttons = Array.from(document.querySelectorAll('.main__nav-btn'));
    panels = Array.from(document.querySelectorAll('.main__panel'));
    if (!buttons.length || !panels.length) {
      redirectToLogin();
      return;
    }
  }

  const activate = (id) => {
    buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.tabTarget === id));
    panels.forEach((p) => p.classList.toggle('is-active', p.id === id));
  };
  buttons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.tabTarget)));
  activate(buttons[0].dataset.tabTarget);

  // common API helper
  const origin = window.location.origin;
  const API_ORIGIN =
    !origin || origin === 'null' || origin === 'file://' || origin.includes('5500')
      ? 'http://localhost:3000'
      : origin;
  const api = (path) => `${API_ORIGIN}${path}`;

  /* ---------- STAFF ---------- */
  const staffBody = document.querySelector('[data-staff-body]');
  const staffForm = document.querySelector('[data-staff-form]');
  const staffMode = document.querySelector('[data-staff-mode]');
  const staffOriginal = document.querySelector('[data-staff-original]');
  const staffCancel = document.querySelector('[data-staff-cancel]');
  const staffReset = document.querySelector('[data-staff-reset]');
  const loginInput = document.querySelector('#staff-login');
  const roleInput = document.querySelector('#staff-role');
  const passInput = document.querySelector('#staff-password');
  const staffSubmit = staffForm?.querySelector('.staff__submit');
  const staffReadonly = role === 'Администратор';

  const StaffAPI = {
    async list() {
      const r = await fetch(api('/api/staff'));
      if (!r.ok) throw new Error('Не удалось получить список');
      return r.json();
    },
    async create(payload) {
      const r = await fetch(api('/api/staff'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json()).message || 'Ошибка создания');
    },
    async update(orig, payload) {
      const r = await fetch(api(`/api/staff/${encodeURIComponent(orig)}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json()).message || 'Ошибка сохранения');
    },
    async remove(login) {
      const r = await fetch(api(`/api/staff/${encodeURIComponent(login)}`), { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
    },
  };

  const renderStaff = async () => {
    if (!staffBody) return;
    staffBody.innerHTML = '<div class="staff__row staff__row_empty">Загрузка...</div>';
    try {
      const list = await StaffAPI.list();
      staffBody.innerHTML = '';
      if (!list.length) {
        staffBody.innerHTML = '<div class="staff__row staff__row_empty">Список сотрудников пуст</div>';
        return;
      }
      list.forEach((acc) => {
        const row = document.createElement('div');
        row.className = `staff__row ${acc.active ? '' : 'staff__row_disabled'}`;
        const actions = staffReadonly
          ? '<span class="staff__row-actions staff__row-actions_view">Только просмотр</span>'
          : `<span class="staff__row-actions">
              <button type="button" class="staff__action staff__action_edit" data-login="${acc.login}" data-role="${acc.role}" data-active="${acc.active ? 1 : 0}">Редактировать</button>
              <button type="button" class="staff__action staff__action_toggle" data-login="${acc.login}" data-role="${acc.role}" data-next="${acc.active ? 0 : 1}">${acc.active ? 'Деактивировать' : 'Активировать'}</button>
              <button type="button" class="staff__action staff__action_delete" data-login="${acc.login}">Удалить</button>
            </span>`;
        row.innerHTML = `
          <span class="staff__cell">${acc.login}</span>
          <span class="staff__cell">${acc.role}</span>
          <span class="staff__cell"><span class="staff__status ${acc.active ? 'staff__status_on' : 'staff__status_off'}">${acc.active ? 'Активен' : 'Выключен'}</span></span>
          ${actions}
        `;
        staffBody.appendChild(row);
      });
    } catch (e) {
      staffBody.innerHTML = `<div class="staff__row staff__row_empty">Ошибка загрузки: ${e.message}</div>`;
    }
  };

  const setStaffCreate = () => {
    staffMode.value = 'create';
    staffOriginal.value = '';
    staffSubmit.textContent = 'Создать';
    staffForm.reset();
    if (passInput) passInput.value = '';
    if (staffSubmit) staffSubmit.dataset.active = 1;
  };

  const setStaffEdit = (login, roleVal, activeVal = 1) => {
    staffMode.value = 'edit';
    staffOriginal.value = login;
    loginInput.value = login;
    roleInput.value = roleVal;
    if (passInput) passInput.value = '';
    staffSubmit.textContent = 'Сохранить';
    staffSubmit.dataset.active = activeVal ? 1 : 0;
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (staffReadonly) return;
    const mode = staffMode.value;
    const login = loginInput.value.trim();
    const r = roleInput.value;
    const p = passInput.value.trim();
    if (!login || !r) return;
    if (mode === 'create' && !p) return;
    try {
      if (mode === 'create') await StaffAPI.create({ login, role: r, password: p, active: 1 });
      else {
        const payload = { login, role: r, active: staffSubmit.dataset.active ? Number(staffSubmit.dataset.active) : 1 };
        if (p) payload.password = p;
        await StaffAPI.update(staffOriginal.value, payload);
      }
      await renderStaff();
      setStaffCreate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStaffClick = async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || staffReadonly) return;
    if (t.classList.contains('staff__action_edit')) {
      setStaffEdit(t.dataset.login, t.dataset.role, Number(t.dataset.active));
    }
    if (t.classList.contains('staff__action_toggle')) {
      const login = t.dataset.login;
      const next = Number(t.dataset.next) === 1;
      const roleVal = t.dataset.role;
      if (!login) return;
      try {
        await StaffAPI.update(login, { login, role: roleVal || 'Сотрудник', active: next });
        await renderStaff();
      } catch (err) {
        alert(err.message);
      }
    }
    if (t.classList.contains('staff__action_delete')) {
      const login = t.dataset.login;
      if (!login) return;
      if (!confirm(`Удалить аккаунт ${login}?`)) return;
      try {
        await StaffAPI.remove(login);
        await renderStaff();
        setStaffCreate();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const initStaff = () => {
    if (!staffBody || !staffForm) return;
    renderStaff();
    if (!staffReadonly) {
      staffForm.addEventListener('submit', handleStaffSubmit);
      staffBody.addEventListener('click', handleStaffClick);
      staffCancel?.addEventListener('click', setStaffCreate);
      staffReset?.addEventListener('click', () => {
        renderStaff();
        setStaffCreate();
      });
    } else {
      staffForm.style.display = 'none';
    }
  };

  if (allowedTabs.includes('tab-staff') || role === 'Владелец') initStaff();

  /* ---------- MENU ---------- */
  const canManageMenu = role === 'Администратор' || role === 'Владелец';
  const canDeleteMenu = role === 'Владелец';

  const menuBody = document.querySelector('[data-menu-body]');
  const menuForm = document.querySelector('[data-menu-form]');
  const menuMode = document.querySelector('[data-menu-mode]');
  const menuId = document.querySelector('[data-menu-id]');
  const menuName = document.querySelector('#menu-name');
  const menuCategory = document.querySelector('#menu-category');
  const menuWeight = document.querySelector('#menu-weight');
  const menuPrice = document.querySelector('#menu-price');
  const menuDesc = document.querySelector('#menu-desc');
  const menuHidden = document.querySelector('[data-menu-hidden]');
  const menuCategoriesOptions = document.querySelector('#menu-categories-options');
  const menuCancel = document.querySelector('[data-menu-cancel]');
  const menuRefresh = document.querySelector('[data-menu-refresh]');
  const menuSubmit = menuForm?.querySelector('.menu-admin__submit');

  const MenuAPI = {
    async list() {
      const r = await fetch(api(`/api/menu${canManageMenu ? '?all=1' : ''}`));
      if (!r.ok) throw new Error('Не удалось загрузить меню');
      return r.json();
    },
    async create(payload) {
      const r = await fetch(api('/api/menu'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json()).message || 'Ошибка создания');
    },
    async update(id, payload) {
      const r = await fetch(api(`/api/menu/${id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json()).message || 'Ошибка сохранения');
    },
    async hide(id, hidden) {
      const r = await fetch(api(`/api/menu/${id}/hide`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) });
      if (!r.ok) throw new Error('Ошибка изменения видимости');
    },
    async remove(id) {
      const r = await fetch(api(`/api/menu/${id}`), { method: 'DELETE' });
      if (!r.ok) throw new Error('Ошибка удаления');
    },
  };

  const renderMenu = async () => {
    if (!menuBody) return;
    menuBody.innerHTML = '<div class="menu-admin__row menu-admin__row_empty">Загрузка...</div>';
    try {
      const items = await MenuAPI.list();
      menuBody.innerHTML = '';
      if (!items.length) {
        menuBody.innerHTML = '<div class="menu-admin__row menu-admin__row_empty">Пусто</div>';
        return;
      }
      if (menuCategoriesOptions) {
        const cats = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
        menuCategoriesOptions.innerHTML = cats.map((c) => `<option value="${c}">`).join('');
      }
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'menu-admin__row';
        row.innerHTML = `
          <span class="menu-admin__cell">${item.name}</span>
          <span class="menu-admin__cell">${item.category}</span>
          <span class="menu-admin__cell">${item.price}₽</span>
          <span class="menu-admin__cell">${item.weight || '-'}</span>
          <span class="menu-admin__cell">${item.hidden ? 'Скрыто' : 'Активно'}</span>
          <span class="menu-admin__row-actions">
            ${canManageMenu ? `<button type="button" class="menu-admin__action menu-admin__action_edit" data-id="${item.id}" data-name="${item.name}" data-category="${item.category}" data-price="${item.price}" data-weight="${item.weight || ''}" data-description="${item.description || ''}" data-hidden="${item.hidden ? 1 : 0}">Редактировать</button>` : ''}
            ${canManageMenu ? `<button type="button" class="menu-admin__action menu-admin__action_hide" data-id="${item.id}" data-hidden="${item.hidden ? 0 : 1}">${item.hidden ? 'Показать' : 'Скрыть'}</button>` : ''}
            ${canDeleteMenu ? `<button type="button" class="menu-admin__action menu-admin__action_delete" data-id="${item.id}">Удалить</button>` : ''}
          </span>
        `;
        menuBody.appendChild(row);
      });
    } catch (e) {
      menuBody.innerHTML = `<div class="menu-admin__row menu-admin__row_empty">Ошибка: ${e.message}</div>`;
    }
    loadStats();
  };

  const resetMenuForm = () => {
    menuMode.value = 'create';
    menuId.value = '';
    menuName.value = '';
    menuCategory.value = '';
    menuWeight.value = '';
    menuPrice.value = '';
    menuDesc.value = '';
    menuHidden.checked = false;
    menuSubmit.textContent = 'Создать';
  };

  const handleMenuSubmit = async (e) => {
    e.preventDefault();
    if (!canManageMenu) return;
    const payload = {
      name: menuName.value.trim(),
      category: menuCategory.value.trim(),
      weight: menuWeight.value.trim(),
      description: menuDesc.value.trim(),
      price: Number(menuPrice.value),
      hidden: menuHidden.checked,
    };
    if (!payload.name || !payload.category || Number.isNaN(payload.price)) return;
    try {
      if (menuMode.value === 'create') await MenuAPI.create(payload);
      else await MenuAPI.update(menuId.value, payload);
      await renderMenu();
      resetMenuForm();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMenuClick = async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.dataset.id;
    if (!id) return;
    if (t.classList.contains('menu-admin__action_edit')) {
      menuMode.value = 'edit';
      menuId.value = id;
      menuName.value = t.dataset.name || '';
      menuCategory.value = t.dataset.category || '';
      menuPrice.value = t.dataset.price || '';
      menuWeight.value = t.dataset.weight || '';
      menuDesc.value = t.dataset.description || '';
      menuHidden.checked = t.dataset.hidden === '1';
      menuSubmit.textContent = 'Сохранить';
    }
    if (t.classList.contains('menu-admin__action_hide')) {
      const hidden = Number(t.dataset.hidden) === 1;
      try {
        await MenuAPI.hide(id, hidden);
        await renderMenu();
      } catch (err) {
        alert(err.message);
      }
    }
    if (t.classList.contains('menu-admin__action_delete')) {
      if (!canDeleteMenu) return;
      if (!confirm('Удалить позицию?')) return;
      try {
        await MenuAPI.remove(id);
        await renderMenu();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const initMenu = () => {
    if (!menuBody || !menuForm || !canManageMenu) return;
    renderMenu();
    menuForm.addEventListener('submit', handleMenuSubmit);
    menuBody.addEventListener('click', handleMenuClick);
    menuCancel?.addEventListener('click', resetMenuForm);
    menuRefresh?.addEventListener('click', renderMenu);
  };

  /* ---------- СТАТИСТИКА ---------- */
  const statsOrdersEl = document.querySelector('[data-stats-orders]');
  const statsRevenueEl = document.querySelector('[data-stats-revenue]');
  const statsMenuEl = document.querySelector('[data-stats-menu]');
  const statsBars = document.querySelector('[data-stats-bars]');
  const statsList = document.querySelector('[data-stats-list]');

  const formatNumber = (n) => Number(n || 0).toLocaleString('ru-RU');
  const formatMoney = (n) => `${Number(n || 0).toLocaleString('ru-RU')}₽`;
  const formatMoneyShort = (n) => {
    const v = Number(n || 0);
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}м₽`;
    if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k₽`;
    return `${v}₽`;
  };

  const renderStats = (data) => {
    if (!data) return;
    if (statsOrdersEl) statsOrdersEl.textContent = formatNumber(data.ordersCount);
    if (statsRevenueEl) statsRevenueEl.textContent = formatMoney(data.revenueClosed);
    if (statsMenuEl) statsMenuEl.textContent = formatNumber(data.menuCount);

    if (statsBars) {
      statsBars.innerHTML = '';
      const series = data.series || [];
      const max = Math.max(...series.map((s) => Number(s.revenue || 0)), 0) || 1;
      series.forEach((s) => {
        const bar = document.createElement('div');
        bar.className = 'stats-admin__bar';
        const h = Math.round((s.revenue / max) * 100);
        bar.style.setProperty('--bar-h', `${h}%`);
        bar.innerHTML = `
          <span class="stats-admin__bar-value" title="${formatMoney(s.revenue)}">${formatMoneyShort(s.revenue)}</span>
          <div class="stats-admin__bar-fill" title="Выручка: ${formatMoney(s.revenue)}"></div>
          <span class="stats-admin__bar-label">${(s.day || '').slice(5)}</span>
          <span class="stats-admin__bar-orders">${formatNumber(s.orders)} зак.</span>
        `;
        statsBars.appendChild(bar);
      });
    }

    if (statsList) {
      statsList.innerHTML = '';
      (data.series || []).forEach((s) => {
        const row = document.createElement('div');
        row.className = 'stats-admin__row';
        row.innerHTML = `
          <span>${s.day}</span>
          <span>${formatNumber(s.orders)}</span>
          <span>${formatMoney(s.revenue)}</span>
        `;
        statsList.appendChild(row);
      });
    }
  };

  const loadStats = async () => {
    if (!statsOrdersEl && !statsRevenueEl && !statsBars) return;
    try {
      const r = await fetch(api('/api/stats'));
      if (!r.ok) throw new Error('Не удалось загрузить статистику');
      const data = await r.json();
      renderStats(data);
    } catch (err) {
      // silently ignore, keep placeholder values
      console.warn(err.message);
    }
  };

  if (allowedTabs.includes('tab-stats') || role === 'Владелец') {
    loadStats();
  }

  if (role === 'Владелец' || role === 'Администратор') initMenu();

  /* ---------- ORDERS ---------- */
  const ordersBody = document.querySelector('[data-orders-body]');
  const ordersRefresh = document.querySelector('[data-orders-refresh]');
  const ordersShowClosed = document.querySelector('[data-orders-show-closed]');
  const canDeleteOrders = role === 'Владелец';
  const orderForm = document.querySelector('[data-order-form]');
  const orderTable = document.querySelector('[data-order-table]');
  const orderCustomer = document.querySelector('[data-order-customer]');
  const orderSearchInput = document.querySelector('[data-order-search]');
  const orderSuggest = document.querySelector('[data-order-suggest]');
  const orderQtyInput = document.querySelector('[data-order-qty]');
  const orderAddBtn = document.querySelector('[data-order-add]');
  const orderBasket = document.querySelector('[data-order-basket]');
  const orderTotalEl = document.querySelector('[data-order-total]');
  const orderPayInputs = document.querySelectorAll('[data-order-pay]');

  let menuCache = [];
  let basket = [];
  let selectedMenuId = null;
  let ordersCache = [];
  const statusMap = {
    waiting: { label: 'Ожидание', class: 'orders__status--waiting' },
    cooking: { label: 'Готовится', class: 'orders__status--cooking' },
    ready: { label: 'Готов', class: 'orders__status--ready' },
    closed: { label: 'Закрыт', class: 'orders__status--closed' },
  };

  const renderOrders = (list) => {
    if (!ordersBody) return;
    ordersBody.innerHTML = '';
    if (!list.length) {
      ordersBody.innerHTML = '<div class="menu-admin__row menu-admin__row_empty">Пока нет заказов</div>';
      return;
    }
    list.forEach((order) => {
      const st = statusMap[order.status] || statusMap.waiting;
      const card = document.createElement('div');
      card.className = 'orders__card';
      card.innerHTML = `
        <div class="orders__top">
          <span class="orders__number">Заказ: ${order.code}</span>
          <span class="orders__status ${st.class}">${st.label}</span>
        </div>
        <div class="orders__meta">
          <span>${(order.created_at || '').replace('T', ' ').slice(0, 16)}</span>
          <span style="text-align:right;">Стол ${order.table_no || '-'}</span>
          <span>Онлайн заказ: ${order.customer || '—'}</span>
          <span></span>
        </div>
        <div class="orders__positions-title">Позиции:</div>
        <div class="orders__positions">
          ${(order.items || [])
            .map(
              (it) => `
            <div class="orders__pos">
              <span>${it.name}${it.qty && it.qty > 1 ? ` ×${it.qty}` : ''}</span>
              <span class="orders__price">${it.price}₽</span>
            </div>
            <div class="orders__dotline"></div>
          `
            )
            .join('')}
        </div>
        <div class="orders__status-actions">
          <div class="orders__status-control">
            <button class="orders__btn" type="button" data-order-id="${order.id}" data-order-status="${order.status}" data-order-dropdown>Изменить статус</button>
            <div class="orders__dropdown" data-order-dropdown-panel>
              ${Object.entries(statusMap)
                .map(
                  ([key, val]) =>
                    `<button type="button" class="orders__dropdown-item" data-status="${key}">${val.label}</button>`
                )
                .join('')}
            </div>
          </div>
          ${canDeleteOrders ? `<button class="orders__btn orders__btn_delete" type="button" data-order-delete="${order.id}">Удалить заказ</button>` : ''}
        </div>
      `;
      ordersBody.appendChild(card);
    });
  };

  const fetchOrders = async () => {
    if (!ordersBody) return;
    ordersBody.innerHTML = '<div class="menu-admin__row menu-admin__row_empty">Загрузка...</div>';
    try {
      const r = await fetch(api('/api/orders'));
      if (!r.ok) throw new Error('Не удалось загрузить заказы');
      ordersCache = await r.json();
      const filtered = ordersShowClosed?.checked
        ? ordersCache
        : ordersCache.filter((o) => o.status !== 'closed');
      renderOrders(filtered);
      loadStats();
    } catch (e) {
      ordersBody.innerHTML = `<div class="menu-admin__row menu-admin__row_empty">Ошибка: ${e.message}</div>`;
    }
  };

  const cycleStatus = (cur) => {
    const seq = ['waiting', 'cooking', 'ready', 'closed'];
    const idx = seq.indexOf(cur);
    return seq[(idx + 1) % seq.length] || 'waiting';
  };

  const initOrders = () => {
    if (!ordersBody) return;
    fetchOrders();
    ordersRefresh?.addEventListener('click', fetchOrders);
    ordersShowClosed?.addEventListener('change', () => {
      const filtered = ordersShowClosed.checked
        ? ordersCache
        : ordersCache.filter((o) => o.status !== 'closed');
      renderOrders(filtered);
    });

    document.addEventListener('click', (e) => {
      if (!ordersBody) return;
      const panel = e.target.closest('[data-order-dropdown-panel]');
      const toggle = e.target.closest('[data-order-dropdown]');
      // close all
      ordersBody.querySelectorAll('.orders__dropdown').forEach((d) => (d.style.display = 'none'));
      if (toggle) {
        const dd = toggle.parentElement.querySelector('.orders__dropdown');
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
        e.stopPropagation();
      }
      if (panel) e.stopPropagation();
    });

    ordersBody.addEventListener('click', async (e) => {
      const item = e.target.closest('.orders__dropdown-item');
      if (!item) return;
      const card = e.target.closest('.orders__card');
      const btn = card?.querySelector('[data-order-id]');
      if (!btn) return;
      const id = btn.dataset.orderId;
      const next = item.dataset.status;
      try {
        await fetch(api(`/api/orders/${id}/status`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        fetchOrders();
      } catch (err) {
        alert('Не удалось обновить статус');
      }
    });

    if (canDeleteOrders) {
      ordersBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-order-delete]');
        if (!btn) return;
        const id = btn.dataset.orderDelete;
        if (!confirm('Удалить этот заказ?')) return;
        try {
          const r = await fetch(api(`/api/orders/${id}`), { method: 'DELETE' });
          if (!r.ok) throw new Error();
          fetchOrders();
        } catch (err) {
          alert('Не удалось удалить заказ');
        }
      });
    }
  };

  initOrders();

  /* ---------- Создать заказ ---------- */
  const renderBasket = () => {
    if (!orderBasket) return;
    orderBasket.innerHTML = '';
    if (!basket.length) {
      orderBasket.innerHTML = '<span class="orders__basket-empty">Пока нет позиций</span>';
    } else {
      basket.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'orders__basket-item';
        row.innerHTML = `
          <span>${it.name} ×${it.qty}</span>
          <span>${it.price * it.qty}₽</span>
          <button type="button" class="orders__basket-remove" data-basket-idx="${idx}">×</button>
        `;
        orderBasket.appendChild(row);
      });
    }
    const total = basket.reduce((sum, it) => sum + it.price * it.qty, 0);
    if (orderTotalEl) orderTotalEl.textContent = `${total}₽`;
  };

  const loadMenuForOrders = async () => {
    try {
      const res = await fetch(api('/api/menu'));
      if (!res.ok) throw new Error();
      menuCache = await res.json();
    } catch {
      // silent
    }
  };

  const filterSuggestions = (text) => {
    const q = text.toLowerCase();
    const arr = q ? menuCache.filter((m) => m.name.toLowerCase().includes(q)) : menuCache;
    return arr.slice(0, 10);
  };

  const renderSuggest = (text) => {
    if (!orderSuggest || !orderSearchInput) return;
    const list = filterSuggestions(text);
    if (!list.length) {
      orderSuggest.style.display = 'none';
      return;
    }
    orderSuggest.innerHTML = list
      .map(
        (m) =>
          `<div class="orders__suggest-item" data-id="${m.id}" data-name="${m.name}" data-price="${m.price}">
             <span class="orders__suggest-name">${m.name}</span><span class="orders__suggest-price">${m.price}₽</span>
           </div>`
      )
      .join('');
    orderSuggest.style.display = 'block';
  };

  const addToBasket = () => {
    const id = selectedMenuId;
    const qty = Number(orderQtyInput?.value || 1);
    if (!id || !qty || qty < 1) return;
    const item = menuCache.find((m) => String(m.id) === id);
    if (!item) return;
    const existing = basket.find((b) => b.id === item.id);
    if (existing) existing.qty += qty;
    else basket.push({ id: item.id, name: item.name, price: item.price, qty });
    renderBasket();
  };

  const removeFromBasket = (idx) => {
    basket.splice(idx, 1);
    renderBasket();
  };

  const getPayment = () => {
    const checked = Array.from(orderPayInputs).find((i) => i.checked);
    return checked ? checked.value : 'cash';
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!basket.length) {
      alert('Добавьте позиции');
      return;
    }
    const payload = {
      customer: orderCustomer?.value?.trim() || '',
      table_no: orderTable?.value?.trim() || '',
      payment: getPayment(),
      status: 'waiting',
      items: basket.map((b) => ({ name: b.name, price: b.price, qty: b.qty })),
    };
    try {
      const res = await fetch(api('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Не удалось создать заказ');
      basket = [];
      orderCustomer.value = '';
      orderTable.value = '';
      renderBasket();
      fetchOrders();
      alert('Заказ создан');
    } catch (err) {
      alert(err.message);
    }
  };

  if (orderForm) {
    loadMenuForOrders();
    renderBasket();
    orderAddBtn?.addEventListener('click', addToBasket);
    orderBasket?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-basket-idx]');
      if (!btn) return;
      removeFromBasket(Number(btn.dataset.basketIdx));
    });
    orderForm.addEventListener('submit', handleCreateOrder);

    orderSearchInput?.addEventListener('input', (e) => {
      selectedMenuId = null;
      renderSuggest(e.target.value);
    });
    orderSearchInput?.addEventListener('focus', (e) => renderSuggest(e.target.value));
    orderSuggest?.addEventListener('click', (e) => {
      const item = e.target.closest('.orders__suggest-item');
      if (!item) return;
      selectedMenuId = item.dataset.id;
      orderSearchInput.value = item.dataset.name;
      orderSuggest.style.display = 'none';
    });
    document.addEventListener('click', (e) => {
      if (!orderSuggest) return;
      if (!orderSuggest.contains(e.target) && e.target !== orderSearchInput) {
        orderSuggest.style.display = 'none';
      }
    });
  }
});
