/* ==========================================================
   plans.js – Trainingspläne anzeigen, anlegen, bearbeiten, löschen
   - Feste Pläne: Gym, Mobility, Comeback
   - Eigene Pläne (z. B. Radfahren, Schwimmen) mit passenden Feldern
     je Sportart (siehe sports.js)
   Alles wird im localStorage des Browsers gespeichert.
   ========================================================== */

const Plans = {
  STORAGE_KEY: 'fitboard.plans.v1',
  CATEGORY_KEY: 'fitboard.categories.v1',
  data: null, // { [kategorie]: { mo: { focus, exercises }, … } }
  custom: [], // eigene Pläne: [{ key, label, type, color, description }]
  category: 'gym', // gewählter Plan
  day: DateUtils.weekdayKey(new Date()), // gewählter Wochentag (Start: heute)
  editing: null, // { category, day, id } beim Bearbeiten einer Übung
  editingPlan: null, // key des Plans, der gerade bearbeitet wird

  /* Callbacks – werden von app.js gesetzt */
  onChange: () => {}, // Pläne wurden geändert
  onInfoRendered: () => {}, // Infobereich neu gezeichnet

  /* ---------- Start ---------- */
  init() {
    this.data = Storage.get(this.STORAGE_KEY, null) || clone(DEFAULT_PLANS);
    this.custom = Storage.get(this.CATEGORY_KEY, []);
    this.custom.forEach((c) => this.registerCategory(c));
    this.migrateWeights();

    this.el = {
      section: document.getElementById('plans'),
      tabs: document.getElementById('planTabs'),
      desc: document.getElementById('planDesc'),
      days: document.getElementById('dayGrid'),
      dayLabel: document.getElementById('planDayLabel'),
      focus: document.getElementById('planFocus'),
      summary: document.getElementById('planSummary'),
      list: document.getElementById('exerciseList'),
      info: document.getElementById('planInfo'),
      addInline: document.getElementById('addInlineBtn'),
      editPlanBtn: document.getElementById('editPlanBtn'),
      resetBtn: document.getElementById('resetPlanBtn'),
      // Übungs-Dialog
      modal: document.getElementById('exerciseModal'),
      form: document.getElementById('exerciseForm'),
      modalTitle: document.getElementById('modalTitle'),
      nameLabel: document.getElementById('exerciseNameLabel'),
      fields: document.getElementById('exerciseFields'),
      // Plan-Dialog
      planModal: document.getElementById('planModal'),
      planForm: document.getElementById('planForm'),
      planTitle: document.getElementById('planModalTitle'),
      typeGrid: document.getElementById('planTypeGrid'),
      colorGrid: document.getElementById('planColorGrid'),
      typeHint: document.getElementById('planTypeHint'),
      templateRow: document.getElementById('planTemplateRow'),
      deletePlanBtn: document.getElementById('deletePlanBtn'),
    };
    this.el.form.day.innerHTML = WEEKDAYS.map((d) => `<option value="${d.key}">${d.long}</option>`).join('');
    this.bindEvents();
    this.render();
  },

  save() {
    Storage.set(this.STORAGE_KEY, this.data);
    this.onChange();
  },

  saveCategories() {
    Storage.set(this.CATEGORY_KEY, this.custom);
  },

  /** Eigenen Plan in CATEGORIES eintragen und Farbe als CSS-Regel anlegen */
  registerCategory(c) {
    const type = SPORT_TYPES[c.type] || SPORT_TYPES.other;
    CATEGORIES[c.key] = {
      label: c.label,
      subtitle: type.label,
      type: c.type,
      color: c.color,
      description: c.description || type.description,
      tips: type.tips,
      custom: true,
    };
    if (!this.data[c.key]) this.data[c.key] = buildWeek(c.type, false);
    this.updateColorStyles();
  },

  /** Eigene Farben: [data-cat="…"] { --cat: #… } */
  updateColorStyles() {
    let style = document.getElementById('customCategoryColors');
    if (!style) {
      style = document.createElement('style');
      style.id = 'customCategoryColors';
      document.head.appendChild(style);
    }
    style.textContent = this.custom.map((c) => `[data-cat="${c.key}"] { --cat: ${c.color}; }`).join('\n');
  },

  /** Übungen eines Tages */
  exercisesOf(category, day) {
    return this.data[category][day].exercises;
  },

  /** Alle Übungen mit Kategorie und Tag als flache Liste */
  allExercises() {
    const result = [];
    Object.keys(CATEGORIES).forEach((category) =>
      WEEKDAYS.forEach((d) =>
        this.exercisesOf(category, d.key).forEach((exercise) => result.push({ category, day: d.key, exercise }))
      )
    );
    return result;
  },

  findExercise(id) {
    return this.allExercises().find((item) => item.exercise.id === id) || null;
  },

  /** Arbeitsgewicht setzen (z. B. nach neuem Eintrag im Gewichtsverlauf) */
  setWeight(id, weight) {
    const found = this.findExercise(id);
    if (!found || found.exercise.weight === weight) return;
    found.exercise.weight = weight;
    this.save();
    this.renderDetail();
  },

  /**
   * Ältere gespeicherte Pläne hatten das Gewicht nur im Hinweis-Text
   * ("60 kg · 2 min Pause"). Hier wird es einmalig in das Feld `weight` übernommen.
   */
  migrateWeights() {
    this.allExercises().forEach(({ exercise }) => {
      if ('weight' in exercise) return;
      const match = String(exercise.detail || '').match(/(\d+(?:[.,]\d+)?)\s*kg/i);
      exercise.weight = match ? parseFloat(match[1].replace(',', '.')) : null;
      if (match) {
        exercise.detail = exercise.detail.replace(match[0], '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
      }
    });
  },

  /** Hat die Übung ein Gewicht oder Einträge im Gewichtsverlauf? */
  isWeighted(exercise) {
    return Boolean(exercise.weight) || WeightLog.entries(exercise.id).length > 0;
  },

  /* ---------- Ereignisse ---------- */
  bindEvents() {
    // Plan wechseln oder neuen Plan anlegen
    this.el.tabs.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="new-plan"]')) return this.openPlanModal();
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      this.category = btn.dataset.cat;
      this.render();
    });

    // Wochentag wechseln
    this.el.days.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-day]');
      if (!btn) return;
      this.day = btn.dataset.day;
      this.renderDays();
      this.renderDetail();
    });

    // Verlauf / Bearbeiten / Löschen in der Übungsliste
    this.el.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      if (btn.dataset.action === 'history') WeightLog.open(id);
      if (btn.dataset.action === 'edit') this.openModal(id);
      if (btn.dataset.action === 'delete') this.deleteExercise(id);
    });

    // Fokus / Titel des Tages
    this.el.focus.addEventListener('change', () => {
      this.data[this.category][this.day].focus = this.el.focus.value.trim();
      this.save();
      this.renderDays();
      showToast('Fokus gespeichert');
    });
    this.el.focus.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.el.focus.blur();
    });

    // Buttons
    document.getElementById('addExerciseBtn').addEventListener('click', () => this.openModal());
    this.el.addInline.addEventListener('click', () => this.openModal());
    this.el.resetBtn.addEventListener('click', () => this.resetCategory());
    this.el.editPlanBtn.addEventListener('click', () => this.openPlanModal(this.category));

    // Übungs-Dialog
    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveFromForm();
    });
    // Anderer Plan gewählt → passende Felder anzeigen, Eingaben behalten
    this.el.form.category.addEventListener('change', () => {
      this.renderFields(this.el.form.category.value, this.collectValues());
    });

    // Plan-Dialog
    this.el.planForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePlanFromForm();
    });
    this.el.typeGrid.addEventListener('change', () => this.updateTypeHint());
    this.el.deletePlanBtn.addEventListener('click', () => this.deletePlan());

    // Alle Dialoge: Schließen-Knöpfe und Klick auf den Hintergrund
    [this.el.modal, this.el.planModal].forEach((modal) => {
      modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => modal.close()));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.close();
      });
    });
  },

  /* ---------- Anzeige ---------- */
  render() {
    if (!CATEGORIES[this.category]) this.category = 'gym';
    const cat = CATEGORIES[this.category];
    this.el.section.dataset.cat = this.category;
    this.el.desc.textContent = cat.description;
    this.el.editPlanBtn.hidden = !cat.custom;
    this.el.resetBtn.hidden = Boolean(cat.custom) && !SPORT_TYPES[cat.type].template;
    this.el.addInline.querySelector('.label').textContent = `${sportTypeOf(this.category).unit[0]} zu diesem Tag hinzufügen`;
    this.renderTabs();
    this.renderDays();
    this.renderDetail();
    this.renderInfo();
  },

  renderTabs() {
    this.el.tabs.innerHTML =
      Object.entries(CATEGORIES)
        .map(
          ([key, cat]) => `
        <button type="button" class="tab ${key === this.category ? 'active' : ''}" data-cat="${key}"
                role="tab" aria-selected="${key === this.category}">
          <span class="dot"></span>
          ${escapeHtml(cat.label)} <small>· ${escapeHtml(cat.subtitle)}</small>
        </button>`
        )
        .join('') +
      `<button type="button" class="tab tab-add" data-action="new-plan">${icon('plus')}Neuer Plan</button>`;
  },

  renderDays() {
    const todayKey = DateUtils.weekdayKey(new Date());
    const [one, many] = sportTypeOf(this.category).unit;
    this.el.days.innerHTML = WEEKDAYS.map((d) => {
      const plan = this.data[this.category][d.key];
      const count = plan.exercises.length;
      const classes = ['day-tile', d.key === this.day && 'active', !count && 'rest'].filter(Boolean).join(' ');
      return `
        <button type="button" class="${classes}" data-day="${d.key}" aria-pressed="${d.key === this.day}">
          <span class="day-name">${d.short}${d.key === todayKey ? '<span class="day-today">Heute</span>' : ''}</span>
          <span class="day-focus">${escapeHtml(count ? plan.focus || 'Training' : 'Ruhetag')}</span>
          <span class="day-count">${count ? `${count} ${count === 1 ? one : many}` : 'Pause'}</span>
        </button>`;
    }).join('');

    // Aktiven Tag auf kleinen Bildschirmen in die Mitte scrollen
    const grid = this.el.days;
    const active = grid.querySelector('.active');
    if (active && grid.scrollWidth > grid.clientWidth) {
      const gridBox = grid.getBoundingClientRect();
      const tileBox = active.getBoundingClientRect();
      grid.scrollLeft += tileBox.left - gridBox.left - (gridBox.width - tileBox.width) / 2;
    }
  },

  renderDetail() {
    const weekday = WEEKDAYS.find((d) => d.key === this.day);
    const plan = this.data[this.category][this.day];
    const exercises = plan.exercises;
    const type = sportTypeOf(this.category);

    this.el.dayLabel.textContent = `${weekday.long} · ${CATEGORIES[this.category].label}`;
    this.el.focus.value = plan.focus;
    this.el.summary.textContent = exercises.length ? type.summary(exercises) : 'Ruhetag';

    if (!exercises.length) {
      this.el.list.innerHTML = `
        <li class="empty-state" data-id="">
          <span class="empty-icon">${icon('coffee')}</span>
          <strong>Ruhetag</strong>
          <span class="muted">Für ${weekday.long} ist noch nichts eingetragen.</span>
        </li>`;
      return;
    }

    this.el.list.innerHTML = exercises
      .map((e, i) => {
        const chips = type
          .chips(e)
          .filter(Boolean)
          .map((c) => `<span class="chip${c.strong ? ' strong' : ''}">${escapeHtml(c.text)}</span>`)
          .join('');
        const notes = [e.intervals, e.detail].filter(Boolean).map(escapeHtml).join(' · ');
        return `
        <li class="exercise" data-id="${e.id}">
          <span class="ex-num">${i + 1}</span>
          <div class="ex-main">
            <p class="ex-name">${escapeHtml(e.name)}</p>
            <div class="ex-meta">
              ${chips}
              ${e.weight ? `<span class="chip weight">${formatKg(e.weight)}${this.weightTrend(e)}</span>` : ''}
              ${notes ? `<span class="ex-detail">${notes}</span>` : ''}
            </div>
          </div>
          <div class="ex-actions">
            ${this.isWeighted(e) ? `<button type="button" class="icon-btn history" data-action="history" aria-label="Gewichtsverlauf von ${escapeHtml(e.name)}" title="Gewichtsverlauf">${icon('trend')}</button>` : ''}
            <button type="button" class="icon-btn" data-action="edit" aria-label="${escapeHtml(e.name)} bearbeiten" title="Bearbeiten">${icon('pencil')}</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="${escapeHtml(e.name)} löschen" title="Löschen">${icon('trash')}</button>
          </div>
        </li>`;
      })
      .join('');
  },

  /** Kleiner Hinweis im Gewichts-Chip: Veränderung der letzten 4 Wochen */
  weightTrend(exercise) {
    const diff = WeightLog.changeSince(exercise.id, 28);
    if (!diff) return '';
    return ` <span class="chip-trend ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '↑' : '↓'} ${formatKg(Math.abs(diff))}</span>`;
  },

  renderInfo() {
    const cat = CATEGORIES[this.category];
    const type = sportTypeOf(this.category);
    const weekList = WEEKDAYS.flatMap((d) => this.exercisesOf(this.category, d.key));
    const trainingDays = WEEKDAYS.filter((d) => this.exercisesOf(this.category, d.key).length).length;

    let html = `
      <div>
        <h3>${icon(type.icon)} Woche im Überblick</h3>
        <p class="week-total">${weekList.length ? escapeHtml(type.summary(weekList)) : 'Noch nichts geplant'}</p>
        <p class="muted">${trainingDays} von 7 Tagen mit Training</p>
      </div>
      <div>
        <h3>${icon('info')} Tipps · ${escapeHtml(cat.label)}</h3>
        <ul class="tip-list">${cat.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
      </div>`;

    if (type.zones && cat.custom) {
      html += `
        <div>
          <h3 style="margin-bottom:10px">${type.zones.title}</h3>
          <div class="zone-list">
            ${type.zones.rows
              .map(
                ([tag, value, label], i) => {
                  // Farbe wird mit der Zone kräftiger, bleibt aber hell genug für dunklen/hellen Text
                  const mix = Math.round(10 + (i / (type.zones.rows.length - 1)) * 25);
                  return `
              <div class="zone-row" style="--zone-mix:${mix}%">
                <b>${tag}</b><span class="zone-value">${value}</span><span class="muted">${label}</span>
              </div>`;
                }
              )
              .join('')}
          </div>
        </div>`;
    }

    if (this.category === 'comeback') {
      html += `
        <div>
          <h3 style="margin-bottom:10px">Schmerz-Ampel</h3>
          <div class="traffic">
            <div class="traffic-row green"><b>0–2</b><span>Alles gut – Plan fortsetzen</span></div>
            <div class="traffic-row yellow"><b>3–4</b><span>Umfang halten, nicht steigern</span></div>
            <div class="traffic-row red"><b>5+</b><span>Abbrechen, 2–3 Tage pausieren</span></div>
          </div>
        </div>
        <div>
          <h3 style="margin-bottom:4px">Schmerzverlauf</h3>
          <p class="muted" style="margin-bottom:10px">Nach Comeback-Einheiten · letzte 8 Wochen</p>
          <div class="mini-chart"><canvas id="painChart" aria-label="Schmerzverlauf"></canvas></div>
        </div>
        <p class="info-note">Hinweis: Dieser Plan ersetzt keine ärztliche oder physiotherapeutische Beratung. Bei anhaltenden oder punktuellen Schmerzen bitte abklären lassen.</p>`;
    }

    this.el.info.innerHTML = html;
    this.onInfoRendered(this.category);
  },

  /* ---------- Übungs-Dialog (Hinzufügen / Bearbeiten) ---------- */

  /** Formularfelder passend zur Sportart des gewählten Plans erzeugen */
  renderFields(categoryKey, values = {}) {
    const type = sportTypeOf(categoryKey);
    this.el.nameLabel.textContent = type.nameLabel;
    this.el.form.name.placeholder = type.namePlaceholder;
    this.el.modalTitle.textContent = `${type.unit[0]} ${this.editing ? 'bearbeiten' : 'hinzufügen'}`;

    this.el.fields.innerHTML = type.fields
      .map((f) => {
        const id = `field-${f.key}`;
        const given = values[f.key];
        const isEmpty = given === undefined || given === null || given === '';
        const value = isEmpty ? (this.editing ? '' : f.default ?? '') : given;
        const attrs = [
          `id="${id}"`,
          `name="${f.key}"`,
          f.required ? 'required' : '',
          f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : '',
          f.maxlength ? `maxlength="${f.maxlength}"` : '',
        ].join(' ');

        let control;
        if (f.type === 'select') {
          const options = (f.empty ? [`<option value="">${f.empty}</option>`] : []).concat(
            f.options.map((o) => `<option value="${escapeHtml(o)}" ${String(value) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`)
          );
          control = `<select class="select" ${attrs}>${options.join('')}</select>`;
        } else if (f.type === 'number') {
          control = `<input type="number" inputmode="decimal" ${attrs} min="${f.min ?? 0}" max="${f.max ?? 100000}" step="${f.step ?? 1}" value="${escapeHtml(value)}" />`;
        } else {
          control = `<input type="text" ${attrs} value="${escapeHtml(value)}" />`;
        }
        const optional = f.required ? '' : ' <em>(optional)</em>';
        return `<label class="field${f.full ? ' field--full' : ''}" for="${id}"><span>${f.label}${f.type === 'select' ? '' : optional}</span>${control}</label>`;
      })
      .join('');
  },

  /** Aktuelle Werte aller Felder im Übungs-Dialog */
  collectValues() {
    const values = {};
    this.el.fields.querySelectorAll('[name]').forEach((input) => (values[input.name] = input.value));
    return values;
  },

  openModal(id = null) {
    const form = this.el.form;
    form.reset();
    form.category.innerHTML = Object.entries(CATEGORIES)
      .map(([key, c]) => `<option value="${key}">${escapeHtml(c.label)}</option>`)
      .join('');
    form.category.value = this.category;
    form.day.value = this.day;

    let values = {};
    if (id) {
      const exercise = this.exercisesOf(this.category, this.day).find((e) => e.id === id);
      if (!exercise) return;
      this.editing = { category: this.category, day: this.day, id };
      form.name.value = exercise.name;
      values = exercise;
    } else {
      this.editing = null;
    }

    this.renderFields(this.category, values);
    this.el.modal.showModal();
    form.name.focus();
  },

  saveFromForm() {
    const form = this.el.form;
    const targetCat = form.category.value;
    const targetDay = form.day.value;
    const type = sportTypeOf(targetCat);
    const previous = this.editing ? this.findExercise(this.editing.id)?.exercise : null;

    // Bestehende Werte behalten (z. B. beim Wechsel der Sportart) und Felder überschreiben
    const exercise = { ...(previous || {}), id: previous ? previous.id : newId(), name: form.name.value.trim() };
    const values = this.collectValues();
    type.fields.forEach((f) => {
      const raw = String(values[f.key] ?? '').trim();
      if (f.type === 'number') {
        const num = parseFloat(raw.replace(',', '.'));
        exercise[f.key] = Number.isFinite(num) ? num : null;
      } else {
        exercise[f.key] = raw;
      }
    });
    if (!('weight' in exercise)) exercise.weight = null;
    if (!exercise.name) return;

    // Neues oder geändertes Gewicht automatisch im Verlauf für heute festhalten
    const oldWeight = previous ? previous.weight : null;
    if (exercise.weight && exercise.weight !== oldWeight) {
      WeightLog.record(exercise.id, DateUtils.toKey(new Date()), exercise.weight, exercise.reps);
    }

    if (this.editing) {
      const source = this.exercisesOf(this.editing.category, this.editing.day);
      const index = source.findIndex((e) => e.id === this.editing.id);
      const sameDay = this.editing.category === targetCat && this.editing.day === targetDay;
      if (sameDay) {
        source[index] = exercise; // an gleicher Stelle ersetzen
      } else {
        source.splice(index, 1); // auf anderen Tag / anderen Plan verschieben
        this.exercisesOf(targetCat, targetDay).push(exercise);
      }
    } else {
      this.exercisesOf(targetCat, targetDay).push(exercise);
    }

    // Ansicht zum Ziel springen lassen, damit man die Übung direkt sieht
    this.category = targetCat;
    this.day = targetDay;

    this.save();
    this.el.modal.close();
    this.render();
    showToast(`${type.unit[0]} ${this.editing ? 'aktualisiert' : 'hinzugefügt'}`);
    this.editing = null;
  },

  async deleteExercise(id) {
    const list = this.exercisesOf(this.category, this.day);
    const exercise = list.find((e) => e.id === id);
    if (!exercise) return;
    const unitName = sportTypeOf(this.category).unit[0];
    const ok = await confirmAction(`„${exercise.name}“ wird aus diesem Tag entfernt.`, 'Löschen', `${unitName} löschen?`);
    if (!ok) return;

    list.splice(list.indexOf(exercise), 1);
    this.save();
    this.renderDays();
    this.renderDetail();
    this.renderInfo();
    showToast(`${unitName} gelöscht`);
  },

  async resetCategory() {
    const cat = CATEGORIES[this.category];
    const ok = await confirmAction(
      `Der Plan „${cat.label}“ wird auf die Beispielwoche zurückgesetzt. Eigene Änderungen an diesem Plan gehen verloren.`,
      'Zurücksetzen',
      'Plan zurücksetzen?'
    );
    if (!ok) return;
    this.data[this.category] = cat.custom ? buildWeek(cat.type, true) : clone(DEFAULT_PLANS[this.category]);
    this.save();
    this.render();
    showToast(`Plan „${cat.label}“ zurückgesetzt`);
  },

  /* ---------- Plan-Dialog (eigene Pläne anlegen / bearbeiten) ---------- */
  openPlanModal(key = null) {
    const form = this.el.planForm;
    form.reset();
    const existing = key ? this.custom.find((c) => c.key === key) : null;
    this.editingPlan = existing ? existing.key : null;

    this.el.planTitle.textContent = existing ? 'Plan bearbeiten' : 'Neuen Plan anlegen';
    this.el.deletePlanBtn.hidden = !existing;
    this.el.templateRow.hidden = Boolean(existing);

    // Sportarten als Auswahlkarten
    const selectedType = existing ? existing.type : 'cycling';
    this.el.typeGrid.innerHTML = SPORT_TYPE_ORDER.map((t) => {
      const type = SPORT_TYPES[t];
      return `
        <label class="type-option">
          <input type="radio" name="type" value="${t}" ${t === selectedType ? 'checked' : ''} ${existing ? 'disabled' : ''} />
          <span class="type-card">${icon(type.icon)}<strong>${type.label}</strong></span>
        </label>`;
    }).join('');

    // Farben – erste noch freie Farbe vorauswählen
    const used = this.custom.map((c) => c.color);
    const selectedColor = existing ? existing.color : PLAN_COLORS.find((c) => !used.includes(c)) || PLAN_COLORS[0];
    this.el.colorGrid.innerHTML = PLAN_COLORS.map(
      (c, i) => `
        <label class="swatch-option" title="Farbe ${i + 1}">
          <input type="radio" name="color" value="${c}" ${c === selectedColor ? 'checked' : ''} aria-label="Farbe ${i + 1}" />
          <span style="background:${c}"></span>
        </label>`
    ).join('');

    form.label.value = existing ? existing.label : '';
    form.description.value = existing ? existing.description || '' : '';
    this.updateTypeHint();
    this.el.planModal.showModal();
    form.label.focus();
  },

  /** Zeigt, welche Faktoren die gewählte Sportart erfasst */
  updateTypeHint() {
    const checked = this.el.planForm.querySelector('[name="type"]:checked');
    const type = SPORT_TYPES[checked ? checked.value : 'other'];
    this.el.typeHint.innerHTML = `<strong>Erfasst je ${type.unit[0]}:</strong> ${type.hint}`;
    this.el.templateRow.querySelector('input').disabled = !type.template;
    this.el.templateRow.querySelector('.label').textContent = type.template
      ? 'Mit Beispielwoche starten'
      : 'Für diese Sportart gibt es keine Beispielwoche';
  },

  savePlanFromForm() {
    const form = this.el.planForm;
    const label = form.label.value.trim();
    if (!label) return;
    const color = form.querySelector('[name="color"]:checked').value;
    const description = form.description.value.trim();

    if (this.editingPlan) {
      const plan = this.custom.find((c) => c.key === this.editingPlan);
      Object.assign(plan, { label, color, description });
      this.registerCategory(plan);
      this.category = plan.key;
      showToast('Plan gespeichert');
    } else {
      const type = form.querySelector('[name="type"]:checked').value;
      const plan = { key: `plan${Date.now().toString(36)}`, label, type, color, description };
      const withTemplate = form.template.checked && !form.template.disabled;
      this.data[plan.key] = buildWeek(type, withTemplate);
      this.custom.push(plan);
      this.registerCategory(plan);
      this.category = plan.key;
      showToast(`Plan „${label}“ angelegt`);
    }

    this.saveCategories();
    this.save();
    this.el.planModal.close();
    this.render();
  },

  async deletePlan() {
    const plan = this.custom.find((c) => c.key === this.editingPlan);
    if (!plan) return;
    const ok = await confirmAction(
      `Der Plan „${plan.label}“ und alle seine Einheiten werden gelöscht.`,
      'Plan löschen',
      'Plan löschen?'
    );
    if (!ok) return;

    this.custom = this.custom.filter((c) => c.key !== plan.key);
    delete CATEGORIES[plan.key];
    delete this.data[plan.key];
    this.updateColorStyles();
    this.saveCategories();
    this.save();
    this.el.planModal.close();
    this.category = 'gym';
    this.render();
    showToast(`Plan „${plan.label}“ gelöscht`);
  },
};
