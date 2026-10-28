import { useEffect, useState } from 'react';
import { Accessibility, Bell, Briefcase, Palette } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import {
  desktopNotificationSupport,
  enableDesktopNotifications,
  notifyDesktop,
  playToastSound,
} from '../../settings/feedback.js';
import {
  SIDEBAR_EVENT,
  WORKSPACE_FIELDS,
  isSidebarCollapsedPref,
  setSidebarCollapsedPref,
} from '../../settings/preferences.js';
import { usePreferences } from '../../settings/PreferencesProvider.jsx';

const TABS = [
  { id: 'accessibility', label: 'Accessibility', detail: 'Reading, contrast, and motion', icon: Accessibility },
  { id: 'appearance', label: 'Appearance', detail: 'Theme, density, and sidebar', icon: Palette },
  { id: 'notifications', label: 'Notifications', detail: 'Sound and desktop alerts', icon: Bell },
];

const WORKSPACE_TAB = {
  id: 'workspace',
  label: 'Workspace',
  detail: 'Tools for this role',
  icon: Briefcase,
};

function SettingToggle({ checked, onChange, label, detail, inline = false }) {
  return (
    <label className={inline ? 'settings-switch settings-switch-inline' : 'settings-switch'}>
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="settings-switch-control">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="settings-switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}

function SettingChoice({ name, label, value, options, onChange, hint, variant = 'segment' }) {
  return (
    <fieldset className="settings-field">
      <legend>{label}</legend>
      {hint ? <p className="settings-hint">{hint}</p> : null}
      <div className={`settings-choice settings-choice-${variant}`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label key={String(option.value)} className={selected ? 'settings-choice-btn active' : 'settings-choice-btn'}>
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              {variant === 'theme' ? (
                <span className={`settings-swatch settings-swatch-${option.value}`} aria-hidden="true">
                  <span className="settings-swatch-side" />
                  <span className="settings-swatch-main"><span /><span /></span>
                </span>
              ) : null}
              {variant === 'scale' ? (
                <span className="settings-scale-mark" style={{ fontSize: option.mark }} aria-hidden="true">A</span>
              ) : null}
              <span>
                <strong>{option.label}</strong>
                {option.detail ? <small>{option.detail}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SettingsCard({ title, description, children, footer }) {
  return (
    <section className="settings-card">
      <header>
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="settings-card-body">{children}</div>
      {footer ? <div className="settings-card-footer">{footer}</div> : null}
    </section>
  );
}

function AccessibilityPreview() {
  const [sampleOn, setSampleOn] = useState(true);
  return (
    <aside className="settings-preview" aria-label="Accessibility preview">
      <div className="settings-preview-top">
        <span className="settings-preview-dots" aria-hidden="true"><i /><i /><i /></span>
        <h4>Live preview</h4>
      </div>
      <div className="settings-preview-body">
        <div className="settings-preview-copy">
          <p>
            The quick brown fox jumps over the lazy dog. This sample uses the same text size, spacing, contrast, and motion as the rest of CORVEX.
          </p>
          <p>
            <a href="#accessibility-preview" onClick={(event) => event.preventDefault()}>Sample link</a>
          </p>
        </div>
        <div className="settings-preview-controls">
          <div className="settings-preview-row">
            <button className="button" type="button">Sample button</button>
            <SettingToggle inline checked={sampleOn} onChange={setSampleOn} label="Sample switch" />
          </div>
          <div className="settings-preview-row">
            <StatusBadge status="Active" />
            <StatusBadge status="Pending" />
            <StatusBadge status="Overdue" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="settings-focus-sample">Focus sample</label>
            <input id="settings-focus-sample" type="text" placeholder="Tab to this field to check the focus ring" />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function UserSettingsPanel({
  role = 'personal',
  showToast,
  children,
  embedded = false,
}) {
  const { prefs, update, resetGroup } = usePreferences();
  const fields = WORKSPACE_FIELDS[role] || [];
  const hasWorkspace = fields.length > 0 || Boolean(children);
  const tabs = hasWorkspace ? [...TABS, WORKSPACE_TAB] : TABS;
  const [section, setSection] = useState('accessibility');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isSidebarCollapsedPref);
  const [notificationPermission, setNotificationPermission] = useState(desktopNotificationSupport);

  useEffect(() => {
    const onSidebar = (event) => setSidebarCollapsed(Boolean(event.detail));
    window.addEventListener(SIDEBAR_EVENT, onSidebar);
    return () => window.removeEventListener(SIDEBAR_EVENT, onSidebar);
  }, []);

  const active = tabs.some((tab) => tab.id === section) ? section : 'accessibility';
  const activeTab = tabs.find((tab) => tab.id === active) || tabs[0];
  const motionReduced = typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === '1';
  const themeName = typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'light';

  const onTabKeyDown = (event) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === active);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next = tabs[(current + direction + tabs.length) % tabs.length];
    setSection(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  };

  const setDesktop = async (checked) => {
    if (!checked) {
      update({ desktopNotifications: false });
      return;
    }
    const result = await enableDesktopNotifications();
    setNotificationPermission(result);
    if (result !== 'granted') {
      update({ desktopNotifications: false });
      const message = result === 'unsupported'
        ? 'This browser does not support desktop notifications.'
        : 'Notifications are blocked. Allow them in the browser site settings, then turn this on again.';
      showToast?.(message, 'error');
      return;
    }
    update({ desktopNotifications: true });
    notifyDesktop('CORVEX', 'Desktop notifications are on.');
    showToast?.('Desktop notifications are on.', 'success');
  };

  const shell = (
      <div className="settings-shell">
        <div className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={onTabKeyDown}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                className={selected ? 'settings-nav-btn active' : 'settings-nav-btn'}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSection(tab.id)}
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

        <div className="settings-stage" role="tabpanel" id={`settings-panel-${active}`} aria-labelledby={`settings-tab-${active}`}>
          <div className="settings-stage-head">
            <h3>{activeTab.label}</h3>
            <p className="muted">{activeTab.detail}</p>
          </div>

          {active === 'accessibility' ? (
            <div className="settings-stack">
              <AccessibilityPreview />
                <SettingsCard title="Reading" description="Size, spacing, and how long messages stay on screen.">
                  <SettingChoice
                    name="text-scale"
                    label="Text size"
                    variant="scale"
                    value={prefs.textScale}
                    onChange={(value) => update({ textScale: value })}
                    options={[
                      { value: 100, label: 'Default', mark: '0.95rem' },
                      { value: 112, label: 'Large', mark: '1.25rem' },
                      { value: 125, label: 'Larger', mark: '1.55rem' },
                      { value: 150, label: 'Largest', mark: '1.95rem' },
                    ]}
                  />
                  <SettingChoice
                    name="line-spacing"
                    label="Line spacing"
                    value={prefs.lineSpacing}
                    onChange={(value) => update({ lineSpacing: value })}
                    options={[
                      { value: 'default', label: 'Default' },
                      { value: 'relaxed', label: 'Relaxed' },
                      { value: 'loose', label: 'Loose' },
                    ]}
                  />
                  <SettingChoice
                    name="letter-spacing"
                    label="Letter spacing"
                    value={prefs.letterSpacing}
                    onChange={(value) => update({ letterSpacing: value })}
                    options={[
                      { value: 'default', label: 'Default' },
                      { value: 'wide', label: 'Wide' },
                    ]}
                  />
                  <SettingToggle
                    checked={prefs.readableFont}
                    onChange={(checked) => update({ readableFont: checked })}
                    label="Readable font"
                    detail="Switches the interface to Lexend, a typeface designed for longer reading."
                  />
                  <SettingToggle
                    checked={prefs.longerToasts}
                    onChange={(checked) => update({ longerToasts: checked })}
                    label="Keep messages on screen longer"
                    detail="Confirmation messages stay for 8 seconds instead of 3."
                  />
                  <SettingToggle
                    checked={prefs.readingGuide}
                    onChange={(checked) => update({ readingGuide: checked })}
                    label="Reading guide"
                    detail="A highlight band follows the pointer so the current line is easier to track."
                  />
                </SettingsCard>

                <SettingsCard title="Vision" description="Contrast and status colors that do not rely on hue alone.">
                  <SettingToggle
                    checked={prefs.highContrast}
                    onChange={(checked) => update({ highContrast: checked })}
                    label="High contrast"
                    detail="Black text on a white background, with heavier borders. This overrides the theme."
                  />
                  <SettingToggle
                    checked={prefs.underlineLinks}
                    onChange={(checked) => update({ underlineLinks: checked })}
                    label="Underline links"
                    detail="Links in the page content stay underlined so they are not identified by color alone."
                  />
                  <SettingChoice
                    name="color-palette"
                    label="Status colors"
                    value={prefs.colorPalette}
                    onChange={(value) => update({ colorPalette: value })}
                    hint="Color-blind safe uses a blue, amber, and vermilion palette and adds a shape before each status."
                    options={[
                      { value: 'standard', label: 'Standard' },
                      { value: 'colorblind', label: 'Color-blind safe' },
                    ]}
                  />
                </SettingsCard>

                <SettingsCard title="Interaction" description="Focus, target size, and how much the interface moves.">
                  <SettingToggle
                    checked={prefs.strongFocus}
                    onChange={(checked) => update({ strongFocus: checked })}
                    label="Stronger keyboard focus"
                    detail="Draws a thick gold outline around the control you have reached with Tab."
                  />
                  <SettingToggle
                    checked={prefs.largeTargets}
                    onChange={(checked) => update({ largeTargets: checked })}
                    label="Larger click and tap targets"
                    detail="Makes buttons, navigation, and form fields at least 44 pixels tall."
                  />
                  <SettingChoice
                    name="reduce-motion"
                    label="Motion"
                    hint={motionReduced ? 'Animations are currently reduced.' : 'Animations are currently allowed.'}
                    value={prefs.reduceMotion}
                    onChange={(value) => update({ reduceMotion: value })}
                    options={[
                      { value: 'system', label: 'Match this device' },
                      { value: 'on', label: 'Reduce' },
                      { value: 'off', label: 'Allow' },
                    ]}
                  />
                </SettingsCard>

                <aside className="settings-note">
                  <strong>Keyboard</strong>
                  <p>
                    Moving between screens announces the page name. The first Tab stop is Skip to content.
                  </p>
                  <div className="settings-keys">
                    <span><kbd>?</kbd> Shortcuts</span>
                    <span><kbd>/</kbd> Search</span>
                  </div>
                </aside>
                <div className="settings-actions">
                  <button className="button secondary" type="button" onClick={() => resetGroup('accessibility')}>
                    Restore accessibility defaults
                  </button>
                </div>
            </div>
          ) : null}

          {active === 'appearance' ? (
            <SettingsCard
              title="Display"
              description="Choose how CORVEX looks on this screen."
              footer={(
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setSidebarCollapsed(false);
                    setSidebarCollapsedPref(false);
                    resetGroup('appearance');
                  }}
                >
                  Restore appearance defaults
                </button>
              )}
            >
              <SettingChoice
                name="theme"
                label="Theme"
                variant="theme"
                hint={prefs.highContrast ? 'High contrast is on, so this theme is overridden.' : (themeName === 'dark' ? 'Using dark appearance.' : 'Using light appearance.')}
                value={prefs.theme}
                onChange={(value) => update({ theme: value })}
                options={[
                  { value: 'system', label: 'Match this device' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
              <SettingChoice
                name="density"
                label="Density"
                variant="cards"
                value={prefs.density}
                onChange={(value) => update({ density: value })}
                options={[
                  { value: 'comfortable', label: 'Comfortable', detail: 'More space around cards and tables.' },
                  { value: 'compact', label: 'Compact', detail: 'Tighter rows for dense work.' },
                ]}
              />
              <SettingToggle
                checked={sidebarCollapsed}
                onChange={(checked) => {
                  setSidebarCollapsed(checked);
                  setSidebarCollapsedPref(checked);
                }}
                label="Collapse the sidebar"
                detail="Keeps the navigation as icons. You can still expand it from the sidebar control."
              />
            </SettingsCard>
          ) : null}

          {active === 'notifications' ? (
            <SettingsCard
              title="Alerts"
              description="Hear a tone, or get a system notification while this tab is in the background."
              footer={(
                <>
                  <button className="button secondary" type="button" onClick={() => playToastSound()}>
                    Play sound
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      if (notificationPermission !== 'granted') {
                        showToast?.('Turn on desktop notifications first and allow them in the browser.', 'error');
                        return;
                      }
                      notifyDesktop('CORVEX', 'This is a test notification.');
                      showToast?.('Test notification sent.', 'success');
                    }}
                  >
                    Send test notification
                  </button>
                  <button className="button ghost" type="button" onClick={() => resetGroup('notifications')}>
                    Restore notification defaults
                  </button>
                </>
              )}
            >
              <SettingToggle
                checked={prefs.toastSound}
                onChange={(checked) => update({ toastSound: checked })}
                label="Play a sound for messages"
                detail="A short tone plays when CORVEX confirms or reports an action."
              />
              <SettingToggle
                checked={prefs.desktopNotifications}
                onChange={setDesktop}
                label="Desktop notifications"
                detail={permissionDetail(notificationPermission)}
              />
            </SettingsCard>
          ) : null}

          {active === 'workspace' ? (
            <>
              {fields.length ? (
                <SettingsCard
                  title="This role"
                  description="These controls change how this device handles field work and warehouse tasks."
                  footer={(
                    <button className="button secondary" type="button" onClick={() => resetGroup('workspace')}>
                      Restore workspace defaults
                    </button>
                  )}
                >
                  {fields.map((field) => (
                    <SettingToggle
                      key={field.key}
                      checked={Boolean(prefs[field.key])}
                      onChange={(checked) => update({ [field.key]: checked })}
                      label={field.label}
                      detail={field.detail}
                    />
                  ))}
                </SettingsCard>
              ) : null}
              {children ? (
                <section className="settings-card">
                  <header>
                    <h4>Actions</h4>
                  </header>
                  <div className="settings-card-body">{children}</div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
  );

  if (embedded) return shell;

  return (
    <div className="page settings-page">
      <header className="settings-hero">
        <div>
          <p className="settings-kicker">Preferences</p>
          <h2>Settings</h2>
          <p className="muted">Saved on this device and applied immediately, including the next time you open CORVEX.</p>
        </div>
        <div className="settings-hero-meta">
          <span className="settings-pill">On this device</span>
          <span className="settings-pill">Applies immediately</span>
        </div>
      </header>
      {shell}
    </div>
  );
}

function permissionDetail(permission) {
  if (permission === 'granted') return 'Allowed. A system notification is sent when a message arrives while this tab is in the background.';
  if (permission === 'denied') return 'Blocked by the browser. Allow notifications for this site, then turn this on again.';
  if (permission === 'unsupported') return 'This browser cannot show system notifications.';
  return 'The browser will ask permission the first time you turn this on.';
}
