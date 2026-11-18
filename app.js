/* 대구 평형 왜곡 — 대구 도심 준신축 59·74·84㎡ 실거래가 비교 */
(function () {
  "use strict";

  var state = { tab: "all", gu: "전체", q: "", sort: "gap" };
  var DATA = null;
  var BASE = { r59_84: 75.1, r74_84: 88.6 };
  var GU_LIST = ["전체", "중구", "수성구", "남구", "달서구", "북구", "동구", "서구"];

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $("list");
  var qEl = $("q");
  var sortEl = $("sort");
  var gusEl = $("gus");
  var tabsEl = $("tabs");
  var countEl = $("resultCount");

  /* ── 숫자·문자 포맷 ─────────────────────────── */
  function man(v) {
    if (v == null) return "—";
    if (v >= 10000) {
      var eok = Math.floor(v / 10000), rest = v % 10000;
      return rest ? eok + "억 " + rest.toLocaleString("ko-KR") : eok + "억";
    }
    return v.toLocaleString("ko-KR");
  }
  function won(v) {
    if (v == null) return "—";
    return v.toLocaleString("ko-KR") + "만원";
  }
  // 84 안에서 74/59의 차액. 값이 역전되면(소형이 더 비싸면) 그렇게 적는다.
  function diffPhrase(it) {
    if (it.diff == null) return "—";
    var small = it.basis === "74/84" ? "74㎡" : "59㎡";
    if (it.diff >= 0) return won(it.diff);
    return man(-it.diff) + " (" + small + "가 오히려 비쌈)";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(v) { return v == null ? "—" : v.toFixed(1) + "%"; }
  function signed(v) { return (v > 0 ? "+" : "") + v.toFixed(1); }

  /* ── 판정 표시 ──────────────────────────────── */
  var VERDICT = {
    "84": { label: "84㎡ 추천", cls: "b-84", v: "v-84" },
    "59": { label: "59㎡ 추천", cls: "b-59", v: "v-59" },
    watch: { label: "관찰", cls: "b-watch", v: "" },
    thin: { label: "표본 부족", cls: "b-thin", v: "v-thin" },
    na: { label: "비교 불가", cls: "b-na", v: "" }
  };

  function baselineOf(it) {
    if (it.basis === "59/84") return BASE.r59_84;
    if (it.basis === "74/84") return BASE.r74_84;
    return null;
  }

  /* ── 한 줄 해석 ─────────────────────────────── */
  function noteFor(it) {
    var base59 = BASE.r59_84, base74 = BASE.r74_84;
    if (!it.basis) {
      var got = [];
      ["59", "74", "84"].forEach(function (k) {
        var a = it["a" + k];
        if (a) got.push(k + "㎡ " + man(a.med) + "(" + a.n + "건)");
      });
      return "12개월간 짝이 되는 평형 거래가 없었습니다. " + esc(got.join(" · ")) + " — 단일 평형 단지입니다.";
    }
    var d;
    if (it.basis === "59/84") {
      d = it.ratio - base59;
      if (it.verdict === "84") {
        return "59㎡가 84㎡의 <b>" + pct(it.ratio) + "</b>로 시장 정상선(" + base59 + "%)보다 <b>" +
          signed(d) + "%p</b> 높습니다. 84㎡까지 차액이 " + diffPhrase(it) +
          "뿐이라 — 어차피 살 거면 84㎡가 단가상 유리합니다" +
          (it.a59 && it.a84 && it.a59.mm && it.a84.mm ? " (㎡당 " + it.a59.mm + "만 vs " + it.a84.mm + "만)." : ".");
      }
      if (it.verdict === "59") {
        return "59㎡가 84㎡의 <b>" + pct(it.ratio) + "</b>로 정상선(" + base59 + "%)보다 <b>" +
          signed(d) + "%p</b> 낮습니다. 59㎡ 단가가 눌린 단지라 실거주 목적이면 59㎡ 메리트가 큽니다 (84㎡까지 " + diffPhrase(it) + ").";
      }
      if (it.verdict === "thin") {
        return "59/84 <b>" + pct(it.ratio) + "</b> — 정상선(" + base59 + "%) 대비 " + signed(d) +
          "%p. 다만 두 평형 중 한쪽 거래가 3건 미만이라 판정을 보류했습니다 (차액 " + diffPhrase(it) + ").";
      }
      return "59/84 <b>" + pct(it.ratio) + "</b> — 정상선(" + base59 + "%)과 " + Math.abs(d).toFixed(1) +
        "%p 차이의 정상 범위입니다. 84㎡까지 차액 " + diffPhrase(it) + ".";
    }
    d = it.ratio - base74;
    if (it.verdict === "84") {
      return "59㎡ 거래가 없는 단지입니다. 74㎡가 84㎡의 <b>" + pct(it.ratio) + "</b>(정상선 " + base74 +
        "%) — 차액이 " + diffPhrase(it) + "뿐이라 74㎡를 고를 이유가 거의 없습니다.";
    }
    if (it.verdict === "thin") {
      return "59㎡ 거래 없음. 74/84 <b>" + pct(it.ratio) + "</b>, 차액 " + diffPhrase(it) +
        ". 표본이 3건 미만이라 판정을 보류합니다.";
    }
    return "59㎡ 거래 없음. 74/84 <b>" + pct(it.ratio) + "</b>(정상선 " + base74 + "%), 차액 " +
      diffPhrase(it) + " — 정상 범위입니다.";
  }

  /* ── 카드 ───────────────────────────────────── */
  function areaBox(it, k) {
    var a = it["a" + k];
    if (!a) {
      return '<div class="area is-missing"><span class="a-name">' + k +
        '㎡</span><span class="a-price">거래 없음</span><span class="a-n">&nbsp;</span></div>';
    }
    var cheap = (k === "84" && it.verdict === "84") || (k === "59" && it.verdict === "59");
    return '<div class="area' + (cheap ? " is-cheap" : "") + '">' +
      '<span class="a-name">' + k + "㎡</span>" +
      '<span class="a-price">' + man(a.med) + "</span>" +
      '<span class="a-n">' + a.n + "건 거래</span></div>";
  }

  function factsFor(it) {
    var out = [];
    if (it.basis) {
      out.push('<span class="fact">' + it.basis.replace("/", "·") + " " + pct(it.ratio) + "</span>");
      if (it.ratio6 != null) out.push('<span class="fact dim">최근 6개월 ' + pct(it.ratio6) + "</span>");
      if (it.diff != null) {
        out.push('<span class="fact' + (it.verdict === "84" && it.diff >= 0 && it.diff <= 10000 ? " good" : "") + '">' +
          (it.diff >= 0 ? (it.basis === "59/84" ? "84−59 " : "84−74 ") + man(it.diff)
            : "역전 " + man(-it.diff)) + "</span>");
      }
    }
    var pair = it.basis === "59/84" ? [it.a59, it.a84] : it.basis === "74/84" ? [it.a74, it.a84] : [];
    var thin = pair.length ? Math.min.apply(null, pair.map(function (a) { return a ? a.n : 0; })) : 0;
    if (it.sample === "low" && it.basis) out.push('<span class="fact warn">표본 3건 미만</span>');
    else if (thin && thin < 5) out.push('<span class="fact warn">표본 ' + thin + "건으로 얇음</span>");
    var direct = (it.a59 && it.a59.direct || 0) + (it.a74 && it.a74.direct || 0) + (it.a84 && it.a84.direct || 0);
    if (direct > 0) out.push('<span class="fact dim">직거래 ' + direct + "건 포함</span>");
    var cancel = (it.a59 && it.a59.cancel || 0) + (it.a74 && it.a74.cancel || 0) + (it.a84 && it.a84.cancel || 0);
    if (cancel > 0) out.push('<span class="fact dim">해제 ' + cancel + "건 제외</span>");
    var low = (it.a59 && it.a59.ex || 0) + (it.a74 && it.a74.ex || 0) + (it.a84 && it.a84.ex || 0);
    if (low > 0) out.push('<span class="fact dim">1~2층 ' + low + "건 제외</span>");
    return out.join("");
  }

  function detailFor(it) {
    var rows = "";
    ["59", "74", "84"].forEach(function (k) {
      var a = it["a" + k];
      if (!a) return;
      rows += "<tr><td>" + k + "㎡</td><td>" + man(a.med) + "</td><td>" + a.n +
        "</td><td>" + a.mm + '</td><td class="last">' + esc(a.last) + "</td></tr>";
    });
    if (!rows) return "";
    return "<details><summary>상세 · 최근거래</summary><div class=\"detail-body\"><table>" +
      "<tr><th>평형</th><th>중앙값</th><th>건수</th><th>㎡당</th><th>최근 거래</th></tr>" +
      rows + "</table></div></details>";
  }

  function card(it) {
    var v = VERDICT[it.verdict] || VERDICT.na;
    var base = baselineOf(it);
    var bar = "";
    if (it.basis) {
      var w = Math.max(2, Math.min(100, it.ratio));
      bar = '<div class="ratio">' +
        '<div class="ratio-head"><span class="ratio-key">' + it.basis + "</span>" +
        "<b>" + pct(it.ratio) + "</b>" +
        (base != null ? '<span class="base">정상선 ' + base + "%</span>" : "") +
        "</div>" +
        '<div class="bar"><div class="fill" style="width:' + w + '%"></div>' +
        (base != null ? '<div class="mark" style="left:' + Math.min(100, base) + '%"></div>' : "") +
        "</div></div>";
    }
    return '<article class="card ' + v.v + '">' +
      '<div class="card-top"><div><h2>' + esc(it.name) + "</h2>" +
      '<p class="loc">' + esc(it.gu) + (it.dong ? " " + esc(it.dong) : "") + " · " +
      (it.year ? it.year + "년 준공" : "준공 미상") + " · " + it.trades + "건</p></div>" +
      '<span class="badge ' + v.cls + '">' + v.label + "</span></div>" +
      bar +
      '<div class="areas">' + areaBox(it, "59") + areaBox(it, "74") + areaBox(it, "84") + "</div>" +
      '<div class="facts">' + factsFor(it) + "</div>" +
      '<p class="note">' + noteFor(it) + "</p>" +
      detailFor(it) +
      "</article>";
  }

  /* ── 필터·정렬 ──────────────────────────────── */
  function inTab(it) {
    if (state.tab === "rec84") return it.verdict === "84";
    if (state.tab === "rec59") return it.verdict === "59";
    if (state.tab === "near74") return it.basis === "74/84";
    return true;
  }
  function matches(it) {
    if (state.gu !== "전체" && it.gu !== state.gu) return false;
    if (state.q) {
      var q = state.q.replace(/\s+/g, "").toLowerCase();
      var hay = (it.name + it.dong + it.gu + it.sgg).replace(/\s+/g, "").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }
  function sortItems(arr) {
    var s = state.sort;
    var copy = arr.slice();
    var rank = { "84": 0, "59": 1, watch: 2, thin: 3, na: 4 };
    var tier = { high: 0, mid: 1, low: 2 };
    copy.sort(function (a, b) {
      if (s === "trade") return (b.trades || 0) - (a.trades || 0);
      if (s === "diffasc") {
        var da = a.diff == null ? Infinity : a.diff, db = b.diff == null ? Infinity : b.diff;
        return da - db;
      }
      if (s === "rasc") {
        var ra = a.ratio == null ? Infinity : a.ratio, rb = b.ratio == null ? Infinity : b.ratio;
        return ra - rb;
      }
      if (s === "rdesc") {
        var qa = a.ratio == null ? -Infinity : a.ratio, qb = b.ratio == null ? -Infinity : b.ratio;
        return qb - qa;
      }
      // 기본: 추천 우선 — 판정 순 → 표본 등급 → 정상선 대비 편차
      var oa = rank[a.verdict] == null ? 9 : rank[a.verdict];
      var ob = rank[b.verdict] == null ? 9 : rank[b.verdict];
      if (oa !== ob) return oa - ob;
      var ta = tier[a.sample] == null ? 3 : tier[a.sample];
      var tb = tier[b.sample] == null ? 3 : tier[b.sample];
      if (ta !== tb) return ta - tb;
      var ga = a.ratio == null ? -Infinity : Math.abs(a.ratio - baselineOf(a));
      var gb = b.ratio == null ? -Infinity : Math.abs(b.ratio - baselineOf(b));
      if (gb !== ga) return gb - ga;
      return (b.trades || 0) - (a.trades || 0);
    });
    return copy;
  }

  function render() {
    if (!DATA) return;
    var items = DATA.items.filter(inTab).filter(matches);
    var shown = sortItems(items);
    countEl.textContent = shown.length.toLocaleString("ko-KR") + "개 단지";
    if (!shown.length) {
      listEl.innerHTML = '<div class="empty">조건에 맞는 단지가 없습니다.<br>검색어나 구 필터를 바꿔 보세요.</div>';
      return;
    }
    var html = [];
    for (var i = 0; i < shown.length; i++) html.push(card(shown[i]));
    listEl.innerHTML = html.join("");
  }

  /* ── 컨트롤 ─────────────────────────────────── */
  function buildGuCounts() {
    var counts = { "전체": DATA.items.length };
    DATA.items.forEach(function (it) {
      if (inTab(it)) counts[it.gu] = (counts[it.gu] || 0) + 1;
    });
    gusEl.innerHTML = GU_LIST.map(function (g) {
      return '<button class="chip' + (g === state.gu ? " is-active" : "") + '" data-gu="' + g + '">' +
        g + (counts[g] ? "<small>" + counts[g] + "</small>" : "") + "</button>";
    }).join("");
  }

  function setActiveTab() {
    Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === state.tab);
    });
  }

  function paintTabCounts() {
    var c = { all: DATA.items.length, rec84: 0, rec59: 0, near74: 0 };
    DATA.items.forEach(function (it) {
      if (it.verdict === "84") c.rec84++;
      if (it.verdict === "59") c.rec59++;
      if (it.basis === "74/84") c.near74++;
    });
    Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b) {
      var key = b.getAttribute("data-tab");
      var label = { all: "전체", rec84: "84 추천", rec59: "59 추천", near74: "74·84 근접" }[key];
      var dot = key === "rec84" ? '<span class="dot dot-blue"></span>' :
        key === "rec59" ? '<span class="dot dot-green"></span>' :
        key === "near74" ? '<span class="dot dot-gray"></span>' : "";
      b.innerHTML = dot + label + ' <span class="tab-n">' + (c[key] || 0) + "</span>";
    });
  }

  /* ── KPI·메타 ───────────────────────────────── */
  function fmtDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function paintMeta() {
    var m = DATA.meta;
    BASE.r59_84 = m.baselines.r59_84;
    BASE.r74_84 = m.baselines.r74_84;
    var c = m.verdict_counts || {};
    $("kpiComplex").textContent = m.complex_count;
    $("kpi84").textContent = c["84"] || 0;
    $("kpi59").textContent = c["59"] || 0;
    $("kpiBase").textContent = m.baselines.r59_84 + "% / " + m.baselines.r74_84 + "%";
    $("kpiBaseFoot").textContent = "59/84 · 74/84 · " + (m.baselines.sample_n || 0) + "개 단지 중앙값";
    $("heroMeta").innerHTML =
      "<span>계약일 " + m.period_start + " ~ " + m.period_end + "</span>" +
      "<span>갱신 " + fmtDateTime(m.generated_at) + "</span>" +
      "<span>국토부 원자료 " + (m.raw_count || 0).toLocaleString("ko-KR") + "건</span>";
  }

  /* ── 이벤트 ─────────────────────────────────── */
  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (!b) return;
    state.tab = b.getAttribute("data-tab");
    setActiveTab();
    buildGuCounts();
    render();
  });

  gusEl.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    state.gu = b.getAttribute("data-gu");
    buildGuCounts();
    render();
  });

  var timer = null;
  qEl.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      state.q = qEl.value.trim();
      render();
    }, 120);
  });

  sortEl.addEventListener("change", function () {
    state.sort = sortEl.value;
    render();
  });

  /* ── 시작 ───────────────────────────────────── */
  fetch("data/apartments.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (json) {
      if (!json || !json.items || !json.items.length) throw new Error("데이터 없음");
      DATA = json;
      paintMeta();
      paintTabCounts();
      buildGuCounts();
      render();
    })
    .catch(function (err) {
      listEl.innerHTML = '<div class="empty">데이터를 불러오지 못했습니다.<br>' +
        "잠시 후 새로고침해 주세요. (" + esc(err.message) + ")</div>";
    });
})();
