function clean(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return clean(value);
}

function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value ? clean(value) : fallback;
}

export const env = {
  get appUrl() {
    return required('APP_URL');
  },
  get appName() {
    return optional('APP_NAME', 'GSC Portfolio Dashboard');
  },
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get encryptionKey() {
    return required('ENCRYPTION_KEY');
  },
  get adminEmail() {
    return required('ADMIN_EMAIL');
  },
  get adminPassword() {
    return required('ADMIN_PASSWORD');
  },
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get googleRedirectUri() {
    return required('GOOGLE_REDIRECT_URI');
  },
  get googleScopes() {
    return optional(
      'GOOGLE_OAUTH_SCOPES',
      'openid email profile https://www.googleapis.com/auth/webmasters.readonly'
    );
  },
};
