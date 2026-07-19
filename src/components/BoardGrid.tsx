/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Board, PlacedPiece, PIECES, hasCell } from "../types.js";
import { synth } from "../utils/audio.js";

interface BoardGridProps {
  board: Board;
  placedPieces: PlacedPiece[];
  selectedPieceId: number | null;
  selectedPieceCells: [number, number][] | null;
  onPlacePiece: (pieceId: number, r: number, c: number) => void;
  onRemovePiece: (pieceId: number) => void;
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  board,
  placedPieces,
  selectedPieceId,
  selectedPieceCells,
  onPlacePiece,
  onRemovePiece,
}) => {
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number } | null>(null);
  // Track raw mouse position over the grid container for the floating overlay
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { width, height, targetCells } = board;

  // Convert target cells list to string set for O(1) checks
  const targetKeySet = new Set(targetCells.map(([r, c]) => `${r},${c}`));

  // Helper to check if a cell is in target area
  const isTargetCell = (r: number, c: number) => targetKeySet.has(`${r},${c}`);

  // Find which placed piece covers a cell
  const getCoveringPiece = (r: number, c: number): PlacedPiece | undefined => {
    return placedPieces.find((placed) =>
      placed.cells.some(([pr, pc]) => placed.r + pr === r && placed.c + pc === c)
    );
  };

  // --- Compute bounding box & center offset for the selected piece ---
  // So that the cursor is positioned at the center of the piece's bounding rectangle.
  let centerOffsetR = 0;
  let centerOffsetC = 0;
  let pieceBBoxRows = 0;
  let pieceBBoxCols = 0;

  if (selectedPieceCells && selectedPieceCells.length > 0) {
    const minR = Math.min(...selectedPieceCells.map(([r]) => r));
    const maxR = Math.max(...selectedPieceCells.map(([r]) => r));
    const minC = Math.min(...selectedPieceCells.map(([_, c]) => c));
    const maxC = Math.max(...selectedPieceCells.map(([_, c]) => c));
    pieceBBoxRows = maxR - minR + 1;
    pieceBBoxCols = maxC - minC + 1;
    // Center of bounding box in piece-local coordinates
    centerOffsetR = Math.floor((minR + maxR) / 2);
    centerOffsetC = Math.floor((minC + maxC) / 2);
  }

  // The "anchor" cell on the board: cursor cell adjusted by center offset
  const getAnchorCell = (hoverR: number, hoverC: number) => {
    return {
      r: hoverR - centerOffsetR,
      c: hoverC - centerOffsetC,
    };
  };

  // Calculate if the ghost preview fits perfectly
  let isValidPlacement = false;
  let ghostCoveredCells: [number, number][] = [];
  let anchorCell: { r: number; c: number } | null = null;

  if (selectedPieceId !== null && selectedPieceCells && hoveredCell) {
    anchorCell = getAnchorCell(hoveredCell.r, hoveredCell.c);
    const { r: ar, c: ac } = anchorCell;
    isValidPlacement = true;
    ghostCoveredCells = [];

    // Find other placed pieces (excluding the currently active piece if it was placed elsewhere)
    const otherPlacedPieces = placedPieces.filter((p) => p.pieceId !== selectedPieceId);

    for (const [pr, pc] of selectedPieceCells) {
      const boardR = ar + pr;
      const boardC = ac + pc;
      const key = `${boardR},${boardC}`;

      // 1. Must be a target cell on the board
      if (!targetKeySet.has(key)) {
        isValidPlacement = false;
        // Don't break — we still want to collect ghost cells for visualization
      } else {
        // 2. Must not overlap other placed pieces
        const isOverlapping = otherPlacedPieces.some((placed) =>
          placed.cells.some(([ppr, ppc]) => placed.r + ppr === boardR && placed.c + ppc === boardC)
        );
        if (isOverlapping) {
          isValidPlacement = false;
        }
      }

      ghostCoveredCells.push([boardR, boardC]);
    }
  }

  // Handle cell clicks
  const handleCellClick = (r: number, c: number) => {
    // First check if there is an already placed piece on the clicked cell.
    // If so, remove/retrieve it regardless of whether a piece is selected.
    const covering = getCoveringPiece(r, c);
    if (covering) {
      onRemovePiece(covering.pieceId);
      synth.playClick();
      return;
    }

    if (selectedPieceId !== null) {
      // Trying to PLACE the selected piece
      if (isValidPlacement && anchorCell) {
        onPlacePiece(selectedPieceId, anchorCell.r, anchorCell.c);
        synth.playPlace();
      } else {
        synth.playClick(); // play error-ish click
      }
    }
  };

  // Track mouse position relative to the grid wrapper for the floating overlay
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridContainerRef.current) return;
    const rect = gridContainerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCell(null);
  };

  // --- Floating overlay: measure cell size from the grid ---
  // We need to know cell pixel size & grid top-left offset within the container.
  // We use a ref callback to measure a sample cell.
  const [cellSize, setCellSize] = useState<{ w: number; h: number; gap: number } | null>(null);
  const [gridOffset, setGridOffset] = useState<{ top: number; left: number } | null>(null);

  // Measure on each render (piece/board change)
  useEffect(() => {
    // Measure after layout
    const measure = () => {
      if (!gridContainerRef.current) return;
      const containerRect = gridContainerRef.current.getBoundingClientRect();
      // Find any rendered cell div
      const firstCell = gridContainerRef.current.querySelector<HTMLElement>("[data-cell]");
      if (!firstCell) return;
      const cellRect = firstCell.getBoundingClientRect();
      const w = cellRect.width;
      const h = cellRect.height;
      // gap: find second cell in same row
      const secondCell = gridContainerRef.current.querySelector<HTMLElement>("[data-cell='0-1']");
      let gapX = 8; // default 2 (gap-2 = 8px)
      if (secondCell) {
        const r2 = secondCell.getBoundingClientRect();
        gapX = r2.left - cellRect.right;
      }
      const offsetLeft = cellRect.left - containerRect.left;
      const offsetTop = cellRect.top - containerRect.top;
      setCellSize({ w, h, gap: gapX });
      setGridOffset({ top: offsetTop, left: offsetLeft });
    };
    // Small delay to let the grid render
    const timeout = setTimeout(measure, 50);
    return () => clearTimeout(timeout);
  }, [board, selectedPieceId]);

  // Compute floating overlay position & cells
  const activePieceInfo = selectedPieceId ? PIECES.find((p) => p.id === selectedPieceId) : null;

  // Build floating ghost overlay tiles
  const floatingTiles: { x: number; y: number; isValid: boolean; pr: number; pc: number }[] = [];

  if (
    selectedPieceId !== null &&
    selectedPieceCells &&
    hoveredCell !== null &&
    anchorCell !== null &&
    cellSize &&
    gridOffset
  ) {
    const { w, h, gap } = cellSize;
    const stride = w + gap;
    const strideH = h + gap;
    const { r: ar, c: ac } = anchorCell;

    for (const [pr, pc] of selectedPieceCells) {
      const boardR = ar + pr;
      const boardC = ac + pc;
      const isInGrid = boardR >= 0 && boardR < height && boardC >= 0 && boardC < width;
      const isTargetHere = targetKeySet.has(`${boardR},${boardC}`);
      const isOnGrid = isInGrid && isTargetHere;

      const x = gridOffset.left + boardC * stride;
      const y = gridOffset.top + boardR * strideH;
      floatingTiles.push({ x, y, isValid: isValidPlacement, pr, pc });
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6 p-6 bg-high-surface high-border rounded-[32px] high-shadow relative overflow-visible">
      <div className="text-center korean-wrap">
        <h2 className="text-2xl font-display font-black text-high-black tracking-tight">{board.name}</h2>
        <div className="flex items-center justify-center mt-2">
          {board.difficulty === "EASY" && (
            <span className="bg-emerald-100 border-2 border-high-black text-emerald-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-sm">
              🟢 EASY (3 PIECES)
            </span>
          )}
          {board.difficulty === "MEDIUM" && (
            <span className="bg-amber-100 border-2 border-high-black text-amber-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-sm">
              🟡 MEDIUM (4 PIECES)
            </span>
          )}
          {board.difficulty === "HARD" && (
            <span className="bg-red-100 border-2 border-high-black text-red-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-sm">
              🔴 HARD (4 PIECES)
            </span>
          )}
        </div>
      </div>

      {/* Grid Container — position:relative so floating overlay is anchored here */}
      <div
        ref={gridContainerRef}
        className="relative p-8 bg-high-alpha rounded-[24px] border-2 border-high-black"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="grid gap-2 select-none"
          style={{
            gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
            gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: height }).map((_, rIdx) =>
            Array.from({ length: width }).map((_, cIdx) => {
              const isTarget = isTargetCell(rIdx, cIdx);
              const placed = getCoveringPiece(rIdx, cIdx);
              // Ghost: only show in-grid ghost cells (overlay handles out-of-grid)
              const isGhost = ghostCoveredCells.some(([gr, gc]) => gr === rIdx && gc === cIdx);

              // Get actual piece style if covered
              const pieceInfo = placed ? PIECES.find((p) => p.id === placed.pieceId) : null;

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  data-cell={`${rIdx}-${cIdx}`}
                  onMouseEnter={() => setHoveredCell({ r: rIdx, c: cIdx })}
                  onClick={() => handleCellClick(rIdx, cIdx)}
                  className={`
                    w-10 h-10 md:w-14 md:h-14 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer
                    ${
                      !isTarget
                        ? "bg-transparent text-transparent" // off-grid
                        : placed && pieceInfo
                        ? `${pieceInfo.color} border-2 border-high-black text-white shadow-[inset_0_4px_0_rgba(255,255,255,0.4)] font-black text-lg` // covered by placed piece
                        : isGhost && activePieceInfo
                        ? `${activePieceInfo.color}/60 border-2 border-dashed ${
                            isValidPlacement ? "border-emerald-600 bg-emerald-100/30" : "border-red-600 bg-red-100/30"
                          } animate-pulse` // hovered ghost preview (in-grid)
                        : "bg-high-surface border-2 border-high-black/20 hover:border-high-black hover:bg-high-alpha" // blank target shape cell
                    }
                  `}
                >
                  {/* Subtle inner grid marks for blank cells */}
                  {isTarget && !placed && !isGhost && (
                    <div className="w-1.5 h-1.5 rounded-full bg-high-black/30" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Floating piece overlay — renders ghost tiles even outside grid target cells */}
        {floatingTiles.length > 0 && activePieceInfo && cellSize && (
          <>
            {floatingTiles.map(({ x, y, isValid }, idx) => (
              <div
                key={idx}
                className={`
                  absolute rounded-xl pointer-events-none z-30 border-2 border-dashed transition-none
                  ${activePieceInfo.color}/70
                  ${isValid ? "border-emerald-500" : "border-red-500"}
                  animate-pulse
                `}
                style={{
                  left: x,
                  top: y,
                  width: cellSize.w,
                  height: cellSize.h,
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Guide controls */}
      <div className="flex flex-col gap-3 text-center w-full bg-high-alpha p-4 rounded-2xl border-2 border-high-black/25">
        <div className="text-xs korean-wrap font-semibold text-high-black">
          {selectedPieceId !== null ? (
            <p className="animate-pulse text-high-black font-black tracking-tight">
              🧩 조각 배치 모드: 원하는 그리드 칸을 선택하여 배치하세요.
            </p>
          ) : (
            <p className="text-high-black/70 font-medium">배치된 조각을 클릭하면 다시 손으로 회수합니다.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-high-black/60 font-black uppercase tracking-wider font-mono">
          <span className="bg-high-surface px-2 py-1 rounded border border-high-black/20">R: 회전</span>
          <span className="bg-high-surface px-2 py-1 rounded border border-high-black/20">F: 대칭</span>
          <span className="bg-high-surface px-2 py-1 rounded border border-high-black/20">ESC: 해제</span>
        </div>
      </div>
    </div>
  );
};
