import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@tauri-apps/api/core';
import { toast } from '../stores/toast-store.ts';

export interface PickDirectoryOptions {
  title?: string;
  defaultPath?: string;
}

export function isTauriEnvironment(): boolean {
  if (isTauri()) return true;
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || (window as any).isTauri)) {
    return true;
  }
  if (typeof globalThis !== 'undefined' && ('__TAURI_INTERNALS__' in globalThis || (globalThis as any).isTauri)) {
    return true;
  }
  return false;
}

/**
 * Prompts the user to select a directory using the native OS file picker.
 *
 * Returns:
 * - `string`: The selected absolute directory path (trimmed).
 * - `null`: If the user deliberately cancelled the dialog (no error toast shown).
 *
 * Throws:
 * - `Error`: If the plugin invocation failed, permission was denied, or an unexpected error occurred.
 *
 * In browser/non-Tauri mode:
 * - Informs the user that native directory selection requires the desktop app, and returns `null`.
 */
export async function pickDirectory(options: PickDirectoryOptions = {}): Promise<string | null> {
  if (!isTauriEnvironment()) {
    toast.info('Native directory selection is available in the Runyard desktop app.');
    return null;
  }

  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: options.title,
      defaultPath: options.defaultPath,
    });

    // User cancelled dialog normally — do NOT show an error toast
    if (selected === null || selected === undefined) {
      return null;
    }

    if (typeof selected === 'string') {
      const trimmed = selected.trim();
      if (!trimmed) {
        toast.error('Selected directory path is empty');
        return null;
      }
      return trimmed;
    }

    // Defensive fallback if returned as single-element array (e.g. from different plugin versions)
    const raw: unknown = selected;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      const trimmed = (raw[0] as string).trim();
      if (trimmed) return trimmed;
    }

    throw new Error(`Unexpected return value from directory picker: ${JSON.stringify(selected)}`);
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error('Native directory picker error:', error);
    toast.error(`Failed to open directory chooser: ${message}`);
    throw error;
  }
}
