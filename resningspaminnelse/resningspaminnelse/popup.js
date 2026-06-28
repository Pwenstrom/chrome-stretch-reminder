// ===== Resningspåminnelse — popup logik =====

const figureZone = document.getElementById('figureZone');
const intervalPicker = document.getElementById('intervalPicker');
const customMinInput = document.getElementById('customMin');
const customApplyBtn = document.getElementById('customApply');
const pauseBtn = document.getElementById('pauseBtn');
const statusDot = document.getElementById('statusDot');
const countdownNumber = document.getElementById('countdownNumber');
const countdownSub = document.getElementById('countdownSub');
const statCount = document.getElementById('statCount');
const statInterval = document.getElementById('statInterval');

let countdownTimer = null;

// ----- Karaktärsval (cyklar vid klick) -----

figureZone.addEventListener('click', () => {
  const svgs = Array.from(figureZone.querySelectorAll('svg'));
  const activeIndex = svgs.findIndex(s => s.classList.contains('active'));
  svgs[activeIndex].classList.remove('active');
  const nextIndex = (activeIndex + 1) % svgs.length;
  svgs[nextIndex].classList.add('active');
  chrome.runtime.sendMessage({
    type: 'SET_CHARACTER',
    character: svgs[nextIndex].dataset.figure
  });
});

function applyCharacter(character) {
  const svgs = Array.from(figureZone.querySelectorAll('svg'));
  svgs.forEach(s => s.classList.remove('active'));
  const match = svgs.find(s => s.dataset.figure === character) || svgs[0];
  match.classList.add('active');
}

// ----- Intervallval -----

function setActiveIntervalButton(minutes) {
  const buttons = intervalPicker.querySelectorAll('button');
  let matched = false;
  buttons.forEach(btn => {
    if (Number(btn.dataset.min) === minutes) {
      btn.classList.add('active');
      matched = true;
    } else {
      btn.classList.remove('active');
    }
  });
  return matched;
}

intervalPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const minutes = Number(btn.dataset.min);
  setActiveIntervalButton(minutes);
  customMinInput.value = '';
  chrome.runtime.sendMessage({ type: 'SET_INTERVAL', minutes }, () => {
    statInterval.textContent = `${minutes} min`;
    refreshState();
  });
});

customApplyBtn.addEventListener('click', () => {
  const minutes = Number(customMinInput.value);
  if (!minutes || minutes < 1) return;
  setActiveIntervalButton(minutes); // avmarkerar alla fasta knappar om värdet inte matchar
  chrome.runtime.sendMessage({ type: 'SET_INTERVAL', minutes }, () => {
    statInterval.textContent = `${minutes} min`;
    refreshState();
  });
});

// ----- Pausa / starta -----

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, (response) => {
    updatePauseUI(response.isPaused);
    refreshState();
  });
});

function updatePauseUI(isPaused) {
  pauseBtn.textContent = isPaused ? 'Starta' : 'Pausa';
  pauseBtn.classList.toggle('paused', isPaused);
  statusDot.classList.toggle('paused', isPaused);
  if (isPaused) {
    countdownNumber.textContent = '–';
    countdownSub.textContent = 'Pausad';
    if (countdownTimer) clearInterval(countdownTimer);
  }
}

// ----- Nedräkning -----

function startCountdown(nextFireTime) {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!nextFireTime) {
    countdownNumber.textContent = '--:--';
    countdownSub.textContent = '';
    return;
  }

  function tick() {
    const remainingMs = nextFireTime - Date.now();
    if (remainingMs <= 0) {
      countdownNumber.textContent = '00:00';
      countdownSub.textContent = 'Snart...';
      return;
    }
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    countdownNumber.textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const fireDate = new Date(nextFireTime);
    const timeStr = fireDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    countdownSub.textContent = `Sträck på dig vid ${timeStr}`;
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ----- Hämta state från background och rendera -----

function refreshState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (!state) return;

    applyCharacter(state.character);
    updatePauseUI(state.isPaused);
    statCount.textContent = state.reminderCountToday;
    statInterval.textContent = `${state.intervalMinutes} min`;

    if (!setActiveIntervalButton(state.intervalMinutes)) {
      customMinInput.value = state.intervalMinutes;
    }

    if (!state.isPaused) {
      startCountdown(state.nextFireTime);
    }
  });
}

refreshState();
