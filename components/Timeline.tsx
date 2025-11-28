
import React, { useRef, useState, useEffect } from 'react';
import { Clip, Track, ProjectState } from '../types';
import { TRACK_HEIGHT } from '../constants';

interface TimelineProps {
  project: ProjectState;
  onSeek: (time: number) => void;
  onClipUpdate: (clip: Clip) => void;
  onClipSelect: (id: string | null) => void;
}

const Timeline: React.FC<TimelineProps> = ({ project, onSeek, onClipUpdate, onClipSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<{ id: string, startX: number, originalOffset: number } | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // Touch handling refs
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{x: number, y: number} | null>(null);

  const handleMouseDown = (e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation();
    onClipSelect(clip.id);
    setDraggingClip({
      id: clip.id,
      startX: e.clientX,
      originalOffset: clip.offset
    });
  };

  // Touch Handlers for Clips (Long Press)
  const handleClipTouchStart = (e: React.TouchEvent, clip: Clip) => {
    // We don't stop propagation immediately to allow for potential scrolling if it's not a long press
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    
    longPressTimer.current = setTimeout(() => {
        // Long press detected - Enter drag mode
        onClipSelect(clip.id);
        setDraggingClip({
            id: clip.id,
            startX: touch.clientX,
            originalOffset: clip.offset
        });
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500); // 500ms threshold
  };

  const handleClipTouchMove = (e: React.TouchEvent) => {
      // If waiting for long press, check if finger moved too much (scrolling)
      if (longPressTimer.current && touchStartPos.current) {
          const touch = e.touches[0];
          const dx = Math.abs(touch.clientX - touchStartPos.current.x);
          const dy = Math.abs(touch.clientY - touchStartPos.current.y);
          
          if (dx > 10 || dy > 10) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
          }
      }
  };

  const handleClipTouchEnd = () => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  };

  const handlePlayheadTouchStart = (e: React.TouchEvent) => {
      e.stopPropagation();
      setIsDraggingPlayhead(true);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollLeft = containerRef.current.scrollLeft;
    const newTime = (clickX + scrollLeft) / project.zoom;
    onSeek(Math.max(0, newTime));
  };

  // Global Drag Handlers
  useEffect(() => {
    const handleGlobalMove = (clientX: number) => {
      if (draggingClip) {
        const deltaPixels = clientX - draggingClip.startX;
        const deltaSeconds = deltaPixels / project.zoom;
        const newOffset = Math.max(0, draggingClip.originalOffset + deltaSeconds);
        
        const clip = project.clips.find(c => c.id === draggingClip.id);
        if (clip) {
          onClipUpdate({ ...clip, offset: newOffset });
        }
      }

      if (isDraggingPlayhead && containerRef.current) {
         const rect = containerRef.current.getBoundingClientRect();
         // Account for scroll
         const x = clientX - rect.left + containerRef.current.scrollLeft;
         const newTime = Math.max(0, x / project.zoom);
         onSeek(newTime);
      }
    };

    const handleMouseUp = () => {
      if (draggingClip) setDraggingClip(null);
      if (isDraggingPlayhead) setIsDraggingPlayhead(false);
    };

    const onMouseMove = (e: MouseEvent) => handleGlobalMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
        if (draggingClip || isDraggingPlayhead) {
            e.preventDefault(); // Prevent scrolling while dragging
            handleGlobalMove(e.touches[0].clientX);
        }
    };

    if (draggingClip || isDraggingPlayhead) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      // Passive: false is needed to allow preventDefault
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      window.addEventListener('touchcancel', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchcancel', handleMouseUp);
    };
  }, [draggingClip, isDraggingPlayhead, project.clips, project.zoom, onClipUpdate, onSeek]);

  // Helper to generate time markers
  const renderRuler = () => {
    const markers = [];
    const totalSeconds = Math.max(project.duration + 60, 300); // Minimum 5 mins
    const step = 5; // every 5 seconds

    for (let i = 0; i <= totalSeconds; i += step) {
      markers.push(
        <div 
          key={i} 
          className="absolute top-0 h-4 border-l border-gray-600 text-xs text-gray-400 pl-1 select-none"
          style={{ left: i * project.zoom }}
        >
          {i % 10 === 0 ? formatTime(i) : ''}
        </div>
      );
    }
    return markers;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="flex-1 bg-gray-900 overflow-x-auto overflow-y-hidden relative select-none custom-scrollbar"
      ref={containerRef}
    >
        {/* Ruler */}
        <div 
            className="h-8 bg-gray-800 border-b border-gray-700 relative sticky top-0 z-30 cursor-pointer"
            onClick={handleTimelineClick}
            style={{ minWidth: (project.duration + 60) * project.zoom }}
        >
            {renderRuler()}
            {/* Playhead Indicator in Ruler - Made Draggable */}
            <div 
                className="absolute top-0 bottom-0 w-4 h-full -ml-2 cursor-ew-resize z-40 group flex flex-col items-center"
                style={{ left: project.currentTime * project.zoom }}
                onMouseDown={handlePlayheadMouseDown}
                onTouchStart={handlePlayheadTouchStart}
            >
               <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 group-hover:border-t-red-400 transition-colors" />
            </div>
        </div>

        {/* Tracks Area */}
        <div className="relative" style={{ minWidth: (project.duration + 60) * project.zoom }}>
            
            {/* Playhead Line */}
            <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
                style={{ left: project.currentTime * project.zoom, height: project.tracks.length * TRACK_HEIGHT }}
            />

            {project.tracks.map((track) => (
                <div 
                    key={track.id}
                    className="relative border-b border-gray-800 bg-gray-900/50"
                    style={{ height: TRACK_HEIGHT }}
                >
                    <div className="absolute left-2 top-2 text-[10px] text-gray-500 pointer-events-none uppercase font-semibold">
                      {track.name}
                    </div>
                    {project.clips
                        .filter(c => c.track === track.id)
                        .map(clip => {
                            const width = (clip.end - clip.start) * project.zoom;
                            const left = clip.offset * project.zoom;
                            const isSelected = clip.id === project.selectedClipId;
                            const isAudio = clip.type === 'audio';

                            return (
                                <div
                                    key={clip.id}
                                    onMouseDown={(e) => handleMouseDown(e, clip)}
                                    onTouchStart={(e) => handleClipTouchStart(e, clip)}
                                    onTouchMove={handleClipTouchMove}
                                    onTouchEnd={handleClipTouchEnd}
                                    onTouchCancel={handleClipTouchEnd}
                                    className={`absolute top-6 bottom-2 rounded cursor-move overflow-hidden border ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400/30' : isAudio ? 'border-green-600' : 'border-blue-600'}`}
                                    style={{ 
                                        left, 
                                        width, 
                                        backgroundColor: isAudio ? '#2f855a' : '#2b6cb0',
                                        zIndex: isSelected ? 10 : 1,
                                        transform: draggingClip?.id === clip.id ? 'scale(1.02)' : 'none',
                                        transition: 'transform 0.1s'
                                    }}
                                >
                                    <div className="px-2 py-1 text-xs text-white font-medium truncate">
                                        {clip.name}
                                    </div>
                                    <div className="px-2 text-[10px] opacity-70 flex justify-between">
                                        <span>{(clip.end - clip.start).toFixed(1)}s</span>
                                    </div>
                                    {/* Clip Handles (Visual only for now) */}
                                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-white/10 hover:bg-white/30 cursor-ew-resize" />
                                    <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/10 hover:bg-white/30 cursor-ew-resize" />
                                </div>
                            );
                        })
                    }
                </div>
            ))}
        </div>
    </div>
  );
};

export default Timeline;
