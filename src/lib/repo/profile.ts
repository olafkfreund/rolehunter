import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Profile } from "../db/schema";

export async function getProfile(): Promise<Profile> {
  const db = getDb();
  const rows = await db.select().from(schema.profile).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(schema.profile).values({}).returning();
  return inserted[0];
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const db = getDb();
  const current = await getProfile();
  const updated = await db
    .update(schema.profile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.profile.id, current.id))
    .returning();
  return updated[0];
}
