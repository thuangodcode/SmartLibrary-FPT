import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './AnimatedCalendar.css';

export type AnimatedCalendarMode = 'multiple' | 'range' | 'single';

interface AnimatedCalendarProps {
  mode?: AnimatedCalendarMode;
  value: Date[];
  onChange: (dates: Date[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const formatDate = (date: Date) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

export function AnimatedCalendar({
  mode = 'multiple',
  value,
  onChange,
  placeholder = 'Chọn ngày',
  ariaLabel = placeholder,
  className = '',
}: AnimatedCalendarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = value[0] ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  }, [visibleMonth]);

  const label = mode === 'range'
    ? value.length > 1 ? `${formatDate(value[0])} – ${formatDate(value[1])}` : value.length ? `${formatDate(value[0])} – Chọn ngày kết thúc` : placeholder
    : value.length ? value.map(formatDate).join(', ') : placeholder;

  const selectDate = (date: Date) => {
    const selectedDate = startOfDay(date);
    if (mode === 'single') {
      onChange([selectedDate]);
      setOpen(false);
      return;
    }
    if (mode === 'multiple') {
      const exists = value.some((item) => dateKey(item) === dateKey(selectedDate));
      onChange(exists
        ? value.filter((item) => dateKey(item) !== dateKey(selectedDate))
        : [...value, selectedDate].sort((a, b) => a.getTime() - b.getTime()));
      return;
    }
    if (value.length !== 1) {
      onChange([selectedDate]);
      return;
    }
    const [start] = value;
    onChange(start <= selectedDate ? [start, selectedDate] : [selectedDate, start]);
    setOpen(false);
  };

  return (
    <div className={`animated-calendar ${className}`} ref={rootRef}>
      <button className="animated-calendar-trigger" type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <CalendarDays size={17} aria-hidden="true" />
        <span className={value.length ? '' : 'is-placeholder'}>{label}</span>
        {mode === 'multiple' && value.length > 0 && <b>{value.length}</b>}
      </button>
      {open && (
        <div className="animated-calendar-popover" role="dialog" aria-label="Lịch chọn ngày">
          <div className="animated-calendar-heading">
            <button type="button" aria-label="Tháng trước" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18}/></button>
            <strong>{new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(visibleMonth)}</strong>
            <button type="button" aria-label="Tháng sau" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18}/></button>
          </div>
          {mode === 'range' && <p className="animated-calendar-hint">{value.length === 1 ? 'Chọn ngày kết thúc' : 'Chọn ngày bắt đầu và ngày kết thúc'}</p>}
          <div className="animated-calendar-grid" role="grid">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((weekday) => <span className="weekday" key={weekday} role="columnheader">{weekday}</span>)}
            {days.map((day) => {
              const selected = value.some((item) => dateKey(item) === dateKey(day));
              const inRange = mode === 'range' && value.length === 2 && day > value[0] && day < value[1];
              const isToday = dateKey(day) === dateKey(new Date());
              return <button
                key={dateKey(day)}
                className={`animated-calendar-day${day.getMonth() !== visibleMonth.getMonth() ? ' outside' : ''}${selected ? ' selected' : ''}${inRange ? ' in-range' : ''}${isToday ? ' today' : ''}`}
                type="button"
                role="gridcell"
                aria-pressed={selected}
                aria-label={formatDate(day)}
                onClick={() => selectDate(day)}
              >{day.getDate()}</button>;
            })}
          </div>
          <div className="animated-calendar-footer">
            <span>{mode === 'multiple' ? `${value.length} ngày đã chọn` : mode === 'range' && value.length === 2 ? `${value.length} mốc ngày` : 'Chọn ngày trên lịch'}</span>
            {value.length > 0 && <button type="button" onClick={() => onChange([])}>Xóa chọn</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default AnimatedCalendar;
