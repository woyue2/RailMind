import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, X, Volume2 } from 'lucide-react';
import { AudioAttachment } from '../../types';
import { formatAudioDuration } from '../../utils/audioUtils';

interface AudioPlayerPillProps {
  audio: AudioAttachment;
  onRemove?: () => void;
  className?: string;
  autoPlay?: boolean;
}

export const AudioPlayerPill: React.FC<AudioPlayerPillProps> = ({
  audio,
  onRemove,
  className = '',
  autoPlay = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = new Audio(audio.url);
    audioRef.current = el;

    const handleLoadedMetadata = () => {
      if (el.duration && !isNaN(el.duration) && isFinite(el.duration)) {
        setDuration(Math.round(el.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    el.addEventListener('loadedmetadata', handleLoadedMetadata);
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('ended', handleEnded);
    el.addEventListener('pause', handlePause);
    el.addEventListener('play', handlePlay);

    if (autoPlay) {
      el.play().catch(() => {});
    }

    return () => {
      el.pause();
      el.removeEventListener('loadedmetadata', handleLoadedMetadata);
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('pause', handlePause);
      el.removeEventListener('play', handlePlay);
      audioRef.current = null;
    };
  }, [audio.url, autoPlay]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Audio play failed:', err);
      });
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const remainingSeconds = Math.max(0, duration - currentTime);
  const displayDuration = isPlaying
    ? formatAudioDuration(remainingSeconds)
    : formatAudioDuration(duration);

  return (
    <div
      onClick={togglePlay}
      className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 text-white select-none cursor-pointer overflow-hidden shadow-xs hover:bg-slate-800 transition-all ${className}`}
      style={{ minWidth: '130px', maxWidth: '200px' }}
      title={isPlaying ? '暂停播放' : '点击播放语音'}
    >
      {/* Background progress fill */}
      <div
        className="absolute inset-0 bg-blue-600/30 transition-all pointer-events-none"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Play/Pause icon button */}
      <div className="relative z-10 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
        {isPlaying ? (
          <Pause className="w-2.5 h-2.5 fill-white text-white" />
        ) : (
          <Play className="w-2.5 h-2.5 fill-white text-white ml-0.5" />
        )}
      </div>

      {/* 5-bar animated waveform equalizer */}
      <div className="relative z-10 flex items-center gap-0.5 flex-1 justify-center h-3">
        <span
          className={`w-0.5 rounded-full bg-white/80 transition-all duration-300 ${
            isPlaying ? 'h-3 animate-pulse' : 'h-1.5'
          }`}
          style={{ animationDelay: '0ms' }}
        />
        <span
          className={`w-0.5 rounded-full bg-white/90 transition-all duration-300 ${
            isPlaying ? 'h-2.5 animate-pulse' : 'h-3'
          }`}
          style={{ animationDelay: '150ms' }}
        />
        <span
          className={`w-0.5 rounded-full bg-white transition-all duration-300 ${
            isPlaying ? 'h-3.5 animate-pulse' : 'h-2'
          }`}
          style={{ animationDelay: '300ms' }}
        />
        <span
          className={`w-0.5 rounded-full bg-white/90 transition-all duration-300 ${
            isPlaying ? 'h-2 animate-pulse' : 'h-2.5'
          }`}
          style={{ animationDelay: '450ms' }}
        />
        <span
          className={`w-0.5 rounded-full bg-white/80 transition-all duration-300 ${
            isPlaying ? 'h-3 animate-pulse' : 'h-1.5'
          }`}
          style={{ animationDelay: '200ms' }}
        />
      </div>

      {/* Duration badge */}
      <div className="relative z-10 flex items-center gap-1 font-mono text-[11px] font-medium text-white/90 flex-shrink-0">
        <Volume2 className="w-3 h-3 text-blue-300" />
        <span>{displayDuration}</span>
      </div>

      {/* Optional Remove button (in draft context) */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (audioRef.current) audioRef.current.pause();
            onRemove();
          }}
          className="relative z-10 p-0.5 text-white/60 hover:text-white hover:bg-white/20 rounded-full transition-colors ml-0.5"
          title="移除录音"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
