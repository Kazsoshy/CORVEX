import { landingContent } from '../../content/landingContent';
import { HeroVisual } from './HeroVisual';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

export function HeroSection() {
  const { hero } = landingContent;

  return (
    <section className="cvx-hero" id="home" aria-labelledby="hero-title">
      <div className="cvx-wrap cvx-hero-grid">
        <Reveal as="div" className="cvx-hero-copy" immediate>
          <Kicker>{hero.kicker}</Kicker>
          <h1 id="hero-title">
            <span>{hero.titleLead}</span>
            <span className="cvx-hero-accent">{hero.titleEmphasis}</span>
          </h1>
          <p className="cvx-lede">{hero.lede}</p>
          <div className="cvx-hero-actions">
            <a className="cvx-btn cvx-btn-light" href={hero.primaryCta.href}>
              {hero.primaryCta.label}
            </a>
            <a className="cvx-btn cvx-btn-ghost" href={hero.secondaryCta.href}>
              {hero.secondaryCta.label}
            </a>
          </div>
        </Reveal>
        <HeroVisual />
      </div>
    </section>
  );
}
