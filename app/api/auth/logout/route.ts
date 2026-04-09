import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { appUrl } from '@/lib/urls';

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.redirect(appUrl('/login'), 303);
  } catch (error) {
    console.error('Logout route failed:', error);
    return NextResponse.redirect(appUrl('/login'), 303);
  }
}
