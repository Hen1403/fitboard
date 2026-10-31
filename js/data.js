/* ==========================================================
   data.js – Ziele, Kategorien, Beispieldaten & Standardpläne
   Tipp: Hier kannst du Ziele und Beispielpläne nach Belieben anpassen.
   ========================================================== */

/* ---------- Tagesziele ---------- */
const GOALS = {
  steps: 10000, // Schritte pro Tag
  calories: 600, // aktiv verbrannte kcal pro Tag
  workoutMin: 45, // Trainingsminuten pro Tag
  sleep: 8, // Stunden Schlaf pro Nacht
};

/* ---------- Kennzahlen (für Karten & Diagramme) ---------- */
const METRICS = {
  steps: { label: 'Schritte', icon: 'steps', color: '--c-steps', unit: '', format: (v) => Format.number(v) },
  calories: { label: 'Verbrannte Kalorien', short: 'Kalorien', icon: 'flame', color: '--c-kcal', unit: 'kcal', format: (v) => `${Format.number(v)} kcal` },
  workoutMin: { label: 'Workoutzeit', icon: 'dumbbell', color: '--c-workout', unit: 'min', format: (v) => Format.minutes(v) },
  sleep: { label: 'Schlafzeit', short: 'Schlaf', icon: 'moon', color: '--c-sleep', unit: 'h', format: (v) => Format.hours(v), isAverage: true },
};

/* ---------- Wochentage ---------- */
const WEEKDAYS = [
  { key: 'mo', short: 'Mo', long: 'Montag' },
  { key: 'di', short: 'Di', long: 'Dienstag' },
  { key: 'mi', short: 'Mi', long: 'Mittwoch' },
  { key: 'do', short: 'Do', long: 'Donnerstag' },
  { key: 'fr', short: 'Fr', long: 'Freitag' },
  { key: 'sa', short: 'Sa', long: 'Samstag' },
  { key: 'so', short: 'So', long: 'Sonntag' },
];

/* ---------- Trainingsarten ---------- */
const CATEGORIES = {
  gym: {
    label: 'Gym',
    subtitle: 'Krafttraining',
    type: 'strength',
    color: '--c-gym',
    description: 'Klassisches Krafttraining im Studio – Gewicht und Volumen werden Schritt für Schritt gesteigert.',
    tips: [
      '5–10 Minuten aufwärmen, erster Satz jeder Übung mit leichtem Gewicht.',
      'Progressive Overload: +2,5 kg, sobald alle Sätze sauber gelingen.',
      'Beintraining ohne Sprünge – schont das Schienbein während des Comebacks.',
      '1–3 Wiederholungen „im Tank“ lassen, Technik vor Gewicht.',
    ],
  },
  mobility: {
    label: 'Mobility',
    subtitle: 'Morgendliches Dehnen',
    type: 'mobility',
    color: '--c-mobility',
    description: 'Kurze Dehn- und Mobilisationsroutine direkt nach dem Aufstehen – ca. 10–15 Minuten.',
    tips: [
      'Langsam und kontrolliert bewegen, nicht wippen.',
      'Ruhig weiteratmen – Ausatmen vertieft die Dehnung.',
      'Lieber jeden Tag kurz als einmal pro Woche lang.',
      'Dehnen soll ziehen, aber nie stechen oder schmerzen.',
    ],
  },
  comeback: {
    label: 'Comeback',
    subtitle: 'Schienbeinkante',
    type: 'strength',
    color: '--c-comeback',
    description: 'Behutsamer Wiederaufbau bei chronischem Schienbeinkantensyndrom: Unterschenkel kräftigen, Laufumfang langsam steigern, auf Schmerzsignale achten.',
    tips: [
      'Umfang maximal ca. 10 % pro Woche steigern.',
      'Weiche, ebene Untergründe bevorzugen (Waldweg, Tartan).',
      'Zwischen Laufeinheiten mindestens einen Tag Pause.',
      'Am Morgen nach dem Training prüfen: Schmerz sollte nicht zunehmen.',
    ],
  },
};

/**
 * Trainingsarten mit Beispiel-Aktivitätsdaten (für Diagramme & Verteilung).
 * Eigene Pläne kommen später zu CATEGORIES hinzu, haben aber keine Aktivitätsdaten.
 */
const ACTIVITY_KEYS = ['gym', 'mobility', 'comeback'];

/* ==========================================================
   Beispiel-Aktivitätsdaten
   Werden bei jedem Laden gleich erzeugt (fester Zufalls-Startwert),
   damit das Dashboard immer gefüllt ist.
   ========================================================== */
const DATA_DAYS = 120;

/** Einfacher Zufallsgenerator mit Startwert → reproduzierbare Daten */
function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Erzeugt einen Datensatz pro Tag:
 * { date, steps, calories, workoutMin, sleep, workouts: {gym, mobility, comeback}, pain }
 */
function generateSampleData(days) {
  const rand = seededRandom(42);
  const today = DateUtils.startOfDay(new Date());
  const records = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = DateUtils.addDays(today, -i);
    const dow = date.getDay(); // 0 = Sonntag
    const progress = (days - i) / days; // 0 → 1: Trainingsfortschritt über die Zeit
    const isWeekend = dow === 0 || dow === 6;

    // Training nach Wochenplan (mit gelegentlich ausgelassenen Einheiten)
    const gym = [1, 3, 5].includes(dow) && rand() > 0.1 ? Math.round(50 + rand() * 25) : 0;
    const mobility = rand() > 0.15 ? Math.round(10 + rand() * 8 + (dow === 0 ? 8 : 0)) : 0;
    const comeback = [2, 4, 6].includes(dow) && rand() > 0.1 ? Math.round(16 + progress * 22 + rand() * 8) : 0;
    const workoutMin = gym + mobility + comeback;

    const steps = Math.round(5200 + rand() * 4200 + comeback * 85 + (isWeekend ? 1400 : 0) + progress * 1300);
    const calories = Math.round(steps * 0.032 + gym * 6.5 + comeback * 8 + mobility * 3);
    const sleep = Math.round((6.2 + rand() * 1.5 + (isWeekend ? 0.6 : 0)) * 10) / 10;

    // Schmerzlevel (0–10) nach Comeback-Einheiten – sinkt mit der Zeit
    const pain = comeback ? Math.min(10, Math.max(0, Math.round(5.5 - progress * 4.5 + (rand() - 0.5) * 1.6))) : null;

    records.push({ date, steps, calories, workoutMin, sleep, workouts: { gym, mobility, comeback }, pain });
  }
  return records;
}

/** Verteilt die Tagesschritte realistisch auf 24 Stunden */
const HOUR_PROFILE = [0, 0, 0, 0, 0, 0.2, 1.5, 4, 5, 3.5, 3, 3.5, 6, 4, 3, 3, 4, 7, 8, 6, 4, 2.5, 1, 0.3];

function hourlySteps(record) {
  const rand = seededRandom(record.date.getDate() * 31 + record.date.getMonth() * 7);
  const weights = HOUR_PROFILE.map((w) => w * (0.5 + rand()));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((record.steps * w) / total));
}

/* ==========================================================
   Standard-Trainingspläne
   Struktur: PLAN[trainingsart][wochentag] = { focus, exercises: [...] }
   ========================================================== */
let exerciseCounter = 0;

/**
 * Kurzschreibweise für eine Übung
 * weight = Arbeitsgewicht in kg (null = ohne Gewicht, z. B. Dehnübungen)
 */
function ex(name, sets, reps, detail = '', weight = null) {
  exerciseCounter += 1;
  return { id: `ex${exerciseCounter}`, name, sets, reps, detail, weight };
}

function planDay(focus = '', exercises = []) {
  return { focus, exercises };
}

/* Mobility-Routinen (werden mehrfach verwendet, daher als Funktion) */
const mobilityA = () => [
  ex('Katze-Kuh', 2, '10', 'langsam, Wirbel für Wirbel'),
  ex('Hüftbeuger-Dehnung im Ausfallschritt', 2, '30 s', 'je Seite'),
  ex("World's Greatest Stretch", 2, '5', 'je Seite'),
  ex('BWS-Rotation im Vierfüßlerstand', 2, '8', 'je Seite'),
  ex('Wadendehnung an der Wand', 2, '30 s', 'je Seite, Knie gestreckt'),
];

const mobilityB = () => [
  ex('90/90 Hüftrotation', 2, '8', 'je Seite'),
  ex('Sprunggelenk-Mobilisation (Knie zur Wand)', 2, '10', 'je Seite'),
  ex('Schienbein-Dehnung im Fersensitz', 2, '30 s', 'sanft, schmerzfrei'),
  ex('Brustdehnung im Türrahmen', 2, '30 s', 'je Seite'),
  ex('Kindhaltung', 1, '60 s', 'tief in den Bauch atmen'),
];

const DEFAULT_PLANS = {
  gym: {
    mo: planDay('Oberkörper – Push', [
      ex('Bankdrücken', 4, '8', '2 min Pause', 60),
      ex('Schrägbankdrücken (Kurzhantel)', 3, '10', 'je Hand', 22),
      ex('Schulterdrücken sitzend', 3, '10', 'Kurzhantel, je Hand', 16),
      ex('Seitheben', 3, '15', 'je Hand', 8),
      ex('Trizepsdrücken am Kabel', 3, '12', '', 25),
    ]),
    di: planDay(),
    mi: planDay('Oberkörper – Pull', [
      ex('Klimmzüge', 4, '6–8', 'Körpergewicht'),
      ex('Langhantelrudern', 4, '8', '', 55),
      ex('Latzug eng', 3, '10', '', 50),
      ex('Face Pulls', 3, '15', 'leicht, saubere Technik', 15),
      ex('Bizepscurls (Kurzhantel)', 3, '12', 'je Hand', 12),
    ]),
    do: planDay(),
    fr: planDay('Beine & Core', [
      ex('Kniebeugen', 4, '6', '3 min Pause', 80),
      ex('Rumänisches Kreuzheben', 3, '8', '', 70),
      ex('Beinpresse', 3, '10', '', 140),
      ex('Beinbeuger liegend', 3, '12', '', 35),
      ex('Plank', 3, '45 s', ''),
    ]),
    sa: planDay(),
    so: planDay(),
  },

  mobility: {
    mo: planDay('Routine A – Hüfte & Rücken', mobilityA()),
    di: planDay('Routine B – Sprunggelenk & Brust', mobilityB()),
    mi: planDay('Routine A – Hüfte & Rücken', mobilityA()),
    do: planDay('Routine B – Sprunggelenk & Brust', mobilityB()),
    fr: planDay('Routine A – Hüfte & Rücken', mobilityA()),
    sa: planDay('Routine B – Sprunggelenk & Brust', mobilityB()),
    so: planDay('Lockerer Yoga-Flow', [
      ex('Sonnengruß', 1, '5', 'Durchgänge, fließend'),
      ex('Taube', 2, '45 s', 'je Seite'),
      ex('Faszienrolle Waden', 1, '2 min', 'je Seite, nicht direkt auf das Schienbein'),
      ex('Box Breathing', 1, '3 min', '4 s ein · 4 s halten · 4 s aus'),
    ]),
  },

  comeback: {
    mo: planDay(),
    di: planDay('Kraft Unterschenkel + Geh-Lauf', [
      ex('Zügiges Gehen (Aufwärmen)', 1, '5 min', ''),
      ex('Wadenheben beidbeinig', 3, '15', 'langsam ablassen (3 s)'),
      ex('Tibialis Raises an der Wand', 3, '15', 'Fußspitzen hochziehen'),
      ex('Exzentrisches Wadenheben einbeinig', 3, '10', 'je Seite'),
      ex('Geh-Lauf-Intervalle', 6, '1 min / 2 min', 'laufen / gehen · Schmerz max. 3/10'),
    ]),
    mi: planDay(),
    do: planDay('Fußkraft & Stabilität', [
      ex('Short Foot (Kurzfuß)', 3, '10', '5 s halten'),
      ex('Handtuch mit Zehen greifen', 3, '1 min', ''),
      ex('Einbeinstand auf Kissen', 3, '30 s', 'je Seite'),
      ex('Soleus-Wadenheben (Knie gebeugt)', 3, '15', 'je Seite'),
      ex('Radfahren locker', 1, '20 min', 'Ausdauer ohne Stoßbelastung'),
    ]),
    fr: planDay(),
    sa: planDay('Geh-Lauf + Hüftkraft', [
      ex('Geh-Lauf-Intervalle', 8, '2 min / 1 min', 'laufen / gehen · weicher Untergrund'),
      ex('Hüftabduktion mit Band', 3, '15', 'je Seite'),
      ex('Glute Bridge einbeinig', 3, '10', 'je Seite'),
      ex('Wadendehnung', 2, '45 s', 'je Seite'),
    ]),
    so: planDay('Aktive Erholung', [
      ex('Spaziergang', 1, '30 min', 'locker, flacher Untergrund'),
    ]),
  },
};

/* ==========================================================
   Beispiel-Gewichtsverlauf
   Für jede Übung mit Gewicht wird rückwirkend ein Trainingslog
   erzeugt: langsame Steigerung bis zum heutigen Arbeitsgewicht,
   mit gelegentlichen Plateaus und einem Deload.
   Struktur: { [übungs-id]: [{ date: "2026-10-12", weight: 60, reps: "8" }, …] }
   ========================================================== */

/** Gewichtssprung: kleine Hanteln in 1-kg-, größere in 2,5-kg-Schritten */
function weightStep(weight) {
  return weight < 30 ? 1 : 2.5;
}

function generateWeightHistory(plans, days) {
  const history = {};
  const today = DateUtils.startOfDay(new Date());
  const firstDay = DateUtils.addDays(today, -(days - 1));

  Object.values(plans).forEach((week) => {
    WEEKDAYS.forEach((wd, dayIndex) => {
      week[wd.key].exercises.forEach((exercise, exIndex) => {
        if (!exercise.weight) return;
        const rand = seededRandom(dayIndex * 100 + exIndex * 7 + exercise.name.length);
        const step = weightStep(exercise.weight);

        // Alle vergangenen Termine dieses Wochentags (Mo = 0 … So = 6)
        const dates = [];
        for (let d = DateUtils.addDays(today, -((today.getDay() + 6 - dayIndex + 7) % 7)); d >= firstDay; d = DateUtils.addDays(d, -7)) {
          if (rand() > 0.1 || d.getTime() === today.getTime()) dates.unshift(new Date(d));
        }

        const start = exercise.weight * 0.8;
        history[exercise.id] = dates.map((date, i) => {
          const progress = dates.length > 1 ? i / (dates.length - 1) : 1;
          let weight = Math.round((start + (exercise.weight - start) * progress) / step) * step;
          if (i === Math.round(dates.length * 0.6)) weight -= step * 2; // Deload-Woche
          if (i === dates.length - 1) weight = exercise.weight; // letzte Einheit = aktuelles Gewicht
          return { date: DateUtils.toKey(date), weight: Math.round(weight * 10) / 10, reps: String(exercise.reps) };
        });
      });
    });
  });
  return history;
}
