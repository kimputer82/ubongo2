/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { PIECES, Piece } from "../types.js";
import { motion } from "motion/react";
import { synth } from "../utils/audio.js";

interface PieceTrayProps {
  pieceIds: number[];
  selectedPieceId: number | null;
  placedPieceIds: number[];
  onSelect: (pieceId: number) => void;
  rotatedCells: { [key: number]: [number, number][] };
  onDragStart?: (pieceId: number, e: React.PointerEvent) => void;
}

export const PieceTray: React.FC<PieceTrayProps> = ({
  pieceIds,
  selectedPieceId,
  placedPieceIds,
  onSelect,
  rotatedCells,
  onDragStart,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black tracking-widest text-high-black/60 uppercase font-mono">
          사용 가능한 조각 (YOUR TRAY)
        </h3>
        <span className="text-[10px] text-high-black/40 font-bold uppercase tracking-wider font-mono">
          *클릭 또는 드래그하여 배치하세요
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pieceIds.map((pId) => {
          const piece = PIECES.find((p) => p.id === pId);
          if (!piece) return null;

          const isSelected = selectedPieceId === pId;
          const isPlaced = placedPieceIds.includes(pId);
          const cells = rotatedCells[pId] || piece.cells;

          // Find piece bounding box to render centered
          const maxR = Math.max(...cells.map(([r]) => r));
          const maxC = Math.max(...cells.map(([_, c]) => c));
          const rows = maxR + 1;
          const cols = maxC + 1;

          return (
            <motion.button
              key={pId}
              onPointerDown={(e) => {
                if (isPlaced) return;
                synth.playClick();
                onSelect(pId);
                if (onDragStart) {
                  onDragStart(pId, e);
                }
              }}
              whileHover={{ scale: isPlaced ? 1 : 1.03 }}
              whileTap={{ scale: isPlaced ? 1 : 0.98 }}
              className={`relative flex flex-col items-center justify-between p-4 h-36 rounded-2xl border-2 transition-all duration-300 touch-none select-none ${
                isPlaced
                  ? "bg-high-alpha border-high-black/10 opacity-40 cursor-default"
                  : isSelected
                  ? "bg-art-accent/15 border-high-black shadow-[4px_4px_10px_rgba(0,0,0,0.15)] ring-4 ring-high-black/10 cursor-grab active:cursor-grabbing"
                  : "bg-high-surface border-high-black hover:bg-high-alpha shadow-[3px_3px_8px_rgba(0,0,0,0.12)] hover:shadow-[1px_1px_4px_rgba(0,0,0,0.08)] cursor-grab active:cursor-grabbing"
              }`}
            >
              {/* Placement badge */}
              {isPlaced && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-100 border-2 border-emerald-600 text-emerald-800 text-[9px] font-black rounded-lg uppercase tracking-widest font-mono">
                  PLACED
                </div>
              )}

              {/* Centered Piece Shape Preview */}
              <div className="flex-1 flex items-center justify-center">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: rows }).map((_, rIdx) =>
                    Array.from({ length: cols }).map((_, cIdx) => {
                      const isPart = cells.some(([r, c]) => r === rIdx && c === cIdx);
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={`w-4 h-4 rounded-md transition-all duration-300 ${
                            isPart
                              ? `${piece.color} border border-black/20 shadow-[inset_0_2px_0_rgba(255,255,255,0.4)]`
                              : "bg-transparent"
                          }`}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Label */}
              <div className="mt-2 text-center korean-wrap">
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    isPlaced ? "text-high-black/30" : isSelected ? "text-high-black underline decoration-art-accent decoration-2" : "text-high-black"
                  }`}
                >
                  {piece.name.split(" ")[2] || piece.name}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
