/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PIECES, Board, BOARDS } from "../types.js";

// Rotate cells by 90 degrees
function rotatePiece(cells: [number, number][]): [number, number][] {
  return cells.map(([r, c]) => [c, -r] as [number, number]);
}

// Flip cells horizontally
function flipPiece(cells: [number, number][]): [number, number][] {
  return cells.map(([r, c]) => [r, -c] as [number, number]);
}

// Normalize cells so min row is 0, min col is 0, and sort them
function normalizePiece(cells: [number, number][]): [number, number][] {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([_, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// Get all unique rotated and flipped variants of cells
function getAllVariants(cells: [number, number][]): [number, number][][] {
  const variants: [number, number][][] = [];
  let current = cells;
  for (let i = 0; i < 4; i++) {
    current = rotatePiece(current);
    variants.push(normalizePiece(current));
    variants.push(normalizePiece(flipPiece(current)));
  }

  // Deduplicate variants
  const uniqueVariants: [number, number][][] = [];
  for (const v of variants) {
    const isDup = uniqueVariants.some((uv) => {
      if (uv.length !== v.length) return false;
      return uv.every(([r, c], idx) => v[idx][0] === r && v[idx][1] === c);
    });
    if (!isDup) {
      uniqueVariants.push(v);
    }
  }
  return uniqueVariants;
}

// Check if two cell lists share an edge (Manhattan distance = 1)
function isAdjacent(boardCells: [number, number][], pieceCells: [number, number][]): boolean {
  for (const [pr, pc] of pieceCells) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = pr + dr;
      const nc = pc + dc;
      if (boardCells.some(([br, bc]) => br === nr && bc === nc)) {
        return true;
      }
    }
  }
  return false;
}

export function generateUbongoPuzzle(difficulty: "EASY" | "MEDIUM" | "HARD", customId: number, attempt = 1): Board {
  if (attempt > 50) {
    // Return a fallback board if random generation failed repeatedly
    const baseIndex = customId % 6;
    const baseBoard = BOARDS[baseIndex];
    return {
      id: customId,
      name: `대체 보드 ${difficulty}-${customId}`,
      difficulty,
      targetCells: baseBoard.targetCells,
      width: baseBoard.width,
      height: baseBoard.height,
      solutionPieceIds: baseBoard.solutionPieceIds,
    };
  }

  const numPieces = difficulty === "EASY" ? 3 : difficulty === "MEDIUM" ? 4 : 5;
  
  // Randomly sample numPieces from PIECES array
  const shuffledPieces = [...PIECES].sort(() => Math.random() - 0.5);
  const selectedPieces = shuffledPieces.slice(0, numPieces);
  const selectedIds = selectedPieces.map((p) => p.id);

  // Initialize with first piece
  const firstPiece = selectedPieces[0];
  const firstVariants = getAllVariants(firstPiece.cells);
  const randomVariant = firstVariants[Math.floor(Math.random() * firstVariants.length)];
  
  let board: [number, number][] = [...randomVariant];

  // Try placing each subsequent piece
  for (let i = 1; i < selectedPieces.length; i++) {
    const piece = selectedPieces[i];
    const variants = getAllVariants(piece.cells);
    
    // Shuffle variants
    const shuffledVariants = [...variants].sort(() => Math.random() - 0.5);
    let placed = false;

    for (const variant of shuffledVariants) {
      if (placed) break;

      // Shuffle existing board cells to try random attachment points
      const shuffledBoard = [...board].sort(() => Math.random() - 0.5);

      for (const [br, bc] of shuffledBoard) {
        if (placed) break;

        // Try placing the piece such that its cell [pr, pc] is placed on an empty cell adjacent to [br, bc]
        for (const [pr, pc] of variant) {
          if (placed) break;

          const neighbors = [
            [br - 1, bc],
            [br + 1, bc],
            [br, bc - 1],
            [br, bc + 1],
          ];

          for (const [nbr, nbc] of neighbors) {
            // Check if this neighbor cell is already occupied
            const isOccupied = board.some(([r, c]) => r === nbr && c === nbc);
            if (isOccupied) continue;

            // Calculate translation offset to align [pr, pc] of variant with [nbr, nbc]
            const dr = nbr - pr;
            const dc = nbc - pc;

            const translated: [number, number][] = variant.map(([r, c]) => [r + dr, c + dc] as [number, number]);

            // Check if ANY cell of translated piece overlaps with the existing board
            const overlaps = translated.some(([tr, tc]) => 
              board.some(([br_idx, bc_idx]) => br_idx === tr && bc_idx === tc)
            );

            if (!overlaps) {
              board.push(...translated);
              placed = true;
              break;
            }
          }
        }
      }
    }

    if (!placed) {
      // Retry recursively with a different shuffle/selection
      return generateUbongoPuzzle(difficulty, customId, attempt + 1);
    }
  }

  // Normalize final board cells
  const normalizedBoard = normalizePiece(board);

  // Calculate width and height
  const maxR = Math.max(...normalizedBoard.map(([r]) => r));
  const maxC = Math.max(...normalizedBoard.map(([_, c]) => c));
  const width = maxC + 1;
  const height = maxR + 1;

  return {
    id: customId,
    name: `랜덤 보드 ${difficulty === "EASY" ? "A" : difficulty === "MEDIUM" ? "B" : "C"}-${customId}`,
    difficulty,
    targetCells: normalizedBoard,
    width,
    height,
    solutionPieceIds: selectedIds,
  };
}
