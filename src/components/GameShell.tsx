'use client';

import { GameState, GameAction } from '@/lib/types';
import TopBar from '@/components/TopBar';
import TrailPanel from '@/components/TrailPanel';
import PlayArea from '@/components/PlayArea';
import InfoPanel from '@/components/InfoPanel';
import PlayerHand from '@/components/PlayerHand';
import GameLog from '@/components/GameLog';

export default function GameShell({
  game,
  selectedPlayer,
  selectedSteerRow,
  isAI,
  effectToast,
  onAdvance,
  onAction,
  onSelectPlayer,
  onTokenSelect,
  onSteerTo,
}: {
  game: GameState;
  selectedPlayer: number;
  selectedSteerRow: number | null;
  isAI: boolean[];
  effectToast: { cardName: string; text: string; color: string } | null;
  onAdvance: () => void;
  onAction: (action: GameAction, playerIndex?: number) => void;
  onSelectPlayer: (index: number) => void;
  onTokenSelect: (row: number) => void;
  onSteerTo: (row: number, direction: number) => void;
}) {
  const currentPlayer = game.players[selectedPlayer];

  return (
    <div className="game-shell game-table text-white">
      <TopBar game={game} onAdvance={onAdvance} />
      <TrailPanel game={game} selectedPlayer={selectedPlayer} />
      <div className="game-shell-center flex flex-col min-h-0">
        {/* Mobile: inline trail info (hidden on desktop where left panel shows) */}
        <div className="md:hidden flex-shrink-0">
          <TrailPanel game={game} inline selectedPlayer={selectedPlayer} />
        </div>
        <PlayArea
          game={game}
          currentPlayer={currentPlayer}
          selectedPlayer={selectedPlayer}
          selectedSteerRow={selectedSteerRow}
          isAI={isAI}
          onAction={onAction}
          onSelectPlayer={onSelectPlayer}
          onTokenSelect={onTokenSelect}
          onSteerTo={onSteerTo}
        />
        {/* Mobile: inline game log (hidden on desktop where right panel shows) */}
        <div className="md:hidden flex-shrink-0 p-2 max-h-32 overflow-hidden relative z-0">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#8A9A7A' }}>Game Log</div>
          <div className="h-24 overflow-hidden">
            <GameLog log={game.log} />
          </div>
        </div>
      </div>
      <InfoPanel game={game} />
      <PlayerHand
        game={game}
        currentPlayer={currentPlayer}
        onAction={(a) => onAction(a)}
      />

      {/* Effect Toast */}
      {effectToast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-pulse rounded-lg px-4 py-2 border-2 flex items-center gap-3"
          style={{
            borderColor: effectToast.color,
            backgroundColor: `${effectToast.color}15`,
            boxShadow: `0 0 20px ${effectToast.color}30`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: effectToast.color, boxShadow: `0 0 8px ${effectToast.color}` }}
          />
          <div>
            <span className="font-bold text-sm" style={{ color: effectToast.color }}>{effectToast.cardName}</span>
            <span className="text-gray-300 text-sm ml-2">{effectToast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
