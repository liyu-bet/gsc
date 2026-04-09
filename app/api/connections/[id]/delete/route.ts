import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const { id } = await params;
  await prisma.googleConnection.delete({ where: { id } });

  return NextResponse.redirect(appUrl('/dashboard'), 303);
}
