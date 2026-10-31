/* ==========================================================
   charts.js – Alle Diagramme (basierend auf Chart.js)
   Jede Funktion bekommt fertig aufbereitete Daten und zeichnet
   das passende Diagramm. Farben kommen aus den CSS-Variablen,
   dadurch passt alles automatisch zum Hell-/Dunkelmodus.
   ========================================================== */

const Charts = {
  instances: {},

  /** Ist Chart.js geladen? (braucht Internet beim ersten Öffnen) */
  available() {
    return typeof Chart !== 'undefined';
  },

  /** Globale Standardwerte an das aktuelle Farbschema anpassen */
  applyTheme() {
    if (!this.available()) return;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('--text-muted');
    Chart.defaults.borderColor = cssVar('--grid');
  },

  /** Zeichnet ein Diagramm neu (altes wird vorher entfernt) */
  draw(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (!this.available()) {
      canvas.parentElement.innerHTML =
        '<p class="chart-fallback">Diagramme konnten nicht geladen werden.<br>Bitte Internetverbindung prüfen (Chart.js).</p>';
      return;
    }

    if (this.instances[canvasId]) this.instances[canvasId].destroy();
    this.instances[canvasId] = new Chart(canvas, config);
  },

  /** Einheitlicher Tooltip-Stil */
  tooltip(extra = {}) {
    return {
      backgroundColor: cssVar('--tooltip-bg'),
      titleColor: cssVar('--tooltip-text'),
      bodyColor: cssVar('--tooltip-text'),
      padding: 10,
      cornerRadius: 10,
      boxPadding: 4,
      usePointStyle: true,
      titleFont: { weight: '600' },
      ...extra,
    };
  },

  /** Einheitliche Achsen */
  axes({ yTicks, yMax, xTicks = {} } = {}) {
    return {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { maxRotation: 0, autoSkipPadding: 10, ...xTicks },
      },
      y: {
        beginAtZero: true,
        max: yMax,
        grid: { color: cssVar('--grid') },
        border: { display: false },
        ticks: { padding: 8, maxTicksLimit: 6, callback: yTicks || ((v) => Format.compact(v)) },
      },
    };
  },

  /* ---------- 1. Tägliche Aktivität ---------- */
  activity({ labels, titles, steps, calories, mode }) {
    const stepColor = cssVar('--c-steps');
    const kcalColor = cssVar('--c-kcal');
    const isDay = mode === 'day';

    const datasets = [
      {
        type: 'bar',
        label: 'Schritte',
        data: steps,
        // Tage mit erreichtem Ziel werden kräftiger dargestellt
        backgroundColor: steps.map((v) => (isDay || v >= GOALS.steps ? stepColor : withAlpha(stepColor, 0.38))),
        hoverBackgroundColor: stepColor,
        borderRadius: 6,
        maxBarThickness: isDay ? 18 : 30,
        yAxisID: 'y',
        order: 2,
      },
    ];

    if (!isDay) {
      datasets.push({
        type: 'line',
        label: 'Kalorien',
        data: calories,
        borderColor: kcalColor,
        backgroundColor: kcalColor,
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: mode === 'month' ? 0 : 3.5,
        pointHoverRadius: 5,
        yAxisID: 'y1',
        order: 1,
      });
    }

    const scales = this.axes();
    scales.y1 = {
      display: !isDay,
      position: 'right',
      beginAtZero: true,
      grid: { drawOnChartArea: false },
      border: { display: false },
      ticks: { padding: 8, maxTicksLimit: 6, callback: (v) => Format.compact(v) },
    };

    this.draw('activityChart', {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: {
              title: (items) => titles[items[0].dataIndex],
              label: (ctx) =>
                ctx.dataset.yAxisID === 'y1'
                  ? ` Kalorien: ${Format.number(ctx.parsed.y)} kcal`
                  : ` Schritte: ${Format.number(ctx.parsed.y)}`,
            },
          }),
        },
        scales,
      },
    });
  },

  /* ---------- 2. Wöchentlicher Fortschritt ---------- */
  weekly({ labels, values, goal, metricKey, highlightIndex }) {
    const metric = METRICS[metricKey];
    const color = cssVar(metric.color);

    this.draw('weeklyChart', {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: metric.short || metric.label,
            data: values,
            backgroundColor: values.map((_, i) => (i === highlightIndex ? color : withAlpha(color, 0.35))),
            hoverBackgroundColor: color,
            borderRadius: 8,
            maxBarThickness: 38,
            order: 2,
          },
          {
            type: 'line',
            label: 'Ziel',
            data: values.map(() => goal),
            borderColor: cssVar('--text-muted'),
            borderWidth: 1.5,
            borderDash: [6, 5],
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${metric.format(ctx.parsed.y)}${ctx.datasetIndex === 0 ? ' / Tag' : ''}`,
            },
          }),
        },
        scales: this.axes({
          yTicks: metricKey === 'sleep' ? (v) => `${v} h` : metricKey === 'workoutMin' ? (v) => `${v} min` : undefined,
          yMax: metricKey === 'sleep' ? 10 : undefined,
        }),
      },
    });
  },

  /* ---------- 3. Workout-Trends ---------- */
  trend({ labels, series }) {
    const datasets = ACTIVITY_KEYS.map((key) => {
      const color = categoryColor(key);
      return {
        label: CATEGORIES[key].label,
        data: series[key],
        borderColor: color,
        backgroundColor: withAlpha(color, 0.08),
        fill: key === 'comeback', // Comeback-Fläche hebt den Aufbau hervor
        borderWidth: 2.5,
        cubicInterpolationMode: 'monotone',
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
      };
    });

    this.draw('trendChart', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Format.minutes(ctx.parsed.y)}` },
          }),
        },
        scales: this.axes({ yTicks: (v) => `${v} min` }),
      },
    });
  },

  /* ---------- 4. Trainingsverteilung (Donut) ---------- */
  share(totals) {
    const keys = ACTIVITY_KEYS;
    const values = keys.map((k) => totals[k]);
    const hasData = values.some((v) => v > 0);

    this.draw('shareChart', {
      type: 'doughnut',
      data: {
        labels: keys.map((k) => CATEGORIES[k].label),
        datasets: [
          {
            data: hasData ? values : [1],
            backgroundColor: hasData ? keys.map((k) => categoryColor(k)) : [cssVar('--surface-2')],
            borderColor: cssVar('--surface'),
            borderWidth: 3,
            hoverOffset: hasData ? 6 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            enabled: hasData,
            callbacks: { label: (ctx) => ` ${ctx.label}: ${Format.minutes(ctx.parsed)}` },
          }),
        },
      },
    });
  },

  /* ---------- 5. Gewichtsverlauf einer Übung ---------- */
  weight({ labels, titles, values, reps, sessions = [], interval = 'session', color = cssVar('--accent') }) {
    const best = values.length ? Math.max(...values) : 0;
    const last = values.length - 1;

    const scales = this.axes({ yTicks: (v) => `${v} kg`, xTicks: { maxTicksLimit: 8 } });
    scales.y.beginAtZero = false;
    scales.y.grace = '12%'; // etwas Luft über und unter der Linie

    this.draw('weightChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Gewicht',
            data: values,
            borderColor: color,
            backgroundColor: withAlpha(color, 0.12),
            fill: 'start',
            borderWidth: 2.5,
            cubicInterpolationMode: 'monotone',
            // Endpunkt und Bestwert hervorheben
            pointRadius: values.map((v, i) => (i === last ? 6 : v === best ? 4.5 : 3)),
            pointBackgroundColor: values.map((v, i) => (i === last ? color : cssVar('--surface'))),
            pointBorderColor: color,
            pointBorderWidth: 2,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: {
              title: (items) => titles[items[0].dataIndex],
              label: (ctx) => {
                const i = ctx.dataIndex;
                const r = reps[i] ? ` × ${reps[i]}` : '';
                const prev = i > 0 ? values[i] - values[i - 1] : 0;
                const diff = prev ? ` (${prev > 0 ? '+' : ''}${formatKg(Math.round(prev * 10) / 10)})` : '';
                return ` ${formatKg(ctx.parsed.y)}${r}${diff}`;
              },
              afterLabel: (ctx) =>
                interval !== 'session' && sessions[ctx.dataIndex] ? ` ${sessions[ctx.dataIndex]} Einheit(en)` : '',
            },
          }),
        },
        scales,
      },
    });
  },

  /* ---------- 6. Ernährung: gegessen vs. Ziel ---------- */
  nutritionBalance({ labels, titles, eaten, target, mode }) {
    const kcal = cssVar('--c-kcal');
    const line = cssVar('--text');
    // Balken über dem Ziel kräftig, darunter heller
    const colors = eaten.map((v, i) => (v !== null && target[i] && v > target[i] * 1.05 ? kcal : withAlpha(kcal, 0.45)));

    this.draw('nutritionChart', {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Gegessen',
            data: eaten,
            backgroundColor: colors,
            hoverBackgroundColor: kcal,
            borderRadius: 6,
            maxBarThickness: 30,
            order: 2,
          },
          {
            type: 'line',
            label: 'Ziel',
            data: target,
            borderColor: line,
            backgroundColor: line,
            borderWidth: 2,
            borderDash: [5, 4],
            stepped: 'middle',
            pointRadius: 0,
            pointHoverRadius: 4,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: {
              title: (items) => titles[items[0].dataIndex],
              label: (ctx) => (ctx.parsed.y === null ? null : ` ${ctx.dataset.label}: ${Format.number(ctx.parsed.y)} kcal`),
              afterBody: (items) => {
                const i = items[0].dataIndex;
                if (eaten[i] === null || !target[i]) return '';
                const diff = eaten[i] - target[i];
                return ` Differenz: ${diff >= 0 ? '+' : '−'}${Format.number(Math.abs(diff))} kcal`;
              },
            },
          }),
        },
        scales: this.axes({ xTicks: { maxTicksLimit: mode === 'month' ? 16 : 7 } }),
      },
    });
  },

  /* ---------- 7. Ernährung: Makroverteilung ---------- */
  macros({ values, colors, labels, grams }) {
    const hasData = values.some((v) => v > 0);
    this.draw('macroChart', {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: hasData ? values : [1],
            backgroundColor: hasData ? colors : [cssVar('--surface-2')],
            borderColor: cssVar('--surface'),
            borderWidth: 3,
            hoverOffset: hasData ? 6 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            enabled: hasData,
            callbacks: { label: (ctx) => ` ${ctx.label}: ${grams[ctx.dataIndex]} g · ${Format.number(ctx.parsed)} kcal` },
          }),
        },
      },
    });
  },

  /* ---------- 8. Körpergewicht ---------- */
  bodyWeight({ labels, titles, values, average }) {
    const color = cssVar('--c-body');
    const scales = this.axes({ yTicks: (v) => `${v} kg`, xTicks: { maxTicksLimit: 6 } });
    scales.y.beginAtZero = false;
    scales.y.grace = '10%';

    this.draw('bodyChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Gewogen',
            data: values,
            showLine: false,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            pointBackgroundColor: withAlpha(color, 0.45),
            pointBorderWidth: 0,
          },
          {
            label: 'Ø 7 Tage',
            data: average,
            borderColor: color,
            backgroundColor: withAlpha(color, 0.1),
            fill: 'start',
            borderWidth: 2.5,
            cubicInterpolationMode: 'monotone',
            pointRadius: average.map((_, i) => (i === average.length - 1 ? 5 : 0)),
            pointBackgroundColor: color,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            callbacks: {
              title: (items) => titles[items[0].dataIndex],
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('de-DE')} kg`,
            },
          }),
        },
        scales,
      },
    });
  },

  /* ---------- 9. Schmerzverlauf (Comeback) ---------- */
  pain({ labels, values }) {
    const colorFor = (v) => (v <= 2 ? cssVar('--success') : v <= 4 ? cssVar('--warning') : cssVar('--danger'));
    const line = cssVar('--c-comeback');
    const scales = this.axes({ yTicks: (v) => v, xTicks: { maxTicksLimit: 5 } });
    scales.y.suggestedMax = 6; // Skala wächst automatisch, falls Werte höher sind
    scales.y.ticks.stepSize = 2;

    this.draw('painChart', {
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Schmerz',
            data: values,
            borderColor: line,
            backgroundColor: withAlpha(line, 0.1),
            fill: true,
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: values.map(colorFor),
            pointBorderColor: cssVar('--surface'),
            pointBorderWidth: 1.5,
            order: 1,
          },
          {
            type: 'line',
            label: 'Grenze',
            data: values.map(() => 3),
            borderColor: cssVar('--text-muted'),
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: this.tooltip({
            filter: (item) => item.datasetIndex === 0,
            callbacks: { label: (ctx) => ` Schmerz: ${ctx.parsed.y}/10` },
          }),
        },
        scales,
      },
    });
  },
};
