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
  renderLoad(range);
  renderHeat(range);
  renderRings();
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

/* ==========================================================
   Heute: Plakat-Bühne, Tagesziele, Belastung, Kontinuität, Comeback-Leiter
   ========================================================== */
const ZONES = ['z1', 'z2', 'z3', 'z4', 'z5'];

/** Hauptzone einer Trainingsart (geschätzt, bis echte Pulsdaten kommen) */
function zoneOfCategory(key) {
  const fixed = { mobility: 'z1', comeback: 'z2', gym: 'z4' };
  if (fixed[key]) return fixed[key];
  const byType = { cycling: 'z2', running: 'z2', swimming: 'z2', strength: 'z4', mobility: 'z1', other: 'z3' };
  return byType[CATEGORIES[key].type] || 'z3';
}

/** Minuten eines Tages je Zone (Kraft verteilt sich auf Z3–Z5) */
function zoneMinutes(record) {
  const out = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  if (!record) return out;
  const { gym, mobility, comeback } = record.workouts;
  out.z1 += mobility;
  out.z2 += comeback;
  out.z3 += Math.round(gym * 0.35);
  out.z4 += Math.round(gym * 0.55);
  out.z5 += Math.round(gym * 0.1);
  return out;
}

/* ---------- Plakat-Bühne ---------- */
function doneStorageKey() {
  return `fitboard.done.${DateUtils.toKey(TODAY)}`;
}

/** Heutige Einheiten: Hauptsportart (meiste Minuten) zuerst */
function todaySessions() {
  const dayKey = DateUtils.weekdayKey(TODAY);
  const sessions = Object.keys(CATEGORIES)
    .map((cat) => {
      const plan = Plans.data[cat][dayKey];
      const minutes = plan.exercises.reduce((sum, e) => sum + sportTypeOf(cat).minutes(e), 0);
      return { cat, plan, minutes };
    })
    .filter((s) => s.plan.exercises.length);
  return sessions.sort((a, b) => b.minutes - a.minutes);
}

/** Knappe Mengenangabe fürs Plakat: „4×8“, „10×100 m“, „45 min“ */
function compactDose(cat, e) {
  const type = CATEGORIES[cat].type;
  if (type === 'swimming') return `${e.reps || 1}×${e.distanceM} m`;
  if (['cycling', 'running', 'other'].includes(type)) return e.duration ? `${e.duration} min` : '';
  return `${e.sets}×${e.reps}`;
}

function renderTodayPlan() {
  const stage = document.getElementById('stage');
  const weekday = WEEKDAYS.find((d) => d.key === DateUtils.weekdayKey(TODAY)).long;
  const sessions = todaySessions();
  const done = new Set(Storage.get(doneStorageKey(), []));

  if (!sessions.length) {
    stage.dataset.cat = 'mobility';
    stage.innerHTML = `
      <div class="poster">
        <span class="eyebrow">Regeneration gehört zum Training</span>
        <span class="zone-tag">Z1</span>
        <h3 id="posterTitle">${weekday}.<br>Ruhetag.</h3>
        <p class="poster-sub">Locker bewegen, gut schlafen, Protein verteilen.</p>
      </div>
      <button type="button" class="start-bar" data-go="plans"><span>Trainingsplan öffnen</span><span>keine Einheit geplant</span></button>`;
    return;
  }

  const main = sessions[0];
  const all = sessions.flatMap((s) => s.plan.exercises.map((e) => ({ ...e, cat: s.cat })));
  const doneCount = all.filter((e) => done.has(e.id)).length;
  const nextIndex = all.findIndex((e) => !done.has(e.id));
  const totalMin = sessions.reduce((sum, s) => sum + s.minutes, 0);

  stage.dataset.cat = main.cat;
  stage.innerHTML = `
    <div class="poster">
      <span class="eyebrow">${sessions.length} ${sessions.length === 1 ? 'Einheit' : 'Einheiten'} · ca. ${Format.minutes(totalMin)}</span>
      <span class="zone-tag">${zoneOfCategory(main.cat).toUpperCase()}</span>
      <h3 id="posterTitle">${weekday}.<br>${escapeHtml(CATEGORIES[main.cat].label)}.</h3>
      <p class="poster-sub">${escapeHtml(main.plan.focus || CATEGORIES[main.cat].subtitle)}</p>
    </div>
    <ol class="moves">
      ${all
        .map((e, i) => {
          const isDone = done.has(e.id);
          const isNext = i === nextIndex;
          return `
        <li data-cat="${e.cat}">
          <button type="button" class="move${isDone ? ' done' : ''}${isNext ? ' next' : ''}" data-id="${e.id}"
                  aria-pressed="${isDone}" aria-label="${escapeHtml(e.name)} ${isDone ? 'als offen markieren' : 'als erledigt markieren'}">
            <span class="move-no">${String(i + 1).padStart(2, '0')}</span>
            <span>
              <span class="move-name">${escapeHtml(e.name)}${isNext ? '<span class="next-tag">als Nächstes</span>' : ''}</span>
              <span class="move-meta"><span class="move-cat"></span>${escapeHtml(CATEGORIES[e.cat].label.toLowerCase())}${e.detail ? ` · ${escapeHtml(e.detail)}` : ''}</span>
            </span>
            <span class="move-dose">${escapeHtml(compactDose(e.cat, e))}</span>
          </button>
        </li>`;
        })
        .join('')}
    </ol>
    ${
      nextIndex >= 0
        ? `<button type="button" class="start-bar" data-complete="${all[nextIndex].id}">
             <span>Übung ${String(nextIndex + 1).padStart(2, '0')} erledigt</span><span>${doneCount}/${all.length} geschafft</span>
           </button>`
        : `<button type="button" class="start-bar" data-go="stats"><span>Alles erledigt. Stark!</span><span>${all.length}/${all.length}</span></button>`
    }`;
}

function toggleDone(id, force) {
  const done = new Set(Storage.get(doneStorageKey(), []));
  const makeDone = force ?? !done.has(id);
  if (makeDone) done.add(id);
  else done.delete(id);
  Storage.set(doneStorageKey(), [...done]);
  renderTodayPlan();
}

/* ---------- Tagesziele (Ringe) ---------- */
function renderRings() {
  const rec = getRecords(TODAY, TODAY)[0];
  if (!rec) return;
  const rings = [
    { key: 'training', value: rec.workoutMin, goal: GOALS.workoutMin, fmt: (v) => `${v} min`, color: 'var(--c-workout)' },
    { key: 'bewegung', value: rec.steps, goal: GOALS.steps, fmt: (v) => Format.number(v), color: 'var(--c-steps)' },
    { key: 'erholung', value: rec.sleep, goal: GOALS.sleep, fmt: (v) => `${v.toLocaleString('de-DE')} h`, color: 'var(--c-sleep)' },
  ];
  const radii = [68, 52, 36];
  const svg = document.getElementById('ringSvg');
  svg.innerHTML = rings
    .map((r, i) => {
      const c = 2 * Math.PI * radii[i];
      const pct = Math.min(r.value / r.goal, 1);
      return `
        <circle cx="80" cy="80" r="${radii[i]}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
        <circle class="ring-fg" cx="80" cy="80" r="${radii[i]}" fill="none" stroke="${r.color}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - pct)}"
          transform="rotate(-90 80 80)"/>`;
    })
    .join('');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => svg.querySelectorAll('.ring-fg').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.target)))
  );

  const reached = rings.filter((r) => r.value >= r.goal).length;
  document.getElementById('ringNote').textContent = `heute · ${reached}/3 erreicht`;
  document.getElementById('ringLegend').innerHTML = rings
    .map(
      (r) => `
      <li><i style="background:${r.color}"></i>
        <span><span class="mono-sm">${r.key}</span><b>${r.fmt(r.value)} <small>/ ${r.fmt(r.goal)}</small></b></span></li>`
    )
    .join('');
}

/* ---------- Belastung je Zone ---------- */
function renderLoad(range) {
  const end = range.end > TODAY ? TODAY : range.end;
  const start = state.period === 'day' ? DateUtils.startOfWeek(range.start) : range.start;
  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  getRecords(start, end).forEach((r) => {
    const z = zoneMinutes(r);
    ZONES.forEach((k) => (totals[k] += z[k]));
  });
  const sum = ZONES.reduce((s, k) => s + totals[k], 0) || 1;

  document.getElementById('loadSub').textContent =
    state.period === 'month' ? `Minuten je Zone · ${Format.date(range.start, { month: 'long' })}` : `Minuten je Zone · KW ${DateUtils.isoWeek(start)}`;
  document.getElementById('zonebar').innerHTML = ZONES.map(
    (k) => `<div style="width:${(totals[k] / sum) * 100}%;background:var(--${k})" title="${k.toUpperCase()}: ${totals[k]} min"></div>`
  ).join('');
  document.getElementById('zoneLegend').innerHTML = ZONES.map((k) => `<span>${k}<b>${totals[k]}</b></span>`).join('');

  // Tagesbalken der Woche, in der der Zeitraum endet
  const monday = DateUtils.startOfWeek(end);
  const days = WEEKDAYS.map((d, i) => {
    const date = DateUtils.addDays(monday, i);
    const z = date <= TODAY ? zoneMinutes(getRecords(date, date)[0]) : zoneMinutes(null);
    return { d, date, z, total: ZONES.reduce((s, k) => s + z[k], 0) };
  });
  const max = Math.max(90, ...days.map((x) => x.total));
  document.getElementById('weekBars').innerHTML = days
    .map(
      (x) => `
      <div class="week-bar" title="${x.d.long}: ${x.total} min">
        ${ZONES.slice()
          .reverse()
          .filter((k) => x.z[k])
          .map((k) => `<div class="seg" style="height:${(x.z[k] / max) * 100}%;background:var(--${k})"></div>`)
          .join('')}
        ${x.total ? '' : '<div class="seg" style="height:3px;background:var(--border)"></div>'}
      </div>`
    )
    .join('');
  document.getElementById('weekLbl').innerHTML = days
    .map((x) => `<span class="${DateUtils.isSameDay(x.date, TODAY) ? 'is-today' : ''}">${x.d.short.toLowerCase()}</span>`)
    .join('');
}

/* ---------- Kontinuität: 12 Wochen als Kalender-Kästchen ---------- */
function renderHeat(range) {
  const end = range.end > TODAY ? TODAY : range.end;
  const start = DateUtils.addDays(DateUtils.startOfWeek(end), -7 * 11);
  const level = (m) => (!m ? null : m < 20 ? 'z1' : m < 45 ? 'z2' : m < 70 ? 'z3' : m < 95 ? 'z4' : 'z5');
  let html = ['mo', '', 'mi', '', 'fr', '', 'so'].map((l) => `<span class="rowlbl">${l}</span>`).join('');
  let active = 0;
  for (let i = 0; i < 84; i++) {
    const date = DateUtils.addDays(start, i);
    const rec = date <= TODAY ? getRecords(date, date)[0] : null;
    const lv = rec ? level(rec.workoutMin) : null;
    if (lv) active++;
    const label = `${Format.date(date, { day: 'numeric', month: 'short' })}: ${rec ? rec.workoutMin : 0} min`;
    html += `<span class="cell" style="${date > TODAY ? 'opacity:.3;' : ''}${lv ? `background:var(--${lv})` : ''}" title="${label}"></span>`;
  }
  const heat = document.getElementById('heat');
  heat.innerHTML = html;
  heat.setAttribute('role', 'img');
  heat.setAttribute('aria-label', `${active} Trainingstage in den letzten 12 Wochen`);
  document.getElementById('heatNote').textContent = `${active} Trainingstage · 12 Wochen`;
}

/* ---------- Comeback-Leiter ---------- */
const LADDER_KEY = 'fitboard.comeback.stage';
const LADDER = [
  { short: 'gehen', label: 'Zügig gehen 30 min' },
  { short: 'g/l 1:2', label: 'Geh-Lauf 1 min laufen / 2 min gehen' },
  { short: 'g/l 2:1', label: 'Geh-Lauf 2 min laufen / 1 min gehen' },
  { short: 'lauf 10', label: '10 min am Stück laufen' },
  { short: 'lauf 20', label: '20 min am Stück laufen' },
  { short: 'lauf 30', label: '30 min am Stück laufen' },
];

function renderLadder() {
  const stage = Storage.get(LADDER_KEY, 3);
  document.getElementById('ladder').innerHTML = LADDER.map(
    (s, i) =>
      `<div class="ladder-step ${i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : ''}" style="height:${28 + i * 12}%" title="Stufe ${i + 1}: ${s.label}"></div>`
  ).join('');
  document.getElementById('ladderLbl').innerHTML = LADDER.map((s) => `<span>${s.short}</span>`).join('');
  document.getElementById('ladderStage').textContent = `Stufe ${stage} von ${LADDER.length}`;
  document.getElementById('ladderHint').textContent =
    stage < LADDER.length ? `Jetzt: ${LADDER[stage - 1].label}. Weiter nach 3 Einheiten mit Schmerz ≤ 2.` : 'Ziel erreicht: 30 min am Stück.';
  const last = activityData.filter((r) => r.pain !== null).pop();
  document.getElementById('painNow').textContent = last ? `${last.pain}/10` : '–';
  document.getElementById('ladderDown').disabled = stage <= 1;
  document.getElementById('ladderUp').disabled = stage >= LADDER.length;
}

function moveLadder(step) {
  const stage = Math.min(LADDER.length, Math.max(1, Storage.get(LADDER_KEY, 3) + step));
  Storage.set(LADDER_KEY, stage);
  renderLadder();
  showToast(`Comeback-Leiter: Stufe ${stage}`);
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
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  },
  updateButton() {
    const dark = this.current() === 'dark';
    // Farbe der Statusleiste (Handy) an das Farbschema anpassen
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = cssVar('--bg')));
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

  // Plakat-Bühne: Übung antippen = erledigt/offen, Balken = nächste Übung erledigt
  document.getElementById('stage').addEventListener('click', (e) => {
    const move = e.target.closest('.move[data-id]');
    if (move) return toggleDone(move.dataset.id);
    const complete = e.target.closest('[data-complete]');
    if (complete) {
      toggleDone(complete.dataset.complete, true);
      showToast('Übung erledigt');
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) Mobile.goTo(go.dataset.go);
  });

  // Comeback-Leiter
  document.getElementById('ladderUp').addEventListener('click', () => moveLadder(1));
  document.getElementById('ladderDown').addEventListener('click', () => moveLadder(-1));

  // Hell / Dunkel
  document.getElementById('themeToggle').addEventListener('click', () => Theme.toggle());
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
  renderLadder();
  Mobile.init(); // Handy-Ansichten, Einstellungen, Offline-Modus
}

document.addEventListener('DOMContentLoaded', init);
