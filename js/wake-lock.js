export const WakeLock = {
  _lock: null,
  async enable() {
    if (!('wakeLock' in navigator)) return false;
    try {
      this._lock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', this._reacquire);
      return true;
    } catch { return false; }
  },
  _reacquire: async () => {
    if (document.visibilityState === 'visible') {
      try { WakeLock._lock = await navigator.wakeLock.request('screen'); } catch {}
    }
  },
  async disable() {
    if (this._lock) { try { await this._lock.release(); } catch {} this._lock = null; }
  }
};
