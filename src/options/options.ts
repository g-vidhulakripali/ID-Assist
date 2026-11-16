import { chromeSettingsStore } from '../browser/chrome-adapters';
import { CORNERS, type Corner } from '../shared/settings';

const store = chromeSettingsStore();
const autoDetect = document.getElementById('autoDetect') as HTMLInputElement;
const position = document.getElementById('indicatorPosition') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLElement;
const shortcut = document.getElementById('shortcut') as HTMLElement;

async function render(): Promise<void> {
  const s = await store.load();
  autoDetect.checked = s.autoDetect;
  position.value = s.indicatorPosition;
}

function flash(text: string): void {
  status.textContent = text;
  setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, 1500);
}

autoDetect.addEventListener('change', async () => {
  await store.save({ autoDetect: autoDetect.checked });
  flash('Saved');
});

position.addEventListener('change', async () => {
  const value = position.value;
  if ((CORNERS as readonly string[]).includes(value)) {
    await store.save({ indicatorPosition: value as Corner });
    flash('Saved');
  }
});

// Show the shortcut the browser actually assigned (the user may have changed it, or it may have clashed).
chrome.commands
  .getAll()
  .then((commands) => {
    const cmd = commands.find((c) => c.name === 'activate-assist');
    if (cmd) shortcut.textContent = cmd.shortcut || 'not set (assign one under Keyboard shortcuts)';
  })
  .catch(() => {});

void render();
