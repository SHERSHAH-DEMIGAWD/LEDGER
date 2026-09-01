/**
 * config/seedUsers.ts
 *
 * Static list of demo users for the persona switcher.
 *
 * In mock mode (VITE_USE_MOCK_DEALS=true), this list controls which users
 * the UI can switch between, and their persona drives the visible state
 * (e.g. their role determines whether they see deal/invitation actions).
 *
 * In real-backend mode (VITE_USE_MOCK_DEALS=false), these same IDs are
 * forwarded to the backend via the X-Mock-User header. The IDs MUST match
 * what is in the database after running `npm run prisma:seed`.
 *
 * The `password` field is provided for convenience when the user wants to
 * test the real auth flow; it is only used by the LoginPage form.
 */

export type Role = 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN';

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Mock password used by LoginPage. All seed users share this. */
  password: string;
  /** Short tagline shown in the persona switcher. */
  blurb: string;
}

export const SEED_USERS: SeedUser[] = [
  // --- BRANDs ---
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'brand-1@ledger.test',
    name: 'Acme Studios',
    role: 'BRAND',
    password: 'Test1234',
    blurb: 'Brand — drafts, invites creators',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'bright-1@ledger.test',
    name: 'Bright Co',
    role: 'BRAND',
    password: 'Test1234',
    blurb: 'Brand — funded, submitted, disputed',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    email: 'cloud9-1@ledger.test',
    name: 'Cloud9 Agency',
    role: 'BRAND',
    password: 'Test1234',
    blurb: 'Brand — in-progress deal',
  },

  // --- CREATORs ---
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    email: 'alex-1@ledger.test',
    name: 'Alex Rivera',
    role: 'CREATOR',
    password: 'Test1234',
    blurb: 'Creator — invited, accepted, submitted',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    email: 'jordan-1@ledger.test',
    name: 'Jordan Lee',
    role: 'CREATOR',
    password: 'Test1234',
    blurb: 'Creator — funded + disputed',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    email: 'sam-1@ledger.test',
    name: 'Sam Patel',
    role: 'CREATOR',
    password: 'Test1234',
    blurb: 'Creator — in-progress deal',
  },

  // --- ADMIN ---
  {
    id: '550e8400-e29b-41d4-a716-446655440007',
    email: 'admin@ledger.test',
    name: 'System Admin',
    role: 'ADMIN',
    password: 'Test1234',
    blurb: 'Admin — sees all deals',
  },

  // --- HRT ---
  {
    id: '550e8400-e29b-41d4-a716-446655440008',
    email: 'hrt@ledger.test',
    name: 'HRT Reviewer',
    role: 'HRT',
    password: 'Test1234',
    blurb: 'HRT — dispute resolution',
  },
];

/** Group seed users by role for display in the persona switcher. */
export const SEED_USERS_BY_ROLE: Record<Role, SeedUser[]> = {
  BRAND: SEED_USERS.filter((u) => u.role === 'BRAND'),
  CREATOR: SEED_USERS.filter((u) => u.role === 'CREATOR'),
  ADMIN: SEED_USERS.filter((u) => u.role === 'ADMIN'),
  HRT: SEED_USERS.filter((u) => u.role === 'HRT'),
};

/** Format the X-Mock-User header value for a given user. */
export function toMockUserHeader(user: SeedUser): string {
  return `${user.role}:${user.id}`;
}

/** Find a seed user by id. Returns undefined if not found. */
export function findSeedUser(id: string): SeedUser | undefined {
  return SEED_USERS.find((u) => u.id === id);
}
