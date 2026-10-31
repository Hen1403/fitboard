/* ==========================================================
   app.js – Hauptlogik: Filter, Zusammenfassungen, Diagramme,
   Navigation und Farbschema
   ========================================================== */

/* ---------- Zustand der App ---------- */
const state = {
  period: 'week', // 'day' | 'week' | 'month'
  offset: 0, // 0 = aktueller Zeitraum, -1 = davor, …
  metric: 'steps', // Kennzahl im Wochen-Diagramm
};

const TODAY = DateUtils.startOfDay(new Date());
const activityData = generateSampleData(DATA_DAYS);
const FIRST_DATE = activityData[0].date;

/* ==========================================================
   Daten auswerten
   ========================================================== */

/** Start- und Enddatum für einen Zeitraum berechnen */
function getRange(period, offset) {
  if (period === 'day') {
    const day = DateUtils.addDays(TODAY, offset);
    return { start: day, end: day };
  }
  if (period === 'week') {
    const start = DateUtils.addDays(DateUtils.startOfWeek(TODAY), offset * 7);
    return { start, end: DateUtils.addDays(start, 6) };
  }
  // Monat
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1);
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset + 1, 0);
  return { start, end };
}

/** Alle Tagesdatensätze zwischen zwei Daten */
function getRecords(start, end) {
  return activityData.filter((r) => r.date >= start && r.date <= end);
}

/** Summen bzw. Durchschnitte für eine Liste von Tagen */
function summarize(records) {
  const days = records.length;
  const sum = (key) => records.reduce((total, r) => total + r[key], 0);
  const workouts = { gym: 0, mobility: 0, comeback: 0 };
  records.forEach((r) => Object.keys(workouts).forEach((k) => (workouts[k] += r.workouts[k])));

  return {
    days,
    steps: sum('steps'),
    calories: sum('calories'),
    workoutMin: sum('workoutMin'),
    sleep: days ? sum('sleep') / days : 0, // Schlaf als Durchschnitt pro Nacht
    workouts,
  };
}

/** Durchschnitt pro Tag für eine Kennzahl */
function perDay(summary, key) {
  if (!summary.days) return 0;
  return METRICS[key].isAverage ? summary[key] : summary[key] / summary.days;
}

/* ==========================================================
   Rendering
   ========================================================== */

function render() {
  const range = getRange(state.period, state.offset);
  const records = getRecords(range.start, range.end);
  const summary = summarize(records);
  const prevRange = getRange(state.period, state.offset - 1);
  const prevSummary = summarize(getRecords(prevRange.start, prevRange.end));

  renderPeriodNav(range);
  renderKpis(summary, prevSummary);
  renderShare(summary);
  renderActivity(range);
  renderWeekly(range);
  renderTrend(range);
  Nutrition.renderCharts(range);
}

/* ---------- Zeitraum-Navigation ---------- */
function renderPeriodNav(range) {
  const label = document.getElementById('periodLabel');
  const sub = document.getElementById('overviewSub');

  if (state.period === 'day') {
    const isToday = DateUtils.isSameDay(range.start, TODAY);
    const isYesterday = DateUtils.isSameDay(range.start, DateUtils.addDays(TODAY, -1));
    label.textContent = isToday ? 'Heute' : isYesterday ? 'Gestern' : Format.date(range.start, { weekday: 'short', day: 'numeric', month: 'short' });
    sub.textContent = `Zusammenfassung für ${Format.date(range.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  } else if (state.period === 'week') {
    const from = Format.date(range.start, { day: 'numeric', month: 'short' });
    const to = Format.date(range.end, { day: 'numeric', month: 'short' });
    label.textContent = `KW ${DateUtils.isoWeek(range.start)} · ${from} – ${to}`;
    sub.textContent = state.offset === 0 ? 'Zusammenfassung für diese Woche' : `Zusammenfassung für KW ${DateUtils.isoWeek(range.start)}`;
  } else {
    label.textContent = Format.date(range.start, { month: 'long', year: 'numeric' });
    sub.textContent = `Zusammenfassung für ${label.textContent}${state.offset === 0 ? ' (bisher)' : ''}`;
  }

  // Vor/Zurück nur erlauben, wenn Daten vorhanden sind
  const prev = getRange(state.period, state.offset - 1);
  document.getElementById('prevPeriod').disabled = prev.end < FIRST_DATE;
  document.getElementById('nextPeriod').disabled = state.offset >= 0;

  // Aktiven Filter-Button markieren
  document.querySelectorAll('#periodFilter button').forEach((btn) => {
    const active = btn.dataset.period === state.period;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });
}

/* ---------- Zusammenfassungs-Karten ---------- */
function renderKpis(summary, prevSummary) {
  const grid = document.getElementById('kpiGrid');
  const isDay = state.period === 'day';

  grid.innerHTML = Object.entries(METRICS)
    .map(([key, metric]) => {
      const value = summary[key];
      const avg = perDay(summary, key);
      const goal = GOALS[key];
      const goalTotal = metric.isAverage ? goal : goal * summary.days;
      const percent = goalTotal ? Math.round((value / goalTotal) * 100) : 0;

      // Veränderung zur Vorperiode (über Tagesdurchschnitt – so sind auch angefangene Zeiträume fair)
      let badge = '';
      if (prevSummary.days && summary.days) {
        const prevAvg = perDay(prevSummary, key);
        const change = prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : 0;
        const dir = Math.abs(change) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
        const arrow = dir === 'up' ? icon('arrowUp') : dir === 'down' ? icon('arrowDown') : '';
        const vs = isDay ? 'Vortag' : state.period === 'week' ? 'Vorwoche' : 'Vormonat';
        badge = `<span class="badge ${dir}" title="Ø pro Tag im Vergleich zum ${vs}">${arrow}${Math.abs(change).toFixed(0)} %</span>`;
      }

      // Hauptwert schön formatieren
      let valueHtml;
      if (key === 'steps') valueHtml = Format.number(value);
      else if (key === 'calories') valueHtml = `${Format.number(value)}<small>kcal</small>`;
      else if (key === 'workoutMin') valueHtml = Format.minutes(value);
      else valueHtml = `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })}<small>h</small>`;

      // Unterzeile
      let sub;
      if (metric.isAverage) sub = isDay ? 'letzte Nacht' : 'Ø pro Nacht';
      else sub = isDay ? `Ziel: ${metric.format(goal)}` : `Ø ${metric.format(avg)} pro Tag`;

      return `
        <article class="card kpi" style="--kpi-color: var(${metric.color})">
          <div class="kpi-top">
            <span class="kpi-label"><span class="kpi-icon">${icon(metric.icon)}</span>${metric.label}</span>
            ${badge}
          </div>
          <div>
            <div class="kpi-value">${valueHtml}</div>
            <p class="muted kpi-sub">${sub}</p>
          </div>
          <div>
            <div class="progress" role="progressbar" aria-valuenow="${Math.min(percent, 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="${metric.label} Zielerreichung">
              <span style="width:${Math.min(percent, 100)}%"></span>
            </div>
            <div class="progress-meta">
              <span><strong>${percent} %</strong> vom Ziel</span>
              <span>${metric.isAverage ? `Ziel ${metric.format(goal)}` : metric.format(goalTotal)}</span>
            </div>
          </div>
        </article>`;
    })
    .join('');
}

/* ---------- Trainingsverteilung ---------- */
function renderShare(summary) {
  const total = Object.values(summary.workouts).reduce((a, b) => a + b, 0);
  document.getElementById('shareCenter').innerHTML = `<strong>${Format.minutes(total)}</strong><span>gesamt</span>`;

  document.getElementById('shareLegend').innerHTML = ACTIVITY_KEYS.map((key) => [key, CATEGORIES[key]])
    .map(([key, cat]) => {
      const min = summary.workouts[key];
      const pct = total ? Math.round((min / total) * 100) : 0;
      return `
        <li data-cat="${key}">
          <span class="dot"></span>
          <span>${cat.label}<span class="muted" style="display:block;font-size:12px">${cat.subtitle}</span></span>
          <span class="legend-val">${Format.minutes(min)}<span class="legend-pct">${pct} %</span></span>
        </li>`;
    })
    .join('');

  Charts.share(summary.workouts);
}

/* ---------- Tägliche Aktivität ---------- */
function renderActivity(range) {
  const sub = document.getElementById('activitySub');
  const legend = document.getElementById('activityLegend');
  const stepsSwatch = '<span><i class="swatch" style="background:var(--c-steps)"></i>Schritte</span>';

  if (state.period === 'day') {
    const record = getRecords(range.start, range.end)[0];
    const hours = record ? hourlySteps(record) : new Array(24).fill(0);
    sub.textContent = 'Schritte pro Stunde';
    legend.innerHTML = stepsSwatch;
    Charts.activity({
      mode: 'day',
      labels: hours.map((_, h) => `${h}`),
      titles: hours.map((_, h) => `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00 Uhr`),
      steps: hours,
      calories: [],
    });
    return;
  }

  // Woche / Monat: ein Wert pro Kalendertag (zukünftige Tage bleiben leer)
  const byKey = new Map(getRecords(range.start, range.end).map((r) => [DateUtils.toKey(r.date), r]));
  const labels = [];
  const titles = [];
  const steps = [];
  const calories = [];

  for (let d = new Date(range.start); d <= range.end; d = DateUtils.addDays(d, 1)) {
    const r = byKey.get(DateUtils.toKey(d));
    labels.push(state.period === 'week' ? Format.date(d, { weekday: 'short', day: 'numeric' }) : String(d.getDate()));
    titles.push(Format.date(d, { weekday: 'long', day: 'numeric', month: 'long' }));
    steps.push(r ? r.steps : null);
    calories.push(r ? r.calories : null);
  }

  sub.textContent = `Schritte & aktive Kalorien pro Tag · kräftige Balken = Ziel (${Format.number(GOALS.steps)}) erreicht`;
  legend.innerHTML = `${stepsSwatch}<span><i class="swatch line" style="background:var(--c-kcal)"></i>Kalorien</span>`;
  Charts.activity({ mode: state.period, labels, titles, steps, calories });
}

/* ---------- Wöchentliche Reihen ---------- */
/**
 * Liefert bis zu `count` Wochen bis einschließlich der Woche von `endDate`.
 * completeOnly: nur vollständige Wochen (7 Tage) – wichtig für Summen,
 * damit eine angefangene Woche nicht wie ein Einbruch aussieht.
 */
function getWeeks(endDate, count, completeOnly = false) {
  let lastMonday = DateUtils.startOfWeek(endDate);
  if (completeOnly && getRecords(lastMonday, DateUtils.addDays(lastMonday, 6)).length < 7) {
    lastMonday = DateUtils.addDays(lastMonday, -7);
  }
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = DateUtils.addDays(lastMonday, -7 * i);
    const records = getRecords(start, DateUtils.addDays(start, 6));
    if (!records.length || (completeOnly && records.length < 7)) continue;
    weeks.push({ start, label: `KW ${DateUtils.isoWeek(start)}`, summary: summarize(records) });
  }
  return weeks;
}

/** Endpunkt für Wochen-Diagramme: Ende des Zeitraums, aber nicht in der Zukunft */
function chartEndDate(range) {
  return range.end > TODAY ? TODAY : range.end;
}

function renderWeekly(range) {
  const weeks = getWeeks(chartEndDate(range), 8);
  Charts.weekly({
    labels: weeks.map((w) => w.label),
    values: weeks.map((w) => Math.round(perDay(w.summary, state.metric) * 10) / 10),
    goal: GOALS[state.metric],
    metricKey: state.metric,
    highlightIndex: weeks.length - 1,
  });
}

function renderTrend(range) {
  const weeks = getWeeks(chartEndDate(range), 12, true);
  const series = {};
  ACTIVITY_KEYS.forEach((key) => (series[key] = weeks.map((w) => w.summary.workouts[key])));

  document.getElementById('trendLegend').innerHTML = ACTIVITY_KEYS.map((key) => [key, CATEGORIES[key]])
    .map(([key, c]) => `<span><i class="swatch line" style="background:var(${c.color})"></i>${c.label}</span>`)
    .join('');

  Charts.trend({ labels: weeks.map((w) => w.label), series });
}

/* ---------- Kraftfortschritt (Übersicht aller Übungen mit Gewicht) ---------- */

/** Kleine Verlaufslinie als SVG (ohne Achsen) */
function sparkline(values) {
  if (values.length < 2) return '';
  const w = 120;
  const h = 32;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / range) * (h - pad * 2),
  ]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const area = `${pad},${h} ${line} ${w - pad},${h}`;
  const [lx, ly] = pts[pts.length - 1];
  return `
    <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}" fill="var(--cat-soft)"></polygon>
      <polyline points="${line}" fill="none" stroke="var(--cat)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--cat)"></circle>
    </svg>`;
}

function deltaBadge(diff) {
  if (diff === null) return '<span class="badge flat">–</span>';
  const rounded = Math.round(diff * 10) / 10;
  const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? icon('arrowUp') : dir === 'down' ? icon('arrowDown') : '';
  return `<span class="badge ${dir}">${arrow}${rounded > 0 ? '+' : ''}${formatKg(rounded)}</span>`;
}

function renderStrength() {
  const container = document.getElementById('strengthRows');
  const items = Plans.allExercises().filter(({ exercise }) => Plans.isWeighted(exercise));

  if (!items.length) {
    container.innerHTML = '<p class="muted strength-empty">Noch keine Übungen mit Gewicht. Trage bei einer Übung ein Gewicht ein, um den Fortschritt zu sehen.</p>';
    return;
  }

  container.innerHTML = items
    .map(({ category, day, exercise }) => {
      const entries = WeightLog.entries(exercise.id);
      const values = entries.slice(-12).map((e) => e.weight);
      const current = entries.length ? entries[entries.length - 1].weight : exercise.weight;
      const sinceStart = entries.length > 1 ? current - entries[0].weight : null;
      const fourWeeks = WeightLog.changeSince(exercise.id, 28);
      const weekday = WEEKDAYS.find((d) => d.key === day).short;
      return `
        <button type="button" class="strength-row" role="row" data-cat="${category}" data-id="${exercise.id}"
                aria-label="Gewichtsverlauf von ${escapeHtml(exercise.name)} öffnen">
          <span class="strength-name" role="cell">
            <strong>${escapeHtml(exercise.name)}</strong>
            <span class="muted"><i class="dot"></i>${CATEGORIES[category].label} · ${weekday} · ${escapeHtml(exercise.sets)} × ${escapeHtml(exercise.reps)}</span>
          </span>
          <span class="strength-spark" role="cell">${sparkline(values)}</span>
          <span class="strength-current" role="cell">${current ? formatKg(current) : '–'}</span>
          <span role="cell" data-label="4 Wochen">${deltaBadge(fourWeeks)}</span>
          <span role="cell" data-label="Seit Start">${deltaBadge(sinceStart)}</span>
        </button>`;
    })
    .join('');
}

/* ---------- Schmerzverlauf (im Comeback-Plan) ---------- */
function renderPainChart() {
  const records = getRecords(DateUtils.addDays(TODAY, -56), TODAY).filter((r) => r.pain !== null);
  Charts.pain({
    labels: records.map((r) => Format.date(r.date, { day: 'numeric', month: 'numeric' })),
    values: records.map((r) => r.pain),
  });
}

/* ---------- Heute geplant (Checkliste) ---------- */
function doneStorageKey() {
  return `fitboard.done.${DateUtils.toKey(TODAY)}`;
}

function renderTodayPlan() {
  const dayKey = DateUtils.weekdayKey(TODAY);
  const done = new Set(Storage.get(doneStorageKey(), []));
  const container = document.getElementById('todayPlan');

  const groups = Object.entries(CATEGORIES)
    .map(([key, cat]) => ({ key, cat, plan: Plans.data[key][dayKey] }))
    .filter((g) => g.plan.exercises.length);

  const allIds = groups.flatMap((g) => g.plan.exercises.map((e) => e.id));
  const doneCount = allIds.filter((id) => done.has(id)).length;
  const weekday = WEEKDAYS.find((d) => d.key === dayKey).long;

  document.getElementById('todayPlanSub').textContent = allIds.length
    ? `${weekday} · ${doneCount} von ${allIds.length} Übungen erledigt`
    : `${weekday} · Ruhetag`;

  renderRing(allIds.length ? doneCount / allIds.length : 0);

  if (!groups.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${icon('coffee')}</span>
        <strong>Heute ist Ruhetag</strong>
        <span class="muted">Regeneration gehört zum Training dazu.</span>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="today-groups">${groups
    .map(
      (g) => `
      <div data-cat="${g.key}">
        <p class="today-group-title"><span class="dot"></span>${g.cat.label}
          <span class="muted">· ${escapeHtml(g.plan.focus || g.cat.subtitle)}</span></p>
        <ul class="check-list">
          ${g.plan.exercises
            .map(
              (e) => `
            <li>
              <label class="check-item ${done.has(e.id) ? 'done' : ''}">
                <input type="checkbox" data-id="${e.id}" ${done.has(e.id) ? 'checked' : ''} />
                <span class="check-box">${icon('check')}</span>
                <span class="check-text">
                  <strong>${escapeHtml(e.name)}</strong>
                  <span>${escapeHtml(exerciseShort(g.key, e))}</span>
                </span>
              </label>
            </li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('')}</div>`;
}

function renderRing(ratio) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  document.getElementById('todayRing').innerHTML = `
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle class="ring-bg" cx="28" cy="28" r="${r}"></circle>
      <circle class="ring-fg" cx="28" cy="28" r="${r}"
              stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - ratio)}"></circle>
    </svg>
    <span class="ring-text">${Math.round(ratio * 100)}%</span>`;
}

/* ---------- Sidebar: Tagesziele ---------- */
function renderGoals() {
  document.getElementById('goalList').innerHTML = Object.entries(METRICS)
    .map(
      ([key, m]) => `
      <li><span><i class="dot" style="background:var(${m.color})"></i>${m.short || m.label}</span>
      <strong>${m.format(GOALS[key])}</strong></li>`
    )
    .join('');
}

/* ---------- Begrüßung ---------- */
function renderGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  document.getElementById('greeting').textContent = `${greeting}!`;
  document.getElementById('todayLabel').textContent = Format.date(TODAY, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ==========================================================
   Farbschema (Hell / Dunkel)
   ========================================================== */
const Theme = {
  current() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  updateButton() {
    const dark = this.current() === 'dark';
    document.getElementById('themeIcon').innerHTML = icon(dark ? 'sun' : 'moon');
    document.getElementById('themeText').textContent = dark ? 'Hellmodus' : 'Dunkelmodus';
  },
  toggle() {
    const next = this.current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    Storage.set('fitboard.theme', next);
    this.refresh();
  },
  refresh() {
    this.updateButton();
    // Farbe der Statusleiste (Handy) an das Farbschema anpassen
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = cssVar('--bg')));
    Charts.applyTheme();
    render();
    Plans.renderInfo(); // zeichnet ggf. das Schmerz-Diagramm neu
    if (WeightLog.el.modal.open) WeightLog.render();
    Nutrition.render();
  },
};

/* ==========================================================
   Navigation (Sidebar)
   ========================================================== */
function setupNavigation() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const links = document.querySelectorAll('.nav-link[data-section]');

  const closeMenu = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  };

  document.getElementById('menuBtn').addEventListener('click', () => {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
  });
  backdrop.addEventListener('click', closeMenu);
  links.forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

  // Aktiven Menüpunkt beim Scrollen hervorheben
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.toggle('active', l.dataset.section === entry.target.id));
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  document.querySelectorAll('.section').forEach((section) => observer.observe(section));
}

/* ==========================================================
   Ereignisse
   ========================================================== */
function bindEvents() {
  // Zeitraum-Filter: Tag / Woche / Monat
  document.getElementById('periodFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-period]');
    if (!btn || btn.dataset.period === state.period) return;
    state.period = btn.dataset.period;
    state.offset = 0;
    render();
  });

  // Vor / Zurück
  document.getElementById('prevPeriod').addEventListener('click', () => {
    state.offset -= 1;
    render();
  });
  document.getElementById('nextPeriod').addEventListener('click', () => {
    state.offset = Math.min(0, state.offset + 1);
    render();
  });

  // Kennzahl im Wochen-Diagramm
  document.getElementById('metricSelect').addEventListener('change', (e) => {
    state.metric = e.target.value;
    renderWeekly(getRange(state.period, state.offset));
  });

  // Checkliste "Heute geplant"
  document.getElementById('todayPlan').addEventListener('change', (e) => {
    if (!e.target.matches('input[type="checkbox"]')) return;
    const done = new Set(Storage.get(doneStorageKey(), []));
    if (e.target.checked) done.add(e.target.dataset.id);
    else done.delete(e.target.dataset.id);
    Storage.set(doneStorageKey(), [...done]);
    renderTodayPlan();
  });

  // Hell / Dunkel
  document.getElementById('themeToggle').addEventListener('click', () => Theme.toggle());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.dataset.theme) Theme.refresh();
  });
}

/* ==========================================================
   Start
   ========================================================== */
function init() {
  hydrateIcons();
  Charts.applyTheme();
  renderGreeting();
  renderGoals();

  // Gewichtsverlauf zuerst laden – die Pläne zeigen daraus Trends an
  WeightLog.onChange = () => {
    renderStrength();
    renderTodayPlan();
    Plans.renderDetail();
  };
  WeightLog.init();

  // Pläne: bei Änderungen "Heute"-Liste und Kraftfortschritt aktualisieren
  Plans.onChange = () => {
    renderTodayPlan();
    renderStrength();
    if (Nutrition.el) Nutrition.renderDay(); // Trainingsumfang ändert die Ernährungsziele
  };
  Plans.onInfoRendered = (category) => {
    if (category === 'comeback') renderPainChart();
  };
  Plans.init();
  Nutrition.init();

  // Klick auf eine Zeile im Kraftfortschritt öffnet den Gewichtsverlauf
  document.getElementById('strengthRows').addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) WeightLog.open(row.dataset.id);
  });

  Theme.updateButton();
  bindEvents();
  setupNavigation();
  render();
  renderTodayPlan();
  renderStrength();
  Mobile.init(); // Handy-Ansichten, Einstellungen, Offline-Modus
}

document.addEventListener('DOMContentLoaded', init);
