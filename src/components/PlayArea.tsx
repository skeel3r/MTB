'use client';

import { GameState, GameAction, PlayerState } from '@/lib/types';
import { getTrailStageCheckedRows, getTrailStageTargetLanes } from '@/lib/cards';
import GameBoard from '@/components/GameBoard';
import ObstacleZone from '@/components/ObstacleZone';
import ActionBar from '@/components/ActionBar';
import CommitmentOverlay from '@/components/overlays/CommitmentOverlay';
import ReckoningOverlay from '@/components/overlays/ReckoningOverlay';
import StageBreakOverlay from '@/components/overlays/StageBreakOverlay';
import PhaseInfoOverlay from '@/components/overlays/PhaseInfoOverlay';

function PlayerSeat({
  player,
  isSelected,
  canSteer,
  selectedSteerRow,
  checkedRows,
  targetLanes,
  onSelect,
  onTokenSelect,
  onSteerTo,
}: {
  player: PlayerState;
  isSelected: boolean;
  canSteer: boolean;
  selectedSteerRow: number | null;
  checkedRows?: number[];
  targetLanes?: number[];
  onSelect: () => void;
  onTokenSelect: (row: number) => void;
  onSteerTo: (row: number, direction: number) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-lg p-2 transition-all border-2 flex-shrink-0"
      style={
        isSelected
          ? { borderColor: '#D4A847', background: 'rgba(212,168,71,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }
          : { borderColor: '#8B5E3C', background: 'rgba(27,42,74,0.3)' }
      }
    >
      <GameBoard
        player={player}
        checkedRows={checkedRows}
        targetLanes={targetLanes}
        compact
        steerEnabled={canSteer}
        selectedSteerRow={selectedSteerRow}
        onTokenSelect={onTokenSelect}
        onSteerTo={onSteerTo}
      />
      {/* Mini stats */}
      <div className="grid grid-cols-4 gap-1 mt-1.5 text-center text-[9px]">
        <div><span className="font-bold" style={{ color: '#7BC47F' }}>{player.progress}</span> <span style={{ color: '#A08A6A' }}>P</span></div>
        <div><span className="font-bold" style={{ color: '#6BADE0' }}>{player.momentum}</span> <span style={{ color: '#A08A6A' }}>M</span></div>
        <div><span className="font-bold" style={{ color: '#B898D0' }}>{player.flow}</span> <span style={{ color: '#A08A6A' }}>F</span></div>
        <div><span className="font-bold" style={{ color: '#E07070' }}>{player.hazardDice}</span> <span style={{ color: '#A08A6A' }}>H</span></div>
      </div>
      {player.commitment && (
        <div className="text-center text-[8px] mt-0.5 font-bold" style={{ color: player.commitment === 'pro' ? '#E07070' : '#A08A6A' }}>
          {player.commitment === 'pro' ? 'PRO' : 'Main'}
        </div>
      )}
    </div>
  );
}

export default function PlayArea({
  game,
  currentPlayer,
  selectedPlayer,
  selectedSteerRow,
  isAI,
  onAction,
  onSelectPlayer,
  onTokenSelect,
  onSteerTo,
}: {
  game: GameState;
  currentPlayer: PlayerState;
  selectedPlayer: number;
  selectedSteerRow: number | null;
  isAI: boolean[];
  onAction: (action: GameAction, playerIndex?: number) => void;
  onSelectPlayer: (index: number) => void;
  onTokenSelect: (row: number) => void;
  onSteerTo: (row: number, direction: number) => void;
}) {
  const checkedRows = game.activeTrailCard ? getTrailStageCheckedRows(game.activeTrailCard) : undefined;
  const targetLanes = game.activeTrailCard ? getTrailStageTargetLanes(game.activeTrailCard) : undefined;
  const hasPending = game.activeObstacles.length > 0;

  // Determine if we need a phase overlay
  const showCommitment = game.phase === 'commitment';
  const showReckoning = game.phase === 'reckoning';
  const showStageBreak = game.phase === 'stage_break';
  const showPhaseInfo = ['setup', 'scroll_descent', 'environment', 'preparation', 'alignment'].includes(game.phase);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 p-2 gap-2">
      {/* Player boards row */}
      <div className="flex gap-2 justify-center flex-wrap flex-shrink-0">
        {game.players.map((player, i) => {
          const isSelected = i === selectedPlayer;
          const canSteer =
            isSelected &&
            game.phase === 'sprint' &&
            currentPlayer.actionsRemaining >= 1 &&
            !currentPlayer.turnEnded &&
            !currentPlayer.crashed &&
            !hasPending;
          return (
            <PlayerSeat
              key={player.id}
              player={player}
              isSelected={isSelected}
              canSteer={canSteer}
              selectedSteerRow={isSelected ? selectedSteerRow : null}
              checkedRows={checkedRows}
              targetLanes={targetLanes}
              onSelect={() => onSelectPlayer(i)}
              onTokenSelect={onTokenSelect}
              onSteerTo={onSteerTo}
            />
          );
        })}
      </div>

      {/* Below the boards: show either sprint controls or phase info */}
      {game.phase === 'sprint' ? (
        <>
          <div className="flex justify-center flex-shrink-0">
            <ObstacleZone
              game={game}
              currentPlayer={currentPlayer}
              onAction={(a) => onAction(a)}
            />
          </div>
          <div className="flex justify-center flex-shrink-0">
            <ActionBar
              game={game}
              currentPlayer={currentPlayer}
              hasPendingObstacle={hasPending}
              onAction={(a) => onAction(a)}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto p-2">
          {showCommitment && (
            <CommitmentOverlay
              currentPlayer={currentPlayer}
              onAction={(a) => onAction(a)}
            />
          )}
          {showReckoning && <ReckoningOverlay game={game} />}
          {showStageBreak && <StageBreakOverlay game={game} onAction={onAction} />}
          {showPhaseInfo && <PhaseInfoOverlay game={game} />}
        </div>
      )}
    </div>
  );
}
