/** Joins class names, skipping falsy ones. Plain module: usable from server and client components. */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
