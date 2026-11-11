(function () {
  var root = document.getElementById("heroDemo");
  if (!root) return;

  var q = root.querySelector(".hd-q");
  var card = root.querySelector(".hd-card");
  var ic = root.querySelector(".hd-ic");
  var ttl = root.querySelector(".hd-card b");
  var pr = root.querySelector(".hd-card span");
  var m1 = root.querySelector(".hd-msg.out");
  var m2 = root.querySelector(".hd-msg.in");
  var st = root.querySelector(".hd-stamp");

  var svg = function (p) {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  };

  var items = [
    {
      q: "iPhone 13",
      t: "iPhone 13, 128 ГБ",
      p: "42 000 ₽",
      a: "Ещё продаёте?",
      b: "Да, забирайте сегодня",
      i: svg('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>')
    },
    {
      q: "Диван угловой",
      t: "Диван угловой",
      p: "18 500 ₽",
      a: "Можно посмотреть вечером?",
      b: "Конечно, после 18:00",
      i: svg('<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 17v2M19 17v2"/>')
    },
    {
      q: "Lada Vesta",
      t: "Lada Vesta, 2019",
      p: "780 000 ₽",
      a: "Торг уместен?",
      b: "Договоримся при встрече",
      i: svg('<path d="M5 16 6.5 10a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/>')
    }
  ];

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var wait = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };

  var parts = [card, m1, m2, st];

  function fill(it) {
    ic.innerHTML = it.i;
    ttl.textContent = it.t;
    pr.textContent = it.p;
    m1.textContent = it.a;
    m2.textContent = it.b;
  }

  async function run() {
    if (still) {
      var f = items[0];
      q.textContent = f.q;
      fill(f);
      parts.forEach(function (e) {
        e.classList.add("show");
      });
      return;
    }

    for (var n = 0; ; n = (n + 1) % items.length) {
      var it = items[n];

      parts.forEach(function (e) {
        e.classList.remove("show");
      });

      q.textContent = "";

      await wait(500);
      fill(it);

      for (var c = 1; c <= it.q.length; c++) {
        q.textContent = it.q.slice(0, c);
        await wait(80);
      }

      await wait(350);
      card.classList.add("show");

      await wait(900);
      m1.classList.add("show");

      await wait(1000);
      m2.classList.add("show");

      await wait(1200);
      st.classList.add("show");

      await wait(2200);
    }
  }

  run();
})();
