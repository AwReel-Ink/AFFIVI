// Gestion GPS avec lissage et état signal
export class GPS {
  constructor() {
    this.watchId = null;
    this.lastPositions = [];
    this.listeners = new Set();
    this.status = 'lost'; // 'ok' | 'weak' | 'lost'
    this.lastUpdate = 0;
    this._statusTimer = null;
  }

  start() {
    if (!navigator.geolocation) { this._setStatus('lost'); return; }
    if (this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      pos => this._onPos(pos),
      err => this._onErr(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    this._statusTimer = setInterval(() => this._checkFreshness(), 1500);
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    if (this._statusTimer) clearInterval(this._statusTimer);
  }

  onUpdate(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _onPos(pos) {
    this.lastUpdate = Date.now();
    let speedMs = pos.coords.speed;
    if (speedMs == null || isNaN(speedMs) || speedMs < 0) speedMs = 0;
    if (speedMs < 1) speedMs = 0; // bruit à l'arrêt
    const kmh = speedMs * 3.6;
    this.lastPositions.push(kmh);
    if (this.lastPositions.length > 3) this.lastPositions.shift();
    const avg = this.lastPositions.reduce((a, b) => a + b, 0) / this.lastPositions.length;
    const acc = pos.coords.accuracy || 50;
    this._setStatus(acc < 25 ? 'ok' : 'weak');
    this.listeners.forEach(fn => fn({ speedKmh: avg, accuracy: acc, raw: pos }));
  }

  _onErr() { this._setStatus('lost'); }

  _checkFreshness() {
    if (Date.now() - this.lastUpdate > 5000) this._setStatus('lost');
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.listeners.forEach(fn => fn({ statusChange: s }));
  }
}
