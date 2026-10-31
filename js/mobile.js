/* ==========================================================
   mobile.js – Smartphone & Offline
   - Untere Navigationsleiste: auf dem Handy eine Ansicht pro Bildschirm
   - Schnellaktionen auf „Heute“
   - Einstellungen: Farbschema, App installieren, Sicherung (Export/Import)
   - Service Worker für den Offline-Modus
   ========================================================== */

const Mobile = {
  VIEW_KEY: 'fitboard.view',
  BACKUP_KEY: 'fitboard.lastBackup',
  query: window.matchMedia('(max-width: 760px)'),
  view: 'overview',
  installPrompt: null, // Android/Chrome: gespeichertes Installations-Angebot

  init() {
    this.view = Storage.get(this.VIEW_KEY, 'overview');
    if (!document.getElementById(this.view)) this.view = 'overview';

    // Ansichten nur auf schmalen Bildschirmen
    this.applyLayout();
    this.query.addEventListener('change', () => this.applyLayout());

    document.getElementById('bottomNav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) this.showView(btn.dataset.view);
    });

    this.bindQuickActions();
    this.bindSettings();
    this.registerServiceWorker();

    window.addEventListener('online', () => showToast('Wieder online'));
    window.addEventListener('offline', () => showToast('Offline – Daten werden auf dem Gerät gespeichert'));
  },

  isPhone() {
    return this.query.matches;
  },

  /** App läuft installiert (vom Home-Bildschirm)? */
  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },

  /* ---------- Ansichten ---------- */
  applyLayout() {
    document.body.classList.toggle('app-views', this.isPhone());
    this.showView(this.view, false);
  },

  showView(view, scroll = true) {
    this.view = view;
    Storage.set(this.VIEW_KEY, view);
    document.body.dataset.view = view;

    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('view-active', s.id === view));
    document.querySelectorAll('#bottomNav [data-view]').forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    if (this.isPhone() && scroll) window.scrollTo({ top: 0, behavior: 'instant' });
    // Diagramme in gerade sichtbar gewordenen Bereichen an die Größe anpassen
    requestAnimationFrame(() => Object.values(Charts.instances).forEach((chart) => chart.resize()));
  },

  /* ---------- Schnellaktionen ---------- */
  bindQuickActions() {
    document.getElementById('quickActions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick]');
      if (!btn) return;
      const action = btn.dataset.quick;

      if (action === 'food') {
        Nutrition.day = TODAY;
        Nutrition.renderDay();
        Nutrition.openFoodModal();
      }

      if (action === 'water') {
        const key = DateUtils.toKey(TODAY);
        Nutrition.water[key] = (Nutrition.water[key] || 0) + 250;
        Nutrition.save('diary');
        if (DateUtils.isSameDay(Nutrition.day, TODAY)) Nutrition.renderDay();
        showToast(`+250 ml Wasser · heute ${(Nutrition.water[key] / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} l`);
      }

      if (action === 'weight') {
        this.goTo('nutrition', 'bodyForm');
        document.getElementById('bodyKg').focus({ preventScroll: true });
      }

      if (action === 'training') this.goTo('plans');
    });
  },

  /** Zu einem Bereich wechseln (Handy) bzw. dorthin scrollen (Desktop) */
  goTo(view, elementId = null) {
    if (this.isPhone()) this.showView(view);
    const target = document.getElementById(elementId || view);
    requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: elementId ? 'center' : 'start' }));
  },

  /* ---------- Einstellungen ---------- */
  bindSettings() {
    const modal = document.getElementById('settingsModal');
    const open = () => {
      this.renderSettings();
      modal.showModal();
    };
    document.getElementById('settingsBtn').addEventListener('click', open);
    document.getElementById('settingsBtnSide').addEventListener('click', open);
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => modal.close()));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });

    document.getElementById('settingsTheme').addEventListener('click', () => {
      Theme.toggle();
      this.renderSettings();
    });
    document.getElementById('exportBtn').addEventListener('click', () => this.exportBackup());
    document.getElementById('importInput').addEventListener('change', (e) => this.importBackup(e.target));
    document.getElementById('installBtn').addEventListener('click', () => this.install());

    // Chrome/Android bietet die Installation an → merken und eigenen Knopf zeigen
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      this.renderSettings();
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      showToast('FitBoard wurde installiert');
      this.renderSettings();
    });
  },

  renderSettings() {
    const dark = Theme.current() === 'dark';
    document.getElementById('settingsThemeLabel').textContent = dark ? 'Dunkel' : 'Hell';

    const last = Storage.get(this.BACKUP_KEY, null);
    document.getElementById('backupInfo').textContent = last
      ? `Letzte Sicherung: ${Format.date(new Date(last), { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Noch keine Sicherung erstellt.';

    const status = document.getElementById('installStatus');
    const btn = document.getElementById('installBtn');
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    btn.hidden = !this.installPrompt;
    if (this.isInstalled()) {
      status.textContent = 'FitBoard läuft als installierte App und funktioniert auch offline.';
    } else if (this.installPrompt) {
      status.textContent = 'Installiere FitBoard auf deinem Startbildschirm. Danach funktioniert es auch offline.';
    } else if (isIos) {
      status.innerHTML = 'iPhone/iPad: In <strong>Safari</strong> unten auf <strong>Teilen</strong> tippen, dann <strong>„Zum Home-Bildschirm“</strong>.';
    } else {
      status.innerHTML = 'Im Browser-Menü (⋮) <strong>„App installieren“</strong> bzw. <strong>„Zum Startbildschirm hinzufügen“</strong> wählen.';
    }
  },

  async install() {
    if (!this.installPrompt) return;
    this.installPrompt.prompt();
    await this.installPrompt.userChoice;
    this.installPrompt = null;
    this.renderSettings();
  },

  /* ---------- Sicherung ---------- */

  /** Alle FitBoard-Daten aus dem Gerätespeicher einsammeln */
  collectData() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('fitboard.') && key !== this.BACKUP_KEY) data[key] = localStorage.getItem(key);
      }
    } catch (e) {
      /* Speicher nicht verfügbar */
    }
    return data;
  },

  exportBackup() {
    const data = this.collectData();
    // Ohne eigene Änderungen gibt es nur Beispieldaten – die entstehen ohnehin neu
    if (!Object.keys(data).length) {
      showToast('Noch keine eigenen Daten zum Sichern');
      return;
    }
    const backup = { app: 'FitBoard', version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fitboard-sicherung-${DateUtils.toKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    Storage.set(this.BACKUP_KEY, new Date().toISOString());
    this.renderSettings();
    showToast('Sicherung erstellt');
  },

  async importBackup(input) {
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (e) {
      showToast('Die Datei ist keine gültige Sicherung.');
      return;
    }
    if (!backup || backup.app !== 'FitBoard' || typeof backup.data !== 'object') {
      showToast('Das ist keine FitBoard-Sicherung.');
      return;
    }

    const date = backup.exportedAt ? Format.date(new Date(backup.exportedAt), { day: 'numeric', month: 'long', year: 'numeric' }) : 'unbekannt';
    const ok = await confirmAction(
      `Die Sicherung vom ${date} ersetzt alle aktuellen Daten auf diesem Gerät.`,
      'Wiederherstellen',
      'Sicherung wiederherstellen?'
    );
    if (!ok) return;

    try {
      Object.keys(this.collectData()).forEach((key) => localStorage.removeItem(key));
      Object.entries(backup.data).forEach(([key, value]) => {
        if (key.startsWith('fitboard.')) localStorage.setItem(key, value);
      });
    } catch (e) {
      showToast('Wiederherstellen fehlgeschlagen: Speicher nicht verfügbar.');
      return;
    }
    location.reload();
  },

  /* ---------- Offline-Modus ---------- */
  registerServiceWorker() {
    // Funktioniert nur über https oder localhost – sonst still überspringen
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* z. B. in einer eingebetteten Vorschau nicht erlaubt */
    });
  },
};
