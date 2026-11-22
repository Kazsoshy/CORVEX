import { landingContent } from '../../content/landingContent';

export function SiteFooter() {
  const { legalName } = landingContent;
  const year = new Date().getFullYear();

  return (
    <footer className="cvx-footer">
      <div className="cvx-wrap cvx-footer-bottom">
        <p>© {year} {legalName}</p>
      </div>
    </footer>
  );
}

