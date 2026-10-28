import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { landingContent } from '../../content/landingContent';
import { Wordmark } from './Wordmark';

const SECTION_IDS = landingContent.nav.map((item) => item.id);

export function SiteNav() {
  const { nav, signInPath } = landingContent;
  const [onHero, setOnHero] = useState(() => window.scrollY < 40);
  const [activeId, setActiveId] = useState('home');
  const [hoverId, setHoverId] = useState(null);
  const [open, setOpen] = useState(false);
  const [indicator, setIndicator] = useState({ x: 0, w: 0, ready: false });
  const listRef = useRef(null);
  const toggleRef = useRef(null);
  const drawerTitleId = useId();

  useEffect(() => {
    const hero = document.getElementById('home');
    if (!hero) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setOnHero(entry.isIntersecting),
      { rootMargin: '-80px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveId(visible.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.2, 0.5, 1] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const measure = () => {
      const id = hoverId || activeId;
      const link = list.querySelector(`[data-nav="${id}"]`);
      if (!link || getComputedStyle(list).display === 'none') {
        setIndicator((current) => ({ ...current, ready: false }));
        return;
      }
      const listBox = list.getBoundingClientRect();
      const box = link.getBoundingClientRect();
      if (!box.width) {
        setIndicator((current) => ({ ...current, ready: false }));
        return;
      }
      setIndicator({ x: box.left - listBox.left, w: box.width, ready: true });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    document.fonts?.ready?.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeId, hoverId, onHero, open]);

  useEffect(() => {
    if (!open) return undefined;
    const drawer = document.getElementById('cvx-drawer');
    const getItems = () => (drawer ? [...drawer.querySelectorAll('a, button')] : []);
    getItems()[0]?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const items = getItems();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      toggleRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const closeMenu = () => setOpen(false);

  return (
    <>
    <header className={`cvx-nav ${onHero ? 'is-clear' : 'is-solid'}`}>
      <div className="cvx-nav-inner">
        <a className="cvx-brand" href="#home" aria-label="CORVEX home">
          <Wordmark />
        </a>

        <nav className="cvx-nav-desktop" aria-label="Primary">
          <div
            ref={listRef}
            className="cvx-nav-track"
            onMouseLeave={() => setHoverId(null)}
          >
            <ul className="cvx-nav-links">
              {nav.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    data-nav={item.id}
                    aria-current={activeId === item.id ? 'true' : undefined}
                    onMouseEnter={() => setHoverId(item.id)}
                    onFocus={() => setHoverId(item.id)}
                    onBlur={() => setHoverId(null)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <span
              className="cvx-nav-indicator"
              style={{
                width: `${indicator.w}px`,
                transform: `translateX(${indicator.x}px)`,
                opacity: indicator.ready ? 1 : 0,
              }}
              aria-hidden="true"
            />
          </div>
        </nav>

        <div className="cvx-nav-actions">
          <Link className="cvx-btn cvx-btn-sign" to={signInPath}>
            Sign In
          </Link>
          <a className="cvx-btn cvx-btn-touch" href="#contact">
            Get in Touch
          </a>
          <button
            ref={toggleRef}
            type="button"
            className="cvx-menu-btn"
            aria-expanded={open}
            aria-controls="cvx-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <span className="cvx-burger" data-open={open ? 'true' : undefined} />
          </button>
        </div>
      </div>
    </header>

      <nav
        id="cvx-drawer"
        className={open ? 'cvx-drawer is-open' : 'cvx-drawer'}
        aria-label="Mobile"
        aria-labelledby={drawerTitleId}
        aria-hidden={open ? undefined : true}
        inert={open ? undefined : ''}
      >
        <p id={drawerTitleId} className="sr-only">Menu</p>
        <ul className="cvx-drawer-links">
          {nav.map((item) => (
            <li key={item.id}>
              <a href={item.href} onClick={closeMenu} aria-current={activeId === item.id ? 'true' : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="cvx-drawer-actions">
          <Link className="cvx-btn cvx-btn-light" to={signInPath} onClick={closeMenu}>
            Sign In
          </Link>
          <a className="cvx-btn cvx-btn-ghost" href="#contact" onClick={closeMenu}>
            Get in Touch
          </a>
        </div>
      </nav>
    </>
  );
}
