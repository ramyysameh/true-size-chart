import type prisma from '../db.server';

/**
 * Deletes everything the app stores for one shop, in one transaction.
 * Runs whether or not a session is left: a redelivered webhook, or shop/redact 48 h after
 * an uninstall, may find the sessions already gone, and the rest must go anyway.
 */
export async function deleteShopData(db: typeof prisma, shop: string): Promise<void> {
  const where = { shop };
  await db.$transaction([
    db.assignmentRule.deleteMany({ where }),
    db.shopState.deleteMany({ where }),
    db.eventDaily.deleteMany({ where }),
    db.eventSizeDaily.deleteMany({ where }),
    db.session.deleteMany({ where }),
  ]);
}
