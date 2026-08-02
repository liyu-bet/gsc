import type { LowPropertyItem } from './types';

/** Safe Prisma select — never loads encrypted tokens or OAuth secrets. */
export const lowPropertySelect = {
  id: true,
  siteUrl: true,
  permissionLevel: true,
  label: true,
  isSelected: true,
  createdAt: true,
  updatedAt: true,
  connection: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const;

export type LowPropertyRow = {
  id: string;
  siteUrl: string;
  permissionLevel: string | null;
  label: string | null;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
  connection: {
    id: string;
    email: string;
    name: string | null;
  };
};

export function serializeLowProperty(row: LowPropertyRow): LowPropertyItem {
  return {
    id: row.id,
    siteUrl: row.siteUrl,
    permissionLevel: row.permissionLevel,
    label: row.label,
    isSelected: row.isSelected,
    firstSeenAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    connection: {
      id: row.connection.id,
      email: row.connection.email,
      name: row.connection.name,
    },
  };
}
