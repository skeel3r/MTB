import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-4 sm:px-8 py-8">
        <h1 className="text-4xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          The Descent
        </h1>
        <p className="text-lg sm:text-xl text-gray-400 mb-8 sm:mb-12">
          A strategic downhill racing board game. Manage momentum, dodge hazards, and outpace your rivals.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <Link
            href="/play"
            className="group bg-gray-800 border border-gray-700 rounded-xl p-6 sm:p-8 hover:border-emerald-500 transition-all hover:bg-gray-800/80"
          >
            <div className="text-3xl sm:text-4xl mb-3">&#9654;</div>
            <h2 className="text-2xl font-bold mb-2 group-hover:text-emerald-400 transition-colors">
              Play Game
            </h2>
            <p className="text-gray-400 text-sm">
              Set up players and play a full game with the complete rule set. Manage your grid, tackle obstacles, and race to the finish.
            </p>
          </Link>

          <Link
            href="/simulate"
            className="group bg-gray-800 border border-gray-700 rounded-xl p-6 sm:p-8 hover:border-cyan-500 transition-all hover:bg-gray-800/80"
          >
            <div className="text-3xl sm:text-4xl mb-3">&#9881;</div>
            <h2 className="text-2xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">
              Simulate
            </h2>
            <p className="text-gray-400 text-sm">
              Run automated games with AI players to test balance, strategy effectiveness, and game mechanics at scale.
            </p>
          </Link>
        </div>

        {/* Quick Rules Reference */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 sm:p-6 text-left">
          <h3 className="text-lg font-bold mb-4 text-center">Quick Reference</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-bold text-yellow-400 mb-2">Actions (5 per Sprint)</h4>
              <div className="space-y-1 text-gray-300">
                <div><span className="text-blue-400">Pedal</span> - +1 Momentum (1 Action)</div>
                <div><span className="text-orange-400">Brake</span> - -1 Momentum (1 Action)</div>
                <div><span className="text-green-400">Steer</span> - Shift 1 Token (1 Action)</div>
                <div><span className="text-purple-400">Technique</span> - Play a Card (1 Action)</div>
                <div><span className="text-emerald-400">Tackle</span> - Face Obstacle (Free!)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-yellow-400 mb-2">Flow Spending</h4>
              <div className="space-y-1 text-gray-300">
                <div><span className="text-purple-400">Ghost Copy</span> - Dupe symbol (1)</div>
                <div><span className="text-purple-400">Reroll</span> - Reroll hazard dice (1)</div>
                <div><span className="text-purple-400">Brace</span> - Ignore 1 push (1)</div>
                <div><span className="text-purple-400">Scrub</span> - Ignore speed limit (3)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-red-400 mb-2">Symbol Penalties</h4>
              <div className="space-y-1 text-gray-300">
                <div><span className="text-red-300">Grip</span> - Slide Out (Row 1 +2 lanes)</div>
                <div><span className="text-blue-300">Air</span> - Case It (-2 Momentum)</div>
                <div><span className="text-green-300">Agility</span> - Wide Turn (away from center)</div>
                <div><span className="text-yellow-300">Balance</span> - Stall (no Pedal)</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-emerald-400 mb-2">Round Structure</h4>
              <div className="space-y-1 text-gray-300 text-xs">
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

          <div className="mt-4 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
            15 Rounds &middot; Stage Break every 3 rounds &middot; Most Progress wins
          </div>
        </div>
      </div>
    </div>
  );
}
