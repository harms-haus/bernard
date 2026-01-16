export interface BrowserStorageAPI {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface BrowserLocationAPI {
  href: string;
  assign(url: string): void;
  replace(url: string): void;
  reload(): void;
}

export interface BrowserDocumentAPI {
  documentElement: {
    classList: {
      add(className: string): void;
      remove(className: string): void;
      toggle(className: string, force?: boolean): boolean;
      contains(className: string): boolean;
    };
  };
}

export interface BrowserClipboardAPI {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

export interface BrowserURLAPI {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface BrowserAPI {
  localStorage: BrowserStorageAPI;
  sessionStorage: BrowserStorageAPI;
  location: BrowserLocationAPI;
  document: BrowserDocumentAPI;
  clipboard: BrowserClipboardAPI;
  URL: BrowserURLAPI;
  userAgent: string;
  onLine: boolean;
}

export const browserAPI: BrowserAPI = {
  localStorage: {
    getItem: (key) => {
      try {
        if (typeof window !== 'undefined') {
          return window.localStorage.getItem(key);
        }
      } catch (error) {
        console.error('localStorage.getItem failed:', error);
      }
      return null;
    },
    setItem: (key, value) => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.error('localStorage.setItem failed:', error);
      }
    },
    removeItem: (key) => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
      } catch (error) {
        console.error('localStorage.removeItem failed:', error);
      }
    },
    clear: () => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.clear();
        }
      } catch (error) {
        console.error('localStorage.clear failed:', error);
      }
    },
  },
  sessionStorage: {
    getItem: (key) => {
      try {
        if (typeof window !== 'undefined') {
          return window.sessionStorage.getItem(key);
        }
      } catch (error) {
        console.error('sessionStorage.getItem failed:', error);
      }
      return null;
    },
    setItem: (key, value) => {
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(key, value);
        }
      } catch (error) {
        console.error('sessionStorage.setItem failed:', error);
      }
    },
    removeItem: (key) => {
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(key);
        }
      } catch (error) {
        console.error('sessionStorage.removeItem failed:', error);
      }
    },
    clear: () => {
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.clear();
        }
      } catch (error) {
        console.error('sessionStorage.clear failed:', error);
      }
    },
  },
  location: {
    get href() { return typeof window !== 'undefined' ? window.location.href : ''; },
    assign(url) { if (typeof window !== 'undefined') window.location.assign(url); },
    replace(url) { if (typeof window !== 'undefined' && window.location.replace) window.location.replace(url); },
    reload() { if (typeof window !== 'undefined') window.location.reload(); },
  },
  document: {
    get documentElement() {
      if (typeof document === 'undefined') return { classList: { add: (_cls: string) => {}, remove: (_cls: string) => {}, toggle: (_cls: string, _force?: boolean) => false, contains: (_cls: string) => false } };
      return {
        classList: {
          add: (cls: string) => document.documentElement.classList.add(cls),
          remove: (cls: string) => document.documentElement.classList.remove(cls),
          toggle: (cls: string, force?: boolean) => document.documentElement.classList.toggle(cls, force),
          contains: (cls: string) => document.documentElement.classList.contains(cls),
        },
      };
    },
  },
  clipboard: {
    async writeText(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    },
    async readText() {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        return navigator.clipboard.readText();
      }
      return '';
    },
  },
  URL: {
    createObjectURL(blob) {
      if (typeof URL !== 'undefined' && typeof window !== 'undefined') {
        return URL.createObjectURL(blob);
      }
      throw new Error('URL.createObjectURL is not available in this environment');
    },
    revokeObjectURL(url) {
      if (typeof URL !== 'undefined' && typeof window !== 'undefined') {
        URL.revokeObjectURL(url);
      }
    },
  },
  get userAgent() { return typeof navigator !== 'undefined' ? navigator.userAgent : ''; },
  get onLine() { return typeof navigator !== 'undefined' ? navigator.onLine : true; },
};

let _browserAPI: BrowserAPI = browserAPI;

export function setBrowserAPI(api: BrowserAPI): void {
  _browserAPI = api;
}

export function getBrowserAPI(): BrowserAPI {
  return _browserAPI;
}

export function resetBrowserAPI(): void {
  _browserAPI = browserAPI;
}
