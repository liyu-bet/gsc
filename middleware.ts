import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMiddlewareAuthBypassPath } from '@/lib/middleware-auth-bypass';
import { getSessionCookieName, verifySessionToken } from '@/lib/middleware-session';

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  if (isMiddlewareAuthBypassPath(url.pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get(getSessionCookieName())?.value;
  const isAuthorized = await verifySessionToken(sessionCookie);

  if (!isAuthorized) {
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
