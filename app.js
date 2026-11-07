(() => {
  const $ = id => document.getElementById(id);
  const clientReady = () => window.supabase && window.SUPABASE_URL && window.SUPABASE_PUBLISHABLE_KEY && !window.SUPABASE_URL.includes('ВСТАВЬ') && !window.SUPABASE_PUBLISHABLE_KEY.includes('ВСТАВЬ');
  const db = clientReady() ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY) : null;
  let user = null, signup = false, listings = [];

  $('year').textContent = new Date().getFullYear();
  const rub = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'''}[c]));
  const open = id => $(id).classList.add('open');
  const close = id => $(id).classList.remove('open');

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target === m) m.classList.remove('open'); }));

  function configStatus() {
    if (!db) $('status').textContent = 'Чтобы подключить общую базу, сначала заполни config.js (инструкция в README).';
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const cat = $('category').value;
    const sort = $('sort').value;
    let rows = listings.filter(x => (!cat || x.category === cat) && (!q || (x.title + ' ' + (x.description || '')).toLowerCase().includes(q)));
    if (sort === 'cheap') rows.sort((a,b) => a.price-b.price);
    else if (sort === 'expensive') rows.sort((a,b) => b.price-a.price);
    else rows.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));

    $('grid').innerHTML = rows.length ? rows.map(x => `
      <article class="item" data-id="${esc(x.id)}">
        <div class="photo">${x.photo_url ? `<img src="${esc(x.photo_url)}" alt="">` : 'Фото не добавлено'}</div>
        <div class="item-body">
          <div class="price">${rub(x.price)}</div>
          <h3>${esc(x.title)}</h3>
          <div class="meta">${esc(x.category)} · Оренбург</div>
        </div>
      </article>`).join('') : '<div class="empty">Объявлений пока нет. Будь первым — размести своё!</div>';

    $('grid').querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => showDetail(el.dataset.id)));
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
    if (!db) { $('loginOpen').textContent = 'Войти'; return; }
    const {data} = await db.auth.getUser();
    user = data.user;
    $('loginOpen').textContent = user ? 'Мой аккаунт' : 'Войти';
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

    let profile = document.getElementById('profileModal');
    if (!profile) {
      profile = document.createElement('div');
      profile.id = 'profileModal';
      profile.className = 'modal';
      document.body.appendChild(profile);
      profile.addEventListener('click', e => {
        if (e.target === profile || e.target.closest('[data-profile-close]')) close('profileModal');
      });
    }

    profile.innerHTML = `
      <div class="dialog" style="max-width:650px;max-height:85vh;overflow:auto">
        <button type="button" class="x" data-profile-close>×</button>
        <h2>Мой аккаунт</h2>
        <p><b>Email:</b> ${esc(user.email)}</p>
        <div class="section-head">
          <h3>Мои объявления</h3>
          <b id="myCount">Загружаем…</b>
        </div>
        <div id="myListings"></div>
        <button type="button" id="profileLogout" class="btn light full">Выйти из аккаунта</button>
      </div>`;

    open('profileModal');

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
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn light" data-view="${esc(x.id)}">Посмотреть</button>
          <button class="btn danger" data-delete="${esc(x.id)}">Удалить</button>
        </div>
      </div>`).join('') : '<p>У тебя пока нет объявлений.</p>';

    list.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.view;
      close('profileModal');
      showDetail(id);
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
      close('profileModal');
      await syncUser();
    });
  }

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
      ${user && user.id === x.user_id ? '<button id="deleteListing" class="btn danger">Удалить объявление</button>' : ''}`;

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
