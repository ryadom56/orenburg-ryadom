(() => {
  const $ = id => document.getElementById(id);
  const clientReady = () => window.supabase && window.SUPABASE_URL && window.SUPABASE_PUBLISHABLE_KEY && !window.SUPABASE_URL.includes('ВСТАВЬ') && !window.SUPABASE_PUBLISHABLE_KEY.includes('ВСТАВЬ');
  const db = clientReady() ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY) : null;
  let user = null, signup = false, listings = [], favorites = new Set(), showingFavorites = false;

  $('year').textContent = new Date().getFullYear();
 const rub = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"',
  "'": '&#39;'
}[c]));
  
  const open = id => $(id).classList.add('open');
  const close = id => $(id).classList.remove('open');

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target === m) m.classList.remove('open'); }));

  function configStatus() {
    if (!db) $('status').textContent = 'Чтобы подключить общую базу, сначала заполни config.js (инструкция в README).';
  }

async function toggleFavorite(id) {
  if (!user) {
    alert('Войди в аккаунт, чтобы добавлять объявления в избранное');
    return;
  }

  const key = String(id);

  if (favorites.has(key)) {
    const { error } = await db
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', id);

    if (error) {
      alert('Ошибка удаления из избранного: ' + error.message);
      return;
    }

    favorites.delete(key);

  } else {
    const { error } = await db
      .from('favorites')
      .insert({
        user_id: user.id,
        listing_id: id
      });

    if (error) {
      alert('Ошибка добавления в избранное: ' + error.message);
      return;
    }

    favorites.add(key);
  }

  render();
}
  
  function render() {
    const q = $('search').value.trim().toLowerCase();
    const cat = $('category').value;
    const sort = $('sort').value;
    let rows = listings.filter(x =>
  (!showingFavorites || favorites.has(String(x.id))) &&
  (!cat || x.category === cat) &&
  (!q || (x.title + ' ' + (x.description || '')).toLowerCase().includes(q))
);
    if (sort === 'cheap') rows.sort((a,b) => a.price-b.price);
    else if (sort === 'expensive') rows.sort((a,b) => b.price-a.price);
    else rows.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));

    $('grid').innerHTML = rows.length ? rows.map(x => `
      <article class="item" data-id="${esc(x.id)}">
<div class="photo" style="position:relative">
${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="">` : 'Фото не добавлено'}

<button
    type="button"
    class="favorite-btn"
    data-id="${esc(x.id)}"
    style="position:absolute;top:10px;right:10px;z-index:2;background:white;border:0;border-radius:50%;width:38px;height:38px;font-size:23px;cursor:pointer;color:${favorites.has(String(x.id)) ? '#e11d48' : '#777'}"
    aria-label="Добавить в избранное"
>${favorites.has(String(x.id)) ? '♥' : '♡'}</button>
</div>
        <div class="item-body">
          <div class="price">${rub(x.price)}</div>
          <h3>${esc(x.title)}</h3>
          <div class="meta">${esc(x.category)} · Оренбург</div>
        </div>
      </article>`).join('') : `<div class="empty">${showingFavorites ? 'В избранном пока пусто ❤️ Добавь объявления, нажав на сердечко.' : 'Объявлений пока нет. Будь первым — размести своё!'}</div>`;

    $('grid').querySelectorAll('.favorite-btn').forEach(button => {
  button.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite(button.dataset.id);
  });
});

$('grid').querySelectorAll('article.item[data-id]').forEach(el => {
  el.addEventListener('click', () => showDetail(el.dataset.id));
});
    $('status').textContent = `Найдено объявлений: ${rows.length}`;
  }

  async function load() {
    if (!db) { configStatus(); render(); return; }
    const {data,error} = await db.from('listings').select('*').order('created_at', {ascending:false});
    if (error) { $('status').textContent = 'Не удалось загрузить объявления: ' + error.message; return; }
    listings = data || [];
    render();
  }

async function syncUser() {
  if (!db) {
    $('loginOpen').textContent = 'Войти';
    favorites.clear();
    return;
  }

  const { data, error } = await db.auth.getUser();

  if (error) {
    console.error('Ошибка получения пользователя:', error);
    return;
  }

  user = data.user;

  $('loginOpen').textContent = user ? 'Мой аккаунт' : 'Войти';

  favorites.clear();

  if (user) {
    const { error: profileError } = await db
      .from('profiles')
      .upsert(
        { id: user.id },
        { onConflict: 'id', ignoreDuplicates: true }
      );

    if (profileError) {
      console.error('Ошибка создания профиля:', profileError);
    }

    const { data: favoriteRows, error: favoritesError } = await db
      .from('favorites')
      .select('listing_id')
      .eq('user_id', user.id);

    if (favoritesError) {
      console.error('Ошибка загрузки избранного:', favoritesError);
    } else {
      favorites = new Set(
        (favoriteRows || []).map(item => String(item.listing_id))
      );
    }
  }

  render();
}
    
  async function openProfile() {
    await syncUser();
    if (!user) {
      signup = false;
      $('authTitle').textContent = 'Вход';
      $('toggleAuth').textContent = 'Нет аккаунта? Зарегистрироваться';
      $('authMessage').textContent = '';
      open('authModal');
      return;
    }

   const profile = document.getElementById('userProfileContent');
if (!profile) return;

    const { data: profileData, error: profileError } = await db
.from('profiles')
.select('*')
.eq('id', user.id)
.maybeSingle();

if (profileError) {
console.error('Ошибка загрузки профиля:', profileError);
}
    
    profile.innerHTML = `
  <div class="profile-card">
    <button type="button" class="x" data-profile-close>×</button>

    <div style="text-align:center;padding:20px 10px">
      ${profileData?.avatar_url
        ? `<img src="${esc(profileData.avatar_url)}" alt="Аватар"
          style="width:110px;height:110px;border-radius:50%;object-fit:cover">`
        : `<div style="width:110px;height:110px;border-radius:50%;background:#e7e9ee;margin:auto;display:flex;align-items:center;justify-content:center;font-size:42px">👤</div>`}

${profileData?.avatar_url
  ? `<button type="button" id="deleteAvatar" class="btn danger" style="margin:10px">
       Удалить аватар
     </button>`
  : ''}

      <h2>${esc(profileData?.display_name || 'Пользователь')}</h2>
      <p>${esc(profileData?.about || 'Расскажи немного о себе')}</p>
    </div>

    <div style="padding:15px;background:#f7f8fa;border-radius:12px">
     <h3>Контакты</h3>

<p><b>Email:</b> ${esc(user.email || 'Не указан')}</p>

<p><b>Телефон:</b>
  ${profileData?.phone
    ? `<a href="tel:${esc(profileData.phone)}">${esc(profileData.phone)}</a>`
    : 'Не указан'}
</p>

<p><b>Telegram:</b>
  ${profileData?.telegram
    ? `<a href="https://t.me/${encodeURIComponent(profileData.telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">Написать в Telegram</a>`
    : 'Не указан'}
</p>

<p><b>WhatsApp:</b>
  ${profileData?.whatsapp
    ? `<a href="https://wa.me/${profileData.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">Написать в WhatsApp</a>`
    : 'Не указан'}
</p>

<p><b>VK:</b>
  ${profileData?.vk
    ? `<a href="${esc(profileData.vk.startsWith('http') ? profileData.vk : 'https://' + profileData.vk)}" target="_blank" rel="noopener">Открыть страницу VK</a>`
    : 'Не указан'}
</p>
</div>

    <button type="button" id="editProfileOpen" class="btn full" style="margin:15px 0">
      Редактировать профиль
    </button>

    <div class="section-head">
      <h3>Мои объявления</h3>
      <b id="myCount">Загружаем…</b>
    </div>

    <div id="myListings"></div>

    <button type="button" id="profileLogout" class="btn light full">
      Выйти из аккаунта
    </button>
  </div>`;

    document.getElementById('userProfilePage').style.display = 'block';
document.querySelector('main.wrap').style.display = 'none';

const deleteAvatarButton = document.getElementById('deleteAvatar');

if (deleteAvatarButton) {
  deleteAvatarButton.addEventListener('click', async () => {
    if (!confirm('Удалить фотографию профиля?')) return;

    deleteAvatarButton.disabled = true;

    const marker = '/avatars/';
    const oldPath = decodeURIComponent(
      profileData.avatar_url.split(marker)[1] || ''
    );

    if (oldPath) {
      const { error: removeError } = await db.storage
        .from('avatars')
        .remove([oldPath]);

      if (removeError) {
        alert('Ошибка удаления фото: ' + removeError.message);
        deleteAvatarButton.disabled = false;
        return;
      }
    }

    const { error } = await db
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (error) {
      alert('Ошибка обновления профиля: ' + error.message);
      deleteAvatarButton.disabled = false;
      return;
    }

    $('userProfilePage').style.display = 'none';
document.querySelector('main.wrap').style.display = '';
    await openProfile();
  });
}
    
    const editButton = document.getElementById('editProfileOpen');

editButton.addEventListener('click', () => {
  let editModal = document.getElementById('editProfileModal');

  if (!editModal) {
    editModal = document.createElement('div');
    editModal.id = 'editProfileModal';
    editModal.className = 'modal';
    document.body.appendChild(editModal);
  }

  editModal.innerHTML = `
    <form class="dialog" id="editProfileForm" style="max-width:500px">
      <button type="button" class="x" id="closeEditProfile">×</button>
      <h2>Редактирование профиля</h2>

      <label>Аватар профиля
  <input
    id="profileAvatar"
    type="file"
    accept="image/jpeg,image/png,image/webp"
  >
</label>

<div id="avatarPreview" style="margin:10px 0">
  ${profileData?.avatar_url
    ? `<img src="${esc(profileData.avatar_url)}"
        style="width:100px;height:100px;border-radius:50%;object-fit:cover">`
    : ''}
</div>

      <label>Имя или псевдоним
        <input id="profileName" maxlength="50"
          value="${esc(profileData?.display_name || '')}"
          placeholder="Как тебя называть">
      </label>

      <label>Телефон
        <input id="profilePhone" type="tel"
          value="${esc(profileData?.phone || '')}"
          placeholder="+7...">
      </label>

      <label>Telegram
        <input id="profileTelegram"
          value="${esc(profileData?.telegram || '')}"
          placeholder="@username">
      </label>

      <label>WhatsApp
        <input id="profileWhatsapp"
          value="${esc(profileData?.whatsapp || '')}"
          placeholder="Номер телефона">
      </label>

      <label>VK
        <input id="profileVk"
          value="${esc(profileData?.vk || '')}"
          placeholder="Ссылка на страницу">
      </label>

      <label>О себе
        <textarea id="profileAbout" rows="4"
          placeholder="Расскажи о себе">${esc(profileData?.about || '')}</textarea>
      </label>

      <button type="submit" class="btn full">Сохранить изменения</button>
      <p id="profileEditMessage" class="message"></p>
    </form>`;

  open('editProfileModal');

  const avatarInput = document.getElementById('profileAvatar');
const avatarPreview = document.getElementById('avatarPreview');

avatarInput.addEventListener('change', () => {
  const file = avatarInput.files[0];

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Выбери изображение.');
    avatarInput.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Фото должно быть меньше 5 МБ.');
    avatarInput.value = '';
    return;
  }

  const imageUrl = URL.createObjectURL(file);

  avatarPreview.innerHTML = `
    <img src="${imageUrl}"
      style="width:100px;height:100px;border-radius:50%;object-fit:cover">
  `;
});

  document.getElementById('closeEditProfile').addEventListener('click', () => {
    close('editProfileModal');
  });

  editModal.addEventListener('click', e => {
    if (e.target === editModal) close('editProfileModal');
  });

  document.getElementById('editProfileForm').addEventListener('submit', async e => {
    e.preventDefault();

    const message = document.getElementById('profileEditMessage');
    const saveButton = e.target.querySelector('button[type="submit"]');

    saveButton.disabled = true;
    message.textContent = 'Сохраняем...';

const avatarFile = document.getElementById('profileAvatar').files[0];

let avatarUrl = profileData?.avatar_url || null;

if (avatarFile) {
  if (avatarFile.size > 5 * 1024 * 1024) {
    message.textContent = 'Фото должно быть меньше 5 МБ.';
    saveButton.disabled = false;
    return;
  }

  const extension = avatarFile.name.split('.').pop().toLowerCase();
  const filePath = `${user.id}/avatar-${Date.now()}.${extension}`;
console.log('USER ID:', user.id);
console.log('AVATAR PATH:', filePath);

const { data: sessionData } = await db.auth.getSession();

console.log('SESSION USER:', sessionData.session?.user?.id);
console.log('CURRENT USER:', user?.id);
console.log('SESSION EXISTS:', !!sessionData.session);
  
  const { error: uploadError } = await db.storage
    .from('avatars')
    .upload(filePath, avatarFile, {
  upsert: false,
  contentType: avatarFile.type
});

  if (uploadError) {
    message.textContent = 'Ошибка загрузки фото: ' + uploadError.message;
    saveButton.disabled = false;
    return;
  }

  const { data: publicData } = db.storage
    .from('avatars')
    .getPublicUrl(filePath);

  avatarUrl = publicData.publicUrl;
}
    
    const updates = {
  avatar_url: avatarUrl,
      display_name: document.getElementById('profileName').value.trim(),
      phone: document.getElementById('profilePhone').value.trim(),
      telegram: document.getElementById('profileTelegram').value.trim(),
      whatsapp: document.getElementById('profileWhatsapp').value.trim(),
      vk: document.getElementById('profileVk').value.trim(),
      about: document.getElementById('profileAbout').value.trim(),
      updated_at: new Date().toISOString()
    };

    const { error } = await db
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    saveButton.disabled = false;

    if (error) {
      message.textContent = 'Ошибка: ' + error.message;
      return;
    }

if (avatarFile && profileData?.avatar_url) {
  const marker = '/avatars/';
  const oldPath = decodeURIComponent(
    profileData.avatar_url.split(marker)[1] || ''
  );

  if (oldPath) {
    const { error: removeError } = await db.storage
      .from('avatars')
      .remove([oldPath]);

    if (removeError) {
      console.warn('Не удалось удалить старый аватар:', removeError);
    }
  }
}
    
    close('editProfileModal');
    $('userProfilePage').style.display = 'none';
document.querySelector('main.wrap').style.display = '';
    await openProfile();
  });
});

    const list = $('myListings');
    list.innerHTML = '<p>Загружаем объявления…</p>';

    const {data,error} = await db.from('listings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', {ascending:false});

    if (error) {
      list.innerHTML = `<p class="message">Не удалось загрузить объявления: ${esc(error.message)}</p>`;
      $('myCount').textContent = '';
      return;
    }

    const mine = data || [];
    $('myCount').textContent = `Всего: ${mine.length}`;

    list.innerHTML = mine.length ? mine.map(x => `
      <div class="item" style="margin:12px 0;padding:12px">
        <div style="display:flex;gap:12px;align-items:center">
          ${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="" style="width:90px;height:75px;object-fit:cover;border-radius:8px">` : ''}
          <div style="min-width:0">
            <b>${esc(x.title)}</b>
            <p class="price">${rub(x.price)}</p>
            <p class="meta">${esc(x.category)}</p>
          </div>
        </div>
       <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
<button class="btn light" data-view="${esc(x.id)}">Посмотреть</button>
<button class="btn light" data-edit="${esc(x.id)}">Редактировать</button>
<button class="btn danger" data-delete="${esc(x.id)}">Удалить</button>
</div>
      </div>`).join('') : '<p>У тебя пока нет объявлений.</p>';

    list.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
  const id = btn.dataset.view;
  $('userProfilePage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
  showDetail(id);
}));

   list.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
  const x = mine.find(a => String(a.id) === String(btn.dataset.edit));
  if (!x) return;

  document.getElementById('editListingModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'editListingModal';
  modal.className = 'modal open';

  modal.innerHTML = `
    <div class="dialog edit-dialog">
      <button type="button" class="x" id="editClose">&times;</button>
      <h2>Редактирование объявления</h2>
      <p class="edit-hint">Измени только те поля, которые хочешь обновить.</p>

      <form id="editListingForm">
        <label>
          Название объявления
          <input id="editTitle" required>
        </label>

        <label>
          Цена в рублях
          <input id="editPrice" type="number" min="0" step="any" required>
        </label>

        <label>
          Категория
          <select id="editCategory" required>
            <option value="">Выберите категорию</option>
            <option>Авто и запчасти</option>
            <option>Недвижимость</option>
            <option>Электроника</option>
            <option>Одежда и обувь</option>
            <option>Дом и ремонт</option>
            <option>Работа</option>
            <option>Услуги</option>
            <option>Животные</option>
            <option>Разное</option>
          </select>
        </label>

        <label>
          Описание
          <textarea id="editDescription"></textarea>
        </label>

        <label>
          Контакт для связи
          <input id="editContact">
        </label>
<label>
  Новая фотография
  <input id="editPhoto" type="file" accept="image/*">
</label>

        <div class="edit-actions">
          <button type="button" class="btn light" id="editCancel">Отмена</button>
          <button type="submit" class="btn primary">Сохранить изменения</button>
        </div>

        <div class="edit-status" id="editStatus"></div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const byId = id => modal.querySelector('#' + id);

  byId('editTitle').value = x.title || '';
  byId('editPrice').value = x.price ?? '';
  byId('editCategory').value = x.category || '';
  byId('editDescription').value = x.description || '';
  byId('editContact').value = x.contact || '';

  const closeEdit = () => modal.remove();

  byId('editClose').addEventListener('click', closeEdit);
  byId('editCancel').addEventListener('click', closeEdit);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeEdit();
  });

  byId('editListingForm').addEventListener('submit', async e => {
    e.preventDefault();

    const title = byId('editTitle').value.trim();
    const price = Number(byId('editPrice').value);
    const category = byId('editCategory').value;
    const description = byId('editDescription').value.trim();
    const contact = byId('editContact').value.trim();
    const status = byId('editStatus');
    let photo_url = x.photo_url || null;
const file = byId('editPhoto').files[0];

if (file) {
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = 'Фото должно быть не больше 5 МБ.';
    return;
  }

  const ext = (file.name.split('.').pop() || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const up = await db.storage
    .from('listing-photos')
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (up.error) {
    status.textContent = 'Ошибка загрузки фото: ' + up.error.message;
    return;
  }

  photo_url = db.storage
    .from('listing-photos')
    .getPublicUrl(path).data.publicUrl;
}
    const saveButton = modal.querySelector('[type="submit"]');

    if (!title || !category || !Number.isFinite(price) || price < 0) {
      status.textContent = 'Проверь название, категорию и цену.';
      return;
    }

    saveButton.disabled = true;
    status.textContent = 'Сохраняем изменения...';

   const { error } = await db.from('listings').update({
  title,
  price,
  category,
  description,
  contact,
  photo_url
}).eq('id', x.id).eq('user_id', user.id);

    if (error) {
      status.textContent = 'Ошибка: ' + error.message;
      saveButton.disabled = false;
      return;
    }

    modal.remove();
    await load();
    await openProfile();
  });
}));
    list.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.delete;
      if (!confirm('Удалить это объявление?')) return;
      const {error} = await db.from('listings').delete().eq('id', id).eq('user_id', user.id);
      if (error) { alert('Ошибка удаления: ' + error.message); return; }
      await load();
      await openProfile();
    }));

    $('profileLogout').addEventListener('click', async () => {
      if (!confirm('Выйти из аккаунта?')) return;
      const {error} = await db.auth.signOut();
      if (error) { alert(error.message); return; }
      $('userProfilePage').style.display = 'none';
document.querySelector('main.wrap').style.display = '';
      await syncUser();
    });
  }

$('profileBack').addEventListener('click', () => {
  $('userProfilePage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
});
  
  $('loginOpen').addEventListener('click', async () => {
    await syncUser();
    if (user) {
      await openProfile();
      return;
    }
    signup = false;
    $('authTitle').textContent = 'Вход';
    $('toggleAuth').textContent = 'Нет аккаунта? Зарегистрироваться';
    $('authMessage').textContent = '';
    open('authModal');
  });

  $('favoritesOpen').addEventListener('click', async () => {
  await syncUser();

  if (!user) {
    alert('Войди в аккаунт, чтобы открыть избранное');
    return;
  }

  showingFavorites = !showingFavorites;
  if (showingFavorites) {
  $('search').value = '';
  $('category').value = '';
  $('sort').value = 'new';
}

    $('listingHeading').textContent = showingFavorites
  ? 'Избранные объявления'
  : 'Свежие объявления';
    
$('heroSection').style.display = showingFavorites ? 'none' : '';

  $('favoritesOpen').textContent = showingFavorites
    ? '← Все объявления'
    : '♡ Избранное';

  $('status').textContent = showingFavorites
    ? 'Твои избранные объявления'
    : 'Свежие объявления';

  render();
});

  $('toggleAuth').addEventListener('click', () => {
    signup = !signup;
    $('authTitle').textContent = signup ? 'Регистрация' : 'Вход';
    $('toggleAuth').textContent = signup ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    $('authMessage').textContent = '';
  });

  $('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!db) { $('authMessage').textContent = 'Сначала настрой config.js.'; return; }
    const email = $('email').value;
    const password = $('password').value;
    $('authMessage').textContent = 'Подождите…';
    const result = signup
      ? await db.auth.signUp({email,password})
      : await db.auth.signInWithPassword({email,password});

    if (result.error) { $('authMessage').textContent = result.error.message; return; }
    if (signup && !result.data.session) {
      $('authMessage').textContent = 'Проверь почту и подтверди регистрацию.';
      return;
    }
    await syncUser();
    close('authModal');
  });
  $('telegramLogin').addEventListener('click', async () => {
  const msg = $('authMessage');

  if (!db) {
    msg.textContent = 'Сначала настрой config.js.';
    return;
  }

  msg.textContent = 'Переходим к авторизации Telegram...';

  const { error } = await db.auth.signInWithOAuth({
    provider: 'custom:telegram',
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) {
    msg.textContent = 'Ошибка Telegram: ' + error.message;
  }
});

  $('addOpen').addEventListener('click', async () => {
    if (!db) { alert('Сначала подключим Supabase — смотри README.'); return; }
    await syncUser();
    if (!user) { alert('Сначала войди или зарегистрируйся.'); open('authModal'); return; }
    $('listingMessage').textContent = '';
    open('listingModal');
  });

  $('listingForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!user) return;
    const msg = $('listingMessage');
    msg.textContent = 'Публикуем…';
    let photo_url = null;
    const file = $('photo').files[0];

    if (file) {
      if (file.size > 5*1024*1024) { msg.textContent = 'Фото должно быть не больше 5 МБ.'; return; }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from('listing-photos').upload(path,file,{upsert:false,contentType:file.type});
      if (up.error) { msg.textContent = 'Ошибка загрузки фото: ' + up.error.message; return; }
      photo_url = db.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
    }

    const row = {
      user_id:user.id,
      title:$('title').value.trim(),
      price:Number($('price').value),
      category:$('newCategory').value,
      description:$('description').value.trim(),
      contact:$('contact').value.trim(),
      photo_url
    };
    const {error} = await db.from('listings').insert(row);
    if (error) { msg.textContent = 'Ошибка публикации: ' + error.message; return; }
    $('listingForm').reset();
    close('listingModal');
    await load();
  });

async function openSellerProfile(userId) {
  const content = $('userProfileContent');
  content.innerHTML = '<p>Загружаем профиль продавца...</p>';

  const { data: profileData, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profileData) {
    alert('Не удалось загрузить профиль продавца.');
    return;
  }

  const { data: sellerListings, error: listingsError } = await db
    .from('listings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (listingsError) {
    alert('Не удалось загрузить объявления продавца.');
    return;
  }

  for (const item of (sellerListings || [])) {
    const index = listings.findIndex(a => String(a.id) === String(item.id));
    if (index === -1) {
      listings.push(item);
    } else {
      listings[index] = item;
    }
  }

  content.innerHTML = `
    <div class="profile-card">
      <div style="text-align:center;padding:25px 10px">
        ${profileData.avatar_url
          ? `<img src="${esc(profileData.avatar_url)}" alt="Аватар" style="width:120px;height:120px;border-radius:50%;object-fit:cover">`
          : `<div style="width:120px;height:120px;border-radius:50%;background:#e7e9ee;margin:auto;display:flex;align-items:center;justify-content:center;font-size:45px">👤</div>`}
        <h2>${esc(profileData.display_name || 'Пользователь')}</h2>
        <p>${esc(profileData.about || 'Пользователь пока ничего не рассказал о себе.')}</p>
      </div>

      <div style="padding:20px;background:#f7f8fa;border-radius:12px">
        <h3>Контакты продавца</h3>
        <p><b>Телефон:</b> ${profileData.phone ? `<a href="tel:${esc(profileData.phone)}">${esc(profileData.phone)}</a>` : 'Не указан'}</p>
        <p><b>Telegram:</b> ${profileData.telegram ? `<a href="https://t.me/${encodeURIComponent(profileData.telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">Написать в Telegram</a>` : 'Не указан'}</p>
        <p><b>WhatsApp:</b> ${profileData.whatsapp ? `<a href="https://wa.me/${profileData.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">Написать в WhatsApp</a>` : 'Не указан'}</p>
        <p><b>VK:</b> ${profileData.vk ? `<a href="${esc(profileData.vk.startsWith('http') ? profileData.vk : 'https://' + profileData.vk)}" target="_blank" rel="noopener">Открыть страницу VK</a>` : 'Не указан'}</p>
      </div>

      <div style="margin-top:25px">
        <div class="section-head">
          <h3>Объявления продавца</h3>
          <b>Всего: ${(sellerListings || []).length}</b>
        </div>

        <div>
          ${(sellerListings || []).length
            ? sellerListings.map(x => `
              <div class="item" style="margin:12px 0;padding:12px">
                <b>${esc(x.title)}</b>
                <p class="price">${rub(x.price)}</p>
                <button class="btn light" data-seller-view="${esc(x.id)}">Посмотреть объявление</button>
              </div>
            `).join('')
            : '<p>У продавца пока нет объявлений.</p>'}
        </div>
      </div>
    </div>
  `;

  $('userProfilePage').style.display = 'block';
  document.querySelector('main.wrap').style.display = 'none';

  content.querySelectorAll('[data-seller-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      showDetail(btn.dataset.sellerView);
    });
  });
}
  
  async function showDetail(id) {
    const x = listings.find(a => String(a.id) === String(id));
    if (!x) return;
    $('detail').innerHTML = `
      ${x.photo_url ? `<img class="detail-photo" src="${esc(x.photo_url)}" alt="">` : ''}
      <p class="meta">${esc(x.category)} · Оренбург</p>
      <div class="detail-price">${rub(x.price)}</div>
      <h2>${esc(x.title)}</h2>
      <p class="detail-desc">${esc(x.description)}</p>
      <p><b>Связь:</b> ${esc(x.contact)}</p>
      <button type="button" id="sellerProfileOpen" class="btn light">
  Профиль продавца
</button>
      ${user && user.id === x.user_id ? '<button id="deleteListing" class="btn danger">Удалить объявление</button>' : ''}`;

$('sellerProfileOpen').addEventListener('click', () => {
  close('detailModal');
  openSellerProfile(x.user_id);
});
    
    if ($('deleteListing')) $('deleteListing').addEventListener('click', async () => {
      if (!confirm('Удалить объявление?')) return;
      const {error} = await db.from('listings').delete().eq('id',x.id);
      if (error) { alert(error.message); return; }
      close('detailModal');
      await load();
    });
    open('detailModal');
  }

  $('searchBtn').addEventListener('click',render);
  $('search').addEventListener('keydown',e => { if(e.key === 'Enter') render(); });
  $('category').addEventListener('change',render);
  $('sort').addEventListener('change',render);

  if (db) db.auth.onAuthStateChange(() => syncUser());
  syncUser();
  load();
})();
