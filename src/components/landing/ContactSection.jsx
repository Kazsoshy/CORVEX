import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactSection() {
  const { contact, email, signInPath } = landingContent;
  const baseId = useId();
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');

  const nameId = `${baseId}-name`;
  const emailId = `${baseId}-email`;
  const messageId = `${baseId}-message`;

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const from = String(data.get('email') || '').trim();
    const message = String(data.get('message') || '').trim();
    const nextErrors = {};

    if (!name) nextErrors.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(from)) nextErrors.email = 'Enter a valid email address.';
    if (message.length < 4) nextErrors.message = 'Add a short message.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus('');
      return;
    }

    const subject = encodeURIComponent(`CORVEX inquiry from ${name}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${from}`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setStatus(`Your email app should open with this message addressed to ${email}. If it does not, use the address above.`);
  };

  return (
    <section className="cvx-contact" id="contact" aria-labelledby="contact-title">
      <Reveal as="div" className="cvx-contact-copy">
        <Kicker>{contact.kicker}</Kicker>
        <h2 id="contact-title">{contact.title}</h2>
        <p className="cvx-contact-lede">{contact.lede}</p>
        <a className="cvx-email" href={`mailto:${email}`}>{email}</a>
        <Link className="cvx-signin-link" to={signInPath}>
          {contact.signInLabel}
        </Link>
      </Reveal>

      <div className="cvx-contact-panel">
        <h3>{contact.formTitle}</h3>
        <p className="cvx-form-note">{contact.formNote}</p>
        <form className="cvx-form" onSubmit={onSubmit} noValidate>
          <div className={`cvx-field ${errors.name ? 'has-error' : ''}`}>
            <label htmlFor={nameId}>Name</label>
            <input id={nameId} name="name" type="text" autoComplete="name" aria-invalid={errors.name ? 'true' : undefined} aria-describedby={errors.name ? `${nameId}-error` : undefined} />
            {errors.name ? <p id={`${nameId}-error`} className="cvx-field-error" role="alert">{errors.name}</p> : null}
          </div>
          <div className={`cvx-field ${errors.email ? 'has-error' : ''}`}>
            <label htmlFor={emailId}>Email</label>
            <input id={emailId} name="email" type="email" autoComplete="email" aria-invalid={errors.email ? 'true' : undefined} aria-describedby={errors.email ? `${emailId}-error` : undefined} />
            {errors.email ? <p id={`${emailId}-error`} className="cvx-field-error" role="alert">{errors.email}</p> : null}
          </div>
          <div className={`cvx-field ${errors.message ? 'has-error' : ''}`}>
            <label htmlFor={messageId}>Message</label>
            <textarea id={messageId} name="message" rows={5} autoComplete="off" aria-invalid={errors.message ? 'true' : undefined} aria-describedby={errors.message ? `${messageId}-error` : undefined} />
            {errors.message ? <p id={`${messageId}-error`} className="cvx-field-error" role="alert">{errors.message}</p> : null}
          </div>
          <button className="cvx-btn cvx-btn-light" type="submit">{contact.submitLabel}</button>
          {status ? <p className="cvx-form-status" role="status">{status}</p> : null}
        </form>
      </div>
    </section>
  );
}
