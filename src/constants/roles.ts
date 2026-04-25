/**
 * User roles constants
 */
export const UserRoles = {
  MAHASISWA: 'mahasiswa',
  ADMIN: 'admin',
  KAPRODI: 'kaprodi',
  WAKIL_DEKAN: 'wakil_dekan',
  DOSEN: 'dosen',
  MENTOR: 'mentor',
} as const;

export type UserRole = typeof UserRoles[keyof typeof UserRoles];

/**
 * Admin roles (subset of user roles)
 */
export const AdminRoles = {
  ADMIN: UserRoles.ADMIN,
  KAPRODI: UserRoles.KAPRODI,
  WAKIL_DEKAN: UserRoles.WAKIL_DEKAN,
} as const;

export type AdminRole = typeof AdminRoles[keyof typeof AdminRoles];

/**
 * Check if a role is an admin role
 */
export const isAdminRole = (role: string): boolean => {
  return Object.values(AdminRoles).includes(role as AdminRole);
};
