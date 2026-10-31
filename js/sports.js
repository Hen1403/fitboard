/* ==========================================================
   sports.js – Sportarten für eigene Trainingspläne
   Jede Sportart legt fest:
   - welche Felder eine Einheit hat (z. B. Watt beim Radfahren)
   - wie Einheiten als „Chips“ zusammengefasst werden
   - Tipps, Intensitätszonen und eine optionale Beispielwoche
   Neue Sportart? Einfach einen weiteren Eintrag in SPORT_TYPES anlegen.
   ========================================================== */

/** Kurzschreibweise für eine Felddefinition */
function field(key, label, type, options = {}) {
  return { key, label, type, ...options };
}

const ZONE_OPTIONS_5 = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const ZONE_OPTIONS_6 = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'];
const sum = (list, key) => list.reduce((total, e) => total + (Number(e[key]) || 0), 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "10" → "10 Wdh.", "30 s" bleibt "30 s" */
function repsLabel(reps) {
  return /^[\d\s–-]+$/.test(String(reps)) ? `${reps} Wdh.` : String(reps);
}

/** 42.5 → "42,5 km" */
function formatKm(value) {
  return `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}

/** Gemeinsame Felder */
const SETS_FIELD = field('sets', 'Sätze', 'number', { min: 1, max: 20, required: true, default: 3 });
const DETAIL_FIELD = field('detail', 'Hinweis', 'text', { placeholder: 'optional', full: true, maxlength: 80 });

/** Kraft-ähnliche Sportarten teilen sich die Darstellung */
const strengthChips = (e) => [
  { text: `${e.sets} ${Number(e.sets) === 1 ? 'Satz' : 'Sätze'}`, strong: true },
  { text: repsLabel(e.reps) },
  e.rest && { text: `Pause ${e.rest}` },
];
const strengthSummary = (list) => `${plural(list.length, 'Übung', 'Übungen')} · ${sum(list, 'sets')} Sätze`;

const SPORT_TYPES = {
  /* ---------- Kraft ---------- */
  strength: {
    label: 'Kraft',
    icon: 'dumbbell',
    hint: 'Sätze, Wiederholungen, Gewicht, Pause',
    unit: ['Übung', 'Übungen'],
    nameLabel: 'Übung',
    namePlaceholder: 'z. B. Bankdrücken',
    description: 'Krafttraining mit Sätzen, Wiederholungen und Gewichtsverlauf.',
    fields: [
      SETS_FIELD,
      field('reps', 'Wiederholungen / Dauer', 'text', { required: true, placeholder: 'z. B. 8–10', maxlength: 20 }),
      field('weight', 'Gewicht (kg)', 'number', { min: 0, max: 1000, step: 0.5, placeholder: 'z. B. 60' }),
      field('rest', 'Satzpause', 'text', { placeholder: 'z. B. 2 min', maxlength: 20 }),
      DETAIL_FIELD,
    ],
    chips: strengthChips,
    summary: strengthSummary,
    minutes: (e) => (Number(e.sets) || 0) * 2.5, // Satz + Pause
    tips: [
      'Progressive Overload: Gewicht oder Wiederholungen steigern, sobald alle Sätze sauber gelingen.',
      'Große Übungen zuerst, Isolationsübungen am Ende.',
      '1–3 Wiederholungen „im Tank“ lassen, Technik vor Gewicht.',
      'Pro Muskelgruppe ca. 10–20 harte Sätze pro Woche als Orientierung.',
    ],
  },

  /* ---------- Laufen ---------- */
  running: {
    label: 'Laufen',
    icon: 'steps',
    hint: 'Dauer, Distanz, Pace, Herzfrequenz-Zone, Intervalle',
    unit: ['Einheit', 'Einheiten'],
    nameLabel: 'Einheit',
    namePlaceholder: 'z. B. Lockerer Dauerlauf',
    description: 'Lauftraining gesteuert über Umfang, Pace und Herzfrequenz-Zonen.',
    fields: [
      field('sessionType', 'Art der Einheit', 'select', {
        options: ['Lockerer Dauerlauf', 'Long Run', 'Tempodauerlauf', 'Intervalle', 'Fahrtspiel', 'Steigerungen', 'Regenerationslauf', 'Wettkampf'],
      }),
      field('duration', 'Dauer (min)', 'number', { min: 1, max: 600, required: true, placeholder: 'z. B. 45' }),
      field('distance', 'Distanz (km)', 'number', { min: 0, max: 300, step: 0.1, placeholder: 'z. B. 8' }),
      field('pace', 'Pace (min/km)', 'text', { placeholder: 'z. B. 5:45', maxlength: 12 }),
      field('zone', 'HF-Zone', 'select', { options: ZONE_OPTIONS_5, empty: 'keine' }),
      field('intervals', 'Intervalle', 'text', { placeholder: 'z. B. 6 × 800 m / 2 min Trabpause', maxlength: 60 }),
      DETAIL_FIELD,
    ],
    chips: (e) => [
      { text: e.sessionType || 'Lauf', strong: true },
      e.duration && { text: Format.minutes(e.duration) },
      e.distance && { text: formatKm(e.distance) },
      e.pace && { text: `${e.pace} /km` },
      e.zone && { text: e.zone },
    ],
    summary: (list) => {
      const km = sum(list, 'distance');
      return [plural(list.length, 'Einheit', 'Einheiten'), Format.minutes(sum(list, 'duration')), km && formatKm(km)].filter(Boolean).join(' · ');
    },
    minutes: (e) => Number(e.duration) || 0,
    tips: [
      'Etwa 80 % des Umfangs locker (Z1–Z2), nur rund 20 % intensiv.',
      'Wochenumfang höchstens um ca. 10 % steigern.',
      'Kadenz um 170–180 Schritte/min verringert oft die Stoßbelastung.',
      'Laufschuhe nach ca. 600–800 km prüfen und ggf. ersetzen.',
    ],
    zones: {
      title: 'Herzfrequenz-Zonen (% HFmax)',
      rows: [
        ['Z1', '50–60 %', 'Regeneration'],
        ['Z2', '60–70 %', 'Grundlagenausdauer'],
        ['Z3', '70–80 %', 'Aerob / Tempo'],
        ['Z4', '80–90 %', 'Schwelle'],
        ['Z5', '90–100 %', 'Maximal / VO2max'],
      ],
    },
    template: () => ({
      di: { focus: 'Intervalle', exercises: [
        unit('Einlaufen', { sessionType: 'Lockerer Dauerlauf', duration: 15, distance: 2.5, zone: 'Z2' }),
        unit('800-m-Intervalle', { sessionType: 'Intervalle', duration: 25, distance: 5, pace: '4:30', zone: 'Z4', intervals: '6 × 800 m / 2 min Trabpause' }),
        unit('Auslaufen', { sessionType: 'Regenerationslauf', duration: 10, distance: 1.5, zone: 'Z1' }),
      ] },
      do: { focus: 'Grundlage', exercises: [
        unit('Lockerer Dauerlauf', { sessionType: 'Lockerer Dauerlauf', duration: 45, distance: 7.5, pace: '6:00', zone: 'Z2' }),
        unit('Steigerungen', { sessionType: 'Steigerungen', duration: 5, intervals: '4 × 80 m locker steigernd' }),
      ] },
      so: { focus: 'Long Run', exercises: [
        unit('Langer Lauf', { sessionType: 'Long Run', duration: 80, distance: 13, pace: '6:10', zone: 'Z2', detail: 'weicher Untergrund, ruhig bleiben' }),
      ] },
    }),
  },

  /* ---------- Radfahren ---------- */
  cycling: {
    label: 'Radfahren',
    icon: 'bike',
    hint: 'Dauer, Distanz, Leistungszone, Watt/%FTP, Trittfrequenz, Höhenmeter',
    unit: ['Einheit', 'Einheiten'],
    nameLabel: 'Einheit',
    namePlaceholder: 'z. B. Grundlagenausfahrt',
    description: 'Radtraining gesteuert über Leistung (Watt / % FTP), Trittfrequenz und Umfang.',
    fields: [
      field('sessionType', 'Art der Einheit', 'select', {
        options: ['Grundlage (GA1)', 'Grundlage 2 (GA2)', 'Sweet Spot', 'Schwelle (FTP)', 'VO2max-Intervalle', 'Sprints', 'Technik / Trittfrequenz', 'Regeneration', 'Rennen / Event'],
      }),
      field('duration', 'Dauer (min)', 'number', { min: 1, max: 900, required: true, placeholder: 'z. B. 90' }),
      field('distance', 'Distanz (km)', 'number', { min: 0, max: 500, step: 0.1, placeholder: 'z. B. 40' }),
      field('zone', 'Leistungszone', 'select', { options: ZONE_OPTIONS_6, empty: 'keine' }),
      field('power', 'Watt / % FTP', 'text', { placeholder: 'z. B. 200 W oder 88–93 %', maxlength: 24 }),
      field('cadence', 'Trittfrequenz (rpm)', 'text', { placeholder: 'z. B. 85–95', maxlength: 12 }),
      field('elevation', 'Höhenmeter', 'number', { min: 0, max: 10000, step: 10, placeholder: 'z. B. 600' }),
      field('intervals', 'Intervalle', 'text', { placeholder: 'z. B. 3 × 12 min / 5 min Pause', maxlength: 60 }),
      DETAIL_FIELD,
    ],
    chips: (e) => [
      { text: e.sessionType || 'Fahrt', strong: true },
      e.duration && { text: Format.minutes(e.duration) },
      e.distance && { text: formatKm(e.distance) },
      e.zone && { text: e.zone },
      e.power && { text: e.power },
      e.cadence && { text: `${e.cadence} rpm` },
      e.elevation && { text: `${Format.number(e.elevation)} hm` },
    ],
    summary: (list) => {
      const km = sum(list, 'distance');
      const hm = sum(list, 'elevation');
      return [plural(list.length, 'Einheit', 'Einheiten'), Format.minutes(sum(list, 'duration')), km && formatKm(km), hm && `${Format.number(hm)} hm`]
        .filter(Boolean)
        .join(' · ');
    },
    minutes: (e) => Number(e.duration) || 0,
    tips: [
      'Etwa 80 % des Umfangs locker in Z1–Z2, gezielte Reize in Z4–Z5.',
      'FTP-Test alle 6–8 Wochen, damit die Wattbereiche stimmen.',
      'Trittfrequenz meist 80–100 rpm, das schont die Knie.',
      'Ab ca. 90 min: 30–60 g Kohlenhydrate pro Stunde, bei langen Ausfahrten bis 90 g.',
    ],
    zones: {
      title: 'Leistungszonen (% FTP)',
      rows: [
        ['Z1', '< 55 %', 'Aktive Erholung'],
        ['Z2', '56–75 %', 'Grundlage'],
        ['Z3', '76–90 %', 'Tempo'],
        ['Z4', '91–105 %', 'Schwelle'],
        ['Z5', '106–120 %', 'VO2max'],
        ['Z6', '121–150 %', 'Anaerob'],
      ],
    },
    template: () => ({
      di: { focus: 'Sweet Spot', exercises: [
        unit('Einfahren', { sessionType: 'Grundlage (GA1)', duration: 15, zone: 'Z2', cadence: '90' }),
        unit('Sweet-Spot-Intervalle', { sessionType: 'Sweet Spot', duration: 51, zone: 'Z3', power: '88–93 % FTP', cadence: '85–95', intervals: '3 × 12 min / 5 min Pause' }),
        unit('Ausfahren', { sessionType: 'Regeneration', duration: 10, zone: 'Z1' }),
      ] },
      do: { focus: 'Grundlage & Technik', exercises: [
        unit('Grundlagenfahrt', { sessionType: 'Grundlage (GA1)', duration: 60, distance: 28, zone: 'Z2', power: '60–70 % FTP' }),
        unit('Trittfrequenz-Drills', { sessionType: 'Technik / Trittfrequenz', duration: 12, cadence: '110+', intervals: '6 × 1 min / 1 min locker' }),
      ] },
      sa: { focus: 'Lange Ausfahrt', exercises: [
        unit('Lange Grundlagenausfahrt', { sessionType: 'Grundlage (GA1)', duration: 180, distance: 80, zone: 'Z2', elevation: 800, detail: '60 g Kohlenhydrate pro Stunde einplanen' }),
      ] },
      so: { focus: 'Regeneration', exercises: [
        unit('Lockeres Rollen', { sessionType: 'Regeneration', duration: 45, distance: 18, zone: 'Z1', cadence: '90–100' }),
      ] },
    }),
  },

  /* ---------- Schwimmen ---------- */
  swimming: {
    label: 'Schwimmen',
    icon: 'waves',
    hint: 'Wiederholungen × Strecke, Lage, Pause/Abgang, Tempo pro 100 m, Hilfsmittel',
    unit: ['Serie', 'Serien'],
    nameLabel: 'Serie / Übung',
    namePlaceholder: 'z. B. Hauptserie Kraul',
    description: 'Schwimmtraining in Serien: Wiederholungen × Strecke mit Lage, Abgangszeit und Tempo.',
    fields: [
      field('phase', 'Abschnitt', 'select', { options: ['Einschwimmen', 'Technik', 'Hauptserie', 'Ausschwimmen'], empty: 'keine Angabe' }),
      field('stroke', 'Lage', 'select', { options: ['Kraul', 'Brust', 'Rücken', 'Delfin', 'Lagen', 'Beine', 'Arme (Pull)'] }),
      field('reps', 'Wiederholungen', 'number', { min: 1, max: 100, required: true, default: 1 }),
      field('distanceM', 'Strecke je Wdh. (m)', 'number', { min: 25, max: 5000, step: 25, required: true, placeholder: 'z. B. 100' }),
      field('rest', 'Pause / Abgang', 'text', { placeholder: 'z. B. 20 s oder @ 2:00', maxlength: 20 }),
      field('pace', 'Tempo pro 100 m', 'text', { placeholder: 'z. B. 1:50', maxlength: 12 }),
      field('equipment', 'Hilfsmittel', 'text', { placeholder: 'z. B. Pullbuoy, Flossen', maxlength: 40 }),
      field('intensity', 'Intensität', 'select', { options: ['locker', 'mittel', 'zügig', 'hart', 'maximal'], empty: 'keine' }),
      DETAIL_FIELD,
    ],
    chips: (e) => [
      { text: Number(e.reps) > 1 ? `${e.reps} × ${e.distanceM} m` : `${e.distanceM} m`, strong: true },
      e.stroke && { text: e.stroke },
      e.phase && { text: e.phase },
      e.rest && { text: e.rest },
      e.pace && { text: `${e.pace} /100 m` },
      e.equipment && { text: e.equipment },
      e.intensity && { text: e.intensity },
    ],
    summary: (list) => {
      const meters = list.reduce((total, e) => total + (Number(e.reps) || 1) * (Number(e.distanceM) || 0), 0);
      return `${plural(list.length, 'Serie', 'Serien')} · ${Format.number(meters)} m`;
    },
    minutes: (e) => ((Number(e.reps) || 1) * (Number(e.distanceM) || 0)) / 35, // ca. 35 m pro Minute inkl. Pausen
    tips: [
      'Technik vor Umfang: saubere Wasserlage spart mehr Kraft als zusätzliche Meter.',
      'Abgangszeiten (z. B. @ 2:00) statt fester Pausen machen Serien vergleichbar.',
      'CSS-Test (400 m + 200 m) liefert dein Schwellentempo pro 100 m.',
      'Paddles sparsam einsetzen, sie belasten die Schulter stärker.',
    ],
    zones: {
      title: 'Intensität (bezogen auf CSS-Tempo)',
      rows: [
        ['EN1', 'CSS + 10–15 s', 'Locker / Technik'],
        ['EN2', 'CSS + 5–10 s', 'Grundlage'],
        ['SCH', '≈ CSS', 'Schwelle'],
        ['VO2', 'CSS − 3–5 s', 'Hohe Intensität'],
        ['SP', 'maximal', 'Sprint'],
      ],
    },
    template: () => ({
      mo: { focus: 'Ausdauer Kraul', exercises: [
        unit('Einschwimmen', { phase: 'Einschwimmen', stroke: 'Kraul', reps: 1, distanceM: 400, intensity: 'locker' }),
        unit('Technik: Abschlag', { phase: 'Technik', stroke: 'Kraul', reps: 8, distanceM: 50, rest: '15 s' }),
        unit('Hauptserie', { phase: 'Hauptserie', stroke: 'Kraul', reps: 10, distanceM: 100, rest: '20 s', pace: '1:55', intensity: 'mittel' }),
        unit('Pull', { phase: 'Hauptserie', stroke: 'Arme (Pull)', reps: 4, distanceM: 100, rest: '20 s', equipment: 'Pullbuoy' }),
        unit('Ausschwimmen', { phase: 'Ausschwimmen', stroke: 'Rücken', reps: 1, distanceM: 200, intensity: 'locker' }),
      ] },
      do: { focus: 'Tempo & Beine', exercises: [
        unit('Einschwimmen', { phase: 'Einschwimmen', stroke: 'Lagen', reps: 1, distanceM: 300, intensity: 'locker' }),
        unit('Beinarbeit', { phase: 'Technik', stroke: 'Beine', reps: 6, distanceM: 50, rest: '20 s', equipment: 'Brett, Flossen' }),
        unit('200er-Serie', { phase: 'Hauptserie', stroke: 'Kraul', reps: 5, distanceM: 200, rest: '@ 4:00', pace: '1:50', intensity: 'zügig' }),
        unit('Ausschwimmen', { phase: 'Ausschwimmen', stroke: 'Brust', reps: 1, distanceM: 200, intensity: 'locker' }),
      ] },
    }),
  },

  /* ---------- Mobility ---------- */
  mobility: {
    label: 'Mobility',
    icon: 'stretch',
    hint: 'Sätze, Wiederholungen oder Haltedauer',
    unit: ['Übung', 'Übungen'],
    nameLabel: 'Übung',
    namePlaceholder: 'z. B. Hüftbeuger-Dehnung',
    description: 'Dehn- und Mobilisationsübungen mit Wiederholungen oder Haltedauer.',
    fields: [
      SETS_FIELD,
      field('reps', 'Wiederholungen / Haltedauer', 'text', { required: true, placeholder: 'z. B. 10 oder 30 s', maxlength: 20 }),
      DETAIL_FIELD,
    ],
    chips: strengthChips,
    summary: strengthSummary,
    minutes: (e) => (Number(e.sets) || 1) * 1,
    tips: [
      'Langsam und kontrolliert bewegen, nicht wippen.',
      'Statische Dehnungen 20–45 s halten.',
      'Lieber täglich kurz als selten lang.',
    ],
  },

  /* ---------- Sonstiges ---------- */
  other: {
    label: 'Sonstiges',
    icon: 'star',
    hint: 'Dauer, Anstrengung (RPE), optional Sätze & Wiederholungen',
    unit: ['Einheit', 'Einheiten'],
    nameLabel: 'Einheit',
    namePlaceholder: 'z. B. Bouldern',
    description: 'Freie Einheiten, gesteuert über Dauer und empfundene Anstrengung (RPE).',
    fields: [
      field('duration', 'Dauer (min)', 'number', { min: 1, max: 600, required: true, placeholder: 'z. B. 60' }),
      field('rpe', 'Anstrengung (RPE 1–10)', 'select', { options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], empty: 'keine' }),
      field('sets', 'Sätze / Runden', 'number', { min: 1, max: 50, placeholder: 'optional' }),
      field('reps', 'Wiederholungen', 'text', { placeholder: 'optional', maxlength: 20 }),
      DETAIL_FIELD,
    ],
    chips: (e) => [
      { text: Format.minutes(e.duration || 0), strong: true },
      e.rpe && { text: `RPE ${e.rpe}` },
      e.sets && { text: e.reps ? `${e.sets} × ${e.reps}` : `${e.sets} Runden` },
    ],
    summary: (list) => `${plural(list.length, 'Einheit', 'Einheiten')} · ${Format.minutes(sum(list, 'duration'))}`,
    minutes: (e) => Number(e.duration) || 0,
    tips: [
      'RPE ist die gefühlte Anstrengung von 1 (sehr leicht) bis 10 (maximal).',
      'Harte Einheiten (RPE 8+) mit lockeren Tagen abwechseln.',
    ],
    zones: {
      title: 'Anstrengung (RPE)',
      rows: [
        ['1–2', 'sehr leicht', 'Unterhaltung mühelos'],
        ['3–4', 'leicht', 'ganze Sätze möglich'],
        ['5–6', 'mittel', 'kurze Sätze möglich'],
        ['7–8', 'hart', 'nur einzelne Wörter'],
        ['9–10', 'maximal', 'Sprechen kaum möglich'],
      ],
    },
  },
};

/** Reihenfolge der Auswahl beim Anlegen eines Plans */
const SPORT_TYPE_ORDER = ['cycling', 'swimming', 'running', 'strength', 'mobility', 'other'];

/** Farben für eigene Pläne (funktionieren in Hell und Dunkel) */
const PLAN_COLORS = ['#2f9e64', '#d23f8f', '#7d5bd6', '#c2410c', '#0e7490', '#a16207', '#4f6bed', '#dc3e42'];

/** Neue eindeutige ID für Übungen/Einheiten */
function newId() {
  return `ex${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Eine Einheit mit beliebigen Feldern anlegen (für Beispielwochen) */
function unit(name, fields = {}) {
  return { id: newId(), name, detail: '', weight: null, ...fields };
}

/** Leere Woche (oder Beispielwoche der Sportart) */
function buildWeek(type, withTemplate) {
  const template = withTemplate && SPORT_TYPES[type].template ? SPORT_TYPES[type].template() : {};
  const week = {};
  WEEKDAYS.forEach((d) => {
    week[d.key] = template[d.key] || { focus: '', exercises: [] };
  });
  return week;
}

/** Sportart einer Trainingsart (Kategorie) */
function sportTypeOf(categoryKey) {
  const category = CATEGORIES[categoryKey];
  return SPORT_TYPES[(category && category.type) || 'strength'];
}

/** Farbe einer Kategorie als echter Farbwert (für Diagramme) */
function categoryColor(categoryKey) {
  const color = CATEGORIES[categoryKey].color;
  return color.startsWith('--') ? cssVar(color) : color;
}

/** Kurzbeschreibung einer Einheit, z. B. "4 Sätze · 8 Wdh. · 60 kg" */
function exerciseShort(categoryKey, exercise) {
  const parts = sportTypeOf(categoryKey).chips(exercise).filter(Boolean).slice(0, 3).map((c) => c.text);
  if (exercise.weight) parts.push(formatKg(exercise.weight));
  return parts.join(' · ');
}
