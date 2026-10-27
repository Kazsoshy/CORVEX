import { useEffect, useState } from 'react';
import { persistCurrentUserFromProfile } from '../../api/authService';
import { updateMyProfile } from '../../api/profileService';
import { getSessionIdleRemainingMs } from '../../api/sessionActivity';

export function initialsFrom(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function passwordScore(value) {
  const text = String(value || '');
  let score = 0;
  if (text.length >= 8) score += 1;
  if (text.length >= 12) score += 1;
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
  if (/\d/.test(text)) score += 1;
  if (/[^A-Za-z0-9]/.test(text)) score += 1;
  return score;
}

export function passwordTone(value) {
  const text = String(value || '');
  if (!text) return 'empty';
  if (text.length < 8) return 'weak';
  const score = passwordScore(text);
  if (score <= 2) return 'fair';
  return 'strong';
}

export function passwordLabel(value) {
  const text = String(value || '');
  if (!text) return 'Use at least 8 characters.';
  if (text.length < 8) return 'Needs at least 8 characters.';
  const score = passwordScore(text);
  if (score <= 2) return 'Acceptable. A longer mix of letters, numbers, and symbols is harder to guess.';
  if (score <= 3) return 'Good. This meets the sign-in rule and uses more than one kind of character.';
  return 'Strong.';
}

export function browserLabel() {
  const ua = navigator.userAgent || '';
  let browser = 'This browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';
  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return os ? `${browser} on ${os}` : browser;
}

export function formatIdleRemaining(ms) {
  if (ms == null) return null;
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return 'Less than a minute';
  return `${minutes} minutes`;
}

export function useIdleRemaining() {
  const [remaining, setRemaining] = useState(() => getSessionIdleRemainingMs());
  useEffect(() => {
    const id = window.setInterval(() => setRemaining(getSessionIdleRemainingMs()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return remaining;
}

export function ProfileTabs({ label, tabs, active, onChange, idPrefix }) {
  const onKeyDown = (event) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === active);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next = tabs[(current + direction + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  };

  return (
    <div className="settings-nav" role="tablist" aria-label={label} aria-orientation="vertical" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            className={selected ? 'settings-nav-btn active' : 'settings-nav-btn'}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            <span className="settings-nav-icon" aria-hidden="true"><Icon strokeWidth={1.75} /></span>
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.detail}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ProfileFact({ label, value, copyText, onCopy }) {
  return (
    <div className="profile-fact">
      <span>{label}</span>
      <div className="profile-fact-value">{value || '—'}</div>
      {copyText ? (
        <button className="profile-copy" type="button" onClick={() => onCopy(copyText, label)}>
          Copy
        </button>
      ) : null}
    </div>
  );
}

export async function copyProfileValue(value, label, showToast) {
  try {
    await navigator.clipboard.writeText(String(value));
    showToast?.(`${label} copied.`, 'success');
  } catch {
    showToast?.('Could not copy from this browser. Select the value and copy it manually.', 'error');
  }
}

function SecretField({ label, value, onChange, autoComplete, revealed, onToggle, placeholder }) {
  return (
    <label>
      {label}
      <span className="profile-secret">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          className="button ghost profile-reveal"
          type="button"
          aria-pressed={revealed}
          onClick={onToggle}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}

export function ProfilePasswordForm({ showToast, onUpdated, onDirtyChange }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = Boolean(currentPassword || password || confirmPassword);
  const tone = passwordTone(password);
  const matches = password.trim() && password.trim() === confirmPassword.trim();

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const reset = () => {
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNext(false);
    setShowConfirm(false);
  };

  const save = async () => {
    if (!currentPassword) {
      showToast?.('Enter your current password.', 'error');
      return;
    }
    if (password.trim().length < 8) {
      showToast?.('New password must be at least 8 characters.', 'error');
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      showToast?.('New password and confirmation do not match.', 'error');
      return;
    }
    setSaving(true);
    const res = await updateMyProfile({
      current_password: currentPassword,
      password: password.trim(),
      confirm_password: confirmPassword.trim(),
    });
    setSaving(false);
    if (!res.success) {
      showToast?.(res.message || 'Password update failed.', 'error');
      return;
    }
    if (res.data?.user_id) persistCurrentUserFromProfile(res.data);
    reset();
    onUpdated?.(res.data);
    showToast?.(res.message || 'Password updated.', 'success');
  };

  return (
    <section className="settings-card">
      <header>
        <h4>Password</h4>
        <p>CORVEX checks your current password before it replaces it. This sign-in stays open until you sign out or leave the app idle.</p>
      </header>
      <div className="settings-card-body">
        <div className="profile-form">
          <SecretField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            revealed={showCurrent}
            onToggle={() => setShowCurrent((value) => !value)}
          />
          <SecretField
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            revealed={showNext}
            onToggle={() => setShowNext((value) => !value)}
          />
          {password ? (
            <div className="profile-meter-block">
              <div className={`profile-meter profile-meter-${tone}`} aria-hidden="true"><i /></div>
              <p>{passwordLabel(password)}</p>
            </div>
          ) : null}
          <SecretField
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            revealed={showConfirm}
            onToggle={() => setShowConfirm((value) => !value)}
          />
          <ul className="profile-rules">
            <li className={password.trim().length >= 8 ? 'met' : ''}>At least 8 characters</li>
            <li className={matches ? 'met' : ''}>Confirmation matches</li>
          </ul>
        </div>
      </div>
      <div className="settings-card-footer">
        <button className="button ghost" type="button" onClick={reset} disabled={saving || !dirty}>Clear</button>
        <button className="button" type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </section>
  );
}
