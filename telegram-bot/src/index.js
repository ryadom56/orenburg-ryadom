// Telegram-бот модерации для «Оренбург рядом».
// Присылает админам новые объявления и жалобы, а кнопки в чате
// одобряют, отправляют на доработку или отклоняют объявления.

const REASONS = {
  scam: 'Мошенничество или обман',
  prohibited: 'Запрещённый товар или услуга',
  duplicate: 'Дубликат или спам',
  wrong_category: 'Неверная категория или цена',
  other: 'Другое'
};

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const cut = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const isSafeId = id => /^[\w-]{1,64}$/.test(String(id));

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function adminIds(env) {
  return String(env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

const isAdmin = (env, userId) => adminIds(env).includes(String(userId));

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error('Telegram error', method, data.description);
  return data;
}

const supabaseKey = env => String(env.SUPABASE_SERVICE_KEY || '').trim();
const supabaseUrl = env => String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

// Проверка, что в SUPABASE_SERVICE_KEY лежит именно серверный ключ, а не публичный.
// С публичным ключом база не показывает боту скрытые объявления, и кнопки отвечают «не найдено».
function keyProblem(env) {
  const key = supabaseKey(env);
  if (!key) return 'Секрет SUPABASE_SERVICE_KEY пустой.';
  if (key.startsWith('sb_publishable_')) {
    return 'В SUPABASE_SERVICE_KEY вставлен публичный ключ (publishable). Нужен секретный: sb_secret_… или service_role.';
  }
  if (key.startsWith('sb_secret_')) return null;

  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'service_role') {
      return `В SUPABASE_SERVICE_KEY ключ с ролью «${payload.role}», а нужна service_role.`;
    }
  } catch {
    return 'SUPABASE_SERVICE_KEY не похож на ключ Supabase. Проверьте, что скопировали его целиком.';
  }

  return null;
}

async function sb(env, path, options = {}) {
  const key = supabaseKey(env);
  const headers = {
    apikey: key,
    'content-type': 'application/json',
    ...(options.headers || {})
  };

  // Новые ключи sb_secret_… — не JWT, их передаём только в apikey
  if (!key.startsWith('sb_')) headers.authorization = `Bearer ${key}`;

  const res = await fetch(`${supabaseUrl(env)}/rest/v1/${path}`, { ...options, headers });
  if (!res.ok) {
    console.error('Supabase error', path, res.status, await res.text());
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// Меняет объявление. onlyStatus защищает от повторных нажатий и гонок.
async function updateListing(env, id, fields, onlyStatus) {
  if (!isSafeId(id)) return [];
  const filter = `id=eq.${encodeURIComponent(id)}` + (onlyStatus ? `&status=eq.${onlyStatus}` : '');
  const rows = await sb(env, `listings?${filter}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, moderated_at: new Date().toISOString() })
  });
  return rows; // null — ошибка обращения к базе, [] — объявление не найдено или уже обработано
}

const openReports = (env, id) =>
  sb(env, `listing_reports?listing_id=eq.${encodeURIComponent(id)}&resolved_at=is.null&select=reason,details`);

const reportLines = reports =>
  reports.slice(0, 5).map(r =>
    `• ${esc(REASONS[r.reason] || r.reason)}${r.details ? ': ' + esc(cut(r.details, 100)) : ''}`
  ).join('\n');

// ---------- Уведомления из Supabase ----------

async function onSupabase(payload, env) {
  if (payload.table === 'listings') return notifyListing(payload, env);
  if (payload.table === 'listing_reports' && payload.type === 'INSERT') return notifyReport(payload.record, env);
}

async function notifyListing({ type, record: x, old_record: old }, env) {
  if (!x || x.status !== 'pending') return;
  if (type === 'UPDATE' && old?.status === 'pending') return; // правка уже стоящего в очереди — не шумим

  const reports = (await openReports(env, x.id)) || [];

  const header = reports.length
    ? '⚠️ Скрыто по жалобам, нужна проверка'
    : old?.status === 'revision_requested'
      ? '✏️ Исправлено продавцом'
      : type === 'UPDATE'
        ? '✏️ Объявление изменено'
        : '🆕 Новое объявление';

  const text = [
    `<b>${header}</b>`,
    '',
    `<b>${esc(cut(x.title, 150))}</b>`,
    `💰 ${esc(new Intl.NumberFormat('ru-RU').format(x.price))} ₽ · ${esc(x.category || 'без категории')}`,
    x.description ? `\n${esc(cut(x.description, 500))}` : '',
    x.contact ? `\n📞 ${esc(cut(x.contact, 80))}` : '',
    reports.length ? `\n<b>Жалобы (${reports.length}):</b>\n${reportLines(reports)}` : ''
  ].filter(s => s !== '').join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Одобрить', callback_data: `a:${x.id}` }],
      [
        { text: '📝 На доработку', callback_data: `v:${x.id}` },
        { text: '❌ Отклонить', callback_data: `r:${x.id}` }
      ]
    ]
  };

  for (const chat_id of adminIds(env)) {
    let sent = { ok: false };

    if (x.photo_url) {
      sent = await tg(env, 'sendPhoto', {
        chat_id, photo: x.photo_url, caption: text.slice(0, 1024), parse_mode: 'HTML', reply_markup: keyboard
      });
    }

    if (!sent.ok) {
      await tg(env, 'sendMessage', {
        chat_id, text, parse_mode: 'HTML', reply_markup: keyboard, disable_web_page_preview: true
      });
    }
  }
}

async function notifyReport(r, env) {
  if (!r) return;

  const reports = (await openReports(env, r.listing_id)) || [];
  if (reports.length !== 1) return; // уведомляем о первой жалобе, дальше сработает автоскрытие

  const rows = await sb(env, `listings?id=eq.${encodeURIComponent(r.listing_id)}&select=id,title,status`);
  const listing = rows?.[0];
  if (!listing || listing.status !== 'approved') return;

  const text = [
    '<b>⚠️ Жалоба на объявление</b>',
    '',
    `<b>${esc(cut(listing.title, 150))}</b>`,
    reportLines(reports)
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      ...(env.SITE_URL ? [[{ text: '🔗 Открыть на сайте', url: `${env.SITE_URL}/?listing=${encodeURIComponent(listing.id)}` }]] : []),
      [
        { text: '👌 Необоснованна', callback_data: `d:${listing.id}` },
        { text: '🚫 Снять', callback_data: `x:${listing.id}` }
      ]
    ]
  };

  for (const chat_id of adminIds(env)) {
    await tg(env, 'sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: keyboard, disable_web_page_preview: true });
  }
}

// ---------- Действия админа в Telegram ----------

const TRIGGER_ERROR = 'База вернула старый статус: триггер защиты откатил изменение. Выполните файл bot.sql в Supabase → SQL Editor (целиком) и повторите.';

// Если база вернула не тот статус, который мы ставили, значит, изменение откатил триггер
const statusMismatch = (rows, expected) => rows.length && rows[0].status !== expected;

const DB_ERROR = 'Не удалось обратиться к базе. Проверьте SUPABASE_URL и SUPABASE_SERVICE_KEY в Cloudflare (смотрите журнал).';

const PROMPTS = {
  r: 'Причина отклонения (ответьте на это сообщение, её увидит продавец):',
  v: 'Что продавцу нужно исправить? (ответьте на это сообщение):',
  x: 'Причина снятия с публикации (ответьте на это сообщение, её увидит продавец):'
};

async function onCallback(cb, env) {
  try {
    await handleCallback(cb, env);
  } catch (error) {
    console.error('Ошибка кнопки:', error);
    await tg(env, 'answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Ошибка: ' + cut(error?.message || error, 150),
      show_alert: true
    });
  }
}

async function handleCallback(cb, env) {
  if (!isAdmin(env, cb.from?.id)) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Нет доступа', show_alert: true });
    return;
  }

  const [action, id] = String(cb.data || '').split(':');
  const chat_id = cb.message?.chat?.id;
  const message_id = cb.message?.message_id;
  if (!chat_id || !isSafeId(id)) return;

  const finish = async text => {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text });
    await tg(env, 'editMessageReplyMarkup', { chat_id, message_id, reply_markup: { inline_keyboard: [] } });
    await tg(env, 'sendMessage', { chat_id, text, reply_to_message_id: message_id });
  };

  if (action === 'a') {
    const rows = await updateListing(env, id, { status: 'approved', moderation_note: null }, 'pending');
    if (rows === null) return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: DB_ERROR, show_alert: true });
    if (statusMismatch(rows, 'approved')) return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: TRIGGER_ERROR, show_alert: true });
    if (rows.length) return finish('✅ Одобрено');
    return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: keyProblem(env) || 'Уже обработано или не найдено', show_alert: true });
  }

  if (action === 'd') {
    const done = await sb(env, `listing_reports?listing_id=eq.${encodeURIComponent(id)}&resolved_at=is.null`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved_at: new Date().toISOString() })
    });
    return done === null
      ? tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка, смотри логи', show_alert: true })
      : finish('👌 Жалобы закрыты, объявление осталось');
  }

  if (PROMPTS[action]) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    await tg(env, 'sendMessage', {
      chat_id,
      text: `${PROMPTS[action]}\n\nref:${action}:${id}`,
      reply_to_message_id: message_id,
      reply_markup: { force_reply: true, input_field_placeholder: 'Причина…' }
    });
  }
}

async function onMessage(msg, env) {
  const chat_id = msg.chat?.id;
  if (!chat_id) return;

  // Помогает узнать свой ID для настройки ADMIN_IDS
  if (/^\/(start|id)(@\w+)?(\s|$)/.test(msg.text || '')) {
    await tg(env, 'sendMessage', { chat_id, text: `Ваш Telegram ID: ${msg.from?.id}` });
    return;
  }

  if (!isAdmin(env, msg.from?.id)) return;

  const ref = /ref:(r|v|x):([\w-]+)/.exec(msg.reply_to_message?.text || '');
  if (!ref || !msg.text) return;

  const [, action, id] = ref;
  const reason = msg.text.trim();

  if (!reason || reason.length > 500) {
    await tg(env, 'sendMessage', { chat_id, text: 'Причина должна быть от 1 до 500 символов. Нажмите кнопку ещё раз.' });
    return;
  }

  const result = {
    r: { fields: { status: 'rejected' }, only: 'pending', done: '❌ Отклонено' },
    v: { fields: { status: 'revision_requested' }, only: 'pending', done: '📝 Отправлено на доработку' },
    x: { fields: { status: 'rejected' }, only: 'approved', done: '🚫 Снято с публикации' }
  }[action];

  const rows = await updateListing(env, id, { ...result.fields, moderation_note: reason }, result.only);

  await tg(env, 'sendMessage', {
    chat_id,
    reply_to_message_id: msg.message_id,
    text: rows === null
      ? DB_ERROR
      : statusMismatch(rows, result.fields.status) ? TRIGGER_ERROR
      : rows.length ? `${result.done}: ${cut(rows[0].title, 80)}` : (keyProblem(env) || 'Уже обработано или не найдено.')
  });
}

// ---------- Точка входа ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/supabase') {
        // Секрет принимаем в заголовке x-webhook-secret или в адресе (?secret=...), как удобнее настроить в Supabase.
        // Текст отказа показывает причину (виден в Supabase в net._http_response), сам секрет не раскрывается.
        const expected = env.SUPABASE_WEBHOOK_SECRET || '';
        const given = request.headers.get('x-webhook-secret') || url.searchParams.get('secret') || '';

        if (!expected) return new Response('forbidden: SUPABASE_WEBHOOK_SECRET не задан в Cloudflare', { status: 403 });
        if (!given) return new Response('forbidden: секрет не пришёл в запросе', { status: 403 });
        if (!safeEqual(given, expected)) return new Response('forbidden: секрет не совпадает', { status: 403 });

        await onSupabase(await request.json(), env);
        return new Response('ok');
      }

      if (request.method === 'POST' && url.pathname === '/telegram') {
        if (!safeEqual(request.headers.get('x-telegram-bot-api-secret-token') || '', env.TELEGRAM_WEBHOOK_SECRET || '')) {
          return new Response('forbidden', { status: 403 });
        }
        const update = await request.json();
        console.log('Telegram update:', Object.keys(update).join(','), update.callback_query?.data || '');
        if (update.callback_query) await onCallback(update.callback_query, env);
        else if (update.message) await onMessage(update.message, env);
        return new Response('ok');
      }

      if (request.method === 'GET' && url.pathname === '/') return new Response('Бот модерации работает (версия 5)');
    } catch (error) {
      // Отвечаем 200, чтобы Telegram не засыпал повторными запросами; ошибка попадёт в логи
      console.error('Ошибка обработчика:', error);
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  }
};
