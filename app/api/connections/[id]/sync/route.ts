import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { appUrl } from '@/lib/urls';
import { syncSitesForConnection } from '@/lib/google';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const { id } = await params;
  await syncSitesForConnection(id);
  return NextResponse.redirect(appUrl('/dashboard'), 303);
}
