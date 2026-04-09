import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const formData = await request.formData();
  const nextSelected = String(formData.get('nextSelected') || '') === 'true';
  const { id } = await params;

  await prisma.gscProperty.update({
    where: { id },
    data: { isSelected: nextSelected },
  });

  return NextResponse.redirect(appUrl('/dashboard'), 303);
}
