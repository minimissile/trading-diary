import type { DesktopApi } from '../shared/api.types';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
