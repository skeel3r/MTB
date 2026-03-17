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
      <div className="sticky top-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to bottom, #f8f6f2 0%, transparent 100%)' }} />
      {log.map((entry, i) => (
        <div
          key={i}
          className={`py-1 ${
            entry.startsWith('──') ? 'text-amber-600 font-bold mt-3' :
            entry.includes('CRASH') ? 'text-red-600 font-bold' :
            entry.includes('Perfect') ? 'text-emerald-600' :
            entry.includes('penalty') || entry.includes('Penalty') ? 'text-orange-500' :
            entry.includes('Blow-By') ? 'text-red-400' :
            entry.includes('Matched') ? 'text-emerald-500' :
            'text-gray-600'
          }`}
        >
          {entry}
        </div>
      ))}
      {/* Bottom fade */}
      <div className="sticky bottom-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to top, #eee9e0 0%, transparent 100%)' }} />
    </div>
  );
}
