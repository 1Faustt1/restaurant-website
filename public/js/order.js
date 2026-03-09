document.addEventListener('DOMContentLoaded', () => {
  const API_ORIGIN =
    window.API_ORIGIN ||
    (window.location.origin.includes('5500') ? 'http://localhost:3000' : window.location.origin);
  const api = (path) => `${API_ORIGIN}${path}`;

  const alertBox = document.getElementById('order-alert');
  const form = document.getElementById('order-form');
  const nameInput = document.getElementById('customer-name');
  const tableInput = document.getElementById('table-number');
  const searchInput = document.getElementById('order-search');
  const suggestBox = document.getElementById('order-suggest');
  const qtyInput = document.getElementById('order-qty');
  const addBtn = document.getElementById('order-add');
  const basketBox = document.getElementById('order-basket');
  const totalEl = document.getElementById('order-total');
  const modal = document.getElementById('order-modal');
  const modalCode = document.getElementById('order-modal-code');
  const modalClose = document.getElementById('order-modal-close');
  const statusInput = document.getElementById('order-status-code');
  const statusBtn = document.getElementById('order-status-check');
  const statusResult = document.getElementById('order-status-result');

  let menuCache = [];
  let selectedId = null;
  let basket = [];

  const showAlert = (text, type = 'info') => {
    if (!alertBox) return;
    alertBox.textContent = text;
    alertBox.className = 'order-alert';
    alertBox.style.display = 'block';
    if (type === 'success') alertBox.classList.add('order-alert_success');
    if (type === 'error') alertBox.classList.add('order-alert_error');
    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 4000);
  };

  const renderBasket = () => {
    if (!basketBox) return;
    basketBox.innerHTML = '';
    if (!basket.length) {
      basketBox.innerHTML = '<span class="order-basket__empty">Пока нет позиций</span>';
    } else {
      basket.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'order-basket__row';
        row.innerHTML = `
          <span>${it.name} ×${it.qty}</span>
          <span>${it.price * it.qty}₽</span>
          <button class="order-basket__remove" data-basket="${idx}">Удалить</button>
        `;
        basketBox.appendChild(row);
      });
    }
    const total = basket.reduce((s, it) => s + it.price * it.qty, 0);
    if (totalEl) totalEl.textContent = `${total}₽`;
  };

  const filterMenu = (text) => {
    const q = (text || '').toLowerCase();
    return q ? menuCache.filter((m) => m.name.toLowerCase().includes(q)) : menuCache.slice(0, 10);
  };

  const renderSuggest = (text) => {
    if (!suggestBox) return;
    const list = filterMenu(text).slice(0, 12);
    if (!list.length) {
      suggestBox.style.display = 'none';
      return;
    }
    suggestBox.innerHTML = list
      .map(
        (m) =>
          `<div class="order-picker__item" data-id="${m.id}" data-name="${m.name}" data-price="${m.price}">
            <span>${m.name}</span><span>${m.price}₽</span>
          </div>`
      )
      .join('');
    suggestBox.style.display = 'block';
  };

  const addToBasket = () => {
    const qty = Number(qtyInput?.value || 1);
    if (!selectedId || !qty || qty < 1) return;
    const item = menuCache.find((m) => String(m.id) === String(selectedId));
    if (!item) return;
    const existing = basket.find((b) => b.id === item.id);
    if (existing) existing.qty += qty;
    else basket.push({ id: item.id, name: item.name, price: item.price, qty });
    renderBasket();
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!basket.length) {
      showAlert('Добавьте хотя бы одну позицию', 'error');
      return;
    }
    const pay = form.querySelector('input[name="pay"]:checked')?.value || 'cash';
    const payload = {
      customer: nameInput?.value?.trim() || '',
      table_no: tableInput?.value?.trim() || '',
      payment: pay,
      status: 'waiting',
      items: basket.map((b) => ({ name: b.name, price: b.price, qty: b.qty })),
    };
    try {
      const res = await fetch(api('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const code = data?.code || data?.[0]?.code || '—';

      basket = [];
      form.reset();
      renderBasket();
      showAlert('Заказ отправлен! Мы подтвердим его на кассе.', 'success');
      if (modal && modalCode) {
        modalCode.textContent = code;
        modal.style.display = 'flex';
      }
      if (statusInput) {
        statusInput.value = code;
        localStorage.setItem('last_order_code', code);
      }
    } catch (err) {
      showAlert('Не удалось отправить заказ. Попробуйте позже.', 'error');
    }
  };

  const statusBadge = (status) => {
    const map = {
      waiting: { text: 'Ожидание', cls: 'badge-waiting' },
      cooking: { text: 'Готовится', cls: 'badge-cooking' },
      ready: { text: 'Готов', cls: 'badge-ready' },
      closed: { text: 'Закрыт', cls: 'badge-closed' },
    };
    return map[status] || { text: status, cls: '' };
  };

  const checkStatus = async () => {
    const code = statusInput?.value?.trim();
    if (!code) return;
    statusResult.textContent = 'Проверяем...';
    try {
      const res = await fetch(api(`/api/orders/code/${encodeURIComponent(code)}`));
      if (!res.ok) throw new Error('notfound');
      const data = await res.json();
      const badge = statusBadge(data.status);
      const items = (data.items || [])
        .map(
          (it) =>
            `<div class="order-status__item"><span>${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}</span><span>${it.price * it.qty}₽</span></div>`
        )
        .join('');
      statusResult.innerHTML = `
        <div class="order-status__panel">
          <div class="order-status__row order-status__row_split">
            <div>
              <div class="order-status__label">Код</div>
              <div class="order-status__value">${data.code}</div>
            </div>
            <div>
              <div class="order-status__label">Статус</div>
              <div class="order-status__badge ${badge.cls}">${badge.text}</div>
            </div>
          </div>
          <div class="order-status__row order-status__row_split">
            <div>
              <div class="order-status__label">Стол / выдача</div>
              <div class="order-status__value">${data.table_no || '—'}</div>
            </div>
            <div>
              <div class="order-status__label">Создан</div>
              <div class="order-status__value">${(data.created_at || '').replace('T',' ').slice(0,16)}</div>
            </div>
          </div>
          <div class="order-status__items">
            <div class="order-status__items-title">Позиции</div>
            ${items || '<div class="order-status__empty">Без позиций</div>'}
          </div>
        </div>
      `;
    } catch (err) {
      statusResult.textContent = 'Заказ не найден. Проверьте код.';
    }
  };

  // load menu
  (async () => {
    try {
      const r = await fetch(api('/api/menu'));
      if (!r.ok) throw new Error();
      menuCache = await r.json();
    } catch (err) {
      showAlert('Не удалось загрузить меню, попробуйте обновить страницу.', 'error');
    }
  })();

  addBtn?.addEventListener('click', addToBasket);
  basketBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-basket]');
    if (!btn) return;
    basket.splice(Number(btn.dataset.basket), 1);
    renderBasket();
  });
  form?.addEventListener('submit', submitOrder);

  searchInput?.addEventListener('input', (e) => {
    selectedId = null;
    renderSuggest(e.target.value);
  });
  searchInput?.addEventListener('focus', (e) => renderSuggest(e.target.value));
  suggestBox?.addEventListener('click', (e) => {
    const item = e.target.closest('.order-picker__item');
    if (!item) return;
    selectedId = item.dataset.id;
    searchInput.value = item.dataset.name || '';
    suggestBox.style.display = 'none';
  });
  document.addEventListener('click', (e) => {
    if (!suggestBox) return;
    if (!suggestBox.contains(e.target) && e.target !== searchInput) {
      suggestBox.style.display = 'none';
    }
  });

  modalClose?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  statusBtn?.addEventListener('click', checkStatus);
  statusInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checkStatus();
    }
  });

  // автозагрузка последнего кода
  const lastCode = localStorage.getItem('last_order_code');
  if (lastCode && statusInput) {
    statusInput.value = lastCode;
  }

  renderBasket();
});
