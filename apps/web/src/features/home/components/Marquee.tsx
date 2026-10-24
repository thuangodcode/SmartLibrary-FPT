import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import './Marquee.css';

interface MarqueeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className' | 'onMouseEnter' | 'onMouseLeave'> {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  speed?: number;
  vertical?: boolean;
  repeat?: number;
}

function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = true,
  speed = 32,
  vertical = false,
  repeat = 4,
  ...props
}: MarqueeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    let frameId = 0;
    let previousTime = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const animate = (time: number) => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      const block = blockRef.current;

      if (viewport && track && block && !reducedMotion.matches && !pausedRef.current) {
        if (previousTime) {
          const style = window.getComputedStyle(track);
          const gap = Number.parseFloat(vertical ? style.rowGap : style.columnGap) || 0;
          const blockSize = vertical ? block.offsetHeight : block.offsetWidth;
          const loopDistance = blockSize + gap;

          if (loopDistance > 0) {
            const direction = reverse ? 1 : -1;
            positionRef.current += direction * speed * ((time - previousTime) / 1000);
            if (Math.abs(positionRef.current) >= loopDistance) {
              positionRef.current %= loopDistance;
            }
            track.style.transform = vertical
              ? `translateY(${positionRef.current}px)`
              : `translateX(${positionRef.current}px)`;
          }
        }
      }

      previousTime = time;
      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [reverse, speed, vertical]);

  const repeatCount = Math.max(2, Math.floor(repeat));

  return (
    <div
      {...props}
      ref={viewportRef}
      className={`marquee-viewport${vertical ? ' is-vertical' : ''}${className ? ` ${className}` : ''}`}
      role={props.role ?? 'region'}
      tabIndex={props.tabIndex ?? 0}
      onMouseEnter={() => { pausedRef.current = pauseOnHover; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onFocusCapture={() => { pausedRef.current = true; }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          pausedRef.current = false;
        }
      }}
    >
      <div ref={trackRef} className="marquee-track">
        {Array.from({ length: repeatCount }, (_, index) => (
          <div
            key={index}
            ref={index === 0 ? blockRef : undefined}
            className="marquee-group"
            aria-hidden={index > 0}
            inert={index > 0}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Marquee;
