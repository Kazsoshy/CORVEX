import { useEffect } from 'react';
import { landingContent } from '../../content/landingContent';
import { AboutSection } from './AboutSection';
import { ContactSection } from './ContactSection';
import { HeroSection } from './HeroSection';
import { ProductShowcase } from './ProductShowcase';
import { SiteFooter } from './SiteFooter';
import { SiteNav } from './SiteNav';
import { ValuesSection } from './ValuesSection';
import './landing.css';

export function LandingPage() {
  useEffect(() => {
    const root = document.documentElement;
    const previousTitle = document.title;
    const previousScroll = root.style.scrollBehavior;
    document.title = `${landingContent.legalName}`;
    const reduce = root.dataset.reduceMotion === '1'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) root.style.scrollBehavior = 'smooth';
    return () => {
      document.title = previousTitle;
      root.style.scrollBehavior = previousScroll;
    };
  }, []);

  return (
    <div className="cvx-site">
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteNav />
      <main id="main">
        <HeroSection />
        <AboutSection />
        <ProductShowcase />
        <ValuesSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}

export default LandingPage;
