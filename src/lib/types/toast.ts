import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
};

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function add(message: string, type: ToastType = 'info', duration = 3000) {
    const id = Math.random().toString(36).slice(2, 10);
    update(t => [...t, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }
  }

  function remove(id: string) {
    update(t => t.filter(x => x.id !== id));
  }

  function success(message: string, duration?: number) {
    add(message, 'success', duration ?? 3000);
  }

  function error(message: string, duration?: number) {
    add(message, 'error', duration ?? 4000);
  }

  function info(message: string, duration?: number) {
    add(message, 'info', duration ?? 3000);
  }

  return { subscribe, add, remove, success, error, info };
}

export const toasts = createToastStore();
