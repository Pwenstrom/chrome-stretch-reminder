// ===== Resningspåminnelse — background service worker =====

const ALARM_NAME = 'stretch_alarm';
const SNOOZE_ALARM_NAME = 'stretch_alarm_snooze';
const DEFAULT_INTERVAL_MIN = 30;
const IDLE_THRESHOLD_SEC = 120; // 2 min utan aktivitet räknas som "borta"

const REMINDER_MESSAGES = [
  'Tid att resa sig och sträcka på sig.',
  'Skaka liv i kroppen en stund.',
  'Stå upp, sträck armarna mot taket.',
  'En kort promenad gör nytta nu.',
  'Resa sig, rulla axlarna, sätt dig igen.'
];

function pickMessage() {
  return REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
}

// ----- Hjälpfunktioner för lagring -----

async function getSettings() {
  const data = await chrome.storage.local.get([
    'intervalMinutes',
    'isPaused',
    'reminderCountToday',
    'lastCountDate',
    'character'
  ]);
  return {
    intervalMinutes: data.intervalMinutes ?? DEFAULT_INTERVAL_MIN,
    isPaused: data.isPaused ?? false,
    reminderCountToday: data.reminderCountToday ?? 0,
    lastCountDate: data.lastCountDate ?? null,
    character: data.character ?? 'kille'
  };
}

async function ensureTodayCount() {
  const settings = await getSettings();
  const today = new Date().toDateString();
  if (settings.lastCountDate !== today) {
    await chrome.storage.local.set({ reminderCountToday: 0, lastCountDate: today });
  }
}

async function incrementCount() {
  await ensureTodayCount();
  const settings = await getSettings();
  await chrome.storage.local.set({ reminderCountToday: settings.reminderCountToday + 1 });
}

// ----- Larmhantering -----

async function createMainAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalMinutes,
    delayInMinutes: intervalMinutes
  });
}

async function ensureAlarmExists() {
  const settings = await getSettings();
  if (settings.isPaused) return;
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    await createMainAlarm(settings.intervalMinutes);
  }
}

// Körs varje gång service workern startar om (browser-omstart, uppdatering m.m.)
chrome.runtime.onStartup.addListener(ensureAlarmExists);
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ intervalMinutes: settings.intervalMinutes });
  await createMainAlarm(settings.intervalMinutes);
});

// ----- Visa notis -----

function showReminderNotification() {
  chrome.notifications.clear('stretch_notification');
  chrome.notifications.create('stretch_notification', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Resningspåminnelse',
    message: pickMessage(),
    priority: 1,
    buttons: [{ title: 'Snooza 5 min' }, { title: 'Klart, tack' }]
  });
}

// ----- Larm-events -----

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME && alarm.name !== SNOOZE_ALARM_NAME) return;

  // Kolla idle-status innan vi stör — om datorn är inaktiv, skippa och vänta på nästa larm
  chrome.idle.queryState(IDLE_THRESHOLD_SEC, async (state) => {
    if (state === 'idle' || state === 'locked') {
      // Hoppa över den här gången, men rör inte huvudschemat
      return;
    }
    showReminderNotification();
    await incrementCount();
  });
});

// ----- Notisknappar (snooze / klart) -----

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (notifId !== 'stretch_notification') return;
  chrome.notifications.clear(notifId);

  if (btnIdx === 0) {
    // Snooza 5 min — ersätter inte huvudschemat, bara en extra engångspåminnelse
    await chrome.alarms.create(SNOOZE_ALARM_NAME, { delayInMinutes: 5 });
  }
  // btnIdx === 1 ("Klart, tack") behöver ingen åtgärd, huvudschemat rullar på som vanligt
});

// ----- Meddelanden från popup -----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'SET_INTERVAL') {
      await chrome.storage.local.set({ intervalMinutes: message.minutes });
      const settings = await getSettings();
      if (!settings.isPaused) {
        await createMainAlarm(message.minutes);
      }
      sendResponse({ ok: true });
    }

    if (message.type === 'TOGGLE_PAUSE') {
      const settings = await getSettings();
      const newPaused = !settings.isPaused;
      await chrome.storage.local.set({ isPaused: newPaused });
      if (newPaused) {
        await chrome.alarms.clear(ALARM_NAME);
        await chrome.alarms.clear(SNOOZE_ALARM_NAME);
      } else {
        await createMainAlarm(settings.intervalMinutes);
      }
      sendResponse({ ok: true, isPaused: newPaused });
    }

    if (message.type === 'SET_CHARACTER') {
      await chrome.storage.local.set({ character: message.character });
      sendResponse({ ok: true });
    }

    if (message.type === 'TEST_NOTIFICATION') {
      showReminderNotification();
      sendResponse({ ok: true });
    }

    if (message.type === 'GET_STATE') {
      await ensureTodayCount();
      const settings = await getSettings();
      const alarm = await chrome.alarms.get(ALARM_NAME);
      sendResponse({
        ...settings,
        nextFireTime: alarm ? alarm.scheduledTime : null
      });
    }
  })();
  return true; // håller meddelandekanalen öppen för async svar
});
