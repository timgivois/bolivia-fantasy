/** Shared nav definition. `key` maps into the `nav` namespace in messages. */
export const NAV_LINKS = [
  { href: "/", key: "home" },
  { href: "/equipo", key: "team" },
  { href: "/liga", key: "leagues" },
  { href: "/clasificacion", key: "standings" },
] as const;

export type NavKey = (typeof NAV_LINKS)[number]["key"];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
