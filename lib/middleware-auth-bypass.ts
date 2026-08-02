/** Paths that skip browser session redirect (handlers enforce their own auth). */
export function isMiddlewareAuthBypassPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/google/callback') ||
    pathname.startsWith('/api/integrations/low')
  );
}
