/* ==========================================================
   nutrition.js – Bereich „Ernährung“
   - Profil & Ziel (Muskelaufbau / halten / abnehmen)
   - Tagesbedarf mit Makro-Zielen, abhängig vom Training des Tages
   - Tagebuch: exakt in Gramm, per Portion oder per Favorit mit einem Klick
   - Training & Timing (vorher / während / danach)
   - Diagramme: Kalorienbilanz, Makroverteilung, Körpergewicht
   ========================================================== */

const Nutrition = {
  KEYS: {
    profile: 'fitboard.nutrition.profile.v1',
    foods: 'fitboard.nutrition.foods.v1',
    diary: 'fitboard.nutrition.diary.v1',
    water: 'fitboard.nutrition.water.v1',
    body: 'fitboard.bodyweight.v1',
  },
  profile: null,
  foods: [],
  diary: {}, // { "2026-10-31": [eintrag, …] }
  water: {}, // { "2026-10-31": ml }
  body: [], // [{ date, kg }]
  day: DateUtils.startOfDay(new Date()), // Tag im Tagebuch
  lastRange: null, // zuletzt gezeigter Zeitraum der Diagramme

  // Zustand des „Essen eintragen“-Dialogs
  modal: { tab: 'search', meal: 'breakfast', food: null, mode: 'portion' },

  /* ---------- Start & Speichern ---------- */
  init() {
    this.profile = { ...DEFAULT_PROFILE, ...Storage.get(this.KEYS.profile, {}) };
    this.foods = Storage.get(this.KEYS.foods, null) || clone(DEFAULT_FOODS);
    const storedDiary = Storage.get(this.KEYS.diary, null);
    if (storedDiary) {
      this.diary = storedDiary;
      this.water = Storage.get(this.KEYS.water, {});
    } else {
      const sample = generateNutritionSample(this.foods);
      this.diary = sample.diary;
      this.water = sample.water;
    }
    this.body = Storage.get(this.KEYS.body, null) || generateBodyWeightSample();

    const $ = (id) => document.getElementById(id);
    this.el = {
      goal: $('goalFilter'),
      dayLabel: $('nutritionDayLabel'),
      prevDay: $('prevNutritionDay'),
      nextDay: $('nextNutritionDay'),
      kpis: $('nutritionKpis'),
      diary: $('diaryList'),
      fuel: $('fuelCard'),
      extras: $('nutritionExtras'),
      bodyStats: $('bodyStats'),
      bodyForm: $('bodyForm'),
      bodyEntries: $('bodyEntries'),
      macroLegend: $('macroLegend'),
      macroCenter: $('macroCenter'),
      balanceSub: $('balanceSub'),
      profileModal: $('profileModal'),
      profileForm: $('profileForm'),
      profilePreview: $('profilePreview'),
      foodModal: $('foodModal'),
      foodTabs: $('foodTabs'),
      foodMeal: $('foodMeal'),
      foodDate: $('foodDate'),
      favorites: $('favoriteChips'),
      search: $('foodSearch'),
      foodList: $('foodList'),
      selected: $('selectedFood'),
      quickForm: $('quickForm'),
      createForm: $('createFoodForm'),
    };
    this.el.foodMeal.innerHTML = MEALS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
    this.bindEvents();
    this.render();
  },

  save(part) {
    if (part === 'diary' || part === 'all') {
      Storage.set(this.KEYS.diary, this.diary);
      Storage.set(this.KEYS.water, this.water);
    }
    if (part === 'foods' || part === 'all') Storage.set(this.KEYS.foods, this.foods);
    if (part === 'profile' || part === 'all') Storage.set(this.KEYS.profile, this.profile);
    if (part === 'body' || part === 'all') Storage.set(this.KEYS.body, this.body);
  },

  /* ---------- Hilfen ---------- */
  dayKey() {
    return DateUtils.toKey(this.day);
  },

  entriesOf(key) {
    return this.diary[key] || [];
  },

  /** Körpergewicht am Datum (letzter Eintrag davor) */
  weightOn(date) {
    const key = DateUtils.toKey(date);
    const sorted = this.sortedBody();
    const before = sorted.filter((e) => e.date <= key);
    const entry = before[before.length - 1] || sorted[0];
    return entry ? entry.kg : 75;
  },

  sortedBody() {
    return this.body.slice().sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Aktive Kalorien eines Tages aus den Aktivitätsdaten (sonst Ø der letzten 14 Tage) */
  activeKcalOn(date) {
    const record = getRecords(date, date)[0];
    if (record) return record.calories;
    const recent = getRecords(DateUtils.addDays(TODAY, -13), TODAY);
    return recent.length ? recent.reduce((s, r) => s + r.calories, 0) / recent.length : 500;
  },

  targetsOn(date) {
    return dailyTargets(this.profile, this.weightOn(date), DateUtils.weekdayKey(date), this.activeKcalOn(date));
  },

  totals(entries) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    entries.forEach((e) => Object.keys(t).forEach((k) => (t[k] += Number(e[k]) || 0)));
    return t;
  },

  /* ---------- Ereignisse ---------- */
  bindEvents() {
    // Ziel umstellen
    this.el.goal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-goal]');
      if (!btn) return;
      this.profile.goal = btn.dataset.goal;
      this.profile.proteinPerKg = null; // Standardwert des neuen Ziels
      this.save('profile');
      this.render();
      showToast(`Ziel: ${NUTRITION_GOALS[this.profile.goal].label}`);
    });

    // Tag im Tagebuch wechseln
    this.el.prevDay.addEventListener('click', () => this.shiftDay(-1));
    this.el.nextDay.addEventListener('click', () => this.shiftDay(1));

    // Tagebuch: hinzufügen / löschen
    this.el.diary.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-meal]');
      if (add) return this.openFoodModal(add.dataset.addMeal);
      const del = e.target.closest('[data-del-entry]');
      if (del) this.deleteEntry(del.dataset.delEntry);
    });
    document.getElementById('addFoodBtn').addEventListener('click', () => this.openFoodModal());

    // Wasser
    this.el.extras.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-water]');
      if (!btn) return;
      const key = this.dayKey();
      this.water[key] = Math.max(0, (this.water[key] || 0) + Number(btn.dataset.water));
      this.save('diary');
      this.renderExtras(this.targetsOn(this.day));
    });

    // Körpergewicht
    this.el.bodyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = this.el.bodyForm;
      const kg = Math.round(parseFloat(String(form.kg.value).replace(',', '.')) * 10) / 10;
      if (!form.date.value || !(kg > 20)) return;
      this.body = this.body.filter((b) => b.date !== form.date.value);
      this.body.push({ date: form.date.value, kg });
      this.save('body');
      form.kg.value = '';
      this.render();
      showToast('Gewicht eingetragen');
    });
    this.el.bodyEntries.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-date]');
      if (!btn) return;
      if (!(await confirmAction('Dieser Gewichtseintrag wird gelöscht.', 'Löschen', 'Eintrag löschen?'))) return;
      this.body = this.body.filter((b) => b.date !== btn.dataset.date);
      this.save('body');
      this.render();
    });

    // Profil
    document.getElementById('profileBtn').addEventListener('click', () => this.openProfile());
    this.el.profileForm.addEventListener('input', () => this.updateProfilePreview());
    this.el.profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = this.el.profileForm;
      const protein = parseFloat(String(f.proteinPerKg.value).replace(',', '.'));
      this.profile = {
        sex: f.sex.value,
        age: Number(f.age.value),
        height: Number(f.height.value),
        goal: f.goal.value,
        proteinPerKg: Number.isFinite(protein) ? protein : null,
        isSample: false,
      };
      this.save('profile');
      this.el.profileModal.close();
      this.render();
      showToast('Profil gespeichert');
    });

    // Essen-Dialog
    this.el.foodTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) this.showFoodTab(btn.dataset.tab);
    });
    this.el.foodMeal.addEventListener('change', () => (this.modal.meal = this.el.foodMeal.value));
    this.el.search.addEventListener('input', () => this.renderFoodList());
    this.el.favorites.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-fav-add]');
      if (!chip) return;
      const item = this.foods.find((f) => f.id === chip.dataset.favAdd);
      const portion = item.portions[0];
      this.addEntry(diaryEntry(item, portion ? portion.grams : 100, this.modal.meal, portion ? `1 ${portion.label}` : ''));
    });
    this.el.foodList.addEventListener('click', (e) => {
      const fav = e.target.closest('[data-fav]');
      if (fav) return this.toggleFavorite(fav.dataset.fav);
      const del = e.target.closest('[data-del-food]');
      if (del) return this.deleteFood(del.dataset.delFood);
      const pick = e.target.closest('[data-food]');
      if (pick) this.selectFood(pick.dataset.food);
    });
    this.el.selected.addEventListener('input', () => this.updatePreview());
    this.el.selected.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        this.modal.mode = mode.dataset.mode;
        this.renderSelected();
      }
      if (e.target.closest('[data-add-selected]')) this.addSelected();
    });
    this.el.quickForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = this.el.quickForm;
      const num = (input) => Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
      this.addEntry({
        id: newId(),
        meal: this.modal.meal,
        name: f.name.value.trim() || 'Schnelleintrag',
        grams: null,
        portion: '',
        kcal: Math.round(num(f.kcal)),
        protein: num(f.protein),
        carbs: num(f.carbs),
        fat: num(f.fat),
        fiber: num(f.fiber),
      });
      f.reset();
    });
    this.el.createForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createFood();
    });

    [this.el.profileModal, this.el.foodModal].forEach((modal) => {
      modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => modal.close()));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.close();
      });
    });
  },

  shiftDay(step) {
    const next = DateUtils.addDays(this.day, step);
    if (next > TODAY) return;
    this.day = next;
    this.renderDay();
  },

  /* ==========================================================
     Anzeige
     ========================================================== */
  render() {
    this.renderDay();
    this.renderBody();
    if (this.lastRange) this.renderCharts(this.lastRange);
  },

  /** Alles, was vom gewählten Tag abhängt */
  renderDay() {
    const targets = this.targetsOn(this.day);
    const entries = this.entriesOf(this.dayKey());
    const totals = this.totals(entries);

    this.el.goal.querySelectorAll('button').forEach((b) => {
      const active = b.dataset.goal === this.profile.goal;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });

    const isToday = DateUtils.isSameDay(this.day, TODAY);
    const isYesterday = DateUtils.isSameDay(this.day, DateUtils.addDays(TODAY, -1));
    this.el.dayLabel.textContent = isToday
      ? 'Heute'
      : isYesterday
        ? 'Gestern'
        : Format.date(this.day, { weekday: 'short', day: 'numeric', month: 'short' });
    this.el.nextDay.disabled = isToday;

    this.renderKpis(totals, targets);
    this.renderDiary(entries, targets);
    this.renderFuel(entries, targets);
    this.renderExtras(targets, totals);
  },

  renderKpis(totals, t) {
    const weight = this.weightOn(this.day);
    const left = t.kcal - totals.kcal;
    const goalHint = t.goal.kcalFactor === 1 ? '' : ` · Ziel ${t.goal.hint}`;
    const cards = [
      {
        label: 'Kalorien', icon: 'flame', color: '--c-kcal', value: Format.number(totals.kcal), unit: 'kcal', goal: t.kcal,
        sub: left >= 0 ? `von ${Format.number(t.kcal)} kcal · noch ${Format.number(left)}` : `${Format.number(-left)} kcal über dem Ziel`,
        meta: `Bedarf ${Format.number(t.need)} = Grundumsatz ${Format.number(t.bmr)} × 1,2 + ${Format.number(t.activeKcal)} aktiv${goalHint}`,
      },
      {
        label: 'Protein', icon: 'egg', color: '--c-protein', value: Math.round(totals.protein), unit: 'g', goal: t.protein,
        sub: `von ${t.protein} g · ${t.proteinPerKg.toLocaleString('de-DE')} g/kg`,
        meta: `aktuell ${(totals.protein / weight).toLocaleString('de-DE', { maximumFractionDigits: 1 })} g/kg Körpergewicht`,
      },
      {
        label: 'Kohlenhydrate', icon: 'wheat', color: '--c-carbs', value: Math.round(totals.carbs), unit: 'g', goal: t.carbs,
        sub: `von ${t.carbs} g · ${t.band.range}`,
        meta: t.carbCapped
          ? `Gedeckelt durch Kalorienziel (Training: ${t.carbWanted} g)`
          : `${t.band.label}${t.minutes ? ` · ${Format.minutes(t.minutes)} geplant` : ''}`,
      },
      {
        label: 'Fett', icon: 'droplet', color: '--c-fat', value: Math.round(totals.fat), unit: 'g', goal: t.fat,
        sub: `von ${t.fat} g`,
        meta: `${Math.round((t.fat * 9 / t.kcal) * 100)} % der Zielkalorien`,
      },
    ];

    this.el.kpis.innerHTML = cards
      .map((c) => {
        const pct = c.goal ? Math.round((Number(c.value.toString().replace(/\./g, '')) / c.goal) * 100) : 0;
        return `
        <article class="card kpi" style="--kpi-color: var(${c.color})">
          <div class="kpi-top">
            <span class="kpi-label"><span class="kpi-icon">${icon(c.icon)}</span>${c.label}</span>
            <span class="badge ${pct > 110 ? 'down' : pct >= 90 ? 'up' : 'flat'}">${pct} %</span>
          </div>
          <div>
            <div class="kpi-value">${c.value}<small>${c.unit}</small></div>
            <p class="muted kpi-sub">${c.sub}</p>
          </div>
          <div>
            <div class="progress${pct > 110 ? ' over' : ''}" role="progressbar" aria-valuenow="${Math.min(pct, 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="${c.label} vom Ziel">
              <span style="width:${Math.min(pct, 100)}%"></span>
            </div>
            <p class="kpi-meta">${c.meta}</p>
          </div>
        </article>`;
      })
      .join('');
  },

  renderDiary(entries, targets) {
    const hasTraining = targets.minutes > 0;
    const meals = MEALS.filter((m) => !m.training || hasTraining || entries.some((e) => e.meal === m.key));

    this.el.diary.innerHTML = meals
      .map((meal) => {
        const list = entries.filter((e) => e.meal === meal.key);
        const t = this.totals(list);
        const rows = list
          .map((e) => {
            const amount = e.portion ? `${e.portion}${e.grams ? ` (${Format.number(e.grams)} g)` : ''}` : e.grams ? `${Format.number(e.grams)} g` : 'Schnelleintrag';
            return `
            <li class="diary-entry">
              <div class="diary-name">
                <strong>${escapeHtml(e.name)}</strong>
                <span class="muted">${escapeHtml(amount)} · P ${Math.round(e.protein)} · K ${Math.round(e.carbs)} · F ${Math.round(e.fat)}</span>
              </div>
              <span class="diary-kcal">${Format.number(e.kcal)} kcal</span>
              <button type="button" class="icon-btn danger" data-del-entry="${e.id}" aria-label="${escapeHtml(e.name)} entfernen" title="Entfernen">${icon('trash')}</button>
            </li>`;
          })
          .join('');
        return `
          <div class="meal${meal.training ? ' meal--training' : ''}">
            <div class="meal-head">
              <h4>${meal.label}</h4>
              <span class="muted">${list.length ? `${Format.number(t.kcal)} kcal · P ${Math.round(t.protein)} g` : 'noch leer'}</span>
              <button type="button" class="icon-btn" data-add-meal="${meal.key}" aria-label="Zu ${meal.label} hinzufügen" title="Hinzufügen">${icon('plus')}</button>
            </div>
            ${rows ? `<ul class="diary-entries">${rows}</ul>` : ''}
          </div>`;
      })
      .join('');
  },

  renderFuel(entries, targets) {
    const dayKey = DateUtils.weekdayKey(this.day);
    const weekday = WEEKDAYS.find((d) => d.key === dayKey).long;
    const sessions = Plans.allExercises().filter((i) => i.day === dayKey);
    const plans = [...new Set(sessions.map((s) => CATEGORIES[s.category].label))];
    const advice = fuelingAdvice(this.weightOn(this.day), dayKey);

    let html = `
      <div class="card-head">
        <div>
          <h3>Training & Timing</h3>
          <p class="muted">${weekday} · ${targets.minutes ? `ca. ${Format.minutes(targets.minutes)} geplant (${plans.map(escapeHtml).join(', ')})` : 'kein Training geplant'}</p>
        </div>
        <span class="pill">${targets.band.range} KH</span>
      </div>`;

    if (!advice.length) {
      html += `<p class="fuel-rest">Ruhetag: Kohlenhydrate eher am unteren Rand (${targets.band.range}), Protein trotzdem über den Tag verteilen. Das unterstützt die Regeneration.</p>`;
    } else {
      html += `<ol class="fuel-steps">${advice
        .map((a) => {
          const logged = entries.some((e) => e.meal === a.key);
          return `
          <li class="fuel-step${logged ? ' done' : ''}">
            <span class="fuel-dot">${logged ? icon('check') : ''}</span>
            <div>
              <strong>${a.title}</strong>${logged ? ' <span class="muted">· eingetragen</span>' : ''}
              <p>${escapeHtml(a.text)}</p>
            </div>
          </li>`;
        })
        .join('')}</ol>`;
    }
    this.el.fuel.innerHTML = html;
  },

  renderExtras(targets, totals = this.totals(this.entriesOf(this.dayKey()))) {
    const water = this.water[this.dayKey()] || 0;
    const fiberPct = Math.round((totals.fiber / targets.fiber) * 100);
    const waterPct = Math.round((water / targets.water) * 100);
    this.el.extras.innerHTML = `
      <div class="extra" style="--kpi-color: var(--c-fiber)">
        <div class="extra-head"><span>${icon('leaf')} Ballaststoffe</span><strong>${Math.round(totals.fiber)} / ${targets.fiber} g</strong></div>
        <div class="progress"><span style="width:${Math.min(fiberPct, 100)}%"></span></div>
      </div>
      <div class="extra" style="--kpi-color: var(--c-water)">
        <div class="extra-head"><span>${icon('droplet')} Wasser</span><strong>${(water / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} / ${(targets.water / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} l</strong></div>
        <div class="progress"><span style="width:${Math.min(waterPct, 100)}%"></span></div>
        <div class="water-btns">
          <button type="button" class="btn btn-ghost" data-water="-250" aria-label="250 ml abziehen">−</button>
          <button type="button" class="btn btn-ghost" data-water="250">+ 250 ml</button>
          <button type="button" class="btn btn-ghost" data-water="500">+ 500 ml</button>
        </div>
        <p class="muted extra-note">Richtwert: ca. 35 ml/kg + 0,5 l pro Trainingsstunde</p>
      </div>`;
  },

  renderBody() {
    const sorted = this.sortedBody();
    const form = this.el.bodyForm;
    form.date.value = DateUtils.toKey(TODAY);
    form.date.max = DateUtils.toKey(TODAY);

    if (!sorted.length) {
      this.el.bodyStats.innerHTML = '<p class="muted">Noch kein Gewicht eingetragen.</p>';
      this.el.bodyEntries.innerHTML = '';
      Charts.bodyWeight({ labels: [], titles: [], values: [], average: [] });
      return;
    }

    const last = sorted[sorted.length - 1];
    const before = (days) => {
      const cutoff = DateUtils.toKey(DateUtils.addDays(TODAY, -days));
      const ref = sorted.filter((e) => e.date <= cutoff).pop();
      return ref ? Math.round((last.kg - ref.kg) * 10) / 10 : null;
    };
    const badge = (diff, label) => {
      if (diff === null) return '';
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      // Beim Abnehmen ist „weniger“ gut – Farben passend zum Ziel
      const good = this.profile.goal === 'lose' ? diff < 0 : this.profile.goal === 'gain' ? diff > 0 : Math.abs(diff) < 0.5;
      return `<span class="badge ${diff === 0 ? 'flat' : good ? 'up' : 'down'}">${dir === 'up' ? icon('arrowUp') : dir === 'down' ? icon('arrowDown') : ''}${diff > 0 ? '+' : ''}${diff.toLocaleString('de-DE')} kg · ${label}</span>`;
    };

    this.el.bodyStats.innerHTML = `
      <div class="body-now"><strong>${last.kg.toLocaleString('de-DE')}</strong><small>kg</small></div>
      <div class="body-badges">${badge(before(7), '7 Tage')}${badge(before(30), '30 Tage')}</div>`;

    // Letzte 12 Wochen + gleitender 7-Tage-Durchschnitt
    const cutoff = DateUtils.toKey(DateUtils.addDays(TODAY, -84));
    const shown = sorted.filter((e) => e.date >= cutoff);
    const average = shown.map((e) => {
      const from = DateUtils.toKey(DateUtils.addDays(new Date(`${e.date}T00:00:00`), -6));
      const win = sorted.filter((x) => x.date >= from && x.date <= e.date);
      return Math.round((win.reduce((s, x) => s + x.kg, 0) / win.length) * 10) / 10;
    });
    Charts.bodyWeight({
      labels: shown.map((e) => Format.date(new Date(`${e.date}T00:00:00`), { day: 'numeric', month: 'numeric' })),
      titles: shown.map((e) => Format.date(new Date(`${e.date}T00:00:00`), { weekday: 'long', day: 'numeric', month: 'long' })),
      values: shown.map((e) => e.kg),
      average,
    });

    this.el.bodyEntries.innerHTML = sorted
      .slice(-3)
      .reverse()
      .map(
        (e) => `
        <li class="entry">
          <span class="entry-date">${Format.date(new Date(`${e.date}T00:00:00`), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span class="entry-val"><strong>${e.kg.toLocaleString('de-DE')} kg</strong></span>
          <span></span>
          <button type="button" class="icon-btn danger" data-date="${e.date}" aria-label="Eintrag löschen" title="Löschen">${icon('trash')}</button>
        </li>`
      )
      .join('');
  },

  /** Diagramme für den Zeitraum aus dem oberen Filter */
  renderCharts(range) {
    this.lastRange = range;
    // Bei „Tag“ die ganze Woche zeigen, sonst wäre es nur ein Balken
    const start = state.period === 'day' ? DateUtils.startOfWeek(range.start) : range.start;
    const end = state.period === 'day' ? DateUtils.addDays(start, 6) : range.end;

    const labels = [];
    const titles = [];
    const eaten = [];
    const target = [];
    const days = [];
    for (let d = new Date(start); d <= end; d = DateUtils.addDays(d, 1)) {
      const key = DateUtils.toKey(d);
      const future = d > TODAY;
      const entries = this.entriesOf(key);
      labels.push(state.period === 'month' ? String(d.getDate()) : Format.date(d, { weekday: 'short', day: 'numeric' }));
      titles.push(Format.date(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      if (future || !entries.length) {
        eaten.push(null);
        target.push(future ? null : this.targetsOn(d).kcal);
        continue;
      }
      const totals = this.totals(entries);
      const t = this.targetsOn(d);
      eaten.push(totals.kcal);
      target.push(t.kcal);
      // Heute läuft noch – zählt nicht in Durchschnitte
      if (!DateUtils.isSameDay(d, TODAY)) days.push({ totals, t });
    }

    const logged = days.length;
    const diffSum = days.reduce((s, x) => s + (x.totals.kcal - x.t.kcal), 0);
    this.el.balanceSub.textContent = logged
      ? `Ø ${diffSum >= 0 ? '+' : '−'}${Format.number(Math.abs(diffSum / logged))} kcal pro Tag gegenüber dem Ziel · ${logged} abgeschlossene Tage`
      : 'Noch keine abgeschlossenen Tage in diesem Zeitraum';
    Charts.nutritionBalance({ labels, titles, eaten, target, mode: state.period === 'month' ? 'month' : 'week' });

    // Makroverteilung (Ø pro erfasstem Tag)
    const avg = (k) => (logged ? days.reduce((s, x) => s + x.totals[k], 0) / logged : 0);
    const grams = { protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') };
    const kcal = { protein: grams.protein * 4, carbs: grams.carbs * 4, fat: grams.fat * 9 };
    const totalKcal = kcal.protein + kcal.carbs + kcal.fat;
    const proteinHits = days.filter((x) => x.totals.protein >= x.t.protein * 0.9).length;

    this.el.macroCenter.innerHTML = logged
      ? `<strong>${Format.number(avg('kcal'))}</strong><span>kcal Ø / Tag</span>`
      : '<span>keine Daten</span>';
    const rows = [
      ['protein', 'Protein', '--c-protein'],
      ['carbs', 'Kohlenhydrate', '--c-carbs'],
      ['fat', 'Fett', '--c-fat'],
    ];
    this.el.macroLegend.innerHTML =
      rows
        .map(
          ([k, label, color]) => `
        <li>
          <span class="dot" style="background:var(${color})"></span>
          <span>${label}</span>
          <span class="legend-val">${Math.round(grams[k])} g<span class="legend-pct">${totalKcal ? Math.round((kcal[k] / totalKcal) * 100) : 0} % der kcal</span></span>
        </li>`
        )
        .join('') +
      `<li class="legend-hit"><span>${icon('check')}</span><span>Proteinziel erreicht</span><span class="legend-val">${proteinHits} / ${logged} Tage</span></li>`;
    Charts.macros({ values: rows.map(([k]) => Math.round(kcal[k])), colors: rows.map(([, , c]) => cssVar(c)), labels: rows.map(([, l]) => l), grams: rows.map(([k]) => Math.round(grams[k])) });
  },

  /* ==========================================================
     Tagebuch-Aktionen
     ========================================================== */
  addEntry(entry) {
    const key = this.dayKey();
    this.diary[key] = [...this.entriesOf(key), entry];
    this.save('diary');
    this.renderDay();
    if (this.lastRange) this.renderCharts(this.lastRange);
    showToast(`${entry.name} eingetragen`);
  },

  async deleteEntry(id) {
    const key = this.dayKey();
    const entry = this.entriesOf(key).find((e) => e.id === id);
    if (!entry) return;
    if (!(await confirmAction(`„${entry.name}“ wird aus dem Tagebuch entfernt.`, 'Entfernen', 'Eintrag entfernen?'))) return;
    this.diary[key] = this.entriesOf(key).filter((e) => e.id !== id);
    this.save('diary');
    this.renderDay();
    if (this.lastRange) this.renderCharts(this.lastRange);
  },

  /* ==========================================================
     Dialog „Essen eintragen“
     ========================================================== */
  openFoodModal(meal = null) {
    this.modal.meal = meal || this.suggestMeal();
    this.modal.food = null;
    this.el.foodMeal.value = this.modal.meal;
    this.el.foodDate.textContent = Format.date(this.day, { weekday: 'long', day: 'numeric', month: 'long' });
    this.el.search.value = '';
    this.showFoodTab('search');
    this.el.foodModal.showModal();
    this.el.search.focus();
  },

  /** Passende Mahlzeit nach Uhrzeit vorschlagen */
  suggestMeal() {
    const h = new Date().getHours();
    return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
  },

  showFoodTab(tab) {
    this.modal.tab = tab;
    this.el.foodTabs.querySelectorAll('[data-tab]').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });
    this.el.foodModal.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    if (tab === 'search') {
      this.renderFavorites();
      this.renderFoodList();
      this.renderSelected();
    }
  },

  renderFavorites() {
    const favs = this.foods.filter((f) => f.favorite);
    this.el.favorites.innerHTML = favs.length
      ? favs
          .map((f) => {
            const p = f.portions[0];
            return `<button type="button" class="fav-chip" data-fav-add="${f.id}" title="Mit einem Klick eintragen">${icon('plus')}${escapeHtml(f.name)} <span>${p ? `${p.label} · ${p.grams} g` : '100 g'}</span></button>`;
          })
          .join('')
      : '<p class="muted">Markiere Lebensmittel mit dem Stern, um sie hier mit einem Klick einzutragen.</p>';
  },

  renderFoodList() {
    const q = this.el.search.value.trim().toLowerCase();
    const list = this.foods
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'de'));

    this.el.foodList.innerHTML = list.length
      ? list
          .map(
            (f) => `
          <li class="food-item${this.modal.food && this.modal.food.id === f.id ? ' active' : ''}">
            <button type="button" class="food-pick" data-food="${f.id}">
              <strong>${escapeHtml(f.name)}</strong>
              <span class="muted">${f.kcal} kcal · P ${f.p} · K ${f.c} · F ${f.f} <small>/ 100 g</small></span>
            </button>
            <button type="button" class="icon-btn fav-btn${f.favorite ? ' on' : ''}" data-fav="${f.id}" aria-pressed="${f.favorite}" aria-label="${escapeHtml(f.name)} als Favorit" title="Favorit">${icon('star')}</button>
            ${f.custom ? `<button type="button" class="icon-btn danger" data-del-food="${f.id}" aria-label="${escapeHtml(f.name)} löschen" title="Lebensmittel löschen">${icon('trash')}</button>` : ''}
          </li>`
          )
          .join('')
      : `<li class="muted food-empty">Nichts gefunden. Lege „${escapeHtml(this.el.search.value)}“ unter „Neues Lebensmittel“ an oder nutze „Schnell eintragen“.</li>`;
  },

  selectFood(id) {
    this.modal.food = this.foods.find((f) => f.id === id);
    this.modal.mode = this.modal.food.portions.length ? 'portion' : 'grams';
    this.renderFoodList();
    this.renderSelected();
    this.el.selected.querySelector('input')?.focus();
  },

  renderSelected() {
    const f = this.modal.food;
    if (!f) {
      this.el.selected.innerHTML = '<p class="muted selected-empty">Wähle links ein Lebensmittel aus.</p>';
      return;
    }
    const hasPortions = f.portions.length > 0;
    const mode = hasPortions ? this.modal.mode : 'grams';
    this.el.selected.innerHTML = `
      <p class="selected-name">${escapeHtml(f.name)}</p>
      <div class="segmented segmented--small" role="group" aria-label="Menge angeben in">
        <button type="button" data-mode="portion" class="${mode === 'portion' ? 'active' : ''}" ${hasPortions ? '' : 'disabled'}>Portion</button>
        <button type="button" data-mode="grams" class="${mode === 'grams' ? 'active' : ''}">Gramm</button>
      </div>
      ${
        mode === 'portion'
          ? `<div class="amount-row">
              <label class="field" for="portionCount"><span>Anzahl</span>
                <input id="portionCount" type="number" min="0.25" max="20" step="0.25" value="1" inputmode="decimal" /></label>
              <label class="field" for="portionSelect"><span>Portion</span>
                <select id="portionSelect" class="select">${f.portions.map((p, i) => `<option value="${i}">${escapeHtml(p.label)} (${p.grams} g)</option>`).join('')}</select></label>
            </div>`
          : `<label class="field" for="gramInput"><span>Menge in Gramm</span>
              <input id="gramInput" type="number" min="1" max="5000" step="1" value="${hasPortions ? f.portions[0].grams : 100}" inputmode="decimal" /></label>`
      }
      <div class="preview" id="foodPreview"></div>
      <button type="button" class="btn btn-primary" data-add-selected>${icon('plus')}Eintragen</button>`;
    this.updatePreview();
  },

  /** Menge aus dem Formular: { grams, portion } */
  currentAmount() {
    const f = this.modal.food;
    const count = this.el.selected.querySelector('#portionCount');
    if (count) {
      const p = f.portions[Number(this.el.selected.querySelector('#portionSelect').value)];
      const n = Math.max(0, parseFloat(String(count.value).replace(',', '.')) || 0);
      return { grams: Math.round(p.grams * n), portion: `${n.toLocaleString('de-DE')} ${p.label}` };
    }
    const g = Math.max(0, parseFloat(String(this.el.selected.querySelector('#gramInput').value).replace(',', '.')) || 0);
    return { grams: Math.round(g), portion: '' };
  },

  updatePreview() {
    const preview = this.el.selected.querySelector('#foodPreview');
    if (!preview || !this.modal.food) return;
    const { grams } = this.currentAmount();
    const n = nutrientsFor(this.modal.food, grams);
    preview.innerHTML = `
      <span><strong>${Format.number(n.kcal)}</strong> kcal</span>
      <span><strong>${Math.round(n.protein)}</strong> g P</span>
      <span><strong>${Math.round(n.carbs)}</strong> g K</span>
      <span><strong>${Math.round(n.fat)}</strong> g F</span>`;
  },

  addSelected() {
    const { grams, portion } = this.currentAmount();
    if (!grams) return;
    this.addEntry(diaryEntry(this.modal.food, grams, this.modal.meal, portion));
  },

  toggleFavorite(id) {
    const f = this.foods.find((x) => x.id === id);
    f.favorite = !f.favorite;
    this.save('foods');
    this.renderFavorites();
    this.renderFoodList();
  },

  async deleteFood(id) {
    const f = this.foods.find((x) => x.id === id);
    if (!(await confirmAction(`„${f.name}“ wird aus deiner Lebensmittel-Liste gelöscht. Bisherige Tagebuch-Einträge bleiben erhalten.`, 'Löschen', 'Lebensmittel löschen?'))) return;
    this.foods = this.foods.filter((x) => x.id !== id);
    if (this.modal.food && this.modal.food.id === id) this.modal.food = null;
    this.save('foods');
    this.showFoodTab('search');
  },

  createFood() {
    const f = this.el.createForm;
    const num = (input) => Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
    const portionGrams = num(f.portionGrams);
    const item = {
      id: `u-${newId()}`,
      name: f.name.value.trim(),
      kcal: Math.round(num(f.kcal)),
      p: num(f.protein),
      c: num(f.carbs),
      f: num(f.fat),
      fib: num(f.fiber),
      portions: portionGrams ? [{ label: f.portionLabel.value.trim() || 'Portion', grams: portionGrams }] : [],
      favorite: f.favorite.checked,
      custom: true,
    };
    if (!item.name) return;
    this.foods.push(item);
    this.save('foods');
    f.reset();
    showToast(`${item.name} angelegt`);
    this.showFoodTab('search');
    this.selectFood(item.id);
  },

  /* ---------- Profil ---------- */
  openProfile() {
    const f = this.el.profileForm;
    f.sex.value = this.profile.sex;
    f.age.value = this.profile.age;
    f.height.value = this.profile.height;
    f.goal.value = this.profile.goal;
    f.proteinPerKg.value = this.profile.proteinPerKg ?? '';
    this.updateProfilePreview();
    this.el.profileModal.showModal();
  },

  updateProfilePreview() {
    const f = this.el.profileForm;
    const goal = NUTRITION_GOALS[f.goal.value];
    f.proteinPerKg.placeholder = `Standard: ${goal.protein.toLocaleString('de-DE')}`;
    const weight = this.weightOn(TODAY);
    const bmr = basalMetabolicRate({ sex: f.sex.value, age: Number(f.age.value) || 0, height: Number(f.height.value) || 0 }, weight);
    this.el.profilePreview.innerHTML = `Mit ${weight.toLocaleString('de-DE')} kg (letzter Eintrag): <strong>Grundumsatz ${Format.number(bmr)} kcal</strong>. Tagesbedarf = Grundumsatz × 1,2 + aktive Kalorien des Tages, für „${goal.label}“ ${goal.hint}.`;
  },
};
