/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { BOARDS, SOLO_BOARDS, PIECES, RoomState, Player, PlacedPiece, Board } from "./src/types.js";
import { generateUbongoPuzzle } from "./src/utils/puzzle.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = parseInt(process.env.PORT || "3000", 10);

// In-memory store for game rooms
// Key: room code (e.g. "ABCD"), Value: room state and associated sockets
interface RoomContainer {
  state: RoomState;
  sockets: Map<string, WebSocket>; // player ID -> websocket
  botTimers: Map<string, NodeJS.Timeout[]>; // player ID -> active timers for bots
  countdownInterval?: NodeJS.Timeout;
}

const rooms = new Map<string, RoomContainer>();

const MASTER_PASSWORD = "1234";

// Helper to generate a random 6-character alphanumeric room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Server-side validation of piece placements
function validateSolution(board: Board, placedPieces: PlacedPiece[]): boolean {
  // 1. Check if the player placed the exact required number of pieces
  if (placedPieces.length !== board.solutionPieceIds.length) {
    return false;
  }

  // 2. Check if placed piece IDs match the allowed solutionPieceIds for this board
  const placedIds = [...placedPieces.map((p) => p.pieceId)].sort();
  const requiredIds = [...board.solutionPieceIds].sort();
  if (JSON.stringify(placedIds) !== JSON.stringify(requiredIds)) {
    return false;
  }

  // 3. Build sets of board target cells and covered cells
  const targetSet = new Set(board.targetCells.map(([br, bc]) => `${br},${bc}`));
  const occupied = new Set<string>();

  for (const piece of placedPieces) {
    for (const [pr, pc] of piece.cells) {
      const boardR = piece.r + pr;
      const boardC = piece.c + pc;
      const key = `${boardR},${boardC}`;

      // Must fit exactly inside the target cells
      if (!targetSet.has(key)) {
        return false;
      }

      // No overlapping allowed
      if (occupied.has(key)) {
        return false;
      }

      occupied.add(key);
    }
  }

  // 4. Ensure ALL target cells are covered exactly once
  return occupied.size === targetSet.size;
}

// Ensure solo mode board exists on demand to prevent heavy room creation lag
function getOrCreateSoloBoard(room: RoomContainer, roundNumber: number): Board {
  if (!room.state.soloBoards) {
    room.state.soloBoards = [];
  }
  const idx = roundNumber - 1;
  if (!room.state.soloBoards[idx]) {
    const difficulty = roundNumber <= 100 ? "EASY" : roundNumber <= 200 ? "MEDIUM" : "HARD";
    room.state.soloBoards[idx] = generateUbongoPuzzle(difficulty, roundNumber);
  }
  return room.state.soloBoards[idx];
}

// Broadcast updated room state to all players in that room
function broadcastRoom(room: RoomContainer) {
  const payload = JSON.stringify({
    type: "room-update",
    payload: room.state,
  });

  room.sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// Handle round timer countdown
function startCountdown(room: RoomContainer) {
  if (room.countdownInterval) {
    clearInterval(room.countdownInterval);
  }

  room.countdownInterval = setInterval(() => {
    if (room.state.state !== "PLAYING") {
      if (room.countdownInterval) {
        clearInterval(room.countdownInterval);
      }
      return;
    }

    room.state.timer -= 1;

    // Timer reached zero! Round ends.
    if (room.state.timer <= 0) {
      room.state.timer = 0;
      endRound(room);
    } else {
      broadcastRoom(room);
    }
  }, 1000);
}

// End the current round, distribute points, and update status
function endRound(room: RoomContainer) {
  if (room.countdownInterval) {
    clearInterval(room.countdownInterval);
    room.countdownInterval = undefined;
  }

  // Clear bot timers
  room.botTimers.forEach((timers) => {
    timers.forEach((t) => clearTimeout(t));
  });
  room.botTimers.clear();

  // Score distribution:
  // First solver gets 3 points.
  // Other solvers get 1 point.
  // Non-solvers get 0 points.
  room.state.players.forEach((p) => {
    if (p.solved) {
      const isFirst = room.state.firstSolvedByName === p.name;
      p.score += isFirst ? 3 : 1;
    }
  });

  room.state.state = "ROUND_OVER";
  broadcastRoom(room);
}

// Trigger solver action (used for both real players and simulated AI Bots)
function solveForPlayer(room: RoomContainer, playerId: string, solvedTimeMs: number) {
  const player = room.state.players.find((p) => p.id === playerId);
  if (!player || player.solved || room.state.state !== "PLAYING") return;

  player.solved = true;
  player.solvedTime = solvedTimeMs;

  const board = room.state.currentBoard || BOARDS.find((b) => b.id === room.state.currentBoardId);
  if (board) {
    // Fill placed pieces with target cell offsets so other players can see the completed visual!
    // We just map the board target cells or individual puzzle pieces
    // to mock-render the completed grid for bots.
    // For real players, they submit their actual placedPieces.
    if (player.id.startsWith("bot_")) {
      // Simulate placed pieces to render on opponents' screen
      let currentOffset = 0;
      player.placedPieces = board.solutionPieceIds.map((pId) => {
        const piece = PIECES.find((p) => p.id === pId);
        return {
          pieceId: pId,
          r: 0,
          c: 0,
          cells: piece ? piece.cells : [],
        };
      });
    }
  }

  // Check if this is the first solver of this round
  if (!room.state.firstSolvedByName) {
    room.state.firstSolvedByName = player.name;
    // Activate standard 60-second sand timer fallback if remaining time is greater than 60s
    if (room.state.timer > 60) {
      room.state.timer = 60;
    }
  }

  // If ALL active players (excluding teachers) have solved, end the round immediately
  const solvers = room.state.players.filter((p) => !p.isTeacher);
  const allSolved = solvers.length > 0 && solvers.every((p) => p.solved);
  if (allSolved) {
    endRound(room);
  } else {
    broadcastRoom(room);
  }
}

// Start bot solvers simulation for the round
function triggerBotSolvers(room: RoomContainer) {
  // Clear any existing bot timers
  room.botTimers.forEach((timers) => {
    timers.forEach((t) => clearTimeout(t));
  });
  room.botTimers.clear();

  const board = room.state.currentBoard || BOARDS.find((b) => b.id === room.state.currentBoardId);
  if (!board) return;

  room.state.players.forEach((p) => {
    if (p.id.startsWith("bot_")) {
      const timers: NodeJS.Timeout[] = [];
      room.botTimers.set(p.id, timers);

      // Bots solve with random delays depending on board difficulty
      let minDelay = 25000; // 25s
      let maxDelay = 55000; // 55s

      if (board.difficulty === "MEDIUM") {
        minDelay = 35000;
        maxDelay = 75000;
      } else if (board.difficulty === "HARD") {
        minDelay = 45000;
        maxDelay = 100000;
      }

      // Add small randomization element
      const solveDelay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
      const startTime = Date.now();

      const timer = setTimeout(() => {
        solveForPlayer(room, p.id, Date.now() - startTime);
      }, solveDelay);

      timers.push(timer);
    }
  });
}

// Start a game round
function startRound(room: RoomContainer, roundNumber: number) {
  room.state.state = "PLAYING";
  room.state.round = roundNumber;
  room.state.timer = 120; // 120 seconds (2 minutes) to solve standard Ubongo
  room.state.firstSolvedByName = undefined;

  // Determine difficulty based on round number
  let difficulty: "EASY" | "MEDIUM" | "HARD" = "EASY";
  if (roundNumber > 2 && roundNumber <= 4) {
    difficulty = "MEDIUM";
  } else if (roundNumber > 4) {
    difficulty = "HARD";
  }

  // Generate a random board for this round
  const board = generateUbongoPuzzle(difficulty, roundNumber);
  room.state.currentBoard = board;
  room.state.currentBoardId = board.id;

  // Reset player round state
  room.state.players.forEach((p) => {
    p.solved = false;
    p.solvedTime = undefined;
    p.placedPieces = [];
  });

  // Start round timer countdown
  startCountdown(room);

  // Trigger bot solvers if bots exist in the lobby
  triggerBotSolvers(room);

  broadcastRoom(room);
}

// WebSocket Connection Handler
wss.on("connection", (ws: WebSocket) => {
  let currentPlayerId: string | null = null;
  let currentRoomCode: string | null = null;

  ws.on("message", (messageStr: string) => {
    try {
      const data = JSON.parse(messageStr);
      const { type, payload } = data;

      switch (type) {
        case "join": {
          const { name, roomCode: requestedCode, password, gameMode } = payload;
          const nameTrimmed = (name || "플레이어").trim().substring(0, 12);
          
          let code = (requestedCode || "").trim().toUpperCase();
          let room: RoomContainer;

          if (!code) {
            // Creating a new room requires teacher preset password
            if ((password || "").trim() !== MASTER_PASSWORD) {
              ws.send(JSON.stringify({ type: "error", payload: "교사용 마스터 비밀번호가 올바르지 않습니다." }));
              return;
            }

            // Create a new room
            code = generateRoomCode();
            const maxRounds = gameMode === "SOLO" ? 300 : 5;

            const newRoomState: RoomState = {
              code,
              players: [],
              gameStarted: false,
              state: "LOBBY",
              round: 1,
              maxRounds,
              currentBoardId: 1,
              timer: 0,
              gameMode: gameMode || "COMPETITION",
              soloBoards: [],
            };

            room = {
              state: newRoomState,
              sockets: new Map(),
              botTimers: new Map(),
            };
            rooms.set(code, room);
          } else {
            const existingRoom = rooms.get(code);
            if (!existingRoom) {
              ws.send(JSON.stringify({ type: "error", payload: "방을 찾을 수 없습니다." }));
              return;
            }
            room = existingRoom;
          }

          // If game already started and is in COMPETITION mode, do not allow joining
          if (room.state.gameStarted && room.state.gameMode === "COMPETITION") {
            ws.send(JSON.stringify({ type: "error", payload: "이미 게임이 진행 중인 방입니다." }));
            return;
          }

          // Generate player ID
          const playerId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          currentPlayerId = playerId;
          currentRoomCode = code;

          // Create new player object
          const isHost = room.state.players.length === 0;
          const player: Player = {
            id: playerId,
            name: nameTrimmed,
            score: 0,
            isReady: true, // Ready by default to streamline starting
            isHost,
            isTeacher: isHost, // The room creator is marked as teacher/admin
            solved: false,
            placedPieces: [],
            // Initialize solo mode state
            soloRound: 1,
            soloSolved: false,
            soloTimer: 120,
            soloCompleted: false,
          };

          if (room.state.gameMode === "SOLO") {
            getOrCreateSoloBoard(room, 1);
          }

          room.state.players.push(player);
          room.sockets.set(playerId, ws);

          // Reply with join confirmation
          ws.send(JSON.stringify({
            type: "join-success",
            payload: {
              playerId,
              roomCode: code,
            },
          }));

          broadcastRoom(room);
          break;
        }

        case "ready": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (player) {
            player.isReady = !player.isReady;
            broadcastRoom(room);
          }
          break;
        }

        case "add-bot": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          // Only host can add bots
          const host = room.state.players.find((p) => p.id === currentPlayerId);
          if (!host || !host.isHost) return;

          const botNum = room.state.players.filter((p) => p.id.startsWith("bot_")).length + 1;
          const botId = `bot_${Date.now()}_${botNum}`;
          
          const botPlayer: Player = {
            id: botId,
            name: `우봉고 봇 ${botNum}`,
            score: 0,
            isReady: true,
            isHost: false,
            solved: false,
            placedPieces: [],
          };

          room.state.players.push(botPlayer);
          broadcastRoom(room);
          break;
        }

        case "remove-player": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          // Only host can remove players (e.g. bots or players)
          const host = room.state.players.find((p) => p.id === currentPlayerId);
          if (!host || !host.isHost) return;

          const removeId = payload.playerId;
          const index = room.state.players.findIndex((p) => p.id === removeId);
          if (index !== -1 && removeId !== currentPlayerId) {
            room.state.players.splice(index, 1);
            
            // If it was a websocket connection, disconnect it
            const targetSocket = room.sockets.get(removeId);
            if (targetSocket) {
              targetSocket.send(JSON.stringify({ type: "kicked", payload: "방장에서 추방되었습니다." }));
              room.sockets.delete(removeId);
            }
            
            broadcastRoom(room);
          }
          break;
        }

        case "start-game": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          // Only host can start game
          const host = room.state.players.find((p) => p.id === currentPlayerId);
          if (!host || !host.isHost) return;

          room.state.gameStarted = true;
          if (room.state.gameMode === "SOLO") {
            room.state.state = "PLAYING";
            room.state.players.forEach((p) => {
              p.soloRound = 1;
              p.soloSolved = false;
              p.soloTimer = 120;
              p.soloCompleted = false;
              p.placedPieces = [];
              p.score = 0;
            });
            broadcastRoom(room);
          } else {
            room.state.maxRounds = payload.maxRounds || 5;
            startRound(room, 1);
          }
          break;
        }

        case "update-progress": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.state.state !== "PLAYING") return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (player) {
            if (room.state.gameMode === "SOLO") {
              player.placedPieces = payload.placedPieces || [];
              if (payload.soloTimer !== undefined) player.soloTimer = payload.soloTimer;
              broadcastRoom(room);
            } else if (!player.solved) {
              player.placedPieces = payload.placedPieces || [];
              broadcastRoom(room);
            }
          }
          break;
        }

        case "update-solo-progress": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.state.gameMode !== "SOLO") return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (player) {
            const { round, score, solved, solvedTime, placedPieces, timer, completed } = payload;
            if (round !== undefined) {
              player.soloRound = round;
              getOrCreateSoloBoard(room, round);
            }
            if (score !== undefined) player.score = score;
            if (solved !== undefined) player.soloSolved = solved;
            if (solvedTime !== undefined) player.solvedTime = solvedTime;
            if (placedPieces !== undefined) player.placedPieces = placedPieces;
            if (timer !== undefined) player.soloTimer = timer;
            if (completed !== undefined) player.soloCompleted = completed;
            
            broadcastRoom(room);
          }
          break;
        }

        case "next-solo-stage": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.state.gameMode !== "SOLO") return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (player) {
            const currentRound = player.soloRound || 1;
            const nextRound = currentRound + 1;
            player.soloRound = nextRound;
            player.soloSolved = false;
            player.soloTimer = 120;
            player.placedPieces = [];
            if (nextRound > room.state.maxRounds) {
              player.soloCompleted = true;
            } else {
              getOrCreateSoloBoard(room, nextRound);
            }
            broadcastRoom(room);
          }
          break;
        }

        case "add-bonus-points": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (player) {
            const points = payload.points || 0;
            player.score += points;
            broadcastRoom(room);
          }
          break;
        }

        case "submit-solve": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.state.state !== "PLAYING") return;

          const player = room.state.players.find((p) => p.id === currentPlayerId);
          if (!player) return;

          if (room.state.gameMode === "SOLO") {
            const soloRound = player.soloRound || 1;
            const board = getOrCreateSoloBoard(room, soloRound);
            if (!board) return;

            const clientPieces: PlacedPiece[] = payload.placedPieces || [];
            const isValid = validateSolution(board, clientPieces);
            if (isValid) {
              player.placedPieces = clientPieces;
              player.soloSolved = true;
              
              // Calculate score
              const timeTakenSeconds = payload.timeTakenSeconds || 0;
              const scoreEarned = 100 + Math.max(0, 120 - Math.floor(timeTakenSeconds)) * 2;
              player.score += scoreEarned;

              ws.send(JSON.stringify({
                type: "solo-solve-success",
                payload: {
                  round: soloRound,
                  scoreEarned,
                  totalScore: player.score,
                }
              }));
              broadcastRoom(room);
            } else {
              ws.send(JSON.stringify({ type: "error", payload: "올바르지 않은 맞춤 솔루션입니다. 다시 시도해보세요!" }));
            }
            return;
          }

          if (player.solved) return;
          const board = room.state.currentBoard || BOARDS.find((b) => b.id === room.state.currentBoardId);
          if (!board) return;

          const clientPieces: PlacedPiece[] = payload.placedPieces || [];

          // Server-side verification
          const isValid = validateSolution(board, clientPieces);
          if (isValid) {
            player.placedPieces = clientPieces;
            
            // Calculate time taken from round start or from firstSolved
            const solvedTime = 120000 - (room.state.timer * 1000);
            solveForPlayer(room, currentPlayerId, solvedTime);
          } else {
            ws.send(JSON.stringify({ type: "error", payload: "올바르지 않은 맞춤 솔루션입니다. 다시 시도해보세요!" }));
          }
          break;
        }

        case "next-round": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.state.state !== "ROUND_OVER") return;

          const host = room.state.players.find((p) => p.id === currentPlayerId);
          if (!host || !host.isHost) return;

          if (room.state.round < room.state.maxRounds) {
            startRound(room, room.state.round + 1);
          } else {
            // Game Over completely - return to lobby or trigger full restart
            room.state.gameStarted = false;
            room.state.state = "LOBBY";
            room.state.round = 1;
            room.state.players.forEach((p) => {
              p.score = 0;
              p.isReady = p.isHost;
              p.solved = false;
              p.placedPieces = [];
            });
            broadcastRoom(room);
          }
          break;
        }

        case "restart-lobby": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const host = room.state.players.find((p) => p.id === currentPlayerId);
          if (!host || !host.isHost) return;

          room.state.gameStarted = false;
          room.state.state = "LOBBY";
          room.state.round = 1;
          room.state.players.forEach((p) => {
            p.score = 0;
            p.isReady = p.isHost;
            p.solved = false;
            p.placedPieces = [];
          });
          broadcastRoom(room);
          break;
        }

        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }
      }
    } catch (err) {
      console.error("Error processing websocket message:", err);
    }
  });

  ws.on("close", () => {
    if (currentRoomCode && currentPlayerId) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        // Remove player from room
        const index = room.state.players.findIndex((p) => p.id === currentPlayerId);
        if (index !== -1) {
          const removedPlayer = room.state.players[index];
          room.state.players.splice(index, 1);
          room.sockets.delete(currentPlayerId);

          // If room is empty, clean it up
          if (room.state.players.filter((p) => !p.id.startsWith("bot_")).length === 0) {
            if (room.countdownInterval) {
              clearInterval(room.countdownInterval);
            }
            rooms.delete(currentRoomCode);
          } else {
            // Assign new host if host left
            if (removedPlayer.isHost && room.state.players.length > 0) {
              // Find first non-bot player
              const nextHost = room.state.players.find((p) => !p.id.startsWith("bot_"));
              if (nextHost) {
                nextHost.isHost = true;
                nextHost.isReady = true;
              }
            }
            broadcastRoom(room);
          }
        }
      }
    }
  });
});

// Configure Vite middleware for dev mode, or static file server for production
async function initServer() {
  // API routes first
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get active rooms (for debugging/status)
  app.get("/api/rooms", (req, res) => {
    const list = Array.from(rooms.keys()).map((code) => {
      const room = rooms.get(code)!;
      return {
        code,
        playersCount: room.state.players.length,
        state: room.state.state,
      };
    });
    res.json(list);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("Failed to start server:", err);
});
