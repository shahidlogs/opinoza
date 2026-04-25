import { db, usersTable, bannedIpsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const BAN_MESSAGE = "Your account has been restricted. Contact support at support@opinoza.com.";
export const IP_BAN_MESSAGE = "Access from this network is restricted. Contact support at support@opinoza.com.";

export async function checkUserBan(
  clerkId: string,
): Promise<{ banned: false } | { banned: true; reason: string }> {
  const [user] = await db
    .select({ isBanned: usersTable.isBanned, bannedReason: usersTable.bannedReason })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (user?.isBanned) {
    return { banned: true, reason: user.bannedReason || BAN_MESSAGE };
  }
  return { banned: false };
}

export async function checkIpBan(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const [row] = await db
    .select({ id: bannedIpsTable.id })
    .from(bannedIpsTable)
    .where(eq(bannedIpsTable.ipAddress, ip))
    .limit(1);
  return !!row;
}
