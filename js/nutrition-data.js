/* ==========================================================
   nutrition-data.js – Ernährung: Lebensmittel, Beispieldaten
   und alle Berechnungen (Bedarf, Makros, Timing)

   Richtwerte (Quellen siehe README):
   - Protein: 1,4–2,0 g/kg für Trainierende, im Kaloriendefizit
     bei Krafttraining 2,3–3,1 g/kg (ISSN 2017)
   - Kohlenhydrate je nach Trainingsumfang des Tages (ACSM / DGE)
   - Ballaststoffe: mindestens 30 g pro Tag (DGE)
   - Grundumsatz: Mifflin-St-Jeor-Formel
   ========================================================== */

/* ---------- Ziele ---------- */
const NUTRITION_GOALS = {
  gain: { label: 'Muskelaufbau', kcalFactor: 1.1, protein: 1.8, hint: '+10 % Kalorien' },
  maintain: { label: 'Gewicht halten', kcalFactor: 1.0, protein: 1.6, hint: 'ausgeglichen' },
  lose: { label: 'Abnehmen', kcalFactor: 0.85, protein: 2.3, hint: '−15 % Kalorien' },
};

/** Grundbedarf über den Grundumsatz hinaus (Verdauung, Stehen, Alltag ohne Schritte) */
const BASE_FACTOR = 1.2;

/** Mindestanteil Fett an den Kalorien – darunter wird das Kohlenhydrat-Ziel gedeckelt */
const MIN_FAT_SHARE = 0.2;

/** Kohlenhydrate (g/kg) nach geplanter Trainingszeit des Tages */
const CARB_BANDS = [
  { maxMin: 45, gPerKg: 3.5, label: 'Ruhetag / leichtes Training', range: '3–5 g/kg' },
  { maxMin: 90, gPerKg: 5, label: 'Moderates Training (~1 h)', range: '5–7 g/kg' },
  { maxMin: 180, gPerKg: 7, label: 'Ausdauertraining 1,5–3 h', range: '6–10 g/kg' },
  { maxMin: Infinity, gPerKg: 9, label: 'Sehr langes Training (> 3 h)', range: '8–12 g/kg' },
];

/* ---------- Mahlzeiten ---------- */
const MEALS = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittagessen' },
  { key: 'dinner', label: 'Abendessen' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'pre', label: 'Vor dem Training', training: true },
  { key: 'during', label: 'Während des Trainings', training: true },
  { key: 'post', label: 'Nach dem Training', training: true },
];

/* ==========================================================
   Lebensmittel-Liste (Richtwerte pro 100 g bzw. 100 ml)
   kcal, Protein (p), Kohlenhydrate (c), Fett (f), Ballaststoffe (fib)
   portions: übliche Portionsgrößen in Gramm
   ========================================================== */
function food(id, name, kcal, p, c, f, fib, portions, favorite = false) {
  return { id, name, kcal, p, c, f, fib, portions: portions.map(([label, grams]) => ({ label, grams })), favorite };
}

const DEFAULT_FOODS = [
  food('f-oats', 'Haferflocken', 372, 13.5, 58.7, 7, 10, [['Portion', 60]], true),
  food('f-wholebread', 'Vollkornbrot', 215, 7, 38, 1.5, 7, [['Scheibe', 50]], true),
  food('f-roll', 'Brötchen (Weizen)', 270, 9, 53, 1.5, 3, [['Stück', 60]]),
  food('f-rice', 'Reis, gekocht', 130, 2.7, 28, 0.3, 0.4, [['Portion', 200]]),
  food('f-pasta', 'Nudeln, gekocht', 150, 5.5, 30, 0.9, 1.8, [['Portion', 250]]),
  food('f-potato', 'Kartoffeln, gekocht', 72, 2, 15, 0.1, 2, [['Portion', 250]]),
  food('f-banana', 'Banane', 93, 1.2, 20, 0.2, 2, [['Stück', 120]], true),
  food('f-apple', 'Apfel', 54, 0.3, 12, 0.2, 2.3, [['Stück', 150]]),
  food('f-berries', 'Beeren (TK)', 45, 1, 8, 0.4, 4, [['Handvoll', 80]]),
  food('f-chicken', 'Hähnchenbrust', 110, 23, 0, 1.5, 0, [['Portion', 150]], true),
  food('f-salmon', 'Lachsfilet', 200, 20, 0, 13, 0, [['Filet', 125]]),
  food('f-beef', 'Rinderhack (5 % Fett)', 121, 21, 0, 4, 0, [['Portion', 125]]),
  food('f-egg', 'Ei', 155, 13, 1, 11, 0, [['Stück', 60]], true),
  food('f-quark', 'Magerquark', 67, 12, 4, 0.3, 0, [['Becher', 250], ['Portion', 150]], true),
  food('f-skyr', 'Skyr natur', 63, 11, 4, 0.2, 0, [['Portion', 150]]),
  food('f-yogurt', 'Griechischer Joghurt (10 %)', 133, 5, 4, 10, 0, [['Portion', 150]]),
  food('f-milk', 'Milch (1,5 %)', 47, 3.4, 4.8, 1.5, 0, [['Glas', 250]]),
  food('f-cheese', 'Gouda', 356, 25, 0, 28, 0, [['Scheibe', 30]]),
  food('f-lentils', 'Linsen, gekocht', 116, 9, 20, 0.4, 8, [['Portion', 200]]),
  food('f-chickpeas', 'Kichererbsen (Dose)', 120, 7, 17, 2.5, 6, [['Halbe Dose', 120]]),
  food('f-tofu', 'Tofu natur', 120, 13, 1.5, 7, 1, [['Portion', 150]]),
  food('f-broccoli', 'Brokkoli', 35, 3.8, 2.7, 0.2, 3, [['Portion', 200]]),
  food('f-veggies', 'Gemüsemischung', 40, 2, 6, 0.5, 3, [['Portion', 200]]),
  food('f-oil', 'Olivenöl', 884, 0, 0, 100, 0, [['EL', 10]]),
  food('f-pb', 'Erdnussbutter', 600, 25, 15, 50, 6, [['EL', 15]]),
  food('f-almonds', 'Mandeln', 580, 21, 9, 50, 12, [['Handvoll', 30]]),
  food('f-whey', 'Whey-Protein', 380, 75, 8, 6, 0, [['Shake (Pulver)', 30]], true),
  food('f-sportdrink', 'Sportgetränk', 26, 0, 6.5, 0, 0, [['Flasche', 500]]),
  food('f-gel', 'Energie-Gel', 250, 0, 62, 0, 0, [['Gel', 40]]),
  food('f-bar', 'Müsliriegel', 400, 6, 65, 12, 5, [['Riegel', 25]]),
  food('f-pizza', 'Pizza Margherita', 250, 10, 30, 9, 2, [['Pizza', 330]]),
];

/* ==========================================================
   Berechnungen
   ========================================================== */

/** Nährwerte für eine Menge eines Lebensmittels */
function nutrientsFor(foodItem, grams) {
  const f = grams / 100;
  const r = (v) => Math.round(v * f * 10) / 10;
  return { kcal: Math.round(foodItem.kcal * f), protein: r(foodItem.p), carbs: r(foodItem.c), fat: r(foodItem.f), fiber: r(foodItem.fib) };
}

/** Grundumsatz nach Mifflin-St-Jeor (kcal/Tag) */
function basalMetabolicRate(profile, weightKg) {
  const base = 10 * weightKg + 6.25 * profile.height - 5 * profile.age;
  return Math.round(profile.sex === 'f' ? base - 161 : base + 5);
}

/** Geschätzte Trainingsminuten eines Wochentags aus allen Plänen */
function plannedMinutes(dayKey) {
  return Plans.allExercises()
    .filter((item) => item.day === dayKey)
    .reduce((total, { category, exercise }) => total + sportTypeOf(category).minutes(exercise), 0);
}

/** Längste einzelne Ausdauereinheit des Tages (für die Verpflegung „während“) */
function longestSession(dayKey) {
  return Plans.allExercises()
    .filter((item) => item.day === dayKey && ['cycling', 'running', 'swimming', 'other'].includes(CATEGORIES[item.category].type))
    .reduce((best, item) => {
      const min = sportTypeOf(item.category).minutes(item.exercise);
      return min > best.minutes ? { minutes: min, item } : best;
    }, { minutes: 0, item: null });
}

/**
 * Tagesziele berechnen
 * activeKcal = aktiv verbrannte Kalorien des Tages (Training + Schritte)
 */
function dailyTargets(profile, weightKg, dayKey, activeKcal) {
  const goal = NUTRITION_GOALS[profile.goal];
  const bmr = basalMetabolicRate(profile, weightKg);
  const need = Math.round(bmr * BASE_FACTOR + activeKcal);
  const kcal = Math.round(need * goal.kcalFactor);

  const minutes = plannedMinutes(dayKey);
  const band = CARB_BANDS.find((b) => minutes < b.maxMin);
  const proteinPerKg = profile.proteinPerKg || goal.protein;
  const protein = Math.round(proteinPerKg * weightKg);

  // Kohlenhydrate nach Training – gedeckelt, damit mindestens 20 % Fett bleiben
  const carbWanted = Math.round(band.gPerKg * weightKg);
  const carbMax = Math.max(0, Math.round((kcal * (1 - MIN_FAT_SHARE) - protein * 4) / 4));
  const carbs = Math.min(carbWanted, carbMax);
  const fat = Math.max(0, Math.round((kcal - protein * 4 - carbs * 4) / 9));

  return {
    bmr, need, kcal, activeKcal: Math.round(activeKcal), goal,
    protein, proteinPerKg, carbs, carbWanted, carbCapped: carbs < carbWanted, fat,
    fiber: 30,
    water: Math.round((weightKg * 35 + (minutes / 60) * 500) / 50) * 50, // ml, Richtwert
    minutes, band,
  };
}

/** Empfehlungen rund ums Training (vorher / während / danach) */
function fuelingAdvice(weightKg, dayKey) {
  const minutes = plannedMinutes(dayKey);
  const longest = longestSession(dayKey);
  const advice = [];
  if (!minutes) return advice;

  advice.push({
    key: 'pre',
    title: 'Vorher (1–4 h)',
    text: `${Math.round(weightKg * 1)}–${Math.round(weightKg * 2)} g Kohlenhydrate, gut verträglich und fettarm. Kurz vorher eher eine kleine Portion, z. B. eine Banane.`,
  });

  if (longest.minutes >= 150) {
    const hours = longest.minutes / 60;
    advice.push({
      key: 'during',
      title: 'Während',
      text: `Für ${Format.minutes(longest.minutes)} „${longest.item.exercise.name}“: 60–90 g Kohlenhydrate pro Stunde (Glukose-Fruktose-Mischung), insgesamt etwa ${Math.round(hours * 60)}–${Math.round(hours * 90)} g. Ab etwa 2 Stunden auch an Natrium denken.`,
    });
  } else if (longest.minutes >= 75) {
    advice.push({
      key: 'during',
      title: 'Während',
      text: `Für ${Format.minutes(longest.minutes)} „${longest.item.exercise.name}“: 30–60 g Kohlenhydrate pro Stunde, z. B. Sportgetränk oder Gel.`,
    });
  } else {
    advice.push({ key: 'during', title: 'Während', text: 'Bei Einheiten unter ca. 75 Minuten reicht meist Wasser.' });
  }

  advice.push({
    key: 'post',
    title: 'Danach',
    text: `${Math.max(20, Math.min(40, Math.round(weightKg * 0.25 / 5) * 5))}–40 g Protein zusammen mit Kohlenhydraten. Insgesamt Protein über den Tag in 20–40-g-Portionen alle 3–4 Stunden verteilen.`,
  });
  return advice;
}

/* ==========================================================
   Beispieldaten: Tagebuch und Körpergewicht
   ========================================================== */
const NUTRITION_SAMPLE_DAYS = 60;

/** Typische Tagesabläufe – Mengen in Gramm */
const SAMPLE_MENUS = {
  breakfast: [
    [['f-oats', 80], ['f-milk', 250], ['f-banana', 120], ['f-pb', 15]],
    [['f-wholebread', 100], ['f-egg', 120], ['f-cheese', 30], ['f-apple', 150]],
    [['f-skyr', 250], ['f-oats', 50], ['f-berries', 100], ['f-almonds', 20]],
  ],
  lunch: [
    [['f-rice', 250], ['f-chicken', 150], ['f-veggies', 200], ['f-oil', 10]],
    [['f-pasta', 300], ['f-beef', 125], ['f-veggies', 150]],
    [['f-potato', 300], ['f-salmon', 125], ['f-broccoli', 200]],
    [['f-lentils', 250], ['f-rice', 150], ['f-veggies', 150], ['f-oil', 10]],
  ],
  dinner: [
    [['f-wholebread', 150], ['f-quark', 150], ['f-cheese', 30], ['f-veggies', 100]],
    [['f-tofu', 200], ['f-rice', 200], ['f-broccoli', 200], ['f-oil', 10]],
    [['f-pizza', 330]],
    [['f-chickpeas', 200], ['f-potato', 200], ['f-veggies', 200], ['f-yogurt', 100]],
  ],
  snacks: [
    [['f-quark', 250], ['f-berries', 80]],
    [['f-bar', 50], ['f-apple', 150]],
    [['f-almonds', 30], ['f-banana', 120]],
  ],
};

/** Ein Tagebuch-Eintrag aus einem Lebensmittel */
function diaryEntry(foodItem, grams, meal, portionLabel = '') {
  return { id: newId(), meal, foodId: foodItem.id, name: foodItem.name, grams, portion: portionLabel, ...nutrientsFor(foodItem, grams) };
}

/**
 * Erzeugt Tagebuch + Wasser für die letzten Tage.
 * Heute wird nur bis zur aktuellen Uhrzeit gefüllt.
 */
function generateNutritionSample(foods) {
  const rand = seededRandom(7);
  const byId = new Map(foods.map((f) => [f.id, f]));
  const today = DateUtils.startOfDay(new Date());
  const hour = new Date().getHours();
  const diary = {};
  const water = {};

  for (let i = NUTRITION_SAMPLE_DAYS - 1; i >= 0; i--) {
    const date = DateUtils.addDays(today, -i);
    const key = DateUtils.toKey(date);
    const dayKey = DateUtils.weekdayKey(date);
    const isToday = i === 0;
    const entries = [];
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const add = (meal, items) =>
      items.forEach(([id, grams]) => entries.push(diaryEntry(byId.get(id), Math.round(grams * (0.95 + rand() * 0.45)), meal)));

    if (!isToday || hour >= 8) add('breakfast', pick(SAMPLE_MENUS.breakfast));
    if (!isToday || hour >= 13) add('lunch', pick(SAMPLE_MENUS.lunch));
    if (!isToday || hour >= 16) if (rand() > 0.3) add('snacks', pick(SAMPLE_MENUS.snacks));
    if (!isToday || hour >= 19) add('dinner', pick(SAMPLE_MENUS.dinner));

    // Trainingstage: Shake danach, bei langen Ausfahrten Verpflegung währenddessen
    if (['mo', 'mi', 'fr'].includes(dayKey) && (!isToday || hour >= 18)) add('post', [['f-whey', 30], ['f-milk', 300]]);
    if (longestSession(dayKey).minutes >= 75 && (!isToday || hour >= 14)) add('during', [['f-gel', 80], ['f-sportdrink', 1000]]);

    diary[key] = entries;
    water[key] = isToday ? Math.min(hour, 20) * 120 : Math.round((1800 + rand() * 1400) / 250) * 250;
  }
  return { diary, water };
}

/** Körpergewicht: leichter Abwärtstrend mit Tagesschwankungen */
function generateBodyWeightSample() {
  const rand = seededRandom(19);
  const today = DateUtils.startOfDay(new Date());
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    if (i !== 0 && rand() < 0.3) continue; // nicht jeden Tag gewogen
    const date = DateUtils.addDays(today, -i);
    const trend = 79.4 - (90 - i) * 0.018;
    entries.push({ date: DateUtils.toKey(date), kg: Math.round((trend + (rand() - 0.5) * 1.2) * 10) / 10 });
  }
  return entries;
}

const DEFAULT_PROFILE = {
  sex: 'm',
  age: 30,
  height: 180,
  goal: 'maintain',
  proteinPerKg: null, // null = Standardwert des Ziels
  isSample: true,
};
