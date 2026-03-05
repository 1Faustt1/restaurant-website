(() => {
  const API_ORIGIN = window.location.origin.includes('5500')
    ? 'http://localhost:3000'
    : window.location.origin;
  const api = (path) => `${API_ORIGIN}${path}`;

  const categoriesContainer = document.querySelector('.menu__categories');
  if (!categoriesContainer) return;

  const renderMenu = (items) => {
    categoriesContainer.innerHTML = '';
    const byCat = new Map();
    items.forEach((item) => {
      if (!byCat.has(item.category)) byCat.set(item.category, []);
      byCat.get(item.category).push(item);
    });

    byCat.forEach((list, cat) => {
      const wrap = document.createElement('div');
      wrap.className = 'menu__category';
      wrap.innerHTML = `<h4 class="menu__category-title">${cat}</h4>`;

      const ul = document.createElement('ul');
      ul.className = 'menu__category-list';

      list.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'menu__category-item';
        li.innerHTML = `
          <span class="menu__item-name">${item.name}</span>
          <span class="menu__item-weight">${item.weight || ''}</span>
          <span class="menu__item-desc">${item.description || ''}</span>
          <span class="menu__item-price">${item.price}₽</span>
          <span class="menu__item-dots"></span>
        `;
        ul.appendChild(li);
      });

      wrap.appendChild(ul);
      categoriesContainer.appendChild(wrap);
    });
  };

  const loadMenu = async () => {
    try {
      const res = await fetch(api('/api/menu'));
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.length) renderMenu(data);
    } catch (err) {
      console.warn('Не удалось загрузить меню из БД, используется статика');
    }
  };

  document.addEventListener('DOMContentLoaded', loadMenu);
})();
