/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { RoomState } from "../types.js";
import { Users, Bot, Settings, Play, Check, Copy, ArrowRight, ShieldCheck, UserCheck, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { synth } from "../utils/audio.js";

interface LobbyProps {
  roomState: RoomState | null;
  playerId: string | null;
  onJoinRoom: (name: string, code: string, password?: string, gameMode?: "SOLO" | "COMPETITION" | "TIMER") => void;
  onToggleReady: () => void;
  onAddBot: () => void;
  onStartGame: (maxRounds: number) => void;
  onKickPlayer: (playerId: string) => void;
  errorMsg: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  playerId,
  onJoinRoom,
  onToggleReady,
  onAddBot,
  onStartGame,
  onKickPlayer,
  errorMsg,
}) => {
  const [activeTab, setActiveTab] = useState<"STUDENT" | "TEACHER">("STUDENT");
  
  // Student Form State
  const [studentNickname, setStudentNickname] = useState("");
  const [studentRoomCode, setStudentRoomCode] = useState("");

  // Teacher Form State
  const [teacherName, setTeacherName] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [selectedMode, setSelectedMode] = useState<"SOLO" | "COMPETITION" | "TIMER">("SOLO");

  const [copied, setCopied] = useState(false);
  const [maxRounds, setMaxRounds] = useState(5);
  const [isCreating, setIsCreating] = useState(false);

  // Automatically reset creation loading state if error occurs or roomState changes
  useEffect(() => {
    setIsCreating(false);
  }, [errorMsg, roomState]);

  const handleCopyCode = () => {
    if (roomState?.code) {
      navigator.clipboard.writeText(roomState.code);
      setCopied(true);
      synth.playClick();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. Splash Screen / Login Section
  if (!roomState) {
    return (
      <div className="flex flex-col items-center justify-center max-w-lg mx-auto py-6 px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <div className="inline-block bg-high-black text-white text-[10px] px-3.5 py-1.5 rounded-full font-black uppercase tracking-widest mb-3 border-2 border-high-black shadow-[2px_4px_8px_rgba(0,0,0,0.15)]">
            REAL-TIME MULTIPLAYER BOARD GAME
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tight text-high-black mb-2">
            우봉고 온라인
          </h1>
          <p className="text-high-black/60 text-xs leading-relaxed max-w-sm mx-auto font-semibold korean-wrap">
            두뇌 회전 100%! 완벽한 형태를 가장 먼저 조합하여 UBONGO를 외치세요!
          </p>
        </motion.div>

        {/* Tab Selector */}
        <div className="w-full flex bg-high-alpha p-1 rounded-2xl border-4 border-high-black mb-5 gap-1">
          <button
            onClick={() => {
              synth.playClick();
              setActiveTab("STUDENT");
            }}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "STUDENT"
                ? "bg-high-black text-white"
                : "text-high-black/60 hover:text-high-black"
            }`}
          >
            <UserCheck className="w-4 h-4" /> 학생으로 참여하기
          </button>
          <button
            onClick={() => {
              synth.playClick();
              setActiveTab("TEACHER");
            }}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "TEACHER"
                ? "bg-high-black text-white"
                : "text-high-black/60 hover:text-high-black"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> 교사로 방 개설 (마스터키)
          </button>
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full bg-high-surface high-border p-7 rounded-[32px] high-shadow flex flex-col gap-5 relative overflow-hidden"
        >
          
          {errorMsg && (
            <div className="p-4 bg-red-100 border-2 border-red-500 text-red-800 text-xs rounded-2xl font-black">
              ⚠️ {errorMsg}
            </div>
          )}

          {activeTab === "STUDENT" ? (
            /* STUDENT LOGIN FORM */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-high-black/50 uppercase tracking-widest font-mono">
                  학생 식별 닉네임 (NICKNAME)
                </label>
                <input
                  type="text"
                  placeholder="닉네임을 입력하세요 (공백 불가)"
                  value={studentNickname}
                  onChange={(e) => setStudentNickname(e.target.value)}
                  className="px-5 py-3.5 bg-high-surface border-4 border-high-black rounded-2xl text-high-black text-sm outline-none transition-all placeholder:text-high-black/30 font-bold focus:bg-high-alpha focus:ring-4 focus:ring-high-black"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-high-black/50 uppercase tracking-widest font-mono">
                  6자리 고유 참가 코드 (6-DIGIT CODE)
                </label>
                <input
                  type="text"
                  placeholder="ROOM CODE"
                  maxLength={6}
                  value={studentRoomCode}
                  onChange={(e) => setStudentRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  className="px-5 py-4 bg-high-surface border-4 border-high-black rounded-2xl text-high-black text-base text-center font-mono font-black tracking-[0.2em] outline-none transition-all placeholder:text-high-black/30 focus:bg-high-alpha focus:ring-4 focus:ring-high-black font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <button
                disabled={!studentNickname.trim() || studentRoomCode.length !== 6}
                onClick={() => {
                  synth.playClick();
                  onJoinRoom(studentNickname, studentRoomCode);
                }}
                className={`w-full py-4 rounded-2xl font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                  studentNickname.trim() && studentRoomCode.length === 6
                    ? "bg-high-black text-white border-4 border-high-black shadow-[4px_4px_10px_rgba(0,0,0,0.18)] hover:bg-zinc-800 hover:shadow-[5px_5px_12px_rgba(0,0,0,0.22)] active:translate-y-[2px] active:shadow-sm"
                    : "bg-high-alpha border-2 border-high-black/25 text-high-black/30 cursor-not-allowed"
                }`}
              >
                교실 입장하기 <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* TEACHER ROOM CREATE FORM */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-high-black/50 uppercase tracking-widest font-mono">
                  교사 이름 (TEACHER NAME)
                </label>
                <input
                  type="text"
                  placeholder="김교사"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="px-5 py-3.5 bg-high-surface border-4 border-high-black rounded-2xl text-high-black text-sm outline-none transition-all placeholder:text-high-black/30 font-bold focus:bg-high-alpha focus:ring-4 focus:ring-high-black"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-high-black/50 uppercase tracking-widest font-mono">
                  교사 마스터 비밀번호 (MASTER PASSWORD)
                </label>
                <input
                  type="password"
                  placeholder="비밀번호 입력"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="px-5 py-3.5 bg-high-surface border-4 border-high-black rounded-2xl text-high-black text-sm outline-none transition-all placeholder:text-high-black/30 font-mono font-bold focus:bg-high-alpha focus:ring-4 focus:ring-high-black focus:shadow-sm"
                />
              </div>

              {/* Game Mode Segment Selector */}
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-[10px] font-black text-high-black/50 uppercase tracking-widest font-mono">
                  룸 진행 모드 (SESSION MODE)
                </label>
                <div className="grid grid-cols-3 gap-2 bg-high-alpha p-1 rounded-2xl border-2 border-high-black">
                  <button
                    type="button"
                    onClick={() => { synth.playClick(); setSelectedMode("SOLO"); }}
                    className={`py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      selectedMode === "SOLO" ? "bg-high-black text-white shadow-sm" : "text-high-black/60 hover:text-high-black"
                    }`}
                  >
                    개인 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => { synth.playClick(); setSelectedMode("COMPETITION"); }}
                    className={`py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      selectedMode === "COMPETITION" ? "bg-high-black text-white shadow-sm" : "text-high-black/60 hover:text-high-black"
                    }`}
                  >
                    경쟁 모드
                  </button>
                  <button
                    type="button"
                    onClick={() => { synth.playClick(); setSelectedMode("TIMER"); }}
                    className={`py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      selectedMode === "TIMER" ? "bg-high-black text-white shadow-sm" : "text-high-black/60 hover:text-high-black"
                    }`}
                  >
                    ⏱️ 타이머
                  </button>
                </div>

                {/* Mode Explanation Panel */}
                <div className="p-4 bg-high-black/5 border-2 border-high-black rounded-xl text-left">
                  {selectedMode === "SOLO" ? (
                    <div className="korean-wrap">
                      <h5 className="text-xs font-black text-high-black flex items-center gap-1">🎯 개인 모드 (Solo Mode)</h5>
                      <p className="text-[11px] text-high-black/70 mt-1 leading-relaxed font-semibold">
                        각 학생은 <strong>300스테이지 독립 하이브리드 코스</strong>를 개별 진도에 맞춰 완료합니다. 교사는 실시간 대시보드로 전체 참가자의 진도와 배치를 단방향으로 관제합니다.
                      </p>
                    </div>
                  ) : selectedMode === "TIMER" ? (
                    <div className="korean-wrap">
                      <h5 className="text-xs font-black text-high-black flex items-center gap-1">⏱️ 타이머 모드 (Timer Mode)</h5>
                      <p className="text-[11px] text-high-black/70 mt-1 leading-relaxed font-semibold">
                        <strong>10분</strong> 동안 개별로 퍼즐을 풀며 점수를 쌓습니다. 퍼즐은 무한 제공되며 난이도는 랜덤입니다. 보너스 럭키박스도 등장합니다!
                      </p>
                    </div>
                  ) : (
                    <div className="korean-wrap">
                      <h5 className="text-xs font-black text-high-black flex items-center gap-1">⚔️ 경쟁 모드 (Competition Mode)</h5>
                      <p className="text-[11px] text-high-black/70 mt-1 leading-relaxed font-semibold">
                        기존의 우봉고 방식대로 진행됩니다. 모든 플레이어가 동일한 라운드 퍼즐에 동시 참여하며, 가장 빠르게 조합을 완성한 플레이어와 순위에 따라 보석(점수)을 획득합니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                disabled={isCreating || !teacherName.trim() || !teacherPassword.trim()}
                onClick={() => {
                  synth.playClick();
                  setIsCreating(true);
                  onJoinRoom(teacherName, "", teacherPassword, selectedMode);
                }}
                className={`w-full py-4 mt-2 rounded-2xl font-black text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                  !isCreating && teacherName.trim() && teacherPassword.trim()
                    ? "bg-high-black text-white border-4 border-high-black shadow-[4px_4px_10px_rgba(0,0,0,0.18)] hover:bg-zinc-800 hover:shadow-[5px_5px_12px_rgba(0,0,0,0.22)] active:translate-y-[2px] active:shadow-sm"
                    : "bg-high-alpha border-2 border-high-black/25 text-high-black/30 cursor-not-allowed"
                }`}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-high-black/60" />
                    <span>퍼즐 및 룸 생성 중...</span>
                  </>
                ) : (
                  <>
                    <span>교사용 룸 개설하기</span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // 2. Waiting Room Lobby: Inside a room, waiting for players to be ready
  const self = roomState.players.find((p) => p.id === playerId);
  const isHost = self?.isHost || false;
  const isSoloMode = roomState.gameMode === "SOLO";
  const isTimerMode = roomState.gameMode === "TIMER";
  const isIndividualMode = isSoloMode || isTimerMode;
  
  // In solo & timer mode, players are immediately ready. In competition mode, they must toggle.
  const allReady = isIndividualMode ? true : roomState.players.every((p) => p.isReady);

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Lobby Details & Settings */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-high-surface high-border p-5 sm:p-6 rounded-3xl high-shadow flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black text-high-black/40 uppercase tracking-widest font-mono">
                  MULTIPL_ROOM_CONNECTED
                </span>
                <h1 className="text-3xl font-display font-black text-high-black mt-1">대기실 로비</h1>
                <div className="mt-1">
                  <span className={`inline-block text-[10px] px-2.5 py-1 rounded-full font-black border-2 border-high-black ${
                    isSoloMode ? "bg-high-black text-white" : isTimerMode ? "bg-emerald-100 text-emerald-950" : "bg-purple-100 text-purple-900"
                  }`}>
                    {isSoloMode ? "🎯 개인 모드 (Solo Mode)" : isTimerMode ? "⏱️ 타이머 모드 (Timer Mode)" : "⚔️ 경쟁 모드 (Competition)"}
                  </span>
                </div>
              </div>

              {/* Room Code with Copy Button */}
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-[10px] text-high-black/40 uppercase font-black tracking-widest font-mono">
                  ROOM CODE
                </span>
                <button
                  onClick={handleCopyCode}
                  className="mt-1 flex items-center gap-2 px-4 py-2 bg-high-surface border-4 border-high-black rounded-2xl text-high-black font-mono font-black tracking-wider text-sm shadow-[3px_3px_8px_rgba(0,0,0,0.15)] hover:shadow-[1px_1px_4px_rgba(0,0,0,0.10)] transition-all cursor-pointer hover:bg-high-alpha active:translate-y-0.5 font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {roomState.code}
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-100 border-2 border-red-500 text-red-800 text-xs rounded-xl font-bold">
                ⚠️ {errorMsg}
              </div>
            )}
          </motion.div>

          {/* Game Parameters */}
          <div className="bg-high-surface high-border p-5 sm:p-6 rounded-3xl high-shadow-sm flex flex-col gap-5">
            <h3 className="text-xs font-black tracking-widest text-high-black/50 uppercase flex items-center gap-2 border-b-2 border-high-black pb-3 font-mono">
              <Settings className="w-4 h-4 text-high-black" />
              <span>⚙️ MATCH SETUP & CONFIG</span>
            </h3>

            <div className="flex flex-col gap-4">
              {isSoloMode ? (
                /* SOLO MODE CONFIG */
                <div className="korean-wrap p-2 text-sm text-high-black/70 leading-relaxed font-semibold">
                  <span className="block font-black text-high-black mb-1">🎯 300스테이지 하이브리드 코스</span>
                  개인 모드에서는 라운드가 넘어갈수록 난이도가 점진적으로 상승하는 300개의 퍼즐 스테이지로 작동합니다. 대기자 모두가 들어오면 아래 버튼으로 즉시 세션을 시작할 수 있습니다.
                </div>
              ) : isTimerMode ? (
                /* TIMER MODE CONFIG */
                <div className="korean-wrap p-2 text-sm text-high-black/70 leading-relaxed font-semibold">
                  <span className="block font-black text-high-black mb-1">⏱️ 10분 타이머 서바이벌 챌린지</span>
                  10분간 연속해서 랜덤 퍼즐을 해결합니다. 퍼즐을 풀 때마다 점수를 획득하며 추가 럭키 찬스 보석 획득 상자도 등장합니다! 방장이 시작 버튼을 누르면 즉시 전체 타이머 매치가 작동합니다.
                </div>
              ) : (
                /* COMPETITION CONFIG */
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="korean-wrap">
                      <h4 className="text-sm font-black text-high-black">총 매치 라운드</h4>
                      <p className="text-xs text-high-black/50 mt-0.5 leading-relaxed font-semibold">모든 라운드가 끝나고 보석을 가장 많이 획득한 사람이 승리합니다.</p>
                    </div>
                    {isHost ? (
                      <div className="flex bg-high-alpha p-1 rounded-xl border-2 border-high-black">
                        {[3, 5, 7].map((r) => (
                          <button
                            key={r}
                            onClick={() => {
                              synth.playClick();
                              setMaxRounds(r);
                            }}
                            className={`px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                              maxRounds === r
                                ? "bg-high-black text-white"
                                : "text-high-black/50 hover:bg-high-surface/50"
                            }`}
                          >
                            {r} 라운드
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm font-black text-high-black font-mono bg-art-accent/20 px-3 py-1.5 rounded-lg border-2 border-high-black">
                        {maxRounds} 라운드 (방장 권한)
                      </span>
                    )}
                  </div>

                  <div className="border-t-2 border-high-black/10 my-1" />

                  {/* Bot Adding Area */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="korean-wrap">
                      <h4 className="text-sm font-black text-high-black">인공지능 AI 봇 투입</h4>
                      <p className="text-xs text-high-black/50 mt-0.5 leading-relaxed font-semibold">경쟁자가 부족하다면 영리한 퍼즐 AI봇을 추가해보세요!</p>
                    </div>
                    {isHost ? (
                      <button
                        onClick={() => {
                          synth.playClick();
                          onAddBot();
                        }}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-50 border-2 border-high-black rounded-2xl text-purple-900 shadow-[2px_4px_8px_rgba(0,0,0,0.12)] hover:shadow-[1px_2px_4px_rgba(0,0,0,0.08)] hover:bg-purple-100 text-xs font-black transition-all cursor-pointer"
                      >
                        <Bot className="w-4 h-4 text-purple-800" /> AI 봇 참가시키기
                      </button>
                    ) : (
                      <span className="text-xs text-high-black/30 font-bold uppercase tracking-wider font-mono">HOST CONTROL ONLY</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Toggle Ready (only for competition mode student players) */}
            {!isIndividualMode && (
              <button
                onClick={() => {
                  synth.playClick();
                  onToggleReady();
                }}
                className={`flex-1 py-4.5 rounded-2xl font-black text-sm tracking-wide transition-all cursor-pointer ${
                  self?.isReady
                    ? "bg-emerald-100 border-4 border-high-black text-emerald-900 shadow-[3px_3px_8px_rgba(0,0,0,0.12)] active:translate-y-0.5"
                    : "high-button-white"
                }`}
              >
                {self?.isReady ? "준비 완료 취소 (Cancel Ready)" : "게임 준비 완료 (Ready Up!)"}
              </button>
            )}

            {/* Host Start Game Button */}
            {isHost && (
              <button
                disabled={!allReady}
                onClick={() => {
                  synth.playClick();
                  onStartGame(isIndividualMode ? 300 : maxRounds);
                }}
                className={`flex-1 py-4.5 rounded-2xl font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  allReady
                    ? "high-button-accent animate-bounce"
                    : "bg-high-alpha border-2 border-high-black/20 text-high-black/30 cursor-not-allowed"
                }`}
              >
                <Play className="w-4 h-4 fill-current" /> {isSoloMode ? "개인 모드 세션 시작! 🚀" : isTimerMode ? "타이머 모드 시작! ⏱️" : "경쟁 모드 매치 시작! ⚔️"}
              </button>
            )}
          </div>
          
          {!allReady && isHost && !isIndividualMode && (
            <p className="text-center text-xs text-high-black/50 font-bold font-semibold korean-wrap">
              * 모든 참여자가 준비 상태여야 게임을 시작할 수 있습니다.
            </p>
          )}

          {isIndividualMode && !isHost && (
            <div className="p-4 bg-zinc-100 border-2 border-high-black rounded-2xl text-high-black text-xs text-center font-bold animate-pulse korean-wrap">
              🕰️ 교사(방장)가 게임 세션을 시작하기를 대기하고 있습니다...
            </div>
          )}
        </div>

        {/* Right Side: Players List with status */}
        <div className="flex flex-col gap-4">
          <div className="bg-high-surface high-border p-5 sm:p-6 rounded-3xl high-shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-black tracking-widest text-high-black/50 uppercase flex items-center gap-2 pb-2 border-b-2 border-high-black/15 font-mono">
              <Users className="w-3.5 h-3.5 text-high-black/40" />
              <span>WAITING PLAYERS ({roomState.players.length})</span>
            </h3>

            <div className="flex flex-col gap-3">
              {roomState.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 bg-high-surface rounded-2xl border-2 border-high-black transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-high-black border-2 border-high-black flex items-center justify-center text-sm font-black text-white font-mono shadow-sm flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-high-black flex items-center gap-1.5 flex-wrap">
                        <span className="truncate max-w-[100px]">{p.name}</span>
                        {p.isHost && (
                          <span className="text-[9px] bg-art-accent/30 border border-high-black text-high-black px-1.5 py-0.5 rounded font-black flex-shrink-0">
                            {isSoloMode ? "교사" : "방장"}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-high-black/40 font-mono font-bold">
                        {p.id.startsWith("bot_") ? "AI BOT" : isSoloMode && p.isHost ? "TEACHER" : "STUDENT"}
                      </span>
                    </div>
                  </div>

                  {/* Ready Indicator badge (Hide in solo mode since we auto-ready) */}
                  <div className="flex items-center gap-2">
                    {!isSoloMode && (
                      p.isReady ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-500 px-2.5 py-1 rounded-full font-black flex items-center gap-0.5 font-mono">
                          <Check className="w-3 h-3" /> READY
                        </span>
                      ) : (
                        <span className="text-[10px] bg-high-alpha text-high-black/40 border border-high-black/25 px-2.5 py-1 rounded-full font-black font-mono">
                          WAIT
                        </span>
                      )
                    )}

                    {/* Kick Action */}
                    {isHost && p.id !== playerId && (
                      <button
                        onClick={() => {
                          synth.playClick();
                          onKickPlayer(p.id);
                        }}
                        className="text-[10px] font-black uppercase text-red-600 hover:bg-red-100 hover:border-red-500 border border-transparent px-2 py-1 rounded-lg transition-all cursor-pointer"
                      >
                        강퇴
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
