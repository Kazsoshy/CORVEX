import { useState, useEffect, useRef } from 'react';
import { landingContent } from '../../content/landingContent';
import { Reveal } from './Reveal';
import bg1 from '../../assets/corvex-bg.png';
import bg2 from '../../assets/corvex-bg-2.png';
import bg3 from '../../assets/corvex-bg-3.png';

const SLIDES = [bg1, bg2, bg3];
const AUTO_PLAY_MS = 9000;
const TRANSITION_DURATION = 800; // ms

export function HeroSection() {
  const { hero } = landingContent;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [prevSlide, setPrevSlide] = useState(null);
  const [transitionDir, setTransitionDir] = useState('right');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [animCount, setAnimCount] = useState(0);

  const currentSlideRef = useRef(0);
  const timerRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const touchStartX = useRef(null);

  currentSlideRef.current = currentSlide;

  const clearAutoTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startAutoTimer = () => {
    clearAutoTimer();
    timerRef.current = setTimeout(() => {
      slideRight();
      timerRef.current = setInterval(() => {
        slideRight();
      }, AUTO_PLAY_MS);
    }, AUTO_PLAY_MS);
  };

  const navigateTo = (nextIndex, direction) => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    const fromSlide = currentSlideRef.current;
    if (fromSlide === nextIndex) return;

    setPrevSlide(fromSlide);
    setCurrentSlide(nextIndex);
    setTransitionDir(direction);
    setIsTransitioning(true);
    setAnimCount((c) => c + 1);

    transitionTimeoutRef.current = setTimeout(() => {
      setIsTransitioning(false);
      setPrevSlide(null);
    }, TRANSITION_DURATION);

    startAutoTimer();
  };

  const slideRight = () => {
    const current = currentSlideRef.current;
    const nextIdx = (current + 1) % SLIDES.length;
    navigateTo(nextIdx, 'right');
  };

  const slideLeft = () => {
    const current = currentSlideRef.current;
    const prevIdx = (current - 1 + SLIDES.length) % SLIDES.length;
    navigateTo(prevIdx, 'left');
  };

  useEffect(() => {
    startAutoTimer();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearAutoTimer();
      } else {
        startAutoTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearAutoTimer();
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Run once on mount to preserve ongoing transitions

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (deltaX > 40) {
      slideRight();
    } else if (deltaX < -40) {
      slideLeft();
    }
  };

  return (
    <section
      className="cvx-hero"
      id="home"
      aria-labelledby="hero-title"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="cvx-hero-carousel" aria-hidden="true">
        {/* Outgoing slide */}
        {prevSlide !== null && (
          <div
            key={`slide-prev-${animCount}-${prevSlide}`}
            className={`cvx-hero-slide cvx-slide-out-${transitionDir}`}
          >
            <img
              src={SLIDES[prevSlide]}
              alt=""
              className="cvx-hero-slide-img"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        )}

        {/* Current / Incoming slide */}
        <div
          key={`slide-curr-${animCount}-${currentSlide}`}
          className={`cvx-hero-slide ${
            isTransitioning ? `cvx-slide-in-${transitionDir}` : 'cvx-hero-slide-active'
          }`}
        >
          <img
            src={SLIDES[currentSlide]}
            alt=""
            className="cvx-hero-slide-img"
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
      </div>

      <div className="cvx-hero-overlay" aria-hidden="true" />

      {/* Navigation buttons on both sides */}
      <button
        type="button"
        className="cvx-hero-nav-btn cvx-hero-nav-prev"
        onClick={slideLeft}
        aria-label="Slide toward the left"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <button
        type="button"
        className="cvx-hero-nav-btn cvx-hero-nav-next"
        onClick={slideRight}
        aria-label="Slide toward the right"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div className="cvx-wrap cvx-hero-wrap">
        <Reveal as="div" className="cvx-hero-copy" immediate>
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
      </div>
    </section>
  );
}