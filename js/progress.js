/* ==========================================================
   progress.js – Gewichtsverlauf pro Übung
   - speichert jede Einheit (Datum, Gewicht, Wiederholungen)
   - fasst Einträge pro Einheit, Woche oder Monat zusammen
   - zeigt Verlauf + Vergleiche im Dialog „Gewichtsverlauf“
   ========================================================== */

const WeightLog = {
  STORAGE_KEY: 'fitboard.weights.v1',
  data: {}, // { [übungs-id]: [{ date, weight, reps }] }
  exercise: null, // aktuell geöffnete Übung
  category: 'gym', // Trainingsart der geöffneten Übung (für die Farbe)
  interval: 'session', // 'session' | 'week' | 'month'
  onChange: () => {}, // wird von app.js gesetzt

  INTERVALS: {
    session: { label: 'Einheit', compare: 'letzter Einheit' },
    week: { label: 'Woche', compare: 'Vorwoche' },
    month: { label: 'Monat', compare: 'Vormonat' },
  },

  /* ---------- Start ---------- */
  init() {
    this.data = Storage.get(this.STORAGE_KEY, null) || generateWeightHistory(DEFAULT_PLANS, DATA_DAYS);
    this.el = {
      modal: document.getElementById('weightModal'),
      title: document.getElementById('weightTitle'),
      sub: document.getElementById('weightSub'),
      tabs: document.getElementById('weightInterval'),
      stats: document.getElementById('weightStats'),
      chartSub: document.getElementById('weightChartSub'),
      list: document.getElementById('weightEntries'),
      form: document.getElementById('weightForm'),
    };
    this.bindEvents();
  },

  save() {
    Storage.set(this.STORAGE_KEY, this.data);
    this.onChange();
  },

  /** Alle Einträge einer Übung, nach Datum sortiert */
  entries(id) {
    return (this.data[id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Eintrag speichern – pro Tag gibt es höchstens einen Eintrag */
  record(id, date, weight, reps) {
    const list = (this.data[id] = (this.data[id] || []).filter((e) => e.date !== date));
    list.push({ date, weight, reps: String(reps || '') });
    this.save();
  },

  remove(id, date) {
    this.data[id] = (this.data[id] || []).filter((e) => e.date !== date);
    this.save();
  },

  /**
   * Einträge nach Intervall gruppieren.
   * Pro Woche/Monat zählt das höchste Gewicht (= bester Satz im Zeitraum).
   */
  aggregate(id, interval) {
    const groups = new Map();
    this.entries(id).forEach((entry) => {
      const date = new Date(`${entry.date}T00:00:00`);
      let key;
      let label;
      let title;
      if (interval === 'week') {
        const monday = DateUtils.startOfWeek(date);
        key = DateUtils.toKey(monday);
        label = `KW ${DateUtils.isoWeek(monday)}`;
        title = `KW ${DateUtils.isoWeek(monday)} · ab ${Format.date(monday, { day: 'numeric', month: 'short' })}`;
      } else if (interval === 'month') {
        key = entry.date.slice(0, 7);
        label = Format.date(date, { month: 'short', year: '2-digit' });
        title = Format.date(date, { month: 'long', year: 'numeric' });
      } else {
        key = entry.date;
        label = Format.date(date, { day: 'numeric', month: 'numeric' });
        title = Format.date(date, { weekday: 'long', day: 'numeric', month: 'long' });
      }
      const group = groups.get(key) || { key, label, title, weight: 0, reps: '', sessions: 0 };
      group.sessions += 1;
      if (entry.weight >= group.weight) {
        group.weight = entry.weight;
        group.reps = entry.reps;
      }
      groups.set(key, group);
    });
    return [...groups.values()];
  },

  /** Kennzahlen für Vergleiche */
  stats(id, interval) {
    const points = this.aggregate(id, interval);
    if (!points.length) return null;
    const current = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const first = points[0];
    const best = points.reduce((a, b) => (b.weight > a.weight ? b : a));
    return { points, current, previous, first, best };
  },

  /** Veränderung über die letzten `days` Tage (für die Übersicht) */
  changeSince(id, days) {
    const list = this.entries(id);
    if (list.length < 2) return null;
    const cutoff = DateUtils.toKey(DateUtils.addDays(new Date(), -days));
    const base = list.find((e) => e.date >= cutoff) || list[list.length - 1];
    return list[list.length - 1].weight - base.weight;
  },

  /* ---------- Ereignisse ---------- */
  bindEvents() {
    this.el.tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-interval]');
      if (!btn) return;
      this.interval = btn.dataset.interval;
      this.render();
    });

    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = this.el.form;
      const weight = Math.round(parseFloat(String(form.weight.value).replace(',', '.')) * 10) / 10;
      if (!form.date.value || !(weight > 0)) return;
      this.record(this.exercise.id, form.date.value, weight, form.reps.value.trim());
      this.syncExerciseWeight();
      form.weight.value = '';
      this.render();
      showToast('Gewicht eingetragen');
    });

    this.el.list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-date]');
      if (!btn) return;
      const date = btn.dataset.date;
      const nice = Format.date(new Date(`${date}T00:00:00`), { day: 'numeric', month: 'long' });
      if (!(await confirmAction(`Der Eintrag vom ${nice} wird gelöscht.`, 'Löschen', 'Eintrag löschen?'))) return;
      this.remove(this.exercise.id, date);
      this.syncExerciseWeight();
      this.render();
      showToast('Eintrag gelöscht');
    });

    this.el.modal.querySelectorAll('[data-close]').forEach((btn) =>
      btn.addEventListener('click', () => this.el.modal.close())
    );
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.el.modal.close();
    });
  },

  /** Das Arbeitsgewicht der Übung folgt immer dem neuesten Eintrag */
  syncExerciseWeight() {
    const list = this.entries(this.exercise.id);
    if (!list.length) return;
    Plans.setWeight(this.exercise.id, list[list.length - 1].weight);
  },

  /* ---------- Dialog ---------- */
  open(id) {
    const found = Plans.findExercise(id);
    if (!found) return;
    this.exercise = found.exercise;
    this.category = found.category;
    const weekday = WEEKDAYS.find((d) => d.key === found.day).long;
    this.el.title.textContent = found.exercise.name;
    this.el.sub.textContent = `${CATEGORIES[found.category].label} · ${weekday} · ${found.exercise.sets} × ${found.exercise.reps}`;
    this.el.modal.dataset.cat = found.category;

    const form = this.el.form;
    form.date.value = DateUtils.toKey(new Date());
    form.date.max = DateUtils.toKey(new Date());
    form.weight.value = '';
    form.weight.placeholder = found.exercise.weight ? String(found.exercise.weight).replace('.', ',') : 'z. B. 60';
    form.reps.value = found.exercise.reps;

    this.render();
    this.el.modal.showModal();
  },

  render() {
    const id = this.exercise.id;
    const info = this.INTERVALS[this.interval];

    this.el.tabs.querySelectorAll('button').forEach((btn) => {
      const active = btn.dataset.interval === this.interval;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });

    const s = this.stats(id, this.interval);
    if (!s) {
      this.el.stats.innerHTML = '<p class="muted weight-empty">Noch keine Einträge. Trage unten dein erstes Gewicht ein.</p>';
      this.el.chartSub.textContent = '';
      this.el.list.innerHTML = '';
      Charts.weight({ labels: [], titles: [], values: [], reps: [] });
      return;
    }

    const delta = (a, b) => {
      if (b === null || b === undefined) return '<span class="badge flat">–</span>';
      const diff = Math.round((a - b) * 10) / 10;
      const pct = b ? Math.round((diff / b) * 100) : 0;
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const arrow = dir === 'up' ? icon('arrowUp') : dir === 'down' ? icon('arrowDown') : '';
      return `<span class="badge ${dir}">${arrow}${diff > 0 ? '+' : ''}${formatKg(diff)} · ${pct > 0 ? '+' : ''}${pct} %</span>`;
    };

    this.el.stats.innerHTML = `
      <div class="wstat">
        <span class="wstat-label">Aktuell</span>
        <strong>${formatKg(s.current.weight)}</strong>
        <span class="muted">${s.current.title}</span>
      </div>
      <div class="wstat">
        <span class="wstat-label">ggü. ${info.compare}</span>
        <strong>${s.previous ? formatKg(s.previous.weight) : '–'}</strong>
        ${delta(s.current.weight, s.previous ? s.previous.weight : null)}
      </div>
      <div class="wstat">
        <span class="wstat-label">Seit Start</span>
        <strong>${formatKg(s.first.weight)}</strong>
        ${delta(s.current.weight, s.points.length > 1 ? s.first.weight : null)}
      </div>
      <div class="wstat">
        <span class="wstat-label">Bestwert</span>
        <strong>${formatKg(s.best.weight)}</strong>
        <span class="muted">${s.best.title}</span>
      </div>`;

    this.el.chartSub.textContent =
      this.interval === 'session'
        ? `Gewicht pro Einheit · ${s.points.length} Einheiten`
        : `Höchstes Gewicht pro ${info.label} · ${s.points.length} ${this.interval === 'week' ? 'Wochen' : 'Monate'}`;

    Charts.weight({
      labels: s.points.map((p) => p.label),
      titles: s.points.map((p) => p.title),
      values: s.points.map((p) => p.weight),
      reps: s.points.map((p) => p.reps),
      sessions: s.points.map((p) => p.sessions),
      interval: this.interval,
      color: categoryColor(this.category),
    });

    // Letzte Einträge (neueste zuerst)
    const entries = this.entries(id).reverse();
    this.el.list.innerHTML = entries
      .slice(0, 8)
      .map((e, i) => {
        const prev = entries[i + 1];
        const diff = prev ? Math.round((e.weight - prev.weight) * 10) / 10 : 0;
        const trend = !prev || diff === 0 ? '' : `<span class="entry-diff ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${formatKg(diff)}</span>`;
        return `
          <li class="entry">
            <span class="entry-date">${Format.date(new Date(`${e.date}T00:00:00`), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span class="entry-val"><strong>${formatKg(e.weight)}</strong>${e.reps ? ` × ${escapeHtml(e.reps)}` : ''}</span>
            ${trend}
            <button type="button" class="icon-btn danger" data-date="${e.date}" aria-label="Eintrag löschen" title="Löschen">${icon('trash')}</button>
          </li>`;
      })
      .join('');
  },
};

/** 62.5 → "62,5 kg" */
function formatKg(value) {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`;
}
