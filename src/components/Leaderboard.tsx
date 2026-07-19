/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Player, RoomState, BOARDS, SOLO_BOARDS, PIECES } from "../types.js";
import { CheckCircle2, AlertCircle, Sparkles, Trash2 } from "lucide-react";
import { motion } from "motion/react";

interface LeaderboardProps {
  roomState: RoomState;
  currentPlayerId: string;
  onKickPlayer?: (playerId: string) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  roomState,
  currentPlayerId,
  onKickPlayer,
}) => {
  const currentBoard = BOARDS.find((b) => b.id === roomState.currentBoardId);
  const self = roomState.players.find((p) => p.id === currentPlayerId);
  const isSelfHost = self?.isHost || false;

  // Find ranks based on scores
  const sortedPlayersByScore = [...roomState.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-4 bg-high-surface high-border p-5 rounded-3xl high-shadow">
      <div className="flex items-center justify-between border-b-2 border-high-black pb-3">
        <h3 className="text-xs font-black tracking-wider text-high-black/60 uppercase flex items-center gap-2 font-mono">
          <span>🏆 LIVE RANKING & PROGRESS</span>
        </h3>
        <span className="text-[10px] text-high-black/60 font-black font-mono">
          PLAYERS: {roomState.players.length}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {sortedPlayersByScore.map((player, index) => {
          const isCurrentPlayer = player.id === currentPlayerId;
          const isBot = player.id.startsWith("bot_");
          const hasSolved = player.solved;
          
          // Rank style
          let rankBadge = `${index + 1}위`;
          if (index === 0) rankBadge = "🥇";
          else if (index === 1) rankBadge = "🥈";
          else if (index === 2) rankBadge = "🥉";

          if (player.isTeacher) {
            return (
              <motion.div
                key={player.id}
                className="p-3.5 bg-high-alpha/30 border-2 border-dashed border-high-black/20 rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-high-black/60 flex items-center gap-1.5 font-sans">
                    🎓 {player.name} (교사/호스트)
                  </span>
                </div>
                <span className="text-[9px] bg-high-black text-white px-2 py-0.5 rounded-full font-black">관제</span>
              </motion.div>
            );
          }

          const isSolo = roomState.gameMode === "SOLO";
          const playerBoard = isSolo
            ? SOLO_BOARDS[(player.soloRound || 1) - 1]
            : currentBoard;

          return (
            <motion.div
              key={player.id}
              layoutId={`player-${player.id}`}
              className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all duration-300 ${
                isCurrentPlayer
                  ? "bg-art-accent/15 border-high-black shadow-[3px_3px_8px_rgba(0,0,0,0.12)]"
                  : (isSolo ? (player.soloSolved ? "bg-emerald-50 border-emerald-600" : "bg-high-surface border-high-black/20") : (hasSolved ? "bg-emerald-50 border-2 border-emerald-600 shadow-sm" : "bg-high-surface border-high-black/20"))
              }`}
            >
              {/* Player Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-base font-black font-mono w-6 text-center">{rankBadge}</span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-sm font-black tracking-tight ${
                          isCurrentPlayer ? "text-high-black underline decoration-art-accent decoration-2" : "text-high-black"
                        }`}
                      >
                        {player.name}
                      </span>
                      {isCurrentPlayer && (
                        <span className="text-[9px] bg-high-black text-white px-1.5 py-0.5 rounded font-black">
                          나
                        </span>
                      )}
                      {player.isHost && (
                        <span className="text-[9px] bg-high-alpha border border-high-black/20 text-high-black/80 px-1.5 py-0.5 rounded font-black font-mono">
                          방장
                        </span>
                      )}
                      {isBot && (
                        <span className="text-[9px] bg-purple-100 border border-purple-300 text-purple-800 px-1.5 py-0.5 rounded font-black">
                          AI 봇
                        </span>
                      )}
                    </div>
                    {/* Score (Gem points) */}
                    <span className="text-xs text-high-black/70 font-semibold mt-0.5 flex items-center gap-1">
                      💎 <strong className="text-high-black font-black">{player.score}</strong> Gems
                    </span>
                  </div>
                </div>

                {/* Solving Status / Solver check */}
                <div className="flex items-center gap-2">
                  {isSolo ? (
                    player.soloCompleted ? (
                      <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                        🏆 정복 완료!
                      </span>
                    ) : player.soloSolved ? (
                      <span className="text-xs font-black text-emerald-600 flex items-center gap-1 font-mono">
                        ✅ {player.soloRound}단계 완료
                      </span>
                    ) : (
                      <span className="text-[10px] text-high-black font-black uppercase tracking-wider animate-pulse flex items-center gap-1 bg-art-accent/30 border-2 border-high-black px-2 py-0.5 rounded-full font-mono">
                        ⏳ Stage {player.soloRound}
                      </span>
                    )
                  ) : hasSolved ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> UBONGO!
                      </span>
                      {player.solvedTime && (
                        <span className="text-[10px] text-high-black/40 font-mono font-bold mt-0.5">
                          {(player.solvedTime / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  ) : roomState.state === "PLAYING" ? (
                    <span className="text-[10px] text-high-black font-black uppercase tracking-wider animate-pulse flex items-center gap-1 bg-art-accent/30 border-2 border-high-black px-2 py-0.5 rounded-full font-mono">
                      <AlertCircle className="w-3.5 h-3.5 text-high-black" /> SOLVING
                    </span>
                  ) : (
                    <span className="text-xs text-high-black/40 font-bold font-mono">WAIT</span>
                  )}

                  {/* Kick Button (Only Host can kick other players/bots in lobby) */}
                  {isSelfHost && !isCurrentPlayer && roomState.state === "LOBBY" && onKickPlayer && (
                    <button
                      onClick={() => onKickPlayer(player.id)}
                      className="p-1 hover:bg-red-100 border border-transparent hover:border-red-500 rounded-lg text-high-black/40 hover:text-red-600 transition-all cursor-pointer"
                      title="강퇴하기"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Real-time Opponent Board Miniature Preview — disabled in competition mode to prevent cheating */}
              {roomState.state === "PLAYING" && playerBoard && !isCurrentPlayer && isSolo && (
                <div className="mt-1 border-t-2 border-high-black/5 pt-2 flex items-center gap-2">
                  <span className="text-[10px] text-high-black/50 font-black uppercase tracking-wider font-mono">MINI BOARD:</span>
                  <div
                    className="grid gap-[2px] bg-high-alpha p-1.5 rounded-lg border-2 border-high-black/50"
                    style={{
                      gridTemplateRows: `repeat(${playerBoard.height}, minmax(0, 1fr))`,
                      gridTemplateColumns: `repeat(${playerBoard.width}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: playerBoard.height }).map((_, rIdx) =>
                      Array.from({ length: playerBoard.width }).map((_, cIdx) => {
                        const isTarget = playerBoard.targetCells.some(
                          ([br, bc]) => br === rIdx && bc === cIdx
                        );

                        // Find if covered in opponent's placedPieces list
                        const placed = player.placedPieces.find((placed) =>
                          placed.cells.some(
                            ([pr, pc]) => placed.r + pr === rIdx && placed.c + pc === cIdx
                          )
                        );
                        const pieceInfo = placed ? PIECES.find((p) => p.id === placed.pieceId) : null;

                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            className={`w-3 h-3 rounded-[3px] border-[1px] border-black/10 ${
                              !isTarget
                                ? "bg-transparent border-transparent"
                                : placed && pieceInfo
                                ? `${pieceInfo.color} shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]`
                                : "bg-high-surface"
                            }`}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
