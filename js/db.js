const DB_NAME = 'affivi-db';
const DB_VERSION = 1;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profiles')) {
        const s = db.createObjectStore('profiles', { keyPath: 'id' });
        s.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function store(name, mode = 'readonly') {
  return openDB().then(db => db.transaction(name, mode).objectStore(name));
}

function promisify(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const DB = {
  async getAllProfiles() {
    const s = await store('profiles');
    const all = await promisify(s.getAll());
    return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  async getProfile(id) {
    const s = await store('profiles');
    return promisify(s.get(id));
  },
  async saveProfile(p) {
    const s = await store('profiles', 'readwrite');
    return promisify(s.put(p));
  },
  async deleteProfile(id) {
    const s = await store('profiles', 'readwrite');
    return promisify(s.delete(id));
  },
  async reorderProfiles(idsInOrder) {
    const db = await openDB();
    const tx = db.transaction('profiles', 'readwrite');
    const s = tx.objectStore('profiles');
    for (let i = 0; i < idsInOrder.length; i++) {
      const p = await promisify(s.get(idsInOrder[i]));
      if (p) { p.order = i; s.put(p); }
    }
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  },

  async getSetting(key, fallback = null) {
    const s = await store('settings');
    const r = await promisify(s.get(key));
    return r ? r.value : fallback;
  },
  async setSetting(key, value) {
    const s = await store('settings', 'readwrite');
    return promisify(s.put({ key, value }));
  },

  async ensureDefaultProfile() {
    const existing = await this.getProfile('standard');
    if (!existing) {
      await this.saveProfile({
        id: 'standard',
        name: 'Standard',
        coefficient: 1.0,
        isDefault: true,
        calibrated: false,
        samples: [],
        order: 0,
        createdAt: Date.now()
      });
    }
  }
};
