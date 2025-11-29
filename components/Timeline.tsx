
import { useRef, useState, useEffect, type FC, type MouseEvent, type TouchEvent } from 'react';
import { Clip, ProjectState } from '../types';
import { TRACK_HEIGHT } from '../constants';

interface TimelineProps {
  project: ProjectState;
  onSeek: (time: number) => void;
  onClipUpdate: (clip: Clip) => void;
  onClipSelect: (id: string | null) => void;
  onMarkerUpdate: (inPoint: number | null, outPoint: number | null) => void;
}

const Timeline: FC<TimelineProps> = ({ project, onSeek, onClipUpdate, onClipSelect, onMarkerUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [dragState, setDragState] = useState<{
      isDragging: boolean;
      clipId: string | null;
      startX: number;
      originalOffset: number;
      originalStart: number;
      originalEnd: number;
      interactionType: 'move' | 'trim-start' | 'trim-end' | 'move-in-marker' | 'move-out-marker';
  }>({
      isDragging: false,
      clipId: null,
      startX: 0,
      originalOffset: 0,
      originalStart: 0,
      originalEnd: 0,
      interactionType: 'move'
  });

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Touch / Long Press Handling
  const longPressTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{x: number, y: number} | null>(null);

  const pixelsPerSecond = project.zoom;

  // Helper: Convert X position to Timeline Time
  const getTimelineTime = (clientX: number) => {
    if (!containerRef.current || !scrollContainerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const x = clientX - rect.left + scrollLeft;
    return Math.max(0, x / pixelsPerSecond);
  };

  // --- MOUSE HANDLERS FOR CLIPS ---

  const handleClipMouseDown = (e: MouseEvent, clip: Clip) => {
      e.stopPropagation();
      onClipSelect(clip.id);
      
      setDragState({
          isDragging: true,
          clipId: clip.id,
          startX: e.clientX,
          originalOffset: clip.offset,
          originalStart: clip.start,
          originalEnd: clip.end,
          interactionType: 'move'
      });
  };

  const handleTrimMouseDown = (e: MouseEvent, clip: Clip, type: 'trim-start' | 'trim-end') => {
      e.stopPropagation();
      e.preventDefault(); // Prevent text selection
      onClipSelect(clip.id);

      setDragState({
          isDragging: true,
          clipId: clip.id,
          startX: e.clientX,
          originalOffset: clip.offset,
          originalStart: clip.start,
          originalEnd: clip.end,
          interactionType: type
      });
  };

  // --- TOUCH HANDLERS FOR CLIPS ---

  const handleClipTouchStart = (e: TouchEvent, clip: Clip) => {
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };

      // Long press detection for moving clips (prevents accidental moves when scrolling)
      longPressTimer.current = window.setTimeout(() => {
          onClipSelect(clip.id);
          setDragState({
              isDragging: true,
              clipId: clip.id,
              startX: touch.clientX,
              originalOffset: clip.offset,
              originalStart: clip.start,
              originalEnd: clip.end,
              interactionType: 'move'
          });
          // Optional haptic feedback could go here
      }, 300); // Reduced delay for better responsiveness
  };

  const handleTrimTouchStart = (e: TouchEvent, clip: Clip, type: 'trim-start' | 'trim-end') => {
      e.stopPropagation();
      const touch = e.touches[0];
      onClipSelect(clip.id);

      setDragState({
          isDragging: true,
          clipId: clip.id,
          startX: touch.clientX,
          originalOffset: clip.offset,
          originalStart: clip.start,
          originalEnd: clip.end,
          interactionType: type
      });
  };

  const handleClipTouchMove = (e: TouchEvent) => {
      if (dragState.isDragging) {
          // If we are already dragging, prevent scrolling
          e.preventDefault();
      } else if (touchStartPos.current) {
          // Check if moved too much to cancel long press
          const touch = e.touches[0];
          const dist = Math.sqrt(
              Math.pow(touch.clientX - touchStartPos.current.x, 2) + 
              Math.pow(touch.clientY - touchStartPos.current.y, 2)
          );
          if (dist > 10) { // Tolerance
              if (longPressTimer.current) {
                  clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
              }
          }
      }
  };

  const handleClipTouchEnd = () => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
  };

  // --- MARKER HANDLERS ---

  const handleMarkerMouseDown = (e: MouseEvent, type: 'in' | 'out') => {
      e.stopPropagation();
      e.preventDefault();
      
      setDragState({
          isDragging: true,
          clipId: null, // Not used for markers
          startX: e.clientX,
          originalOffset: type === 'in' ? (project.inPoint || 0) : (project.outPoint || 0),
          originalStart: 0,
          originalEnd: 0,
          interactionType: type === 'in' ? 'move-in-marker' : 'move-out-marker'
      });
  };

  const handleMarkerTouchStart = (e: TouchEvent, type: 'in' | 'out') => {
      e.stopPropagation();
      // e.preventDefault(); // Might interfere with scrolling if not carefully used, but for marker drag we need to stop default
      
      const touch = e.touches[0];
      setDragState({
          isDragging: true,
          clipId: null,
          startX: touch.clientX,
          originalOffset: type === 'in' ? (project.inPoint || 0) : (project.outPoint || 0),
          originalStart: 0,
          originalEnd: 0,
          interactionType: type === 'in' ? 'move-in-marker' : 'move-out-marker'
      });
  };


  // --- GLOBAL MOVE HANDLER (Mouse & Touch) ---

  useEffect(() => {
      const handleGlobalMove = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
          // Handle Playhead Dragging
          if (isDraggingPlayhead) {
              e.preventDefault(); // Stop scroll while dragging playhead
              const clientX = 'touches' in e ? e.touches[0].clientX : (e as globalThis.MouseEvent).clientX;
              const newTime = getTimelineTime(clientX);
              onSeek(newTime);
              return;
          }

          // Handle Clip / Marker Dragging
          if (dragState.isDragging) {
              e.preventDefault(); // Stop scroll

              const clientX = 'touches' in e ? e.touches[0].clientX : (e as globalThis.MouseEvent).clientX;
              const deltaPixels = clientX - dragState.startX;
              const deltaTime = deltaPixels / pixelsPerSecond;

              // --- MARKER LOGIC ---
              if (dragState.interactionType === 'move-in-marker') {
                  let newIn = Math.max(0, dragState.originalOffset + deltaTime);
                  // Constraint: In cannot be > Out
                  if (project.outPoint !== null && newIn > project.outPoint) {
                      newIn = project.outPoint;
                  }
                  onMarkerUpdate(newIn, project.outPoint);
                  return;
              }
              
              if (dragState.interactionType === 'move-out-marker') {
                  let newOut = Math.max(0, dragState.originalOffset + deltaTime);
                  // Constraint: Out cannot be < In
                  if (project.inPoint !== null && newOut < project.inPoint) {
                      newOut = project.inPoint;
                  }
                  onMarkerUpdate(project.inPoint, newOut);
                  return;
              }

              // --- CLIP LOGIC ---
              if (dragState.clipId) {
                  const clip = project.clips.find(c => c.id === dragState.clipId);
                  if (!clip) return;

                  let updatedClip = { ...clip };

                  if (dragState.interactionType === 'move') {
                      const newOffset = Math.max(0, dragState.originalOffset + deltaTime);
                      updatedClip.offset = newOffset;
                  } 
                  else if (dragState.interactionType === 'trim-start') {
                      let newStart = dragState.originalStart + deltaTime;
                      
                      // Constrain
                      if (newStart < 0) newStart = 0;
                      if (newStart > dragState.originalEnd - 0.1) newStart = dragState.originalEnd - 0.1;

                      const offsetShift = newStart - dragState.originalStart;
                      
                      updatedClip.start = newStart;
                      updatedClip.offset = dragState.originalOffset + offsetShift;
                  } 
                  else if (dragState.interactionType === 'trim-end') {
                      let newEnd = dragState.originalEnd + deltaTime;
                      
                      if (newEnd > clip.duration) newEnd = clip.duration; 
                      if (newEnd < clip.start + 0.1) newEnd = clip.start + 0.1;

                      updatedClip.end = newEnd;
                  }

                  onClipUpdate(updatedClip);
              }
          }
      };

      const handleGlobalUp = () => {
          setDragState(prev => ({ ...prev, isDragging: false, clipId: null }));
          setIsDraggingPlayhead(false);
      };

      if (dragState.isDragging || isDraggingPlayhead) {
          window.addEventListener('mousemove', handleGlobalMove);
          window.addEventListener('mouseup', handleGlobalUp);
          // Use passive: false to allow preventDefault
          window.addEventListener('touchmove', handleGlobalMove, { passive: false });
          window.addEventListener('touchend', handleGlobalUp);
          window.addEventListener('touchcancel', handleGlobalUp);
      }

      return () => {
          window.removeEventListener('mousemove', handleGlobalMove);
          window.removeEventListener('mouseup', handleGlobalUp);
          window.removeEventListener('touchmove', handleGlobalMove);
          window.removeEventListener('touchend', handleGlobalUp);
          window.removeEventListener('touchcancel', handleGlobalUp);
      };
  }, [dragState, isDraggingPlayhead, project.clips, project.inPoint, project.outPoint, pixelsPerSecond, onClipUpdate, onSeek, onMarkerUpdate]);


  // --- PLAYHEAD HANDLERS ---
  
  const handleRulerMouseDown = (e: MouseEvent) => {
      const newTime = getTimelineTime(e.clientX);
      onSeek(newTime);
      setIsDraggingPlayhead(true);
  };

  const handlePlayheadTouchStart = (e: TouchEvent) => {
      const newTime = getTimelineTime(e.touches[0].clientX);
      onSeek(newTime);
      setIsDraggingPlayhead(true);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gray-900 overflow-hidden select-none">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar"
      >
         <div 
            ref={containerRef}
            className="relative min-w-full"
            style={{ 
                width: Math.max(project.duration * pixelsPerSecond + 200, window.innerWidth) + 'px',
                height: Math.max(project.tracks.length * TRACK_HEIGHT + 40, 200) + 'px'
            }}
         >
            {/* Ruler / Playhead Track */}
            <div 
                className="h-6 border-b border-gray-800 sticky top-0 bg-gray-900/90 z-20 cursor-pointer group/ruler"
                onMouseDown={handleRulerMouseDown}
                onTouchStart={handlePlayheadTouchStart}
            >
                {/* Time markers every 5 seconds */}
                {Array.from({ length: Math.ceil(project.duration / 5) + 2 }).map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute bottom-0 text-[10px] text-gray-500 border-l border-gray-700 pl-1"
                        style={{ left: (i * 5) * pixelsPerSecond }}
                    >
                        {i * 5}s
                    </div>
                ))}

                {/* In/Out Marker Region (Ruler Highlight) */}
                {project.inPoint !== null && project.outPoint !== null && (
                    <div 
                        className="absolute top-0 bottom-0 bg-blue-500/30 border-x border-blue-400 pointer-events-none"
                        style={{ 
                            left: project.inPoint * pixelsPerSecond,
                            width: (project.outPoint - project.inPoint) * pixelsPerSecond
                        }}
                    >
                    </div>
                )}

                {/* In Point Marker Icon - Draggable */}
                {project.inPoint !== null && (
                    <div 
                         className="absolute top-0 bottom-0 border-l-2 border-blue-400 z-30 cursor-ew-resize group/marker"
                         style={{ left: project.inPoint * pixelsPerSecond }}
                         onMouseDown={(e) => handleMarkerMouseDown(e, 'in')}
                         onTouchStart={(e) => handleMarkerTouchStart(e, 'in')}
                    >
                        {/* Hit Area */}
                        <div className="absolute top-0 -left-3 w-6 h-full bg-transparent"></div>
                        {/* Visual Icon */}
                        <div className="text-[9px] text-blue-400 bg-gray-900 px-1 -ml-3 -mt-1 font-bold pointer-events-none">[</div>
                    </div>
                )}
                
                {/* Out Point Marker Icon - Draggable */}
                {project.outPoint !== null && (
                    <div 
                         className="absolute top-0 bottom-0 border-r-2 border-blue-400 z-30 cursor-ew-resize group/marker"
                         style={{ left: project.outPoint * pixelsPerSecond }}
                         onMouseDown={(e) => handleMarkerMouseDown(e, 'out')}
                         onTouchStart={(e) => handleMarkerTouchStart(e, 'out')}
                    >
                        {/* Hit Area */}
                        <div className="absolute top-0 -right-3 w-6 h-full bg-transparent"></div>
                        {/* Visual Icon */}
                        <div className="text-[9px] text-blue-400 bg-gray-900 px-1 -ml-1 -mt-1 font-bold pointer-events-none">]</div>
                    </div>
                )}
            </div>
            
            {/* In/Out Vertical Lines across timeline */}
            {project.inPoint !== null && (
                <div 
                    className="absolute top-6 bottom-0 w-px border-l border-dashed border-blue-500/30 pointer-events-none z-0"
                    style={{ left: project.inPoint * pixelsPerSecond }}
                />
            )}
            {project.outPoint !== null && (
                <div 
                    className="absolute top-6 bottom-0 w-px border-l border-dashed border-blue-500/30 pointer-events-none z-0"
                    style={{ left: project.outPoint * pixelsPerSecond }}
                />
            )}

            {/* Tracks & Clips */}
            <div className="pt-2">
                {project.tracks.map((track) => (
                    <div 
                        key={track.id}
                        className="relative border-b border-gray-800/50"
                        style={{ height: TRACK_HEIGHT }}
                    >
                        {/* Track Label */}
                        <div className="absolute left-2 top-2 text-[10px] text-gray-600 font-mono pointer-events-none z-0">
                            {track.name}
                        </div>

                        {/* Render Clips for this track */}
                        {project.clips.filter(c => c.track === track.id).map(clip => {
                            const width = (clip.end - clip.start) * pixelsPerSecond;
                            const left = clip.offset * pixelsPerSecond;
                            const isSelected = project.selectedClipId === clip.id;
                            
                            return (
                                <div
                                    key={clip.id}
                                    className={`absolute top-6 h-12 rounded cursor-pointer overflow-visible border transition-colors group
                                        ${isSelected ? 'border-yellow-400 ring-1 ring-yellow-400 z-10' : 'border-gray-700'}
                                        ${clip.type === 'video' ? 'bg-blue-900/80 hover:bg-blue-800' : 'bg-green-900/80 hover:bg-green-800'}
                                    `}
                                    style={{ left, width }}
                                    onMouseDown={(e) => handleClipMouseDown(e, clip)}
                                    onTouchStart={(e) => handleClipTouchStart(e, clip)}
                                    onTouchMove={handleClipTouchMove}
                                    onTouchEnd={handleClipTouchEnd}
                                >
                                    {/* Clip Info */}
                                    <div className="px-2 py-1 truncate text-xs text-white/90 select-none pointer-events-none overflow-hidden">
                                        {clip.name}
                                    </div>
                                    
                                    {/* Trim Handles (Only visible on hover or selection) */}
                                    {(isSelected || dragState.clipId === clip.id) && (
                                        <>
                                            {/* Left Handle */}
                                            <div 
                                                className="absolute top-0 bottom-0 -left-3 w-6 cursor-ew-resize z-20 flex items-center justify-center group/handle"
                                                onMouseDown={(e) => handleTrimMouseDown(e, clip, 'trim-start')}
                                                onTouchStart={(e) => handleTrimTouchStart(e, clip, 'trim-start')}
                                            >
                                                {/* Visual Handle Bar */}
                                                <div className="w-3 h-full bg-yellow-400/50 group-hover/handle:bg-yellow-400 rounded-l-sm flex items-center justify-center">
                                                    <div className="w-0.5 h-4 bg-black/50"></div>
                                                </div>
                                            </div>

                                            {/* Right Handle */}
                                            <div 
                                                className="absolute top-0 bottom-0 -right-3 w-6 cursor-ew-resize z-20 flex items-center justify-center group/handle"
                                                onMouseDown={(e) => handleTrimMouseDown(e, clip, 'trim-end')}
                                                onTouchStart={(e) => handleTrimTouchStart(e, clip, 'trim-end')}
                                            >
                                                {/* Visual Handle Bar */}
                                                <div className="w-3 h-full bg-yellow-400/50 group-hover/handle:bg-yellow-400 rounded-r-sm flex items-center justify-center">
                                                    <div className="w-0.5 h-4 bg-black/50"></div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Playhead Line */}
            <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                style={{ left: project.currentTime * pixelsPerSecond }}
            >
                <div className="w-3 h-3 -ml-1.5 bg-red-500 rounded-full shadow-sm" />
            </div>

         </div>
      </div>
    </div>
  );
};

export default Timeline;
