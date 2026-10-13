import { useEffect, useState } from 'react';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService';
import { persistCurrentUserFromProfile, requestLogout } from '../../api/authService';
import { formatDisplayDate } from '../../utils/formatters';
import { NavIcon } from '../../navIcons';
import { LoadingState } from './LoadingState';

function updateField(setter, key) {
  return (event) => {
    const value = event.target.value;
    setter((current) => (current ? { ...current, [key]: value } : current));
  };
}

function formatUserId(userId) {
  if (userId == null || userId === '') return '—';
  const numeric = Number(userId);
  if (Number.isFinite(numeric)) {
    return `USR-${String(Math.trunc(numeric)).padStart(4, '0')}`;
  }
  return String(userId);
}

function ProfileField({ label, value }) {
  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      <span className="profile-field-value">{value || '—'}</span>
    </div>
  );
}

function AccountInfoItem({ icon, label, value }) {
  return (
    <li className="profile-account-item">
      <span className="profile-account-icon" aria-hidden="true">
        <NavIcon name={icon} className="profile-account-svg" />
      </span>
      <div className="profile-account-copy">
        <span className="profile-account-label">{label}</span>
        <span className="profile-account-value">{value || '—'}</span>
      </div>
    </li>
  );
}

export function AccountProfilePanel({ showToast, title = 'Profile Information' }) {
  const [profile, setProfile] = useState(null);
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchMyProfile();
      if (!active) return;
      if (res.success && res.data) setProfile(res.data);
      else setLoadError(res.message || 'Could not load your profile.');
    }
    load();
    return () => { active = false; };
  }, []);

  const saveProfile = async (includePassword = false) => {
    if (!profile) return;

    if (includePassword) {
      if (!password.trim()) {
        showToast?.('Enter a new password first.', 'error');
        return;
      }
      if (password.trim().length < 8) {
        showToast?.('Password must be at least 8 characters.', 'error');
        return;
      }
    }

    setSaving(true);
    const payload = {
      first_name: profile.first_name,
      middle_name: profile.middle_name ?? '',
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
    };
    if (includePassword && password.trim()) {
      payload.password = password.trim();
    }

    const res = await updateMyProfile(payload);
    setSaving(false);

    if (res.success) {
      persistCurrentUserFromProfile(res.data);
      setProfile(res.data);
      setPassword('');
      setShowPassword(false);
      setEditing(false);
      showToast?.(includePassword ? 'Password updated.' : 'Profile updated.', 'success');
    } else {
      showToast?.(res.message || 'Update failed.', 'error');
    }
  };

  if (!profile && !loadError) return <LoadingState message="Loading profile..." />;
  if (loadError) {
    return (
      <div className="page profile-page">
        <section className="profile-card">
          <p className="profile-load-error">{loadError}</p>
        </section>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || '—';
  const roleName = profile.role?.name || '—';
  const statusLabel = profile.status || '—';
  const statusClass = String(statusLabel).toLowerCase() === 'active'
    ? 'is-active'
    : 'is-inactive';

  return (
    <div className="page profile-page">
      <section className="profile-card" aria-label={title}>
        <header className="profile-hero">
          <div className="profile-hero-avatar" aria-hidden="true">
            <NavIcon name="user" className="profile-hero-svg" />
          </div>
          <div className="profile-hero-copy">
            <h2 className="profile-hero-name">{fullName}</h2>
            <p className="profile-hero-role">{roleName}</p>
            <p className={`profile-hero-status ${statusClass}`}>
              <span className="profile-status-dot" aria-hidden="true" />
              <span>{statusLabel}</span>
            </p>
          </div>
        </header>

        <div className="profile-divider" role="presentation" />

        <div className="profile-section">
          <h3 className="profile-section-title">Personal Information</h3>

          {editing ? (
            <div className="profile-personal-grid profile-personal-edit">
              <label className="profile-field">
                <span className="profile-field-label">First Name</span>
                <input
                  value={profile.first_name || ''}
                  onChange={updateField(setProfile, 'first_name')}
                  autoComplete="given-name"
                />
              </label>
              <label className="profile-field">
                <span className="profile-field-label">Last Name</span>
                <input
                  value={profile.last_name || ''}
                  onChange={updateField(setProfile, 'last_name')}
                  autoComplete="family-name"
                />
              </label>
              <label className="profile-field">
                <span className="profile-field-label">Email Address</span>
                <input
                  type="email"
                  value={profile.email || ''}
                  onChange={updateField(setProfile, 'email')}
                  autoComplete="email"
                />
              </label>
              <label className="profile-field">
                <span className="profile-field-label">Phone Number</span>
                <input
                  type="tel"
                  value={profile.phone || ''}
                  onChange={updateField(setProfile, 'phone')}
                  autoComplete="tel"
                />
              </label>
              {showPassword ? (
                <label className="profile-field profile-password-field">
                  <span className="profile-field-label">New Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    autoFocus
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="profile-personal-grid">
              <ProfileField label="First Name" value={profile.first_name} />
              <ProfileField label="Last Name" value={profile.last_name} />
              <ProfileField label="Email Address" value={profile.email} />
              <ProfileField label="Phone Number" value={profile.phone} />
            </div>
          )}
        </div>

        <div className="profile-divider" role="presentation" />

        <div className="profile-section">
          <h3 className="profile-section-title">Account Information</h3>
          <ul className="profile-account-list">
            <AccountInfoItem
              icon="credit-card"
              label="User ID"
              value={formatUserId(profile.user_id)}
            />
            <AccountInfoItem
              icon="shield-check"
              label="Role"
              value={roleName}
            />
            <AccountInfoItem
              icon="calendar"
              label="Date Created"
              value={formatDisplayDate(profile.created_at)}
            />
            <AccountInfoItem
              icon="clock"
              label="Last Login"
              value={formatDisplayDate(profile.last_login)}
            />
          </ul>
        </div>

        <div className="profile-divider" role="presentation" />

        <div className="profile-actions" aria-label="Profile actions">
          {editing ? (
            <>
              <button
                className="button ghost profile-action-btn"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setEditing(false);
                  setShowPassword(false);
                  setPassword('');
                  const res = await fetchMyProfile();
                  if (res.success && res.data) setProfile(res.data);
                }}
              >
                Cancel
              </button>
              <button
                className="button profile-action-btn"
                type="button"
                disabled={saving}
                onClick={() => saveProfile(showPassword)}
              >
                {saving ? 'Saving…' : (showPassword ? 'Save Password' : 'Save')}
              </button>
            </>
          ) : (
            <>
              <button
                className="button profile-action-btn"
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowPassword(false);
                  setEditing(true);
                }}
              >
                Update Profile
              </button>
              <button
                className="button secondary profile-action-btn"
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowPassword(true);
                  setEditing(true);
                }}
              >
                Change Password
              </button>
              <button
                className="button ghost profile-action-btn"
                type="button"
                disabled={saving}
                onClick={() => requestLogout()}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
