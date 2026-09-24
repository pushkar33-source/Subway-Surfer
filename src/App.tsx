import React, { useEffect, useRef, useState } from 'react';
import {
  Trophy,
  Coins,
  Flame,
  Volume2,
  VolumeX,
  Music,
  Pause,
  Play,
  RotateCcw,
  Download,
  Share2,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Magnet,
  Zap,
} from 'lucide-react';
import { SubwayGame } from './game';
import { GameStats, PowerupType } from './types';
import { soundManager } from './audio';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SubwayGame | null>(null);

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameover'>('menu');
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    distance: 0,
    coins: 0,
    speed: 24,
    multiplier: 1,
    activePowerup: null,
    powerupTimer: 0,
    highScore: Number(localStorage.getItem('subway_runner_highscore') || '0'),
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isMusicOn, setIsMusicOn] = useState(true);
  const [showControlsHint, setShowControlsHint] = useState(true);
  const [coinPop, setCoinPop] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new SubwayGame(containerRef.current, {
      onStatsUpdate: (newStats) => {
        setStats(newStats);
      },
      onGameOver: (finalStats) => {
        setStats(finalStats);
        setGameState('gameover');
        if (finalStats.score > finalStats.highScore) {
          setIsNewHighScore(true);
        }
      },
      onCoinCollected: () => {
        setCoinPop(true);
        setTimeout(() => setCoinPop(false), 250);
      },
      onPowerupAcquired: () => {
        // Powerup triggered
      },
    });

    gameRef.current = game;

    return () => {
      game.destroy();
    };
  }, []);

  const handleStart = () => {
    if (gameRef.current) {
      gameRef.current.startGame();
      setGameState('playing');
      setIsNewHighScore(false);
    }
  };

  const handleRestart = () => {
    if (gameRef.current) {
      gameRef.current.restartGame();
      setGameState('playing');
      setIsNewHighScore(false);
    }
  };

  const handleTogglePause = () => {
    if (gameRef.current) {
      const paused = gameRef.current.togglePause();
      setGameState(paused ? 'paused' : 'playing');
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundManager.setMuted(nextMuted);
  };

  const handleToggleMusic = () => {
    const nextMusic = !isMusicOn;
    setIsMusicOn(nextMusic);
    soundManager.setMusicEnabled(nextMusic);
  };

  const handleShare = () => {
    const text = `🏃 I scored ${stats.score.toLocaleString()} points (${stats.distance}m, ${stats.coins} coins) in Subway Runner 3D! Can you beat my high score?`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  const handleDownloadStandalone = () => {
    // Direct link to the standalone file
    const link = document.createElement('a');
    link.href = '/standalone.html';
    link.download = 'subway_runner_3d.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-['Outfit',sans-serif] select-none text-white">
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* TOP HUD BAR (Always visible during gameplay) */}
      {gameState === 'playing' && (
        <div className="absolute top-0 left-0 right-0 p-4 md:p-6 pointer-events-none flex items-start justify-between z-20">
          {/* Left Stats: Distance & Score */}
          <div className="flex flex-col gap-2">
            <div className="bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 px-4 py-2 rounded-2xl shadow-lg shadow-black/50 flex items-center gap-3">
              <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Distance</div>
                <div className="text-xl md:text-2xl font-black font-['Chakra_Petch',sans-serif] text-white">
                  {stats.distance.toLocaleString()} <span className="text-xs font-semibold text-cyan-400">m</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md border border-purple-500/30 px-4 py-1.5 rounded-xl shadow-lg flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-xs font-semibold text-slate-400">Score:</span>
              <span className="text-base font-bold text-yellow-300 font-['Chakra_Petch',sans-serif]">
                {stats.score.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Center: Active Power-up Indicator */}
          {stats.activePowerup && (
            <div className="animate-bounce">
              <div
                className={`backdrop-blur-md px-4 py-2 rounded-2xl border shadow-xl flex items-center gap-2.5 ${
                  stats.activePowerup === 'magnet'
                    ? 'bg-sky-950/80 border-sky-400 text-sky-300 shadow-sky-500/30'
                    : stats.activePowerup === 'sneakers'
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-emerald-500/30'
                    : 'bg-pink-950/80 border-pink-400 text-pink-300 shadow-pink-500/30'
                }`}
              >
                {stats.activePowerup === 'magnet' && <Magnet className="w-5 h-5 animate-spin" />}
                {stats.activePowerup === 'sneakers' && <Sparkles className="w-5 h-5 animate-pulse" />}
                {stats.activePowerup === 'multiplier' && <Zap className="w-5 h-5 animate-bounce" />}
                <div className="text-left">
                  <div className="text-[10px] uppercase font-extrabold tracking-wider">
                    {stats.activePowerup === 'magnet'
                      ? 'Coin Magnet'
                      : stats.activePowerup === 'sneakers'
                      ? 'Super Jump'
                      : '2X Score'}
                  </div>
                  <div className="text-xs font-black font-['Chakra_Petch',sans-serif]">
                    {stats.powerupTimer}s left
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right Stats: Coins & Controls */}
          <div className="flex flex-col items-end gap-2 pointer-events-auto">
            <div
              className={`bg-slate-900/80 backdrop-blur-md border border-amber-500/40 px-4 py-2 rounded-2xl shadow-lg shadow-black/50 flex items-center gap-3 transition-transform duration-150 ${
                coinPop ? 'scale-115 border-amber-300' : 'scale-100'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-yellow-200 flex items-center justify-center shadow-md shadow-amber-500/50">
                <Coins className="w-4 h-4 text-amber-950" />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Coins</div>
                <div className="text-xl md:text-2xl font-black font-['Chakra_Petch',sans-serif] text-yellow-400">
                  {stats.coins.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/50">
              <button
                onClick={handleToggleMute}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
              <button
                onClick={handleToggleMusic}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title={isMusicOn ? 'Music Off' : 'Music On'}
              >
                <Music className={`w-4 h-4 ${isMusicOn ? 'text-emerald-400' : 'text-slate-500'}`} />
              </button>
              <button
                onClick={handleTogglePause}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Pause"
              >
                <Pause className="w-4 h-4 text-yellow-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE ON-SCREEN CONTROLS (Only visible on small touchscreens during gameplay) */}
      {gameState === 'playing' && (
        <div className="md:hidden absolute bottom-6 inset-x-4 flex items-center justify-between pointer-events-none z-20">
          {/* Left / Right Buttons */}
          <div className="flex gap-2 pointer-events-auto">
            <button
              onTouchStart={() => gameRef.current?.shiftLane(-1)}
              onClick={() => gameRef.current?.shiftLane(-1)}
              className="w-14 h-14 rounded-2xl bg-slate-900/70 active:bg-cyan-500/40 backdrop-blur-md border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onTouchStart={() => gameRef.current?.shiftLane(1)}
              onClick={() => gameRef.current?.shiftLane(1)}
              className="w-14 h-14 rounded-2xl bg-slate-900/70 active:bg-cyan-500/40 backdrop-blur-md border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg active:scale-95 transition-all"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>

          {/* Jump / Slide Buttons */}
          <div className="flex gap-2 pointer-events-auto">
            <button
              onTouchStart={() => gameRef.current?.jump()}
              onClick={() => gameRef.current?.jump()}
              className="w-14 h-14 rounded-2xl bg-slate-900/70 active:bg-amber-500/40 backdrop-blur-md border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg active:scale-95 transition-all"
            >
              <ArrowUp className="w-6 h-6" />
            </button>
            <button
              onTouchStart={() => gameRef.current?.slide()}
              onClick={() => gameRef.current?.slide()}
              className="w-14 h-14 rounded-2xl bg-slate-900/70 active:bg-purple-500/40 backdrop-blur-md border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg active:scale-95 transition-all"
            >
              <ArrowDown className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* START MENU OVERLAY */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30">
          <div className="max-w-md w-full text-center flex flex-col items-center">
            {/* Title Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> 3D Arcade Endless Runner
            </div>

            {/* Logo */}
            <h1 className="text-5xl md:text-6xl font-black font-['Chakra_Petch',sans-serif] tracking-tight uppercase bg-gradient-to-r from-cyan-400 via-amber-300 to-rose-400 bg-clip-text text-transparent drop-shadow-lg mb-2">
              SUBWAY RUNNER
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-medium max-w-sm mb-6">
              Dodge oncoming trains, jump roadblocks, slide under signals, and grab gold coins in the 3D subway!
            </p>

            {/* High Score Banner */}
            {stats.highScore > 0 && (
              <div className="w-full bg-slate-900/80 border border-yellow-500/30 rounded-2xl p-3 flex items-center justify-center gap-3 mb-6 shadow-md shadow-yellow-500/10">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400">All-Time Best:</span>
                <span className="text-lg font-black font-['Chakra_Petch',sans-serif] text-yellow-300">
                  {stats.highScore.toLocaleString()} pts
                </span>
              </div>
            )}

            {/* Play Button */}
            <button
              onClick={handleStart}
              className="w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-black font-['Chakra_Petch',sans-serif] text-xl tracking-wider uppercase shadow-xl shadow-orange-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 mb-4"
            >
              <Play className="w-6 h-6 fill-current" /> Tap or Press Space to Run
            </button>

            {/* Controls Guide */}
            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2 mb-4">
              <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2">Quick Controls</div>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-cyan-300">A / D</span>
                  <span>or <span className="font-mono text-cyan-300">← →</span> Switch Lanes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-amber-300">W / Space</span>
                  <span>or <span className="font-mono text-amber-300">↑</span> Jump</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-purple-300">S</span>
                  <span>or <span className="font-mono text-purple-300">↓</span> Slide / Duck</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-emerald-300">Swipe</span>
                  <span>Mobile Gestures</span>
                </div>
              </div>
            </div>

            {/* Download Standalone File Button */}
            <button
              onClick={handleDownloadStandalone}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors py-2 px-3 rounded-lg hover:bg-slate-900/60"
            >
              <Download className="w-3.5 h-3.5" /> Download Standalone HTML (Zero Dependencies)
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30 animate-in fade-in duration-200">
          <div className="max-w-md w-full text-center flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl shadow-rose-950/40">
            {/* Header */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-wider mb-2">
              CRASHED!
            </div>

            <h2 className="text-4xl md:text-5xl font-black font-['Chakra_Petch',sans-serif] tracking-tight uppercase text-white mb-2">
              GAME OVER
            </h2>

            {isNewHighScore && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-400 text-yellow-300 text-sm font-bold animate-pulse mb-4">
                <Trophy className="w-4 h-4" /> NEW ALL-TIME HIGH SCORE!
              </div>
            )}

            {/* Score Showcase */}
            <div className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-4 my-4">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1">Final Score</div>
              <div className="text-4xl font-black font-['Chakra_Petch',sans-serif] text-yellow-400">
                {stats.score.toLocaleString()}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800/80">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Distance</div>
                  <div className="text-xl font-bold font-['Chakra_Petch',sans-serif] text-cyan-400">
                    {stats.distance.toLocaleString()} m
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Coins Collected</div>
                  <div className="text-xl font-bold font-['Chakra_Petch',sans-serif] text-amber-400 flex items-center justify-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-400" /> {stats.coins.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <button
              onClick={handleRestart}
              className="w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-black font-['Chakra_Petch',sans-serif] text-xl tracking-wider uppercase shadow-xl shadow-orange-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 mb-3"
            >
              <RotateCcw className="w-6 h-6" /> Play Again (Space / Tap)
            </button>

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleShare}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-slate-700"
              >
                <Share2 className="w-4 h-4 text-cyan-400" /> Share Score
              </button>
              <button
                onClick={handleDownloadStandalone}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-slate-700"
              >
                <Download className="w-4 h-4 text-amber-400" /> Save HTML
              </button>
            </div>

            {shareToast && (
              <div className="mt-3 text-xs text-emerald-400 font-semibold animate-fade-in">
                Score copied to clipboard! Share it with friends.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30">
          <div className="max-w-sm w-full text-center bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
            <Pause className="w-12 h-12 text-yellow-400 mb-2" />
            <h3 className="text-3xl font-black font-['Chakra_Petch',sans-serif] uppercase mb-4">PAUSED</h3>

            <button
              onClick={handleTogglePause}
              className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black font-['Chakra_Petch',sans-serif] text-lg uppercase tracking-wider shadow-lg shadow-cyan-500/30 mb-3"
            >
              Resume Game
            </button>
            <button
              onClick={handleRestart}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
            >
              Restart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
