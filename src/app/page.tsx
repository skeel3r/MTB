import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen game-table text-white flex items-center justify-center p-4">
      {/* WPA Poster Frame */}
      <div className="max-w-2xl w-full mx-auto text-center px-6 sm:px-10 py-8 sm:py-12 relative"
        style={{
          border: '4px solid #D4A847',
          outline: '2px solid rgba(242,232,207,0.3)',
          outlineOffset: '6px',
        }}
      >
        {/* Corner ornaments */}
        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2" style={{ borderColor: '#D4A847' }} />
        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2" style={{ borderColor: '#D4A847' }} />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2" style={{ borderColor: '#D4A847' }} />
        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2" style={{ borderColor: '#D4A847' }} />

        {/* Mountain silhouette decorative header */}
        <svg viewBox="0 0 400 60" className="w-full max-w-md mx-auto mb-4 opacity-40" preserveAspectRatio="xMidYMid meet">
          <path d="M0 60 L60 20 L100 40 L150 10 L200 35 L250 5 L300 30 L340 15 L400 60 Z" fill="#3A6B35" />
          <path d="M0 60 L80 35 L130 50 L180 25 L240 45 L300 20 L360 40 L400 60 Z" fill="#2D5016" />
        </svg>

        <div className="uppercase tracking-[0.3em] text-xs mb-2" style={{ color: '#D4A847' }}>
          A Strategic Board Game
        </div>

        <h1 className="wpa-heading text-5xl sm:text-7xl font-black mb-2" style={{ color: '#F2E8CF' }}>
          Treadline
        </h1>

        <div className="wpa-divider max-w-xs mx-auto mb-4" />

        <p className="text-base sm:text-lg mb-8 sm:mb-10 max-w-md mx-auto leading-relaxed" style={{ color: '#B8C8A8' }}>
          Manage momentum, dodge hazards, and outpace your rivals on the mountain descent.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10">
          <Link
            href="/play"
            className="group playing-card p-6 sm:p-8 text-left"
          >
            <div className="text-3xl sm:text-4xl mb-3" style={{ color: '#C35831' }}>&#9654;</div>
            <h2 className="wpa-heading text-2xl font-bold mb-2 group-hover:text-[#C35831] transition-colors" style={{ color: '#1B2A4A' }}>
              Play Game
            </h2>
            <p className="text-sm" style={{ color: '#5C3D2E' }}>
              Set up players and play a full game with the complete rule set. Manage your grid, tackle obstacles, and race to the finish.
            </p>
          </Link>

          <Link
            href="/simulate"
            className="group playing-card p-6 sm:p-8 text-left"
          >
            <div className="text-3xl sm:text-4xl mb-3" style={{ color: '#2E6B62' }}>&#9881;</div>
            <h2 className="wpa-heading text-2xl font-bold mb-2 group-hover:text-[#2E6B62] transition-colors" style={{ color: '#1B2A4A' }}>
              Simulate
            </h2>
            <p className="text-sm" style={{ color: '#5C3D2E' }}>
              Run automated games with AI players to test balance, strategy effectiveness, and game mechanics at scale.
            </p>
          </Link>
        </div>

        {/* Quick Rules Reference */}
        <div className="trail-card p-4 sm:p-6 text-left">
          <h3 className="wpa-heading text-lg font-bold mb-4 text-center" style={{ color: '#D4A847' }}>Quick Reference</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-bold mb-2 uppercase tracking-wider text-xs" style={{ color: '#D4A847' }}>Actions (5 per Sprint)</h4>
              <div className="space-y-1" style={{ color: '#E8D5B7' }}>
                <div><span style={{ color: '#6BADE0' }}>Pedal</span> - +1 Momentum (1 Action)</div>
                <div><span style={{ color: '#E0875C' }}>Brake</span> - -1 Momentum (1 Action)</div>
                <div><span style={{ color: '#7BC47F' }}>Steer</span> - Shift 1 Token (1 Action)</div>
                <div><span style={{ color: '#B898D0' }}>Technique</span> - Play a Card (1 Action)</div>
                <div><span style={{ color: '#5CB89C' }}>Tackle</span> - Face Obstacle (Free!)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 uppercase tracking-wider text-xs" style={{ color: '#D4A847' }}>Flow Spending</h4>
              <div className="space-y-1" style={{ color: '#E8D5B7' }}>
                <div><span style={{ color: '#B898D0' }}>Ghost Copy</span> - Dupe symbol (1)</div>
                <div><span style={{ color: '#B898D0' }}>Reroll</span> - Reroll hazard dice (1)</div>
                <div><span style={{ color: '#B898D0' }}>Brace</span> - Ignore 1 push (1)</div>
                <div><span style={{ color: '#B898D0' }}>Scrub</span> - Ignore speed limit (3)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 uppercase tracking-wider text-xs" style={{ color: '#C35831' }}>Symbol Penalties</h4>
              <div className="space-y-1" style={{ color: '#E8D5B7' }}>
                <div><span style={{ color: '#E07070' }}>Grip</span> - Slide Out (Row 1 +2 lanes)</div>
                <div><span style={{ color: '#6BADE0' }}>Air</span> - Case It (-2 Momentum)</div>
                <div><span style={{ color: '#7BC47F' }}>Agility</span> - Wide Turn (away from center)</div>
                <div><span style={{ color: '#E0C860' }}>Balance</span> - Stall (no Pedal)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 uppercase tracking-wider text-xs" style={{ color: '#5CB89C' }}>Round Structure</h4>
              <div className="space-y-1 text-xs" style={{ color: '#E8D5B7' }}>
                <div>I. Scroll &amp; Descent (shift tokens)</div>
                <div>II. Commitment (choose line)</div>
                <div>III. Environment (hazards)</div>
                <div>IV. Preparation (draw cards)</div>
                <div>V. Sprint (5 actions)</div>
                <div>VI. Alignment Check</div>
                <div>VII. Reckoning (roll dice)</div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 text-center text-xs" style={{ borderTop: '1px solid #3A6B35', color: '#7A9A6A' }}>
            15 Rounds &middot; Stage Break every 3 rounds &middot; Most Progress wins
          </div>
        </div>

        {/* WPA-style footer badge */}
        <div className="mt-8 uppercase tracking-[0.25em] text-[10px]" style={{ color: '#D4A84780' }}>
          National Trail Service
        </div>
      </div>
    </div>
  );
}
