import { verifyAccessPassword } from "@/lib/accessPassword";

export type SpecialPermissionsStoredLink = {
  requiresSpecialPermissions?: boolean;
  specialPermissionsPasswordHash?: string | null;
};

export function getSpecialPermissionsPasswordHash(
  links: SpecialPermissionsStoredLink[],
): string | null {
  for (const link of links) {
    const hash = link.specialPermissionsPasswordHash;

    if (typeof hash === "string" && hash.trim()) {
      return hash;
    }
  }

  return null;
}

export function hasSpecialPermissionsPassword(
  links: SpecialPermissionsStoredLink[],
): boolean {
  return Boolean(getSpecialPermissionsPasswordHash(links));
}

export function verifySpecialPermissionsPassword(
  password: string,
  links: SpecialPermissionsStoredLink[],
): boolean {
  const hash = getSpecialPermissionsPasswordHash(links);
  return Boolean(hash) && verifyAccessPassword(password, hash);
}

export function removeSpecialPermissionsSecrets<T extends SpecialPermissionsStoredLink>(
  links: T[],
): Array<Omit<T, "specialPermissionsPasswordHash">> {
  return links.map((link) => {
    const { specialPermissionsPasswordHash: _secret, ...publicLink } = link;
    void _secret;
    return publicLink;
  });
}
