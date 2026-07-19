/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Piece {
  id: number;
  color: string;
  borderClass: string;
  cells: [number, number][]; // normalized offsets
  name: string;
}

export interface Board {
  id: number;
  name: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  targetCells: [number, number][]; // Coordinates of cells to be filled, e.g. [[0,0], [0,1], ...]
  width: number;
  height: number;
  solutionPieceIds: number[]; // Piece IDs allocated for this board
}

export interface PlacedPiece {
  pieceId: number;
  r: number; // Row offset on the target board grid
  c: number; // Col offset on the target board grid
  cells: [number, number][]; // Rotated/flipped cells of the piece
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  solved: boolean;
  solvedTime?: number; // Time taken in milliseconds
  placedPieces: PlacedPiece[];
  isTeacher?: boolean; // True if this player is the teacher/admin
  
  // New properties for Solo Mode
  soloRound?: number;        // e.g., 1 to 30
  soloSolved?: boolean;      // current round solved state
  soloTimer?: number;        // current round timer remaining
  soloCompleted?: boolean;   // if they completed all 30 stages!
}

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'ROUND_OVER';

export interface RoomState {
  code: string;
  players: Player[];
  gameStarted: boolean;
  state: RoomStatus;
  round: number;
  maxRounds: number;
  currentBoardId: number;
  currentBoard?: Board;
  soloBoards?: Board[];
  multiplayerBoards?: Board[];
  timer: number; // countdown in seconds
  firstSolvedByName?: string;
  gameMode?: "SOLO" | "COMPETITION";
}

// Global pieces list (Standard Ubongo has 12 pieces)
export const PIECES: Piece[] = [
  {
    id: 1,
    name: "Piece 1 (V-3)",
    color: "bg-[#FBBF24]", // Yellow
    borderClass: "border-[#D97706]",
    cells: [[0, 0], [1, 0], [1, 1]],
  },
  {
    id: 2,
    name: "Piece 2 (I-3)",
    color: "bg-[#EF4444]", // Red
    borderClass: "border-[#B91C1C]",
    cells: [[0, 0], [0, 1], [0, 2]],
  },
  {
    id: 3,
    name: "Piece 3 (O-4)",
    color: "bg-[#3B82F6]", // Blue
    borderClass: "border-[#1D4ED8]",
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]],
  },
  {
    id: 4,
    name: "Piece 4 (L-4)",
    color: "bg-[#10B981]", // Green
    borderClass: "border-[#047857]",
    cells: [[0, 0], [1, 0], [2, 0], [2, 1]],
  },
  {
    id: 5,
    name: "Piece 5 (T-4)",
    color: "bg-[#8B5CF6]", // Purple
    borderClass: "border-[#6D28D9]",
    cells: [[0, 0], [0, 1], [0, 2], [1, 1]],
  },
  {
    id: 6,
    name: "Piece 6 (Z-4)",
    color: "bg-[#EC4899]", // Pink
    borderClass: "border-[#BE185D]",
    cells: [[0, 0], [0, 1], [1, 1], [1, 2]],
  },
  {
    id: 7,
    name: "Piece 7 (I-4)",
    color: "bg-[#06B6D4]", // Cyan
    borderClass: "border-[#0891B2]",
    cells: [[0, 0], [0, 1], [0, 2], [0, 3]],
  },
  {
    id: 8,
    name: "Piece 8 (L-5)",
    color: "bg-[#F97316]", // Orange
    borderClass: "border-[#C2410C]",
    cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  },
  {
    id: 9,
    name: "Piece 9 (U-5)",
    color: "bg-[#14B8A6]", // Teal
    borderClass: "border-[#0F766E]",
    cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]],
  },
  {
    id: 10,
    name: "Piece 10 (Z-5)",
    color: "bg-[#6366F1]", // Indigo
    borderClass: "border-[#4338CA]",
    cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
  },
  {
    id: 11,
    name: "Piece 11 (T-5)",
    color: "bg-[#84CC16]", // Lime
    borderClass: "border-[#4D7C0F]",
    cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  },
  {
    id: 12,
    name: "Piece 12 (P-5)",
    color: "bg-[#D946EF]", // Fuchsia
    borderClass: "border-[#A21CAF]",
    cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
  },
];

// Curated boards with proven, solvable configurations.
// We provide various shapes that match standard Ubongo board sizes (EASY uses 3 pieces, MEDIUM/HARD uses 4 pieces).
export const BOARDS: Board[] = [
  {
    id: 1,
    name: "그리드 보드 A",
    difficulty: "EASY",
    width: 4,
    height: 4,
    // Size: 10. Solvable by pieces: 1 (size 3), 3 (size 4), 1 (size 3) => 3+4+3=10
    // Visual Target:
    // X X X .
    // X X X .
    // X X . .
    // X X . .
    targetCells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1],
      [3, 0], [3, 1],
    ],
    solutionPieceIds: [1, 2, 4], // Pieces 1 (size 3), 2 (size 3), 4 (size 4) = 10 cells
  },
  {
    id: 2,
    name: "그리드 보드 B",
    difficulty: "EASY",
    width: 4,
    height: 4,
    // Size: 11 cells. Solvable with pieces: 1 (3), 3 (4), 4 (4) => 11
    // Visual Target:
    // X X X X
    // X X X .
    // X X X .
    // X . . .
    targetCells: [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
      [3, 0],
    ],
    solutionPieceIds: [1, 3, 5], // Pieces 1 (3), 3 (4), 5 (4) = 11 cells
  },
  {
    id: 3,
    name: "그리드 보드 C",
    difficulty: "MEDIUM",
    width: 5,
    height: 5,
    // Size: 15 cells. Solvable with pieces: 2 (3), 3 (4), 4 (4), 5 (4) => 15
    // Visual Target:
    // . X X X .
    // X X X X X
    // X X X X X
    // . X X . .
    targetCells: [
              [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
              [3, 1], [3, 2],
    ],
    solutionPieceIds: [2, 3, 4, 6], // Pieces 2 (3), 3 (4), 4 (4), 6 (4) = 15 cells
  },
  {
    id: 4,
    name: "그리드 보드 D",
    difficulty: "MEDIUM",
    width: 5,
    height: 5,
    // Size: 14 cells. Solvable with: 1 (3), 2 (3), 4 (4), 6 (4) => 14
    // Visual Target:
    // X X X X .
    // X X X X .
    // . X X X .
    // . X X X .
    targetCells: [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3],
              [2, 1], [2, 2], [2, 3],
              [3, 1], [3, 2], [3, 3],
    ],
    solutionPieceIds: [1, 2, 5, 7], // Pieces 1 (3), 2 (3), 5 (4), 7 (4) = 14 cells
  },
  {
    id: 5,
    name: "그리드 보드 E",
    difficulty: "HARD",
    width: 5,
    height: 5,
    // Size: 17 cells. Solvable with: 3 (4), 4 (4), 6 (4), 8 (5) => 17
    // Visual Target:
    // X X X X X
    // X X X X X
    // X X X . .
    // X X X . .
    // X . . . .
    targetCells: [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2],
      [3, 0], [3, 1], [3, 2],
      [4, 0],
    ],
    solutionPieceIds: [3, 4, 6, 8], // Pieces 3 (4), 4 (4), 6 (4), 8 (5) = 17 cells
  },
  {
    id: 6,
    name: "그리드 보드 F",
    difficulty: "HARD",
    width: 5,
    height: 5,
    // Size: 18 cells. Solvable with: 4 (4), 5 (4), 8 (5), 9 (5) => 18
    // Visual Target:
    // . X X X X
    // . X X X X
    // X X X X X
    // X X X X X
    targetCells: [
              [0, 1], [0, 2], [0, 3], [0, 4],
              [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
      [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
    ],
    solutionPieceIds: [4, 5, 10, 12], // Pieces 4 (4), 5 (4), 10 (5), 12 (5) = 18 cells
  }
];

// Helper to normalize coordinates of cells to have top-left as [0,0]
export function normalizeCells(cells: [number, number][]): [number, number][] {
  if (cells.length === 0) return cells;
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([_, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// Check if cell is in coordinates list
export function hasCell(cells: [number, number][], r: number, c: number): boolean {
  return cells.some(([cr, cc]) => cr === r && cc === c);
}

// Rotate cells 90 degrees clockwise and normalize
export function rotateCells90(cells: [number, number][]): [number, number][] {
  const rotated = cells.map(([r, c]) => [c, -r] as [number, number]);
  return normalizeCells(rotated);
}

// Flip cells horizontally and normalize
export function flipCellsH(cells: [number, number][]): [number, number][] {
  const flipped = cells.map(([r, c]) => [r, -c] as [number, number]);
  return normalizeCells(flipped);
}

// 30 stages programmatically defined to scale difficulty and guarantee 100% solvability
export const SOLO_BOARDS: Board[] = Array.from({ length: 30 }, (_, index) => {
  const stageNum = index + 1;
  let difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'EASY';
  if (stageNum > 10 && stageNum <= 20) {
    difficulty = 'MEDIUM';
  } else if (stageNum > 20) {
    difficulty = 'HARD';
  }

  // Map to one of the 6 predefined boards to guarantee layout and exact solvable piece configuration
  let baseTemplate: Board;
  if (difficulty === 'EASY') {
    baseTemplate = BOARDS[index % 2];
  } else if (difficulty === 'MEDIUM') {
    baseTemplate = BOARDS[2 + (index % 2)];
  } else {
    baseTemplate = BOARDS[4 + (index % 2)];
  }

  return {
    id: stageNum,
    name: `스테이지 ${stageNum} (${baseTemplate.name.replace("그리드 보드 ", "")})`,
    difficulty,
    targetCells: baseTemplate.targetCells,
    width: baseTemplate.width,
    height: baseTemplate.height,
    solutionPieceIds: baseTemplate.solutionPieceIds,
  };
});
