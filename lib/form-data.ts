/**
 * Turn react-hook-form values into the FormData our server actions take, so a
 * form can validate on the client and still call the same action.
 *
 * Strings and numbers are set as-is; booleans become "on" only when true (like
 * a native checkbox); arrays append one entry per item; null/undefined are skipped.
 */
export function toFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item != null) fd.append(key, toEntry(item));
    } else if (typeof value === "boolean") {
      if (value) fd.set(key, "on");
    } else {
      fd.set(key, toEntry(value));
    }
  }
  return fd;
}

function toEntry(value: unknown): string | Blob {
  return value instanceof Blob ? value : String(value);
}
