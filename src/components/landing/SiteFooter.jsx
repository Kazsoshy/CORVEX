import { Link } from 'react-router-dom';
import { landingContent } from '../../content/landingContent';
import { Wordmark } from './Wordmark';

export function SiteFooter() {
  const { footer, legalName, email, nav, signInPath } = landingContent;
  const year = new Date().getFullYear();

  return (
    <footer className="cvx-footer">
      <div className="cvx-wrap cvx-footer-grid">
        <div>
          <a className="cvx-brand" href="#home" aria-label="CORVEX home">
            <Wordmark />
          </a>
          <p className="cvx-footer-blurb">{footer.blurb}</p>
        </div>
        <nav aria-label="Footer">
          <p className="cvx-footer-label">Explore</p>
          <ul>
            {nav.map((item) => (
              <li key={item.id}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="cvx-footer-label">Account</p>
          <ul>
            <li>
              <Link to={signInPath}>Sign In</Link>
            </li>
            <li>
              <a href={`mailto:${email}`}>{email}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="cvx-wrap cvx-footer-bottom">
        <p>© {year} {legalName}</p>
        <p>Sign in for staff and customer accounts.</p>
      </div>
    </footer>
  );
}
