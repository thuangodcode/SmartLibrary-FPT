import { useEffect, useRef, type ComponentPropsWithoutRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
  const initializedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartRef = useRef(0);
  const dragOriginRef = useRef(0);
  const lastPointerRef = useRef({ position: 0, time: 0 });
  const velocityRef = useRef(0);
  const inertiaRef = useRef(0);
  const suppressClickRef = useRef(false);

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
            if (!initializedRef.current) {
              positionRef.current = reverse ? -loopDistance : 0;
              track.style.transform = vertical
                ? `translateY(${positionRef.current}px)`
                : `translateX(${positionRef.current}px)`;
              initializedRef.current = true;
            }
            const direction = reverse ? 1 : -1;
            const deltaTime = (time - previousTime) / 1000;
            positionRef.current += direction * speed * deltaTime + inertiaRef.current * deltaTime;
            inertiaRef.current *= Math.exp(-2.8 * deltaTime);
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

  const getPointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => vertical ? event.clientY : event.clientX;
  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    draggingRef.current = true;
    pausedRef.current = true;
    inertiaRef.current = 0;
    velocityRef.current = 0;
    dragStartRef.current = getPointerPosition(event);
    dragOriginRef.current = positionRef.current;
    lastPointerRef.current = { position: dragStartRef.current, time: performance.now() };
    event.currentTarget.classList.add('is-dragging');
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const position = getPointerPosition(event);
    const now = performance.now();
    const elapsed = Math.max(1, now - lastPointerRef.current.time);
    const delta = position - dragStartRef.current;
    if (Math.abs(delta) > 5) suppressClickRef.current = true;
    velocityRef.current = ((position - lastPointerRef.current.position) / elapsed) * 1000;
    lastPointerRef.current = { position, time: now };
    positionRef.current = dragOriginRef.current + delta;
    const track = trackRef.current;
    if (track) {
      track.style.transform = vertical
        ? `translateY(${positionRef.current}px)`
        : `translateX(${positionRef.current}px)`;
    }
  };
  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    pausedRef.current = false;
    inertiaRef.current = Math.max(-1200, Math.min(1200, velocityRef.current * 0.35));
    event.currentTarget.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

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
      onPointerDown={startDragging}
      onPointerMove={drag}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
      onDragStart={(event) => event.preventDefault()}
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
