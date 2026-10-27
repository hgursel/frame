import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
type User = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  disabled: number;
  mustChangePassword: number;
};
const UserContext = createContext<User | undefined>(undefined);
export const useUser = () => useContext(UserContext);
export function AccountGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>();
  const [error, setError] = useState('');
  const refresh = () =>
    api<User>('/auth/me')
      .then(setUser)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
    const changed = () => {
      void refresh();
    };
    window.addEventListener('frame-profile-updated', changed);
    return () => window.removeEventListener('frame-profile-updated', changed);
  }, []);
  if (!user) return <main className="auth">{error || 'Opening your account…'}</main>;
  return (
    <UserContext.Provider value={user}>
      {user.mustChangePassword ? (
        <main className="auth">
          <h1>Choose your password</h1>
          <p>Replace the temporary password supplied by your administrator.</p>
          <PasswordForm onSaved={refresh} />
        </main>
      ) : (
        children
      )}
    </UserContext.Provider>
  );
}
function PasswordForm({ onSaved }: { onSaved?: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/password', 'POST', { currentPassword, password });
          setCurrent('');
          setPassword('');
          setNotice('Password changed.');
          onSaved?.();
        } catch (e) {
          setNotice((e as Error).message);
        }
      }}
    >
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className="primary">Change password</button>
      <p role="status">{notice}</p>
    </form>
  );
}
export function AccountSettings() {
  const user = useUser();
  return (
    <section className="settings-panel">
      <h2>Your account</h2>
      <p>
        Signed in as <strong>{user?.username}</strong> ·{' '}
        {user?.role === 'admin' ? 'Administrator' : 'User'}
      </p>
      <p>
        Display name: {user?.displayName || user?.username}
        <br />
        Email: {user?.email || 'Not set'}
      </p>
      <p className="muted">Your administrator manages these profile details.</p>
      <PasswordForm />
    </section>
  );
}
export function UsersSettings() {
  const self = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = () => api<User[]>('/admin/users').then(setUsers);
  useEffect(() => {
    void refresh().catch((e) => setNotice(e.message));
  }, []);
  const update = async (user: User, body: unknown) => {
    try {
      await api(`/admin/users/${user.id}`, 'PATCH', body);
      await refresh();
      window.dispatchEvent(new Event('frame-profile-updated'));
      setNotice('Account updated.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  return (
    <section>
      <h2>Users</h2>
      <p>
        Create local accounts. New users must change their temporary password before opening their
        workspace.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/admin/users', 'POST', { username, password, role, displayName, email });
            setUsername('');
            setDisplayName('');
            setEmail('');
            setPassword('');
            await refresh();
            setNotice('Account created. Share the username and temporary password with the user.');
          } catch (e) {
            setNotice((e as Error).message);
          }
        }}
      >
        <label>
          Username
          <input
            required
            pattern="[a-zA-Z0-9_.-]+"
            value={username}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Display name
          <input
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Temporary password
          <input
            required
            type="password"
            minLength={12}
            maxLength={256}
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <button className="primary">Create account</button>
      </form>
      <p role="status">{notice}</p>
      {users.map((u) => (
        <article className="auth-card" key={u.id}>
          <strong>{u.username}</strong> · {u.role} · {u.disabled ? 'Disabled' : 'Active'}
          {u.mustChangePassword ? ' · Password change required' : ''}
          <form
            key={`${u.displayName}:${u.email}`}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void update(u, { displayName: data.get('displayName'), email: data.get('email') });
            }}
          >
            <label>
              Display name
              <input name="displayName" maxLength={120} defaultValue={u.displayName} />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={254} defaultValue={u.email} />
            </label>
            <button>Save profile</button>
          </form>
          {u.id !== self?.id && (
            <div>
              <button onClick={() => void update(u, { disabled: !u.disabled })}>
                {u.disabled ? 'Enable' : 'Disable'} account
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  void update(u, { password: data.get('password') }).then(() => form.reset());
                }}
              >
                <label>
                  Reset password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                  />
                </label>
                <button>Set temporary password</button>
              </form>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
