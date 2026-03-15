'use client';

import { useEffect, useRef } from 'react';

export default function GameLog({ log }: { log: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
      {log.map((entry, i) => (
        <div
          key={i}
          className={`py-0.5 ${
            entry.startsWith('──') ? 'text-yellow-400 font-bold mt-2' :
            entry.includes('CRASH') ? 'text-red-400 font-bold' :
            entry.includes('Perfect') ? 'text-green-400' :
            entry.includes('penalty') || entry.includes('Penalty') ? 'text-orange-400' :
            entry.includes('Blow-By') ? 'text-red-300' :
            entry.includes('Matched') ? 'text-green-300' :
            'text-gray-300'
          }`}
        >
          {entry}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
