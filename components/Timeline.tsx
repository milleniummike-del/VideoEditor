
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

  const handleMouseDown = (e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation();
    onClipSelect(clip.id);
    setDraggingClip({
      id: clip.id,
      startX: e.clientX,
      originalOffset: clip.offset
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingClip) {
      const deltaPixels = e.clientX - draggingClip.startX;
      const deltaSeconds = deltaPixels / project.zoom;
      
      const newOffset = Math.max(0, draggingClip.originalOffset + deltaSeconds);
      
      const clip = project.clips.find(c => c.id === draggingClip.id);
      if (clip) {
        onClipUpdate({ ...clip, offset: newOffset });
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingClip(null);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollLeft = containerRef.current.scrollLeft;
    const newTime = (clickX + scrollLeft) / project.zoom;
    onSeek(Math.max(0, newTime));
  };

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
      className="flex-1 bg-gray-900 overflow-x-auto overflow-y-hidden relative select-none"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
        {/* Ruler */}
        <div 
            className="h-8 bg-gray-800 border-b border-gray-700 relative sticky top-0 z-10 cursor-pointer"
            onClick={handleTimelineClick}
            style={{ minWidth: (project.duration + 60) * project.zoom }}
        >
            {renderRuler()}
            {/* Playhead Indicator in Ruler */}
            <div 
                className="absolute top-0 bottom-0 w-4 h-full -ml-2 pointer-events-none"
                style={{ left: project.currentTime * project.zoom }}
            >
               <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 mx-auto" />
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
                                    className={`absolute top-6 bottom-2 rounded cursor-move overflow-hidden border ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400/30' : isAudio ? 'border-green-600' : 'border-blue-600'}`}
                                    style={{ 
                                        left, 
                                        width, 
                                        backgroundColor: isAudio ? '#2f855a' : '#2b6cb0',
                                        zIndex: isSelected ? 10 : 1
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
