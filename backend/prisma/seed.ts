/**
 * prisma/seed.ts
 *
 * Seeds the database with demo users and sample deals for local development.
 *
 * Users:
 *   BRAND:  brand-1@ledger.test, bright-1@ledger.test, cloud9-1@ledger.test
 *   CREATOR: alex-1@ledger.test, jordan-1@ledger.test, sam-1@ledger.test
 *   ADMIN:  admin@ledger.test
 *   HRT:    hrt@ledger.test
 *
 * All seed users share the password: Test1234
 *
 * Usage:
 *   npx prisma db seed       (once configured in package.json)
 *
 * Or directly:
 *   npx tsx prisma/seed.ts
 *
 * Run after: npx prisma migrate dev (or prisma db push)
 */

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;
const SHARED_PASSWORD = 'Test1234';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// ---------------------------------------------------------------------------
// User definitions
// ---------------------------------------------------------------------------

interface SeedUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  name?: string;
}

const SEED_USERS: SeedUser[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'brand-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'BRAND',
    name: 'Acme Studios',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'bright-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'BRAND',
    name: 'Bright Co',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    email: 'cloud9-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'BRAND',
    name: 'Cloud9 Agency',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    email: 'alex-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'CREATOR',
    name: 'Alex Rivera',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    email: 'jordan-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'CREATOR',
    name: 'Jordan Lee',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    email: 'sam-1@ledger.test',
    password: SHARED_PASSWORD,
    role: 'CREATOR',
    name: 'Sam Patel',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440007',
    email: 'admin@ledger.test',
    password: SHARED_PASSWORD,
    role: 'ADMIN',
    name: 'System Admin',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440008',
    email: 'hrt@ledger.test',
    password: SHARED_PASSWORD,
    role: 'HRT',
    name: 'HRT Reviewer',
  },
];

// ---------------------------------------------------------------------------
// Deal definitions
// ---------------------------------------------------------------------------

type DealSeed = {
  id: string;
  brandId: string;
  creatorId: string | null;
  status: string;
  fundingStatus: string;
  terms: object;
  auditEvents: Array<{ action: string; actorId: string | null; resourceId: string; metadata?: object }>;
};

const SEED_DEALS: DealSeed[] = [
  // -------------------------------------------------------------------------
  // Deal 1: DRAFT — brand-1, no creator yet
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    brandId: '550e8400-e29b-41d4-a716-446655440001',
    creatorId: null,
    status: 'DRAFT',
    fundingStatus: 'NOT_FUNDED',
    terms: {
      title: 'Acme Studios — Q4 Brand Campaign',
      description:
        'Full-scope brand campaign including social media content, blog series, and product photography for the Q4 product launch.',
      deliverables: [
        { title: 'Social Media Pack', description: '20 posts across Instagram, Twitter, and LinkedIn', deadline: '2026-10-31' },
        { title: 'Blog Article Series', description: '4 long-form articles, 1,500+ words each' },
        { title: 'Product Photography', description: '15 edited product shots for web and print' },
      ],
      paymentAmount: 750000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000001', metadata: { status: 'DRAFT' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 2: PENDING_ACCEPTANCE — brand-2, invited alex
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    brandId: '550e8400-e29b-41d4-a716-446655440002',
    creatorId: '550e8400-e29b-41d4-a716-446655440004',
    status: 'PENDING_ACCEPTANCE',
    fundingStatus: 'NOT_FUNDED',
    terms: {
      title: 'Bright Co — Product Launch Video',
      description:
        'Produce a 90-second product launch video including script writing, filming, and post-production for Bright Co\'s SaaS platform launch.',
      deliverables: [
        { title: 'Final Video (90s)', description: '4K, broadcast-ready with captions and licensed music', deadline: '2026-11-15' },
        { title: 'Behind-the-Scenes Cut', description: '15s vertical format for Instagram Reels' },
      ],
      paymentAmount: 1200000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000002', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000002', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440004' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 3: ACCEPTED — brand-1, alex accepted
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000003',
    brandId: '550e8400-e29b-41d4-a716-446655440001',
    creatorId: '550e8400-e29b-41d4-a716-446655440004',
    status: 'ACCEPTED',
    fundingStatus: 'NOT_FUNDED',
    terms: {
      title: 'Acme Studios — Explainer Video Series',
      description: 'Three short-form animated explainer videos introducing Acme\'s core product features.',
      deliverables: [
        { title: 'Video 1 — Overview', description: '60s animated overview, 1080p', deadline: '2026-10-01' },
        { title: 'Video 2 — Feature Deep Dive', description: '90s feature walkthrough, 1080p', deadline: '2026-10-15' },
        { title: 'Video 3 — Use Cases', description: '45s social cut, 1080p', deadline: '2026-10-22' },
      ],
      paymentAmount: 950000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000003', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000003', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440004' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440004', resourceId: 'd1000000-0000-0000-0000-000000000003', metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 4: FUNDED — brand-2, jordan
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000004',
    brandId: '550e8400-e29b-41d4-a716-446655440002',
    creatorId: '550e8400-e29b-41d4-a716-446655440005',
    status: 'FUNDED',
    fundingStatus: 'FUNDED',
    terms: {
      title: 'Bright Co — UI/UX Design System',
      description: 'Comprehensive design system including component library, style guide, and documentation for Bright Co\'s internal product team.',
      deliverables: [
        { title: 'Figma Component Library', description: '100+ components with variants and states', deadline: '2026-11-01' },
        { title: 'Design System Documentation', description: 'Notion-based documentation site' },
        { title: 'Icon Set', description: '50 custom icons in SVG + Figma format' },
      ],
      paymentAmount: 1500000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000004', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000004', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440005' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440005', resourceId: 'd1000000-0000-0000-0000-000000000004', metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000004', metadata: { fromStatus: 'ACCEPTED', toStatus: 'FUNDED' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 5: IN_PROGRESS — brand-3, sam
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000005',
    brandId: '550e8400-e29b-41d4-a716-446655440003',
    creatorId: '550e8400-e29b-41d4-a716-446655440006',
    status: 'IN_PROGRESS',
    fundingStatus: 'FUNDED',
    terms: {
      title: 'Cloud9 Agency — Annual Report Design',
      description: 'Print-ready annual report design including editorial layout, data visualization, and infographics.',
      deliverables: [
        { title: 'Cover + Interior Layout', description: '32-page print-ready PDF, 300dpi', deadline: '2026-10-15' },
        { title: 'Data Visualizations', description: '12 custom charts and infographics in Figma + SVG', deadline: '2026-10-10' },
        { title: 'Digital Version', description: 'Web-optimized HTML/PDF for digital distribution', deadline: '2026-10-20' },
      ],
      paymentAmount: 2000000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440003', resourceId: 'd1000000-0000-0000-0000-000000000005', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440003', resourceId: 'd1000000-0000-0000-0000-000000000005', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440006' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440006', resourceId: 'd1000000-0000-0000-0000-000000000005', metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440003', resourceId: 'd1000000-0000-0000-0000-000000000005', metadata: { fromStatus: 'ACCEPTED', toStatus: 'FUNDED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440006', resourceId: 'd1000000-0000-0000-0000-000000000005', metadata: { fromStatus: 'FUNDED', toStatus: 'IN_PROGRESS' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 6: SUBMITTED — brand-1, alex submitted for review
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000006',
    brandId: '550e8400-e29b-41d4-a716-446655440001',
    creatorId: '550e8400-e29b-41d4-a716-446655440004',
    status: 'SUBMITTED',
    fundingStatus: 'FUNDED',
    terms: {
      title: 'Acme Studios — Podcast Editing Suite',
      description: 'Audio editing and post-production for a 10-episode podcast series including intro/outro music, sound design, and transcription.',
      deliverables: [
        { title: 'Episodes 1-5', description: 'Fully edited with intro, outro, and sound design' },
        { title: 'Episodes 6-10', description: 'Fully edited with intro, outro, and sound design' },
        { title: 'Transcripts', description: 'Full transcripts for all 10 episodes in SRT + TXT format' },
      ],
      paymentAmount: 600000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440004' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440004', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440001', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { fromStatus: 'ACCEPTED', toStatus: 'FUNDED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440004', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { fromStatus: 'FUNDED', toStatus: 'IN_PROGRESS' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440004', resourceId: 'd1000000-0000-0000-0000-000000000006', metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'SUBMITTED' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Deal 7: DISPUTED — brand-2, jordan raised dispute
  // -------------------------------------------------------------------------
  {
    id: 'd1000000-0000-0000-0000-000000000007',
    brandId: '550e8400-e29b-41d4-a716-446655440002',
    creatorId: '550e8400-e29b-41d4-a716-446655440005',
    status: 'DISPUTED',
    fundingStatus: 'FUNDED',
    terms: {
      title: 'Bright Co — Mobile App Illustrations',
      description:
        '30 custom vector illustrations for Bright Co\'s mobile app onboarding flow and in-app messaging. Dispute concerns delivery timing and scope interpretation.',
      deliverables: [
        { title: 'Onboarding Illustrations', description: '15 illustrations for onboarding screens, SVG + PNG', deadline: '2026-09-15' },
        { title: 'In-App Illustrations', description: '15 illustrations for in-app messages and empty states, SVG + PNG', deadline: '2026-09-30' },
      ],
      paymentAmount: 1100000,
      currency: 'USD',
    },
    auditEvents: [
      { action: 'DEAL.CREATED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { status: 'DRAFT' } },
      { action: 'DEAL.CREATOR_INVITED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { creatorId: '550e8400-e29b-41d4-a716-446655440005' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440005', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { fromStatus: 'ACCEPTED', toStatus: 'FUNDED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440005', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { fromStatus: 'FUNDED', toStatus: 'IN_PROGRESS' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440005', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'SUBMITTED' } },
      { action: 'DEAL.STATE_CHANGED', actorId: '550e8400-e29b-41d4-a716-446655440002', resourceId: 'd1000000-0000-0000-0000-000000000007', metadata: { fromStatus: 'SUBMITTED', toStatus: 'DISPUTED' } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Seeding database...\n');

  // ---------------------------------------------------------------------------
  // 1. Upsert users
  // ---------------------------------------------------------------------------
  console.log('Creating users...');
  for (const user of SEED_USERS) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        passwordHash,
        role: user.role,
        emailVerified: true,
      },
      create: {
        id: user.id,
        email: user.email,
        passwordHash,
        role: user.role,
        emailVerified: true,
        profile: user.name
          ? {
              create: {
                name: user.name,
              },
            }
          : undefined,
      },
    });

    // Also update the profile name
    if (user.name) {
      await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { name: user.name },
        create: { userId: user.id, name: user.name },
      });
    }

    console.log(`  ✓ ${user.role} — ${user.email}`);
  }

  // ---------------------------------------------------------------------------
  // 2. Upsert deals
  // ---------------------------------------------------------------------------
  console.log('\nCreating deals...');
  for (const deal of SEED_DEALS) {
    const existing = await prisma.deal.findUnique({ where: { id: deal.id } });
    if (existing) {
      // Update status if it changed (seed re-run scenario)
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          status: deal.status as never,
          fundingStatus: deal.fundingStatus as never,
          creatorId: deal.creatorId,
        },
      });
    } else {
      await prisma.deal.create({
        data: {
          id: deal.id,
          brandId: deal.brandId,
          creatorId: deal.creatorId,
          status: deal.status as never,
          fundingStatus: deal.fundingStatus as never,
          versions: {
            create: {
              versionNumber: 1,
              terms: deal.terms as never,
            },
          },
        },
      });
    }
    console.log(`  ✓ ${deal.status} — ${(deal.terms as { title: string }).title}`);
  }

  // ---------------------------------------------------------------------------
  // 3. Upsert audit logs
  // ---------------------------------------------------------------------------
  console.log('\nCreating audit logs...');
  for (const deal of SEED_DEALS) {
    for (const event of deal.auditEvents) {
      await prisma.auditLog.upsert({
        where: {
          id: `${deal.id}-${event.action}-${event.actorId ?? 'system'}-${Math.floor(Date.now() / 1000)}`,
        },
        update: {},
        create: {
          actorId: event.actorId,
          dealId: deal.id,
          action: event.action,
          resourceType: 'Deal',
          resourceId: event.resourceId,
          metadata: event.metadata as never,
        },
      });
    }
    console.log(`  ✓ ${deal.auditEvents.length} events for deal ${deal.id.slice(0, 8)}...`);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Test accounts (password: Test1234):');
  console.log('  BRAND:  brand-1@ledger.test, bright-1@ledger.test, cloud9-1@ledger.test');
  console.log('  CREATOR: alex-1@ledger.test, jordan-1@ledger.test, sam-1@ledger.test');
  console.log('  ADMIN:  admin@ledger.test');
  console.log('  HRT:    hrt@ledger.test');
  console.log('\nPersona switcher IDs (use X-Mock-User header in format role:id):');
  console.log('  BRAND:  BRAND:550e8400-e29b-41d4-a716-446655440001');
  console.log('  CREATOR: CREATOR:550e8400-e29b-41d4-a716-446655440004');
  console.log('  ADMIN:  ADMIN:550e8400-e29b-41d4-a716-446655440007');
  console.log('  HRT:    HRT:550e8400-e29b-41d4-a716-446655440008');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
