/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  BOARDS,
  SOLO_BOARDS,
  PIECES,
  RoomState,
  PlacedPiece,
  Board,
  rotateCells90,
  flipCellsH,
  normalizeCells,
} from "./types.js";
import { Lobby } from "./components/Lobby.js";
import { BoardGrid } from "./components/BoardGrid.js";
import { PieceTray } from "./components/PieceTray.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { synth } from "./utils/audio.js";
import { motion, AnimatePresence } from "motion/react";
import { RotateCw, FlipHorizontal, RotateCcw, Sparkles, RefreshCw, Trophy, Crown, ArrowLeft, Volume2, VolumeX } from "lucide-react";

export default function App() {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  // Lucky Box and Solo mode states
  const [luckyBoxOpen, setLuckyBoxOpen] = useState(false);
  const [luckyBoxRevealed, setLuckyBoxRevealed] = useState<number | null>(null);
  const [soloTimer, setSoloTimer] = useState(120);

  // Gameplay state
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [rotatedCells, setRotatedCells] = useState<{ [pieceId: number]: [number, number][] }>({});

  // First Solve Timer Overlay Trigger State
  const [showSolveEffect, setShowSolveEffect] = useState(false);
  const [solveEffectName, setSolveEffectName] = useState("");
  const prevFirstSolvedRef = useRef<string | undefined>(undefined);

  const socketRef = useRef<WebSocket | null>(null);
  const prevTimerRef = useRef<number>(120);

  // Drag State & Refs for Pointer-Tracking & Snap Engine
  const [dragState, setDragState] = useState<{
    pieceId: number | null;
    isDragging: boolean;
    x: number;
    y: number;
  }>({
    pieceId: null,
    isDragging: false,
    x: 0,
    y: 0,
  });

  const floatingRef = useRef<HTMLDivElement>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });

  const handleDragStart = (pieceId: number, e: React.PointerEvent) => {
    e.preventDefault();
    pointerPosRef.current = { x: e.clientX, y: e.clientY };
    setDragState({
      pieceId,
      isDragging: true,
      x: e.clientX,
      y: e.clientY,
    });
    setSelectedPieceId(pieceId);
  };

  // Initialize piece cells when a new board starts
  useEffect(() => {
    if (roomState && roomState.state === "PLAYING") {
      const isSolo = roomState.gameMode === "SOLO";
      const selfPlayer = roomState.players.find((p) => p.id === playerId);
      const currentBoard = isSolo
        ? (selfPlayer ? (roomState.soloBoards ? roomState.soloBoards[(selfPlayer.soloRound || 1) - 1] : SOLO_BOARDS[(selfPlayer.soloRound || 1) - 1]) : null)
        : (roomState.currentBoard || BOARDS.find((b) => b.id === roomState.currentBoardId));

      if (currentBoard) {
        const initialRotations: { [pieceId: number]: [number, number][] } = {};
        currentBoard.solutionPieceIds.forEach((pId) => {
          const piece = PIECES.find((p) => p.id === pId);
          if (piece) {
            initialRotations[pId] = piece.cells;
          }
        });
        setRotatedCells(initialRotations);
        setPlacedPieces([]);
        setSelectedPieceId(null);
        if (isSolo) {
          setSoloTimer(120);
        }
      }
    }
  }, [roomState?.currentBoardId, roomState?.state, roomState?.gameMode, playerId, roomState?.players.find((p) => p.id === playerId)?.soloRound]);

  // Handle local Solo Mode Timer countdown
  useEffect(() => {
    const selfPlayer = roomState?.players.find((p) => p.id === playerId);
    const isSolo = roomState?.gameMode === "SOLO";
    const isTeacher = selfPlayer?.isTeacher === true;

    if (roomState?.gameStarted && isSolo && !isTeacher && selfPlayer && !selfPlayer.soloSolved && !selfPlayer.soloCompleted) {
      const interval = setInterval(() => {
        setSoloTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            // Notify server of timeout (timer = 0)
            socketRef.current?.send(JSON.stringify({
              type: "update-progress",
              payload: { soloTimer: 0 }
            }));
            return 0;
          }
          const nextVal = prev - 1;
          // Periodically sync current timer to server every 4 seconds
          if (nextVal % 4 === 0) {
            socketRef.current?.send(JSON.stringify({
              type: "update-progress",
              payload: { soloTimer: nextVal }
            }));
          }
          return nextVal;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [roomState?.gameStarted, roomState?.gameMode, playerId, roomState?.players.find((p) => p.id === playerId)?.soloRound, roomState?.players.find((p) => p.id === playerId)?.soloSolved, roomState?.players.find((p) => p.id === playerId)?.soloCompleted]);

  // Alert/Warning tick when timer is low (last 10 seconds)
  useEffect(() => {
    if (roomState && roomState.state === "PLAYING" && roomState.timer > 0 && roomState.timer <= 10) {
      if (roomState.timer !== prevTimerRef.current) {
        if (!muted) {
          synth.playWarningTick();
        }
        prevTimerRef.current = roomState.timer;
      }
    }
  }, [roomState?.timer, roomState?.state, muted]);

  // Trigger full-screen visual alert effect when 1st place player solves and countdown begins
  useEffect(() => {
    if (roomState && roomState.state === "PLAYING") {
      const currentFirstSolved = roomState.firstSolvedByName;
      const prevFirstSolved = prevFirstSolvedRef.current;

      if (currentFirstSolved && !prevFirstSolved) {
        setSolveEffectName(currentFirstSolved);
        setShowSolveEffect(true);
        if (!muted) {
          synth.playSuccess();
        }
        // Auto dismiss after 4.5 seconds
        const t = setTimeout(() => {
          setShowSolveEffect(false);
        }, 4500);
        return () => clearTimeout(t);
      } else if (!currentFirstSolved) {
        setShowSolveEffect(false);
        setSolveEffectName("");
      }
      prevFirstSolvedRef.current = currentFirstSolved;
    } else {
      prevFirstSolvedRef.current = undefined;
    }
  }, [roomState?.firstSolvedByName, roomState?.state, muted]);

  // Connect and manage WebSocket
  const connectToWebSocket = (name: string, roomCode: string, password?: string, gameMode?: "SOLO" | "COMPETITION") => {
    setErrorMsg(null);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      // Send join request
      socket.send(
        JSON.stringify({
          type: "join",
          payload: { name, roomCode, password, gameMode },
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        switch (type) {
          case "join-success":
            setPlayerId(payload.playerId);
            break;
          case "room-update":
            setRoomState(payload);
            break;
          case "solo-solve-success":
            if (!muted) synth.playSuccess();
            // 30% chance for Lucky Box Modal!
            if (Math.random() < 0.3) {
              setLuckyBoxRevealed(null);
              setLuckyBoxOpen(true);
            }
            break;
          case "error":
            setErrorMsg(payload);
            // If we failed to join, clear state
            if (!playerId) {
              setRoomState(null);
            }
            break;
          case "kicked":
            alert(payload);
            setRoomState(null);
            setPlayerId(null);
            break;
        }
      } catch (err) {
        console.error("Error parsing websocket message:", err);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected.");
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
      setErrorMsg("서버와의 연결에 실패했습니다.");
    };
  };

  // Keyboard controls for desktop convenience
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPieceId === null) return;

      if (e.key === "r" || e.key === "R" || e.key === "ㄱ") {
        e.preventDefault();
        rotateSelected();
      } else if (e.key === "f" || e.key === "F" || e.key === "ㄹ") {
        e.preventDefault();
        flipSelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedPieceId(null);
        if (!muted) synth.playClick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPieceId, rotatedCells, muted]);

  // Drag-and-drop pointer tracking & rotation listeners
  useEffect(() => {
    if (!dragState.isDragging || dragState.pieceId === null) return;

    const handlePointerMove = (e: PointerEvent) => {
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
      if (floatingRef.current) {
        floatingRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      setDragState((prev) => ({ ...prev, isDragging: false, pieceId: null }));
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      rotateSelected();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        rotateSelected();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("contextmenu", handleContextMenu, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    // Initial position sync
    if (floatingRef.current) {
      floatingRef.current.style.transform = `translate3d(${pointerPosRef.current.x}px, ${pointerPosRef.current.y}px, 0) translate(-50%, -50%)`;
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dragState.isDragging, dragState.pieceId, rotatedCells, selectedPieceId]);

  // Rotate selected piece clockwise 90 degrees
  const rotateSelected = () => {
    if (selectedPieceId === null) return;
    const currentCells = rotatedCells[selectedPieceId];
    if (!currentCells) return;

    const rotated = rotateCells90(currentCells);
    setRotatedCells((prev) => ({
      ...prev,
      [selectedPieceId]: rotated,
    }));
    if (!muted) synth.playRotate();
  };

  // Flip selected piece horizontally
  const flipSelected = () => {
    if (selectedPieceId === null) return;
    const currentCells = rotatedCells[selectedPieceId];
    if (!currentCells) return;

    const flipped = flipCellsH(currentCells);
    setRotatedCells((prev) => ({
      ...prev,
      [selectedPieceId]: flipped,
    }));
    if (!muted) synth.playRotate();
  };

  // Lobby triggers
  const handleJoinRoom = (name: string, roomCode: string, password?: string, gameMode?: "SOLO" | "COMPETITION") => {
    connectToWebSocket(name, roomCode, password, gameMode);
  };

  const handleToggleReady = () => {
    socketRef.current?.send(JSON.stringify({ type: "ready" }));
  };

  const handleAddBot = () => {
    socketRef.current?.send(JSON.stringify({ type: "add-bot" }));
  };

  const handleKickPlayer = (id: string) => {
    socketRef.current?.send(JSON.stringify({ type: "remove-player", payload: { playerId: id } }));
  };

  const handleStartGame = (roundsCount: number) => {
    socketRef.current?.send(
      JSON.stringify({
        type: "start-game",
        payload: { maxRounds: roundsCount },
      })
    );
  };

  // Puzzle Actions
  const handlePlacePiece = (pieceId: number, r: number, c: number) => {
    const activeCells = rotatedCells[pieceId];
    if (!activeCells) return;

    // Filter out previous placements of this piece
    const cleanPlaced = placedPieces.filter((p) => p.pieceId !== pieceId);
    const newPlacement: PlacedPiece = {
      pieceId,
      r,
      c,
      cells: activeCells,
    };

    const updatedPlacements = [...cleanPlaced, newPlacement];
    setPlacedPieces(updatedPlacements);
    setSelectedPieceId(null);

    // Sync progress to the server so opponents/teacher can see real-time updates!
    socketRef.current?.send(
      JSON.stringify({
        type: "update-progress",
        payload: { 
          placedPieces: updatedPlacements,
          soloTimer,
        },
      })
    );

    // Auto-verify if all pieces are placed
    const isSolo = roomState?.gameMode === "SOLO";
    const selfPlayer = roomState?.players.find((p) => p.id === playerId);
    const currentBoard = isSolo
      ? (selfPlayer ? (roomState?.soloBoards ? roomState.soloBoards[(selfPlayer.soloRound || 1) - 1] : SOLO_BOARDS[(selfPlayer.soloRound || 1) - 1]) : null)
      : (roomState?.currentBoard || BOARDS.find((b) => b.id === roomState?.currentBoardId));

    if (currentBoard && updatedPlacements.length === currentBoard.solutionPieceIds.length) {
      // Send solution directly! Server will verify authoritative match
      socketRef.current?.send(
        JSON.stringify({
          type: "submit-solve",
          payload: { 
            placedPieces: updatedPlacements,
            timeTakenSeconds: isSolo ? (120 - soloTimer) : undefined,
          },
        })
      );
    }
  };

  // Return a placed piece back to hand/tray
  const handleRemovePiece = (pieceId: number) => {
    const targetPiece = placedPieces.find((p) => p.pieceId === pieceId);
    const updated = placedPieces.filter((p) => p.pieceId !== pieceId);
    setPlacedPieces(updated);

    // Automatically put it in hand
    setSelectedPieceId(pieceId);
    if (targetPiece) {
      setRotatedCells((prev) => ({
        ...prev,
        [pieceId]: targetPiece.cells,
      }));
    }

    // Update server
    socketRef.current?.send(
      JSON.stringify({
        type: "update-progress",
        payload: { placedPieces: updated },
      })
    );
  };

  // Reset entire board state
  const handleResetBoard = () => {
    setPlacedPieces([]);
    setSelectedPieceId(null);
    if (!muted) synth.playClick();

    // Reset rotation to original piece orientations
    const isSolo = roomState?.gameMode === "SOLO";
    const selfPlayer = roomState?.players.find((p) => p.id === playerId);
    const currentBoard = isSolo
      ? (selfPlayer ? (roomState?.soloBoards ? roomState.soloBoards[(selfPlayer.soloRound || 1) - 1] : SOLO_BOARDS[(selfPlayer.soloRound || 1) - 1]) : null)
      : (roomState?.currentBoard || BOARDS.find((b) => b.id === roomState?.currentBoardId));

    if (currentBoard) {
      const initialRotations: { [pieceId: number]: [number, number][] } = {};
      currentBoard.solutionPieceIds.forEach((pId) => {
        const piece = PIECES.find((p) => p.id === pId);
        if (piece) {
          initialRotations[pId] = piece.cells;
        }
      });
      setRotatedCells(initialRotations);
    }

    // Sync to server
    socketRef.current?.send(
      JSON.stringify({
        type: "update-progress",
        payload: { placedPieces: [] },
      })
    );
  };

  const handleNextRound = () => {
    socketRef.current?.send(JSON.stringify({ type: "next-round" }));
  };

  const handleRestartLobby = () => {
    socketRef.current?.send(JSON.stringify({ type: "restart-lobby" }));
  };

  const handleLeaveRoom = () => {
    socketRef.current?.close();
    setRoomState(null);
    setPlayerId(null);
  };

  // Calculate current board info
  const isSoloMode = roomState?.gameMode === "SOLO";
  const selfPlayer = roomState && playerId ? roomState.players.find((p) => p.id === playerId) : null;
  const isTeacher = selfPlayer?.isTeacher === true;
  const activeBoard = roomState
    ? (isSoloMode
        ? (selfPlayer ? (roomState.soloBoards ? roomState.soloBoards[(selfPlayer.soloRound || 1) - 1] : SOLO_BOARDS[(selfPlayer.soloRound || 1) - 1]) : null)
        : (roomState.currentBoard || BOARDS.find((b) => b.id === roomState.currentBoardId)))
    : null;

  return (
    <div className="min-h-screen bg-high-bg text-high-black flex flex-col font-sans select-none overflow-x-hidden pb-12">
      {/* Upper Navigation / Title Header */}
      <header className="border-b-4 border-high-black bg-high-surface shadow-sm sticky top-0 z-50 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-high-black flex items-center justify-center font-black text-white text-lg sm:text-xl border-2 border-high-black -rotate-6 shadow-[3px_3px_8px_rgba(0,0,0,0.15)] flex-shrink-0">
            우
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-lg sm:text-2xl font-display font-black tracking-tighter text-high-black truncate">
              UBONGO! 우봉고
            </h1>
            <span className="hidden sm:block text-[10px] uppercase tracking-[0.25em] font-black text-high-black/40 -mt-0.5 ml-0.5">
              Multiplayer Edition
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Mute Toggle */}
          <button
            onClick={() => setMuted(!muted)}
            className="p-2 sm:p-2.5 bg-high-surface border-2 border-high-black hover:bg-high-bg rounded-2xl text-high-black transition-all cursor-pointer shadow-[3px_3px_8px_rgba(0,0,0,0.12)] hover:shadow-[1px_1px_4px_rgba(0,0,0,0.08)] active:translate-y-0.5"
            title={muted ? "음소거 해제" : "음소거"}
          >
            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {roomState && (
            <button
              onClick={handleLeaveRoom}
              className="flex items-center gap-1.5 text-xs font-black text-white bg-high-black hover:bg-zinc-800 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl transition-all shadow-[3px_3px_8px_rgba(0,0,0,0.15)] active:shadow-sm active:translate-y-[2px] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">방 나가기</span><span className="sm:hidden">나가기</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center max-w-7xl w-full mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          {/* LOBBY / INITIAL SPLASH */}
          {(!roomState || !roomState.gameStarted) && (
            <motion.div
              key="lobby-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <Lobby
                roomState={roomState}
                playerId={playerId}
                onJoinRoom={handleJoinRoom}
                onToggleReady={handleToggleReady}
                onAddBot={handleAddBot}
                onStartGame={handleStartGame}
                onKickPlayer={handleKickPlayer}
                errorMsg={errorMsg}
              />
            </motion.div>
          )}

          {/* ACTIVE PLAYING SCREEN */}
          {roomState && roomState.gameStarted && roomState.state === "PLAYING" && (
            isSoloMode ? (
              isTeacher ? (
                /* TEACHER DASHBOARD FOR SOLO MODE */
                <motion.div
                  key="teacher-dashboard-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-6 w-full"
                >
                  {/* Dashboard Header */}
                  <div className="bg-high-surface high-border p-6 rounded-[28px] high-shadow flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-high-black border-2 border-high-black rounded-2xl flex items-center justify-center shadow-[3px_3px_0px_#18181b]">
                        <Crown className="w-6 h-6 text-white" />
                      </div>
                      <div className="korean-wrap">
                        <span className="text-[10px] text-high-black/50 font-black uppercase tracking-widest font-mono">
                          TEACHER CONTROL CENTER
                        </span>
                        <h2 className="text-2xl font-display font-black text-high-black">
                          우봉고 실시간 개인 모드 관제 대시보드
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 bg-high-alpha border-2 border-high-black px-6 py-3 rounded-2xl">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-high-black/50 font-black uppercase tracking-wider font-mono">참가 코드 (Code)</span>
                        <strong className="text-2xl font-mono font-black text-high-black tracking-widest">{roomState.code}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Room Statistics Summary Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-high-surface high-border p-5 rounded-2xl high-shadow-sm flex items-center justify-between">
                      <div className="korean-wrap">
                        <span className="text-[10px] text-high-black/40 font-black block uppercase font-mono">접속 중인 학생</span>
                        <strong className="text-2xl font-black font-mono text-high-black mt-1 block">
                          {roomState.players.filter(p => !p.isTeacher).length}명
                        </strong>
                      </div>
                      <div className="text-2xl">👥</div>
                    </div>

                    <div className="bg-high-surface high-border p-5 rounded-2xl high-shadow-sm flex items-center justify-between">
                      <div className="korean-wrap">
                        <span className="text-[10px] text-high-black/40 font-black block uppercase font-mono">최고 성적 학생</span>
                        <strong className="text-xl font-display font-black text-high-black mt-1 block truncate max-w-[150px]">
                          {[...roomState.players].filter(p => !p.isTeacher).sort((a,b) => b.score - a.score)[0]?.name || "없음"}
                        </strong>
                      </div>
                      <div className="text-2xl">👑</div>
                    </div>

                    <div className="bg-high-surface high-border p-5 rounded-2xl high-shadow-sm flex items-center justify-between">
                      <div className="korean-wrap">
                        <span className="text-[10px] text-high-black/40 font-black block uppercase font-mono">수업 세션 상태</span>
                        <strong className="text-lg font-black text-emerald-600 mt-1.5 block flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> 실시간 중계 중
                        </strong>
                      </div>
                      <div className="text-2xl">📡</div>
                    </div>
                  </div>

                  {/* Student Live Progress Feed */}
                  <div className="bg-high-surface high-border p-6 rounded-[28px] high-shadow flex flex-col gap-5">
                    <div className="flex items-center justify-between border-b-2 border-high-black pb-3">
                      <h3 className="text-sm font-black text-high-black uppercase tracking-wider flex items-center gap-2 font-mono">
                        📊 학생 실시간 진도 현황 (STUDENT PROGRESS LIST)
                      </h3>
                      <span className="text-xs text-high-black/60 font-black">
                        총 {roomState.players.filter(p => !p.isTeacher).length}명 수강 중
                      </span>
                    </div>

                    {roomState.players.filter(p => !p.isTeacher).length === 0 ? (
                      <div className="p-12 text-center border-4 border-dashed border-high-black/10 rounded-2xl korean-wrap">
                        <div className="text-4xl mb-3">⏳</div>
                        <p className="text-sm font-black text-high-black/50">현재 대기방에 참여한 학생이 없습니다.</p>
                        <p className="text-xs text-high-black/40 mt-1">학생들에게 참가 코드 6자리를 안내해 주세요.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {roomState.players.filter(p => !p.isTeacher).map((student) => {
                          const maxR = roomState.maxRounds || 300;
                          const progressPercent = Math.min(100, Math.round(((student.soloRound || 1) / maxR) * 100));
                          const studentBoard = roomState.soloBoards ? roomState.soloBoards[(student.soloRound || 1) - 1] : SOLO_BOARDS[(student.soloRound || 1) - 1];

                          return (
                            <div key={student.id} className="p-4 bg-high-surface high-border rounded-2xl high-shadow-sm flex flex-col gap-3 relative overflow-hidden">
                              {/* Background subtle indicator */}
                              {student.soloCompleted && (
                                <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
                              )}

                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <strong className="text-base font-black text-high-black">{student.name}</strong>
                                  <span className="text-xs font-semibold text-high-black/60">💎 {student.score} Gems</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  {student.soloCompleted ? (
                                    <span className="text-xs bg-emerald-600 text-white font-black px-2 py-0.5 rounded">
                                      🏆 완주 완료!
                                    </span>
                                  ) : student.soloSolved ? (
                                    <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded border border-emerald-300 animate-pulse">
                                      ✅ 해결 (다음 대기)
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-art-accent/40 text-high-black font-mono font-black px-2 py-0.5 rounded">
                                      ⏳ Stage {student.soloRound}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full bg-high-alpha rounded-full h-3 border border-high-black overflow-hidden mt-1">
                                <div
                                  className="bg-art-accent h-full border-r border-high-black transition-all duration-500"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] font-mono font-bold text-high-black/50">
                                <span>진도: {student.soloRound || 1} / {roomState.maxRounds || 300} 단계</span>
                                <span>{progressPercent}%</span>
                              </div>

                              {/* Student Live Miniature Board Grid */}
                              {studentBoard && !student.soloCompleted && (
                                <div className="mt-1 border-t border-high-black/10 pt-2.5 flex flex-col gap-1.5">
                                  <span className="text-[9px] text-high-black/40 font-black uppercase font-mono">LIVE PUZZLE GRID:</span>
                                  <div className="flex items-center justify-center bg-high-alpha/40 p-2 rounded-xl border border-high-black/10">
                                    <div
                                      className="grid gap-[2px] p-1 bg-high-surface rounded-lg border border-high-black/40"
                                      style={{
                                        gridTemplateRows: `repeat(${studentBoard.height}, minmax(0, 1fr))`,
                                        gridTemplateColumns: `repeat(${studentBoard.width}, minmax(0, 1fr))`,
                                      }}
                                    >
                                      {Array.from({ length: studentBoard.height }).map((_, rIdx) =>
                                        Array.from({ length: studentBoard.width }).map((_, cIdx) => {
                                          const isTarget = studentBoard.targetCells.some(
                                            ([br, bc]) => br === rIdx && bc === cIdx
                                          );

                                          // Find if covered in opponent's placedPieces list
                                          const placed = student.placedPieces.find((placed) =>
                                            placed.cells.some(
                                              ([pr, pc]) => placed.r + pr === rIdx && placed.c + pc === cIdx
                                            )
                                          );
                                          const pieceInfo = placed ? PIECES.find((p) => p.id === placed.pieceId) : null;

                                          return (
                                            <div
                                              key={`${rIdx}-${cIdx}`}
                                              className={`w-3.5 h-3.5 rounded-[3px] border-[1px] border-black/10 ${
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
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Teacher Dashboard Controls */}
                  <div className="bg-high-surface high-border p-6 rounded-[28px] high-shadow flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="korean-wrap">
                      <strong className="text-base font-black text-high-black">수업 제어 센터</strong>
                      <p className="text-xs text-high-black/60 mt-0.5">수업 진도를 전체적으로 초기화하여 다시 시작하거나 대기방으로 돌아갈 수 있습니다.</p>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={handleRestartLobby}
                        className="high-button-white text-xs px-6 py-3 cursor-pointer border-red-600 text-red-600 hover:bg-red-50"
                      >
                        🔄 수업 세션 초기화 (Reset Lobby)
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* STUDENT SOLO WORKSPACE */
                selfPlayer?.soloCompleted ? (
                  /* SOLO COMPLETED CELEBRATION SCREEN */
                  <motion.div
                    key="solo-completed-view"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-xl mx-auto w-full py-8 text-center"
                  >
                    <div className="bg-high-surface high-border p-8 rounded-[36px] high-shadow flex flex-col items-center gap-6">
                      <div className="w-20 h-20 rounded-3xl bg-high-black border-2 border-high-black flex items-center justify-center shadow-[4px_4px_0px_#18181b] -rotate-6">
                        <Trophy className="w-10 h-10 text-white animate-bounce" />
                      </div>

                      <div className="korean-wrap">
                        <span className="text-[10px] text-high-black/50 font-black uppercase tracking-widest font-mono">MISSION ACCOMPLISHED</span>
                        <h2 className="text-3xl font-display font-black text-high-black mt-1">
                          🎉 우봉고 {roomState?.maxRounds || 300}단계 완벽 정복! 🎉
                        </h2>
                        <p className="text-sm text-high-black/60 mt-2 font-medium leading-relaxed max-w-sm mx-auto">
                          훌륭합니다! {roomState?.maxRounds || 300}개의 모든 하이브리드 코스를 완주하였습니다. 공간지각 능력의 한계를 극복하셨군요!
                        </p>
                      </div>

                      <div className="bg-high-alpha border-2 border-high-black rounded-2xl p-5 w-full max-w-xs flex flex-col items-center gap-1.5 shadow-sm">
                        <span className="text-[10px] font-mono font-black text-high-black/50">최종 누적 보석 개수 (TOTAL SCORE)</span>
                        <strong className="text-3xl font-mono font-black text-high-black">💎 {selfPlayer?.score} Gems</strong>
                      </div>

                      <div className="w-full border-t border-high-black/10 pt-5 text-xs text-high-black/50 font-semibold korean-wrap">
                        교사나 다른 학생들이 도전을 끝마칠 때까지 잠시만 기다려 주세요! 🕰️
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  /* SOLO PLAYING STUDY WORKSPACE */
                  <motion.div
                    key="solo-playing-view"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start"
                  >
                    {/* Left Column: Personal Progress status */}
                    <div className="lg:col-span-1 flex flex-col gap-4">
                      <div className="bg-high-surface high-border p-5 rounded-3xl high-shadow flex flex-col gap-4">
                        <div className="border-b-2 border-high-black pb-3">
                          <h3 className="text-xs font-black tracking-wider text-high-black/60 uppercase font-mono">
                            📊 MY SOLO CHALLENGE
                          </h3>
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-high-black/60">현재 단계:</span>
                            <span className="text-sm font-black font-mono text-high-black">{selfPlayer?.soloRound} / {roomState?.maxRounds || 300} Stage</span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-high-alpha rounded-full h-3 border border-high-black overflow-hidden">
                            <div
                              className="bg-art-accent h-full border-r border-high-black transition-all duration-300"
                              style={{ width: `${Math.round(((selfPlayer?.soloRound || 1) / (roomState?.maxRounds || 300)) * 100)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-semibold text-high-black/60 font-mono">TOTAL SCORE:</span>
                            <span className="text-base font-black font-mono text-high-black">💎 {selfPlayer?.score}</span>
                          </div>
                        </div>

                        {/* Guide hints */}
                        <div className="border-t border-high-black/10 pt-4 mt-2 bg-high-alpha p-3 rounded-xl border border-high-black/5 flex flex-col gap-1.5 text-[11px] text-high-black/70 font-semibold korean-wrap">
                          <div className="font-bold text-high-black uppercase tracking-wider font-mono text-[9px] mb-0.5">💡 단축키 가이드 (Keyboard)</div>
                          <div>• <kbd className="font-mono bg-white border border-high-black/20 px-1 rounded">R</kbd> 키 : 선택 조각 시계방향 90도 회전</div>
                          <div>• <kbd className="font-mono bg-white border border-high-black/20 px-1 rounded">F</kbd> 키 : 선택 조각 좌우 반전</div>
                          <div>• <kbd className="font-mono bg-white border border-high-black/20 px-1 rounded">ESC</kbd> 키 : 조각 선택 취소</div>
                        </div>
                      </div>

                      {/* Small Live Board of opponents for fun */}
                      <Leaderboard
                        roomState={roomState}
                        currentPlayerId={playerId || ""}
                        onKickPlayer={handleKickPlayer}
                      />
                    </div>

                    {/* Central Puzzle Workspace */}
                    <div className="lg:col-span-3 flex flex-col gap-6">
                      {/* Solo State Header with beautiful timer */}
                      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between p-5 bg-high-surface high-border rounded-3xl gap-4 high-shadow">
                        <div className="flex items-center gap-4">
                          <div className="bg-high-black text-white px-4 py-2.5 rounded-2xl text-center min-w-[85px] border border-high-black">
                            <span className="block text-[10px] text-white/60 font-black uppercase tracking-wider font-mono">
                              STAGE
                            </span>
                            <strong className="text-2xl font-black text-art-accent font-mono block -mt-1">
                              {selfPlayer?.soloRound} <span className="text-white/40 text-xs font-normal">/ {roomState?.maxRounds || 300}</span>
                            </strong>
                          </div>

                          <div className="korean-wrap">
                            <h2 className="text-xl font-display font-black text-high-black flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-art-accent animate-pulse" /> 스테이지 모양 맞추기!
                            </h2>
                            <p className="text-xs text-high-black/60 mt-0.5 font-medium leading-relaxed">
                              {selfPlayer?.soloSolved ? (
                                <span className="text-emerald-600 font-black animate-pulse">
                                  🎉 퍼즐 완성 돌파 성공! (다음 단계를 클릭하세요!)
                                </span>
                              ) : soloTimer === 0 ? (
                                <span className="text-red-500 font-black animate-pulse">
                                  ⏰ 시간 초과! 다음 단계 버튼을 클릭하여 패스할 수 있습니다.
                                </span>
                              ) : (
                                "지정된 영역을 퍼즐 조각으로 완전히 채우세요!"
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Local Countdown Clock */}
                        <div className="flex items-center gap-4 bg-high-alpha border-2 border-high-black px-5 py-2.5 rounded-2xl justify-between md:justify-end">
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] text-high-black/50 font-black uppercase tracking-widest font-mono">
                              스테이지 남은 시간 (STAGE TIMER)
                            </span>
                            <span
                              className={`text-lg font-mono font-black tracking-tighter ${
                                soloTimer <= 15 ? "text-red-600 animate-pulse" : "text-high-black"
                              }`}
                            >
                              {Math.floor(soloTimer / 60)}:
                              {String(soloTimer % 60).padStart(2, "0")}
                            </span>
                          </div>

                          <div className="relative flex items-center justify-center">
                            <svg className="w-14 h-14 transform -rotate-90">
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                className="text-high-black/10"
                              />
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                strokeDasharray="150.8"
                                strokeDashoffset={150.8 - (Math.min(soloTimer, 120) / 120) * 150.8}
                                className={soloTimer <= 15 ? "text-red-500" : "text-high-black"}
                              />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xs font-mono font-black text-high-black">
                                {soloTimer}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Workspace block */}
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        {/* Puzzle Board */}
                        <div className="md:col-span-3 relative">
                          <BoardGrid
                            board={activeBoard}
                            placedPieces={placedPieces}
                            selectedPieceId={selectedPieceId}
                            selectedPieceCells={
                              selectedPieceId !== null ? rotatedCells[selectedPieceId] : null
                            }
                            onPlacePiece={handlePlacePiece}
                            onRemovePiece={handleRemovePiece}
                          />

                          {/* Overlay solve screen */}
                          {selfPlayer?.soloSolved && (
                            <div className="absolute inset-0 bg-white/80 border-4 border-emerald-600 rounded-[32px] flex flex-col items-center justify-center text-center p-6 backdrop-blur-[2px] z-20 gap-4">
                              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-3xl shadow-sm border border-emerald-300">🎉</div>
                              <div className="korean-wrap">
                                <h3 className="text-2xl font-black text-emerald-800">우봉고 돌파 성공!</h3>
                                <p className="text-sm font-semibold text-high-black/70 mt-1">
                                  {120 - soloTimer}초 만에 완료하여 보석 획득!
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  socketRef.current?.send(JSON.stringify({ type: "next-solo-stage" }));
                                }}
                                className="high-button-primary animate-bounce px-8 py-4 text-base font-black tracking-wide cursor-pointer"
                              >
                                다음 단계 도전하기 ➡️
                              </button>
                            </div>
                          )}

                          {/* Overlay timeout screen */}
                          {soloTimer === 0 && !selfPlayer?.soloSolved && (
                            <div className="absolute inset-0 bg-white/80 border-4 border-red-500 rounded-[32px] flex flex-col items-center justify-center text-center p-6 backdrop-blur-[2px] z-20 gap-4">
                              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-3xl shadow-sm border border-red-300">⏰</div>
                              <div className="korean-wrap">
                                <h3 className="text-2xl font-black text-red-600">시간 초과되었습니다!</h3>
                                <p className="text-xs font-semibold text-high-black/70 mt-1 max-w-[250px] mx-auto">
                                  이번 라운드의 시간 제한이 만료되었습니다. 패스하고 다음 스테이지를 시작할 수 있습니다.
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  socketRef.current?.send(JSON.stringify({ type: "next-solo-stage" }));
                                }}
                                className="high-button-white border-red-500 text-red-500 hover:bg-red-50 px-8 py-3.5 text-sm font-black cursor-pointer"
                              >
                                패스하고 다음 단계로 ➡️
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Selected Piece Actions & Reset */}
                        <div className="md:col-span-2 flex flex-col gap-4">
                          <div className="bg-high-surface high-border p-5 sm:p-6 rounded-3xl flex flex-col items-center justify-center gap-5 text-center min-h-[200px] high-shadow-sm">
                            {selectedPieceId !== null ? (
                              <>
                                <span className="text-[10px] font-black text-high-black uppercase tracking-widest bg-art-accent/20 px-2.5 py-1 rounded-full border-2 border-high-black font-mono">
                                  선택된 퍼즐 조각 (Active Piece)
                                </span>

                                {/* Interactive preview */}
                                <div className="h-28 flex items-center justify-center">
                                  <div
                                    className="grid gap-1.5 bg-high-alpha p-4 rounded-2xl border-2 border-high-black"
                                    style={{
                                      gridTemplateRows: `repeat(${
                                        Math.max(...rotatedCells[selectedPieceId].map(([r]) => r)) + 1
                                      }, minmax(0, 1fr))`,
                                      gridTemplateColumns: `repeat(${
                                        Math.max(...rotatedCells[selectedPieceId].map(([_, c]) => c)) + 1
                                      }, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {Array.from({
                                      length:
                                        Math.max(...rotatedCells[selectedPieceId].map(([r]) => r)) + 1,
                                    }).map((_, rIdx) =>
                                      Array.from({
                                        length:
                                          Math.max(
                                            ...rotatedCells[selectedPieceId].map(([_, c]) => c)
                                          ) + 1,
                                      }).map((_, cIdx) => {
                                        const isPart = rotatedCells[selectedPieceId].some(
                                          (([r, c]) => r === rIdx && c === cIdx)
                                        );
                                        const pieceColor =
                                          PIECES.find((p) => p.id === selectedPieceId)?.color || "bg-high-black";
                                        return (
                                          <div
                                            key={`${rIdx}-${cIdx}`}
                                            className={`w-6 h-6 rounded-md border border-black/20 ${
                                              isPart ? `${pieceColor} shadow-[inset_0_2px_0_rgba(255,255,255,0.3)]` : "bg-transparent"
                                            }`}
                                          />
                                        );
                                      })
                                    )}
                                  </div>
                                </div>

                                {/* Control actions */}
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={rotateSelected}
                                    className="high-button-accent px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" /> 회전 (R)
                                  </button>
                                  <button
                                    onClick={flipSelected}
                                    className="high-button-white px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <FlipHorizontal className="w-3.5 h-3.5 text-high-black" /> 대칭 (F)
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center p-4 korean-wrap">
                                <div className="w-14 h-14 rounded-2xl bg-high-alpha flex items-center justify-center border-2 border-high-black text-high-black text-2xl mb-3">
                                  🧩
                                </div>
                                <span className="text-sm font-black text-high-black">
                                  조각을 선택하세요
                                </span>
                                <p className="text-xs text-high-black/50 mt-1.5 max-w-[200px] leading-relaxed font-semibold">
                                  하단 퍼즐 트레이에서 조각을 선택하면 회전 및 배치할 수 있습니다.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Reset Board button */}
                          <button
                            onClick={handleResetBoard}
                            className="high-button-white w-full py-4 text-xs flex items-center justify-center gap-2 cursor-pointer text-red-600 hover:text-red-700"
                          >
                            <RefreshCw className="w-4 h-4" /> 보드 전체 초기화 (Reset)
                          </button>
                        </div>
                      </div>

                      {/* Piece Tray */}
                      <div className="bg-high-alpha border-4 border-high-black p-6 rounded-[24px]">
                        <PieceTray
                          pieceIds={activeBoard.solutionPieceIds}
                          selectedPieceId={selectedPieceId}
                          placedPieceIds={placedPieces.map((p) => p.pieceId)}
                          onSelect={(pId) => {
                            if (selectedPieceId === pId) {
                              setSelectedPieceId(null);
                            } else {
                              setSelectedPieceId(pId);
                            }
                          }}
                          rotatedCells={rotatedCells}
                          onDragStart={handleDragStart}
                        />
                      </div>
                    </div>
                  </motion.div>
                )
              )
            ) : (
              /* STANDARD COMPETITION PLAYING SCREEN */
              <motion.div
                key="playing-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start"
              >
                {/* Leaderboard and Opponent Grids */}
                <div className="lg:col-span-1">
                  <Leaderboard
                    roomState={roomState}
                    currentPlayerId={playerId || ""}
                    onKickPlayer={handleKickPlayer}
                  />
                </div>

                {/* Central Puzzle Board Workspace */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Round State Header */}
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between p-5 bg-high-surface high-border rounded-3xl gap-4 high-shadow">
                    <div className="flex items-center gap-4">
                      <div className="bg-high-black text-white px-4 py-2.5 rounded-2xl text-center min-w-[85px] border border-high-black">
                        <span className="block text-[10px] text-white/60 font-black uppercase tracking-wider font-mono">
                          ROUND
                        </span>
                        <strong className="text-2xl font-black text-art-accent font-mono block -mt-1">
                          {roomState.round} <span className="text-white/40 text-xs font-normal">/ {roomState.maxRounds}</span>
                        </strong>
                      </div>

                      <div className="korean-wrap">
                        <h2 className="text-xl font-display font-black text-high-black flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-art-accent animate-pulse" /> 모양을 맞추세요!
                        </h2>
                        <p className="text-xs text-high-black/60 mt-0.5 font-medium leading-relaxed">
                          {roomState.firstSolvedByName ? (
                            <span className="text-art-solved font-black animate-pulse">
                              🎉 {roomState.firstSolvedByName}님이 1위 돌파! (60초 카운트다운 가동)
                            </span>
                          ) : (
                            "조각을 회전/반전 시키며 정확히 메우세요!"
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Timer UI with beautiful radial progress circle */}
                    <div className="flex items-center gap-4 bg-high-alpha border-2 border-high-black px-5 py-2.5 rounded-2xl justify-between md:justify-end">
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] text-high-black/50 font-black uppercase tracking-widest font-mono">
                          남은 시간 (TIME)
                        </span>
                        <span
                          className={`text-lg font-mono font-black tracking-tighter ${
                            roomState.timer <= 15 ? "text-red-600 animate-pulse" : "text-high-black"
                          }`}
                        >
                          {Math.floor(roomState.timer / 60)}:
                          {String(roomState.timer % 60).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="relative flex items-center justify-center">
                        <svg className="w-14 h-14 transform -rotate-90">
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className="text-high-black/10"
                          />
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray="150.8"
                            strokeDashoffset={150.8 - (Math.min(roomState.timer, 120) / 120) * 150.8}
                            className={roomState.timer <= 15 ? "text-red-500" : "text-high-black"}
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-xs font-mono font-black text-high-black">
                            {roomState.timer}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Workspace Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Left Column: Board Grid */}
                    <div className="md:col-span-3">
                      <BoardGrid
                        board={activeBoard}
                        placedPieces={placedPieces}
                        selectedPieceId={selectedPieceId}
                        selectedPieceCells={
                          selectedPieceId !== null ? rotatedCells[selectedPieceId] : null
                        }
                        onPlacePiece={handlePlacePiece}
                        onRemovePiece={handleRemovePiece}
                      />
                    </div>

                    {/* Right Column: Active hand piece controls & Piece details */}
                    <div className="md:col-span-2 flex flex-col gap-4">
                      {/* Active Selected Piece Manipulator Panel */}
                      <div className="bg-high-surface high-border p-5 sm:p-6 rounded-3xl flex flex-col items-center justify-center gap-5 text-center min-h-[200px] high-shadow-sm">
                        {selectedPieceId !== null ? (
                          <>
                            <span className="text-[10px] font-black text-high-black uppercase tracking-widest bg-art-accent/20 px-2.5 py-1 rounded-full border-2 border-high-black font-mono">
                              선택된 퍼즐 조각 (Active Piece)
                            </span>

                            {/* Interactive preview of current rotated orientation */}
                            <div className="h-28 flex items-center justify-center">
                              <div
                                className="grid gap-1.5 bg-high-alpha p-4 rounded-2xl border-2 border-high-black"
                                style={{
                                  gridTemplateRows: `repeat(${
                                    Math.max(...rotatedCells[selectedPieceId].map(([r]) => r)) + 1
                                  }, minmax(0, 1fr))`,
                                  gridTemplateColumns: `repeat(${
                                    Math.max(...rotatedCells[selectedPieceId].map(([_, c]) => c)) + 1
                                  }, minmax(0, 1fr))`,
                                }}
                              >
                                {Array.from({
                                  length:
                                    Math.max(...rotatedCells[selectedPieceId].map(([r]) => r)) + 1,
                                }).map((_, rIdx) =>
                                  Array.from({
                                    length:
                                      Math.max(
                                        ...rotatedCells[selectedPieceId].map(([_, c]) => c)
                                      ) + 1,
                                  }).map((_, cIdx) => {
                                    const isPart = rotatedCells[selectedPieceId].some(
                                      (([r, c]) => r === rIdx && c === cIdx)
                                    );
                                    const pieceColor =
                                      PIECES.find((p) => p.id === selectedPieceId)?.color || "bg-high-black";
                                    return (
                                      <div
                                        key={`${rIdx}-${cIdx}`}
                                        className={`w-6 h-6 rounded-md border border-black/20 ${
                                          isPart ? `${pieceColor} shadow-[inset_0_2px_0_rgba(255,255,255,0.3)]` : "bg-transparent"
                                        }`}
                                      />
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Control actions */}
                            <div className="flex items-center gap-3">
                              <button
                                onClick={rotateSelected}
                                className="high-button-accent px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <RotateCw className="w-3.5 h-3.5" /> 회전 (R)
                              </button>
                              <button
                                onClick={flipSelected}
                                className="high-button-white px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <FlipHorizontal className="w-3.5 h-3.5 text-high-black" /> 대칭 (F)
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 korean-wrap">
                            <div className="w-14 h-14 rounded-2xl bg-high-alpha flex items-center justify-center border-2 border-high-black text-high-black text-2xl mb-3">
                              🧩
                            </div>
                            <span className="text-sm font-black text-high-black">
                              조각을 선택하세요
                            </span>
                            <p className="text-xs text-high-black/50 mt-1.5 max-w-[200px] leading-relaxed font-semibold">
                              하단 퍼즐 트레이에서 조각을 선택하면 회전 및 배치할 수 있습니다.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Reset Workspace button */}
                      <button
                        onClick={handleResetBoard}
                        className="high-button-white w-full py-4 text-xs flex items-center justify-center gap-2 cursor-pointer text-red-600 hover:text-red-700"
                      >
                        <RefreshCw className="w-4 h-4" /> 보드 전체 초기화 (Reset)
                      </button>
                    </div>
                  </div>

                  {/* Bottom Piece Tray */}
                  <div className="bg-high-alpha border-4 border-high-black p-6 rounded-[24px]">
                    <PieceTray
                      pieceIds={activeBoard.solutionPieceIds}
                      selectedPieceId={selectedPieceId}
                      placedPieceIds={placedPieces.map((p) => p.pieceId)}
                      onSelect={(pId) => {
                        if (selectedPieceId === pId) {
                          setSelectedPieceId(null);
                        } else {
                          setSelectedPieceId(pId);
                        }
                      }}
                      rotatedCells={rotatedCells}
                      onDragStart={handleDragStart}
                    />
                  </div>
                </div>
              </motion.div>
            )
          )}

          {/* ROUND OVER / FINAL SUMMARY SCREEN */}
          {roomState && roomState.gameStarted && roomState.state === "ROUND_OVER" && (
            <motion.div
              key="roundover-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto flex flex-col gap-6 py-6"
            >
              <div className="bg-high-surface high-border p-8 rounded-[32px] high-shadow flex flex-col items-center text-center gap-6">
                {/* Visual Header */}
                <div className="flex flex-col items-center korean-wrap">
                  <div className="w-16 h-16 rounded-2xl bg-high-black border-2 border-high-black flex items-center justify-center mb-3 shadow-[3px_3px_0px_#18181b]">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-xs font-black text-high-black/50 uppercase tracking-widest font-mono">
                    ROUND COMPLETED
                  </span>
                  <h1 className="text-3xl font-display font-black text-high-black mt-1">
                    {roomState.round < roomState.maxRounds
                      ? `라운드 ${roomState.round} 결과 발표`
                      : "🎉 게임 최종 결과 발표! 🎉"}
                  </h1>
                </div>

                {/* Round Solver Announcement */}
                <div className="w-full bg-high-alpha p-5 rounded-2xl border-2 border-high-black flex items-center justify-between text-left">
                  <div className="korean-wrap">
                    <span className="text-[10px] text-high-black/50 uppercase font-black tracking-wider block font-mono">
                      1위 돌파 플레이어 (First Solver)
                    </span>
                    <strong className="text-xl font-display font-black text-high-black mt-1 block">
                      {roomState.firstSolvedByName ? `${roomState.firstSolvedByName}!` : "없음"}
                    </strong>
                  </div>
                  <div className="px-3.5 py-2 bg-art-accent border-2 border-high-black text-high-black rounded-xl text-xs font-black shadow-sm">
                    +3 보석 획득
                  </div>
                </div>

                {/* Score results list */}
                <div className="w-full flex flex-col gap-2.5">
                  <h3 className="text-xs font-black text-high-black/40 uppercase tracking-widest text-left pl-1 font-mono">
                    SCOREBOARD (GEMS BOARD)
                  </h3>
                  {[...roomState.players]
                    .sort((a, b) => b.score - a.score)
                    .map((player, index) => {
                      const isWinner = index === 0 && roomState.round === roomState.maxRounds;
                      return (
                        <div
                          key={player.id}
                          className={`flex items-center justify-between p-4 bg-high-surface rounded-2xl border-2 transition-all duration-300 ${
                            isWinner ? "border-high-black bg-art-accent/15 shadow-[3px_3px_0px_#18181b]" : "border-high-black/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-high-black/50 font-mono w-8 text-center">
                              {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}위`}
                            </span>
                            <div className="text-left korean-wrap">
                              <span className="text-sm font-bold text-high-black flex items-center gap-1.5">
                                {player.name}
                                {player.id === playerId && (
                                  <span className="text-[9px] bg-high-black text-white px-1.5 py-0.5 rounded font-black">
                                    나
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-high-black/50 block mt-0.5">
                                {player.solved ? "✔️ 이번 라운드 퍼즐 해결 (Solved)" : "❌ 미해결"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-mono font-black text-high-black">
                              💎 {player.score}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Final Winner Showcase */}
                {roomState.round === roomState.maxRounds && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full p-6 bg-art-accent/20 border-4 border-high-black rounded-3xl mt-2 flex flex-col items-center gap-2.5 shadow-[4px_4px_0px_#18181b]"
                  >
                    <Crown className="w-12 h-12 text-high-black animate-bounce" />
                    <div className="korean-wrap">
                      <span className="text-[10px] font-black text-high-black/60 uppercase tracking-widest block font-mono">
                        GRAND CHAMPION
                      </span>
                      <strong className="text-2xl font-display font-black text-high-black mt-1 block">
                        {[...roomState.players].sort((a, b) => b.score - a.score)[0]?.name || "플레이어"}
                      </strong>
                    </div>
                  </motion.div>
                )}

                {/* Host Next round trigger controls */}
                <div className="w-full border-t-2 border-high-black/10 pt-6 mt-2">
                  {playerId && roomState.players.find((p) => p.id === playerId)?.isHost ? (
                    <div className="flex flex-col sm:flex-row gap-4 w-full">
                      {roomState.round < roomState.maxRounds ? (
                        <button
                          onClick={handleNextRound}
                          className="high-button-primary w-full py-4.5 text-sm tracking-wide flex items-center justify-center cursor-pointer"
                        >
                          다음 라운드 시작 🚀
                        </button>
                      ) : (
                        <button
                          onClick={handleRestartLobby}
                          className="high-button-white w-full py-4.5 text-sm tracking-wide flex items-center justify-center cursor-pointer"
                        >
                          로비로 돌아가기 (대기방 이동)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-high-alpha rounded-2xl border-2 border-high-black text-high-black/60 text-xs text-center font-bold korean-wrap">
                      🕰️ 방장이 다음 라운드를 시작할 때까지 대기하고 있습니다...
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* LUCKY BOX MODAL POPUP */}
          {luckyBoxOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-high-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-high-surface border-4 border-high-black rounded-[36px] p-8 max-w-sm w-full text-center high-shadow flex flex-col items-center gap-6"
              >
                <div className="w-20 h-20 bg-art-accent border-4 border-high-black rounded-3xl flex items-center justify-center text-5xl shadow-[4px_4px_0px_#18181b] animate-bounce cursor-pointer">
                  🎁
                </div>

                <div className="korean-wrap">
                  <span className="text-[10px] text-high-black/60 font-black tracking-widest font-mono uppercase block">30% LUCKY CHANCE!</span>
                  <h3 className="text-2xl font-display font-black text-high-black mt-1">대박! 럭키 박스 당첨!</h3>
                  <p className="text-xs text-high-black/60 mt-2 font-semibold leading-relaxed">
                    퍼즐 통과 축하 보너스 당첨 기회입니다! 박스를 열어 추가 점수를 확인하세요!
                  </p>
                </div>

                {luckyBoxRevealed === null ? (
                  <button
                    onClick={() => {
                      const rewards = [10, 30, 50];
                      const chosenReward = rewards[Math.floor(Math.random() * rewards.length)];
                      setLuckyBoxRevealed(chosenReward);
                      if (!muted) synth.playSuccess();
                      // Send points addition to server
                      socketRef.current?.send(JSON.stringify({
                        type: "add-bonus-points",
                        payload: { points: chosenReward }
                      }));
                    }}
                    className="high-button-primary w-full py-4 text-sm font-black tracking-wide flex items-center justify-center gap-2 cursor-pointer"
                  >
                    🎁 럭키 박스 열기!
                  </button>
                ) : (
                  <div className="w-full flex flex-col gap-4 animate-fade-in">
                    <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded-2xl flex flex-col items-center gap-1">
                      <span className="text-[10px] text-emerald-700 font-bold font-mono">REWARD UNLOCKED</span>
                      <strong className="text-3xl font-mono font-black text-emerald-700">💎 +{luckyBoxRevealed} Gems!</strong>
                    </div>

                    <button
                      onClick={() => {
                        setLuckyBoxOpen(false);
                        setLuckyBoxRevealed(null);
                      }}
                      className="high-button-white w-full py-3.5 text-xs font-black cursor-pointer"
                    >
                      닫기 (돌아가기)
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* TIMER COUNTDOWN START OVERLAY EFFECT */}
          {showSolveEffect && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-high-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, rotate: -5 }}
                animate={{ scale: [0.8, 1.1, 1], rotate: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="bg-white border-8 border-high-black rounded-[48px] p-10 max-w-lg w-full text-center high-shadow flex flex-col items-center gap-6 relative overflow-hidden"
              >
                {/* Decorative retro border bars */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-high-black" />
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-high-black" />

                <div className="w-24 h-24 bg-high-black rounded-full flex items-center justify-center text-5xl text-white shadow-[4px_4px_0px_rgba(0,0,0,0.25)] animate-pulse">
                  ⏱️
                </div>

                <div className="korean-wrap">
                  <span className="text-xs text-red-600 font-mono font-black tracking-[0.25em] uppercase block animate-bounce">
                    ALERT! FIRST SOLVER DETECTED
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-display font-black text-high-black mt-3 leading-tight">
                    {solveEffectName} <span className="text-red-600">1위 돌파!</span>
                  </h3>
                  <div className="mt-6 p-4 bg-zinc-100 border-4 border-high-black rounded-2xl flex flex-col items-center gap-1.5">
                    <span className="text-[11px] text-high-black/60 font-mono font-black uppercase">COUNTDOWN STARTED</span>
                    <strong className="text-4xl font-mono font-black text-high-black animate-pulse">
                      ⏳ 60 SECONDS LEFT!
                    </strong>
                  </div>
                  <p className="text-xs text-high-black/60 mt-4 font-semibold leading-relaxed">
                    첫 번째 우승자가 퍼즐을 완료하였습니다!<br />
                    모든 참가자가 제한 시간 내에 조각을 맞춰 다음 단계로 진출하세요!
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Drag Layer (Pointer-Tracking Snap Engine) */}
      {dragState.isDragging && dragState.pieceId !== null && (
        <div
          ref={floatingRef}
          className="fixed pointer-events-none z-[9999] opacity-60 transition-none"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${dragState.x}px, ${dragState.y}px, 0) translate(-50%, -50%)`,
          }}
        >
          {(() => {
            const piece = PIECES.find((p) => p.id === dragState.pieceId);
            const cells = rotatedCells[dragState.pieceId] || piece?.cells || [];
            if (!piece || cells.length === 0) return null;

            const maxR = Math.max(...cells.map(([r]) => r));
            const maxC = Math.max(...cells.map(([_, c]) => c));
            const rows = maxR + 1;
            const cols = maxC + 1;

            return (
              <div
                className="grid gap-1.5 bg-high-surface p-3.5 rounded-2xl border-4 border-high-black shadow-[6px_6px_12px_rgba(0,0,0,0.25)]"
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
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 border-high-black ${
                          isPart ? `${piece.color}` : "bg-transparent border-transparent"
                        }`}
                      />
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
