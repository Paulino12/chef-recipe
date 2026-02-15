/**
 * Minimal className helper used across UI components.
 * Pass any string values (or falsy conditionals) and it returns a single class string.
 */
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}
