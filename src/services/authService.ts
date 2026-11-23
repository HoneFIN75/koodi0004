export type AuthRole = 'writer' | 'admin';

export interface AuthSession {
  authReady: boolean;
  role: AuthRole | null;
  csrfToken: string;
}

export class AuthServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthServiceError';
    this.status = status;
  }
}

const endpoint = `${import.meta.env.BASE_URL}api/planner.php`;

async function request(action: string, csrfToken?: string, payload?: Record<string, string>): Promise<AuthSession> {
  const response = await fetch(`${endpoint}?action=${encodeURIComponent(action)}`, {
    method: payload ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json().catch(() => null) as (Partial<AuthSession> & { error?: string }) | null;
  if (!response.ok) {
    throw new AuthServiceError(result?.error ?? `Kirjautumispyyntö epäonnistui (${response.status}).`, response.status);
  }
  if (!result || typeof result.csrfToken !== 'string'
    || !(result.role === null || result.role === 'writer' || result.role === 'admin')) {
    throw new AuthServiceError('Palvelin vastasi virheellisellä kirjautumistiedolla.', 502);
  }
  return { authReady: result.authReady !== false, role: result.role, csrfToken: result.csrfToken };
}

export const authService = {
  getSession: () => request('session'),
  login: (role: AuthRole, password: string, csrfToken: string) => request('login', csrfToken, { role, password }),
  logout: (csrfToken: string) => request('logout', csrfToken, {}),
  changePassword: (account: AuthRole, currentAdminPassword: string, newPassword: string, csrfToken: string) =>
    request('admin/password', csrfToken, { account, currentAdminPassword, newPassword }),
};
