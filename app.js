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
    x.status === 'approved' &&
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
    </article>
  `).join('') : `<div class="empty">${showingFavorites ? 'В избранном пока пусто ❤️ Добавь объявления, нажав на сердечко.' : 'Объявлений пока нет. Будь первым — размести своё!'}</div>`;

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
  const accountButton = $('loginOpen');
  const moderationButton = $('moderationOpen');

  if (moderationButton) {
    moderationButton.style.display = 'none';
  }

  if (!db) {
    accountButton.innerHTML = 'Войти';
    accountButton.title = 'Войти';
    favorites.clear();
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error('Ошибка получения сессии:', error);
    return;
  }

  user = data.session?.user || null;
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

    const { data: profileData } = await db
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    accountButton.innerHTML = profileData?.avatar_url
      ? `<img src="${esc(profileData.avatar_url)}" alt="Мой профиль">`
      : '👤';

    accountButton.title = 'Мой профиль';

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

    const { data: adminStatus, error: adminError } = await db.rpc('is_listing_admin');

    if (adminError) {
      console.error('Ошибка проверки администратора:', adminError);
    } else if (adminStatus === true && moderationButton) {
      moderationButton.style.display = '';
    }

  } else {
    accountButton.innerHTML = 'Войти';
    accountButton.title = 'Войти';
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

    <button
      type="button"
      id="moderationOpen"
      class="btn primary full"
      style="display:none;margin-top:15px"
    >
      🛡 Модерация объявлений
    </button>

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


const { data: profileIsAdmin, error: profileAdminError } =
  await db.rpc('is_listing_admin');

if (profileAdminError) {
  console.error('Ошибка проверки администратора:', profileAdminError);
}

const profileModerationButton = $('moderationOpen');

if (profileModerationButton) {
  profileModerationButton.style.display =
    profileIsAdmin === true ? '' : 'none';
}

    
   $('messagesPage').style.display = 'none';
$('listingPage').style.display = 'none';
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

   

list.innerHTML = mine.length ? mine.map(x => {
  const statusInfo = {
    pending: {
      title: '⏳ На проверке',
      color: '#b7791f',
      background: '#fff7e6'
    },
    revision_requested: {
      title: '📝 На доработке',
      color: '#b45309',
      background: '#fff7ed'
    },
    approved: {
      title: '✅ Активно',
      color: '#15803d',
      background: '#f0fdf4'
    },
    rejected: {
      title: '❌ Отклонено',
      color: '#dc2626',
      background: '#fef2f2'
    }
  };

  const currentStatus = statusInfo[x.status] || statusInfo.pending;

  const editButtonText = x.status === 'revision_requested'
    ? 'Исправить и отправить повторно'
    : 'Редактировать';

  return `
    <div class="item" style="margin:12px 0;padding:12px">
      <div style="display:flex;gap:12px;align-items:center">
        ${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="" style="width:90px;height:75px;object-fit:cover;border-radius:8px">` : ''}
        <div style="min-width:0">
          <b>${esc(x.title)}</b>
          <p class="price">${rub(x.price)}</p>
          <p class="meta">${esc(x.category)}</p>
        </div>
      </div>

      <div style="margin-top:12px;padding:10px;border-radius:8px;background:${currentStatus.background};color:${currentStatus.color}">
        <b>Статус: ${currentStatus.title}</b>
      </div>

      ${x.moderation_note ? `
        <div style="margin-top:10px;padding:12px;background:#fff7ed;border-radius:8px">
          <b>Комментарий модератора:</b>
          <p style="margin:6px 0 0">${esc(x.moderation_note)}</p>
        </div>
      ` : ''}

      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn light" data-view="${esc(x.id)}">Посмотреть</button>
        <button class="btn light" data-edit="${esc(x.id)}">${editButtonText}</button>
        <button class="btn danger" data-delete="${esc(x.id)}">Удалить</button>
      </div>
    </div>
  `;
}).join('') : '<p>У тебя пока нет объявлений.</p>';


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

$('profileBack')?.addEventListener('click', () => {
  $('userProfilePage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
});

// Загрузка объявлений на модерацию


// Загрузка объявлений на модерацию

async function loadModeration() {
  const content = $('moderationContent');

  content.innerHTML = '<p>Загружаем объявления...</p>';

  const { data, error } = await db
    .from('listings')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    content.innerHTML = `<p>Ошибка загрузки: ${esc(error.message)}</p>`;
    return;
  }

  const rows = data || [];

  if (!rows.length) {
    content.innerHTML = '<p>🎉 Новых объявлений на проверку нет.</p>';
    return;
  }

  content.innerHTML = rows.map(item => {
    const photos = Array.isArray(item.photo_urls) && item.photo_urls.length
      ? item.photo_urls
      : (item.photo_url ? [item.photo_url] : []);

    return `
      <article class="profile-card" style="margin:20px 0;padding:20px">
        <h3>${esc(item.title)}</h3>

        <p><b>Цена:</b> ${rub(item.price)}</p>
        <p><b>Категория:</b> ${esc(item.category || '')}</p>
        <p><b>Описание:</b> ${esc(item.description || '')}</p>
        <p><b>Контакт:</b> ${esc(item.contact || '')}</p>
        <p><b>ID продавца:</b> ${esc(item.user_id || '')}</p>

        ${photos.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin:15px 0">
            ${photos.map(url => `
              <img
                src="${esc(url)}"
                alt="Фото объявления"
                style="width:140px;height:120px;object-fit:contain;background:#f1f3f7;border-radius:10px"
              >
            `).join('')}
          </div>
        ` : '<p>Фотографии не добавлены.</p>'}

        ${item.video_url ? `
          <video
            src="${esc(item.video_url)}"
            controls
            style="display:block;width:100%;max-width:450px;max-height:300px;margin:15px 0"
          ></video>
        ` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">
          <button class="btn primary" type="button" data-approve="${esc(item.id)}">
            ✓ Одобрить
          </button>

          <button class="btn light" type="button" data-revision="${esc(item.id)}">
            📝 Отправить на доработку
          </button>

          <button class="btn danger" type="button" data-reject="${esc(item.id)}">
            ✕ Отклонить
          </button>
        </div>
      </article>
    `;
  }).join('');

  async function moderateListing(id, status, reason = null) {
    const { error } = await db
      .from('listings')
      .update({
        status,
        moderation_note: reason,
        moderated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (error) {
      alert('Ошибка модерации: ' + error.message);
      return false;
    }

    await loadModeration();
    await load();

    return true;
  }

  // Одобрение объявления

  content.querySelectorAll('[data-approve]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;

      await moderateListing(
        button.dataset.approve,
        'approved'
      );
    });
  });

  // Отправка на доработку

  content.querySelectorAll('[data-revision]').forEach(button => {
    button.addEventListener('click', async () => {
      const reason = prompt(
        'Что продавцу нужно исправить? Укажи комментарий:'
      );

      if (reason === null) return;

      if (!reason.trim()) {
        alert('Нужно обязательно указать, что исправить.');
        return;
      }

      button.disabled = true;

      await moderateListing(
        button.dataset.revision,
        'revision_requested',
        reason.trim()
      );
    });
  });

  // Отклонение объявления

  content.querySelectorAll('[data-reject]').forEach(button => {
    button.addEventListener('click', async () => {
      const reason = prompt(
        'Укажи причину отклонения объявления:'
      );

      if (reason === null) return;

      if (!reason.trim()) {
        alert('Нужно обязательно указать причину отклонения.');
        return;
      }

      button.disabled = true;

      await moderateListing(
        button.dataset.reject,
        'rejected',
        reason.trim()
      );
    });
  });
}

  
  // Открытие страницы модерации

$('moderationOpen')?.addEventListener('click', async () => {
  if (!user) return;

  const { data: isAdmin, error } = await db.rpc('is_listing_admin');

  if (error || isAdmin !== true) {
    alert('У тебя нет доступа к модерации.');
    return;
  }

  $('accountMenu').style.display = 'none';
  document.querySelector('main.wrap').style.display = 'none';
  $('userProfilePage').style.display = 'none';
  $('messagesPage').style.display = 'none';
  $('listingPage').style.display = 'none';
  $('moderationPage').style.display = '';

  await loadModeration();
});

// Возврат из модерации

$('moderationBack')?.addEventListener('click', () => {
  $('moderationPage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
  load();
});

$('messagesOpen').addEventListener('click', async () => {
  await syncUser();

  if (!user) {
    alert('Войди в аккаунт, чтобы пользоваться сообщениями.');
    open('authModal');
    return;
  }

  $('accountMenu')?.classList.remove('open');
  $('userProfilePage').style.display = 'none';
  $('listingPage').style.display = 'none';
  $('messagesPage').style.display = 'block';
  document.querySelector('main.wrap').style.display = 'none';

  await loadConversations();
});

$('messagesBack').addEventListener('click', () => {
  $('messagesPage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
});

$('listingPageBack').addEventListener('click', () => {
  $('listingPage').style.display = 'none';
  document.querySelector('main.wrap').style.display = '';
});

$('loginOpen').addEventListener('click', async () => {
  await syncUser();

  if (user) {
    if (window.matchMedia('(max-width: 650px)').matches) {
      $('accountMenu').classList.toggle('open');
    } else {
      await openProfile();
    }
    return;
  }

  $('accountMenu')?.classList.remove('open');

  signup = false;
  $('authTitle').textContent = 'Вход';
  $('toggleAuth').textContent = 'Нет аккаунта? Зарегистрироваться';
  $('authMessage').textContent = '';
  open('authModal');
});

$('profileMenuOpen').addEventListener('click', async () => {
  $('accountMenu').classList.remove('open');
  $('messagesPage').style.display = 'none';
  $('listingPage').style.display = 'none';
  await openProfile();
});

$('favoritesOpen').addEventListener('click', async () => {
  await syncUser();

  if (!user) {
    alert('Войди в аккаунт, чтобы открыть избранное');
    return;
  }

  const main = document.querySelector('main.wrap');

  const alreadyOnFavorites =
    main.style.display !== 'none' && showingFavorites;

  showingFavorites = !alreadyOnFavorites;

  $('accountMenu')?.classList.remove('open');
  $('messagesPage').style.display = 'none';
  $('listingPage').style.display = 'none';
  $('userProfilePage').style.display = 'none';

  main.style.display = '';

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


  $('toggleAuth')?.addEventListener('click', () => {
    signup = !signup;
    $('authTitle').textContent = signup ? 'Регистрация' : 'Вход';
    $('toggleAuth').textContent = signup ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    $('authMessage').textContent = '';
  });

  $('authForm')?.addEventListener('submit', async e => {
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
  $('telegramLogin')?.addEventListener('click', async () => {
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


// Предпросмотр фотографий и видео объявления

const listingPhotoInput = $('photo');
const listingVideoInput = $('video');
const listingPhotoPreview = $('photoPreview');
const listingVideoPreview = $('videoPreview');

let listingPhotoUrls = [];
let listingVideoUrl = null;

function renderListingPhotoPreview() {
  listingPhotoUrls.forEach(url => URL.revokeObjectURL(url));
  listingPhotoUrls = [];

  listingPhotoPreview.innerHTML = '';

  const files = Array.from(listingPhotoInput.files);

  files.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    listingPhotoUrls.push(url);

    const card = document.createElement('div');
    card.className = 'media-preview-card';

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Фото объявления';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Удалить фотографию';

    remove.addEventListener('click', () => {
      const transfer = new DataTransfer();

      Array.from(listingPhotoInput.files).forEach((item, i) => {
        if (i !== index) transfer.items.add(item);
      });

      listingPhotoInput.files = transfer.files;
      renderListingPhotoPreview();
    });

    card.append(img, remove);
    listingPhotoPreview.append(card);
  });
}

function renderListingVideoPreview() {
  if (listingVideoUrl) {
    URL.revokeObjectURL(listingVideoUrl);
    listingVideoUrl = null;
  }

  listingVideoPreview.innerHTML = '';

  const file = listingVideoInput.files[0];
  if (!file) return;

  listingVideoUrl = URL.createObjectURL(file);

  const card = document.createElement('div');
  card.className = 'media-preview-card video-preview-card';

  const video = document.createElement('video');
  video.src = listingVideoUrl;
  video.controls = true;
  video.preload = 'metadata';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = 'Удалить видео';

  remove.addEventListener('click', () => {
    listingVideoInput.value = '';
    renderListingVideoPreview();
  });

  card.append(video, remove);
  listingVideoPreview.append(card);
}

listingPhotoInput.addEventListener('change', () => {
  if (listingPhotoInput.files.length > 10) {
    alert('Можно выбрать не больше 10 фотографий.');
    listingPhotoInput.value = '';
  }

  renderListingPhotoPreview();
});

listingVideoInput.addEventListener('change', () => {
  const file = listingVideoInput.files[0];

  if (file && file.size > 50 * 1024 * 1024) {
    alert('Видео должно быть не больше 50 МБ.');
    listingVideoInput.value = '';
  }

  renderListingVideoPreview();
});

  
 

$('listingForm')?.addEventListener('submit', async e => {
  e.preventDefault();

  if (!user) return;

  const msg = $('listingMessage');
  msg.textContent = 'Отправляем объявление на модерацию...';

  const photoFiles = Array.from($('photo').files);
  const videoFile = $('video').files[0];

  if (photoFiles.length > 10) {
    msg.textContent = 'Можно загрузить не больше 10 фотографий.';
    return;
  }

  for (const file of photoFiles) {
    if (!file.type.startsWith('image/')) {
      msg.textContent = 'Выбранный файл не является фотографией.';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      msg.textContent = `Фото ${file.name} больше 5 МБ.`;
      return;
    }
  }

  if (videoFile) {
    if (!videoFile.type.startsWith('video/')) {
      msg.textContent = 'Выбранный файл не является видео.';
      return;
    }

    if (videoFile.size > 50 * 1024 * 1024) {
      msg.textContent = 'Видео должно быть не больше 50 МБ.';
      return;
    }
  }

  const photo_urls = [];
  let video_url = null;
  const uploadedPaths = [];

  const storage = db.storage.from('listing-photos');

  try {
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];

      msg.textContent = `Загружаем фотографию ${i + 1} из ${photoFiles.length}...`;

      const ext = (file.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const up = await storage.upload(path, file, {
        upsert: false,
        contentType: file.type
      });

      if (up.error) throw new Error(up.error.message);

      uploadedPaths.push(path);

      const url = storage.getPublicUrl(path).data.publicUrl;
      photo_urls.push(url);
    }

    if (videoFile) {
      msg.textContent = 'Загружаем видео...';

      const ext = (videoFile.name.split('.').pop() || 'mp4')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const up = await storage.upload(path, videoFile, {
        upsert: false,
        contentType: videoFile.type
      });

      if (up.error) throw new Error(up.error.message);

      uploadedPaths.push(path);

      video_url = storage.getPublicUrl(path).data.publicUrl;
    }

    msg.textContent = 'Сохраняем объявление...';

    const row = {
      user_id: user.id,
      title: $('title').value.trim(),
      price: Number($('price').value),
      category: $('newCategory').value,
      description: $('description').value.trim(),
      contact: $('contact').value.trim(),
      photo_url: photo_urls[0] || null,
      photo_urls,
      video_url
    };

    const { error } = await db.from('listings').insert(row);

    if (error) throw new Error(error.message);

    $('listingForm').reset();

    renderListingPhotoPreview();
    renderListingVideoPreview();

    close('listingModal');

    await load();

    alert('Объявление отправлено на модерацию! После проверки оно появится на сайте.');

  } catch (error) {
    if (uploadedPaths.length) {
      await storage.remove(uploadedPaths);
    }

    msg.textContent = 'Ошибка публикации: ' + error.message;
  }
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
    .eq('status', 'approved')
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
    <div class="profile-background">
      <div class="profile-card">

        <div class="profile-cover"></div>

        <div class="profile-header">
          ${profileData.avatar_url
            ? `<img
                src="${esc(profileData.avatar_url)}"
                alt="Аватар"
                class="profile-avatar"
              >`
            : `<div class="profile-avatar profile-avatar-placeholder">👤</div>`}

          <div class="profile-heading">
            <h2>${esc(profileData.display_name || 'Пользователь')}</h2>
            <p>${esc(profileData.about || 'Пользователь пока ничего не рассказал о себе.')}</p>
          </div>
        </div>

        <div class="profile-content">

          <section class="profile-section">
            <h3>Контакты продавца</h3>

            <div class="profile-contacts">
              <div class="profile-contact">
                <b>Телефон</b>
                ${profileData.phone
                  ? `<a href="tel:${esc(profileData.phone)}">${esc(profileData.phone)}</a>`
                  : 'Не указан'}
              </div>

              <div class="profile-contact">
                <b>Telegram</b>
                ${profileData.telegram
                  ? `<a href="https://t.me/${encodeURIComponent(profileData.telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">Написать в Telegram</a>`
                  : 'Не указан'}
              </div>

              <div class="profile-contact">
                <b>WhatsApp</b>
                ${profileData.whatsapp
                  ? `<a href="https://wa.me/${profileData.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">Написать в WhatsApp</a>`
                  : 'Не указан'}
              </div>

              <div class="profile-contact">
                <b>VK</b>
                ${profileData.vk
                  ? `<a href="${esc(profileData.vk.startsWith('http') ? profileData.vk : 'https://' + profileData.vk)}" target="_blank" rel="noopener">Открыть страницу VK</a>`
                  : 'Не указан'}
              </div>
            </div>
          </section>

          <section class="profile-section">
            <div class="section-head">
              <h3>Объявления продавца</h3>
              <b>Всего: ${(sellerListings || []).length}</b>
            </div>

            <div class="profile-listings">
              ${(sellerListings || []).length
                ? sellerListings.map(x => `
                  <div class="item" style="padding:12px">
                    ${x.photo_url
                      ? `<img src="${esc(x.photo_url)}" alt=""
                          style="width:100%;height:160px;object-fit:cover;border-radius:10px;margin-bottom:10px">`
                      : ''}
                    <b>${esc(x.title)}</b>
                    <p class="price">${rub(x.price)}</p>
                    <button class="btn light" data-seller-view="${esc(x.id)}">
                      Посмотреть объявление
                    </button>
                  </div>
                `).join('')
                : '<p>У продавца пока нет объявлений.</p>'}
            </div>
          </section>

        </div>
      </div>
    </div>
  `;

  const cover = content.querySelector('.profile-cover');
  if (cover && profileData.cover_url) {
    cover.style.backgroundImage = `url("${profileData.cover_url}")`;
  }

  const background = content.querySelector('.profile-background');
  if (background && profileData.background_url) {
    background.style.backgroundImage = `url("${profileData.background_url}")`;
  }

  $('userProfilePage').style.display = 'block';
  document.querySelector('main.wrap').style.display = 'none';

  content.querySelectorAll('[data-seller-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      showDetail(btn.dataset.sellerView);
    });
  });
}

async function loadConversations() {
  const list = $('conversationsList');
  list.innerHTML = '<p>Загружаем диалоги...</p>';

  const { data, error } = await db
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="message">Ошибка загрузки: ${esc(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<p>У тебя пока нет переписок. Напиши продавцу из объявления!</p>';
    return;
  }

  const cards = await Promise.all(data.map(async conversation => {
    const otherId = conversation.buyer_id === user.id
      ? conversation.seller_id
      : conversation.buyer_id;

    const { data: profile } = await db
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', otherId)
      .maybeSingle();

    const { data: listing } = await db
      .from('listings')
      .select('title')
      .eq('id', conversation.listing_id)
      .maybeSingle();

    return `
      <button type="button"
        class="item"
        data-chat-id="${esc(conversation.id)}"
        style="width:100%;text-align:left;margin:10px 0;padding:15px;border:1px solid #e7e9ee;cursor:pointer">
        <b>${esc(profile?.display_name || 'Пользователь')}</b>
        <p class="meta">Объявление: ${esc(listing?.title || 'Объявление удалено')}</p>
      </button>
    `;
  }));

  list.innerHTML = cards.join('');

  list.querySelectorAll('[data-chat-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      openChat(btn.dataset.chatId);
    });
  });
}

async function openChat(conversationId) {
  const chat = $('chatWindow');
  const list = $('conversationsList');

  list.style.display = 'none';
  chat.style.display = 'block';
  chat.innerHTML = '<p>Загружаем переписку...</p>';

  const { data: conversation, error } = await db
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !conversation) {
    chat.innerHTML = '<p>Не удалось открыть переписку.</p>';
    return;
  }

  const otherId = conversation.buyer_id === user.id
    ? conversation.seller_id
    : conversation.buyer_id;

  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', otherId)
    .maybeSingle();

  chat.innerHTML = `
    <button type="button" id="chatBack" class="btn light">
      ← Все диалоги
    </button>

    <h3>${esc(profile?.display_name || 'Пользователь')}</h3>

    <div id="chatMessages"
      style="height:400px;overflow-y:auto;padding:15px;background:#f7f8fa;border-radius:12px;margin:15px 0">
    </div>

    <form id="messageForm" style="display:flex;gap:10px">
      <input id="messageText" maxlength="5000"
        placeholder="Напиши сообщение..." required
        style="flex:1;min-width:0">
      <button type="submit" class="btn primary">Отправить</button>
    </form>

    <p id="messageStatus" class="message"></p>
  `;

  $('chatBack').addEventListener('click', () => {
    chat.style.display = 'none';
    list.style.display = 'block';
  });

  async function refreshMessages() {
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const box = $('chatMessages');

    if (error) {
      box.innerHTML = '<p>Ошибка загрузки сообщений.</p>';
      return;
    }

    box.innerHTML = (data || []).map(message => `
      <div style="display:flex;justify-content:${message.sender_id === user.id ? 'flex-end' : 'flex-start'};margin:8px 0">
        <div style="max-width:80%;padding:10px 14px;border-radius:12px;background:${message.sender_id === user.id ? '#dbeafe' : '#fff'};overflow-wrap:anywhere">
          ${esc(message.body)}
          <div style="font-size:11px;color:#747b88;margin-top:5px">
            ${new Date(message.created_at).toLocaleString('ru-RU')}
          </div>
        </div>
      </div>
    `).join('') || '<p>Сообщений пока нет. Напиши первым!</p>';

    box.scrollTop = box.scrollHeight;
  }

  await refreshMessages();

  $('messageForm').addEventListener('submit', async e => {
    e.preventDefault();

    const input = $('messageText');
    const status = $('messageStatus');
    const body = input.value.trim();

    if (!body) return;

    const button = $('messageForm').querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'Отправляем...';

    const { error } = await db.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body
    });

    if (error) {
      status.textContent = 'Ошибка отправки: ' + error.message;
    } else {
      input.value = '';
      status.textContent = '';
      await refreshMessages();
    }

    button.disabled = false;
  });
}

async function startConversation(listing) {
  await syncUser();

  if (!user) {
    alert('Войди в аккаунт, чтобы написать продавцу.');
    open('authModal');
    return;
  }

  if (user.id === listing.user_id) {
    alert('Нельзя написать самому себе.');
    return;
  }

  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('id')
    .eq('listing_id', listing.id)
    .eq('buyer_id', user.id)
    .maybeSingle();

  if (findError) {
    alert('Не удалось проверить переписку: ' + findError.message);
    return;
  }

  let conversationId = existing?.id;

  if (!conversationId) {
    const { data: created, error } = await db
      .from('conversations')
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.user_id
      })
      .select('id')
      .single();

    if (error) {
      alert('Не удалось создать переписку: ' + error.message);
      return;
    }

    conversationId = created.id;
  }

  $('userProfilePage').style.display = 'none';
  $('listingPage').style.display = 'none';
  $('messagesPage').style.display = 'block';
  document.querySelector('main.wrap').style.display = 'none';

  await loadConversations();
  await openChat(conversationId);
}
  
 

async function showDetail(id) {
  const x = listings.find(a => String(a.id) === String(id));
  if (!x) return;

  const content = $('listingPageContent');
  content.innerHTML = '<p>Загружаем объявление...</p>';

  const { data: seller } = await db
    .from('profiles')
    .select('display_name, avatar_url, about')
    .eq('id', x.user_id)
    .maybeSingle();

  const photos = Array.isArray(x.photo_urls) && x.photo_urls.length
    ? x.photo_urls
    : (x.photo_url ? [x.photo_url] : []);

  const videoUrl = x.video_url || null;

  content.innerHTML = `
    <div class="listing-full-card">

      <div class="listing-main-info">

        <div class="listing-gallery">
          <div class="listing-gallery-main" id="listingMainMedia">
            ${photos.length
              ? `<img src="${esc(photos[0])}" alt="${esc(x.title)}">`
              : videoUrl
                ? `<video src="${esc(videoUrl)}" controls playsinline></video>`
                : `<div class="listing-no-photo">📷 Нет фотографии</div>`}
          </div>

          ${photos.length || videoUrl ? `
            <div class="listing-gallery-thumbs">
              ${photos.map((photo, index) => `
                <button
                  type="button"
                  class="listing-thumb ${index === 0 ? 'active' : ''}"
                  data-photo-index="${index}"
                >
                  <img src="${esc(photo)}" alt="Фото ${index + 1}">
                </button>
              `).join('')}

              ${videoUrl ? `
                <button type="button" class="listing-thumb listing-video-thumb" data-show-video>
                  ▶ Видео
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <div class="listing-details">

          <div class="listing-category-label">
            ${esc(x.category || 'Без категории')} · Оренбург
          </div>

          <h1>${esc(x.title)}</h1>

          <div class="listing-description-block">
            <h3>Описание объявления</h3>
            <p class="listing-description">${esc(x.description || 'Описание не указано.')}</p>
          </div>

          <div class="listing-actions">
            ${user && user.id !== x.user_id ? `
              <button type="button" id="writeSeller" class="btn primary">
                ✉ Написать продавцу
              </button>
            ` : ''}

            <button type="button" id="listingFavorite" class="btn light">
              ${favorites.has(String(x.id)) ? '♥ В избранном' : '♡ В избранное'}
            </button>

            ${user && user.id === x.user_id ? `
              <button type="button" id="deleteListing" class="btn danger">
                Удалить объявление
              </button>
            ` : ''}
          </div>

        </div>
      </div>

      <aside class="listing-sidebar">

        <div class="listing-price-card">
          <span class="listing-price-caption">Цена объявления</span>
          <div class="listing-full-price">${rub(x.price)}</div>

          ${user && user.id !== x.user_id ? `
            <button type="button" id="sidebarWriteSeller" class="btn primary full">
              ✉ Написать продавцу
            </button>
          ` : ''}
        </div>

        <div class="listing-seller-card">
          <h3>Продавец</h3>

          <div class="listing-seller-info">
            ${seller?.avatar_url
              ? `<img src="${esc(seller.avatar_url)}" alt="Аватар продавца">`
              : '<div class="listing-seller-avatar">👤</div>'}

            <div>
              <b>${esc(seller?.display_name || 'Пользователь')}</b>
              <p>${esc(seller?.about || 'Информация о продавце не указана.')}</p>
            </div>
          </div>

          <button type="button" id="sellerProfileOpen" class="btn light full">
            Профиль продавца
          </button>
        </div>

      </aside>

    </div>
  `;

  // Переключение фотографий и видео

  const mainMedia = $('listingMainMedia');

  content.querySelectorAll('[data-photo-index]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.photoIndex);
      const photo = photos[index];

      if (!photo) return;

      mainMedia.innerHTML = `
        <img src="${esc(photo)}" alt="${esc(x.title)}">
      `;

      content.querySelectorAll('.listing-thumb').forEach(item => {
        item.classList.remove('active');
      });

      button.classList.add('active');
    });
  });

  const videoButton = content.querySelector('[data-show-video]');

  if (videoButton) {
    videoButton.addEventListener('click', () => {
      mainMedia.innerHTML = `
        <video src="${esc(videoUrl)}" controls autoplay playsinline></video>
      `;

      content.querySelectorAll('.listing-thumb').forEach(item => {
        item.classList.remove('active');
      });

      videoButton.classList.add('active');
    });
  }

  document.querySelector('main.wrap').style.display = 'none';
  $('userProfilePage').style.display = 'none';
  $('messagesPage').style.display = 'none';
  $('listingPage').style.display = 'block';

  $('sellerProfileOpen').addEventListener('click', () => {
    $('listingPage').style.display = 'none';
    openSellerProfile(x.user_id);
  });

  const writeButton = $('writeSeller');
  const sidebarWriteButton = $('sidebarWriteSeller');

  if (writeButton) {
    writeButton.addEventListener('click', () => {
      startConversation(x);
    });
  }

  if (sidebarWriteButton) {
    sidebarWriteButton.addEventListener('click', () => {
      startConversation(x);
    });
  }

  $('listingFavorite').addEventListener('click', async () => {
    await toggleFavorite(x.id);
    await showDetail(x.id);
  });

  const deleteButton = $('deleteListing');

  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Удалить объявление?')) return;

      const { error } = await db
        .from('listings')
        .delete()
        .eq('id', x.id);

      if (error) {
        alert(error.message);
        return;
      }

      $('listingPage').style.display = 'none';
      document.querySelector('main.wrap').style.display = '';
      await load();
    });
  }
}



  $('searchBtn').addEventListener('click',render);
  $('search').addEventListener('keydown',e => { if(e.key === 'Enter') render(); });
  $('category').addEventListener('change',render);
  $('sort')?.addEventListener('change',render);

  if (db) db.auth.onAuthStateChange(() => syncUser());
  syncUser();
  load();
})();
