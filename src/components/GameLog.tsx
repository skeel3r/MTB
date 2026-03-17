'use client';

import { useEffect, useRef } from 'react';

export default function GameLog({ log }: { log: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log]);

  return (
    <div ref={containerRef} className="trail-card relative p-3 h-full overflow-y-auto font-mono text-xs">
      {/* Top fade */}
      <div className="sticky top-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to bottom, #2D5016 0%, transparent 100%)' }} />
      {log.map((entry, i) => (
        <div
          key={i}
          className={`py-1 ${
            entry.startsWith('──') ? 'font-bold mt-3' :
            entry.includes('CRASH') ? 'font-bold' :
            ''
          }`}
          style={{
            color: entry.startsWith('──') ? '#D4A847'
              : entry.includes('CRASH') ? '#E07070'
              : entry.includes('Perfect') ? '#7BC47F'
              : entry.includes('penalty') || entry.includes('Penalty') ? '#E0875C'
              : entry.includes('Blow-By') ? '#E07070'
              : entry.includes('Matched') ? '#7BC47F'
              : '#E8D5B7',
          }}
        >
          {entry}
        </div>
      ))}
      {/* Bottom fade */}
      <div className="sticky bottom-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to top, #1A3A12 0%, transparent 100%)' }} />
    </div>
  );
}
