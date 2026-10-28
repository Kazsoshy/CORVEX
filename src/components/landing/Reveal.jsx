import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1];

function motionAllowed(reduced) {
  if (reduced !== false) return false;
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.reduceMotion !== '1';
}

export function Reveal({ as = 'div', className, children, delay = 0, immediate = false }) {
  const reduced = useReducedMotion();
  if (!motionAllowed(reduced)) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = motion[as];
  const enter = immediate
    ? { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 22 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '0px 0px -8% 0px' },
      };

  return (
    <MotionTag
      className={className}
      {...enter}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}
