'use client';

import { useEffect, useRef } from 'react';

export default function GameLog({ log }: { log: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div className="trail-card relative p-3 h-64 overflow-y-auto font-mono text-xs">
      {/* Top fade */}
      <div className="sticky top-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to bottom, #3d3226 0%, transparent 100%)' }} />
      {log.map((entry, i) => (
        <div
          key={i}
          className={`py-1 ${
            entry.startsWith('──') ? 'text-yellow-400 font-bold mt-3' :
            entry.includes('CRASH') ? 'text-red-400 font-bold' :
            entry.includes('Perfect') ? 'text-green-400' :
            entry.includes('penalty') || entry.includes('Penalty') ? 'text-orange-400' :
            entry.includes('Blow-By') ? 'text-red-300' :
            entry.includes('Matched') ? 'text-green-300' :
            'text-[#e8dcc8]'
          }`}
        >
          {entry}
        </div>
      ))}
      <div ref={endRef} />
      {/* Bottom fade */}
      <div className="sticky bottom-0 left-0 right-0 h-4 pointer-events-none" style={{ background: 'linear-gradient(to top, #2a2218 0%, transparent 100%)' }} />
    </div>
  );
}
