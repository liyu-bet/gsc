import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie, verifyAdminCredentials } from '@/lib/auth';
import { appUrl } from '@/lib/urls';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.redirect(appUrl('/login?error=Invalid%20credentials'), 303);
    }

    await setSessionCookie(email);
    return NextResponse.redirect(appUrl('/dashboard'), 303);
  } catch (error) {
    console.error('Login route failed:', error);
    return NextResponse.redirect(appUrl('/login?error=Login%20failed'), 303);
  }
}
