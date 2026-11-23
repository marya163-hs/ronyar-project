// Capture early: the browser may offer installation before PublicEntry mounts.
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}
let pending: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const standalone = window.matchMedia('(display-mode: standalone)');
let installed = standalone.matches;
const notify = () => listeners.forEach(listener => listener());
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pending = event as InstallPrompt;
  notify();
});
window.addEventListener('appinstalled', () => {
  pending = null;
  installed = true;
  notify();
});
standalone.addEventListener('change', () => { installed = standalone.matches; notify(); });
export const installAvailable = () => pending !== null;
export const installedWindow = () => installed;
export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function requestInstall(): Promise<'accepted' | 'dismissed' | 'unavailable' | 'failed'> {
  const event = pending;
  if (!event) return 'unavailable';
  pending = null;
  notify();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return 'failed';
  }
}
