import React, { useRef, useEffect, useState, useCallback, useMemo, type FC } from 'react';
import { Clip, ProjectState } from '../types';

interface PlayerProps {
  project: ProjectState;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  isExporting?: boolean;
  exportEndTime?: number;
  onExportFinish?: (url: string | null, mimeType?: string) => void;
  width?: number; // Display Width
  height?: number; // Display Height
  onClipUpdate?: (clip: Clip) => void;
}

const Player: FC<PlayerProps> = ({ 
  project, 
  onTimeUpdate, 
  isExporting = false,
  exportEndTime,
  onExportFinish,
  width = 800, 
  height = 450,
  onClipUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null); // Container for off-screen media elements
  
  // Media Elements - Keyed by Clip ID to ensure unique elements per clip on timeline
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  // Audio Context & Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceNodesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());

  const requestRef = useRef<number | null>(null);
  
  // Track loaded status of individual clips to manage Loading Banner correctly
  const [loadedClipIds, setLoadedClipIds] = useState<Set<string>>(new Set());
  
  // Timing refs for smooth playback
  const lastTimeRef = useRef<number | null>(null);
  // Throttling for FPS (Used mainly for Export)
  const lastRenderTimeRef = useRef<number>(0);
  // Throttling for UI Updates (prevent React render spam)
  const lastUiUpdateRef = useRef<number>(0);

  // Independent time tracker to decouple render loop from React state updates
  // This is the MASTER CLOCK.
  const internalTimeRef = useRef<number>(0); 
  const playbackSpeedRef = useRef<number>(1);
  const prevSeekTimeRef = useRef<number>(0);
  
  // Export refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const isInternalExporting = useRef(false); // Drives the loop during export without affecting global isPlaying state
  const isStoppingRef = useRef(false); // Prevents race conditions during stop

  // Interaction Refs (Drag Overlay)
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const dragStartRef = useRef<{x: number, y: number, originalX: number, originalY: number} | null>(null);

  // Initialize Audio Context
  useEffect(() => {
    if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        audioDestinationRef.current = ctx.createMediaStreamDestination();
    }

    // iOS Audio Unlock: Resume context on first user interaction
    const unlockAudio = () => {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
                console.log("AudioContext resumed by user gesture");
            }).catch(e => console.warn("Failed to resume AudioContext", e));
        }
        // Remove listeners once triggered
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Sync internal time with project time based on Seek events or Pause state
  useEffect(() => {
    if (isInternalExporting.current) return;

    // 1. Explicit Seek Detection (User Interaction)
    if (project.lastSeekTime !== undefined && project.lastSeekTime !== prevSeekTimeRef.current) {
        internalTimeRef.current = project.currentTime;
        prevSeekTimeRef.current = project.lastSeekTime;
        
        // Reset lastTimeRef so play loop doesn't calculate a huge dt
        if (project.isPlaying) {
             lastTimeRef.current = performance.now();
        }
    } 
    // 2. Fallback Sync when NOT playing (e.g. stopped, or minor updates)
    else if (!project.isPlaying) {
        // Prevent drift when paused
        if (Math.abs(internalTimeRef.current - project.currentTime) > 0.01) {
            internalTimeRef.current = project.currentTime;
        }
    }
  }, [project.currentTime, project.isPlaying, project.lastSeekTime]);

  // Initialize video and audio elements for all clips
  useEffect(() => {
    const actx = audioContextRef.current;
    const dest = audioDestinationRef.current;
    const container = hiddenContainerRef.current;
    if (!actx || !dest || !container) return;

    const currentClipIds = new Set(project.clips.map(c => c.id));

    // Cleanup removed clips
    for (const [id, video] of videoRefs.current) {
        if (!currentClipIds.has(id)) {
            video.pause();
            video.src = "";
            video.remove(); // Remove from DOM
            videoRefs.current.delete(id);
            // Also disconnect audio source if exists
            const source = sourceNodesRef.current.get(id);
            const gain = gainNodesRef.current.get(id);
            if (source) {
                source.disconnect();
                sourceNodesRef.current.delete(id);
            }
            if (gain) {
                gain.disconnect();
                gainNodesRef.current.delete(id);
            }
            // Cleanup loaded state for removed clips
            setLoadedClipIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }
    for (const [id, audio] of audioRefs.current) {
        if (!currentClipIds.has(id)) {
            audio.pause();
            audio.src = "";
            audio.remove(); // Remove from DOM
            audioRefs.current.delete(id);
            const source = sourceNodesRef.current.get(id);
            const gain = gainNodesRef.current.get(id);
            if (source) {
                source.disconnect();
                sourceNodesRef.current.delete(id);
            }
            if (gain) {
                gain.disconnect();
                gainNodesRef.current.delete(id);
            }
            // Cleanup loaded state for removed clips
            setLoadedClipIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }

    // Add new clips
    project.clips.forEach(clip => {
      if (clip.type === 'video') {
        if (!videoRefs.current.has(clip.id)) {
            const video = document.createElement('video');
            video.crossOrigin = "anonymous"; // Set before src
            video.src = clip.url;
            video.preload = "auto";
            
            // If clip is muted (e.g. audio split to another track), mute the DOM element.
            video.muted = clip.muted || false;
            
            video.playsInline = true; // Critical for iOS
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            
            // Force browser to render this video element by making it visible but off-screen
            // This prevents "judder" caused by browser optimizing out hidden videos
            video.style.position = 'absolute';
            video.style.top = '0';
            video.style.left = '0';
            video.style.width = '128px'; // Small but valid size
            video.style.height = '128px';
            video.style.opacity = '0.01'; // Not 0 to ensure it's "visible"
            video.disablePictureInPicture = true;
            
            // Critical: Append to DOM to ensure browser decodes frames for canvas
            container.appendChild(video);

            video.onloadedmetadata = () => {
                // Initial seek to start time
                video.currentTime = clip.start;
                setLoadedClipIds(prev => {
                    const next = new Set(prev);
                    next.add(clip.id);
                    return next;
                });
            };
            
            // Critical: Handle errors (e.g. expired blob URLs) so app doesn't hang
            video.onerror = () => {
                console.error(`Failed to load video clip: ${clip.name} (${clip.url})`);
                // Mark loaded anyway so the UI doesn't block
                setLoadedClipIds(prev => {
                    const next = new Set(prev);
                    next.add(clip.id);
                    return next;
                });
            };

            videoRefs.current.set(clip.id, video);

            // Connect Audio only if NOT muted
            if (!clip.muted) {
                try {
                    const source = actx.createMediaElementSource(video);
                    const gain = actx.createGain();
                    
                    source.connect(gain);
                    gain.connect(actx.destination); // For local playback
                    gain.connect(dest); // For export stream
                    
                    sourceNodesRef.current.set(clip.id, source);
                    gainNodesRef.current.set(clip.id, gain);
                } catch (e) {
                    // It's normal to fail if source already exists (though we check has(clip.id))
                    // console.warn("Audio Context Error (Video):", e);
                }
            }
        } else {
             // Handle muting update dynamically if the clip property changes
             const video = videoRefs.current.get(clip.id);
             if (video) video.muted = clip.muted || false;
        }
    } else if (clip.type === 'audio') {
        if (!audioRefs.current.has(clip.id)) {
            const audio = document.createElement('audio');
            audio.crossOrigin = "anonymous"; // Set before src
            audio.src = clip.url;
            audio.preload = "auto";
            
            audio.style.position = 'absolute';
            audio.style.opacity = '0.01';

            container.appendChild(audio);
            
            audio.onloadedmetadata = () => {
                audio.currentTime = clip.start;
                setLoadedClipIds(prev => {
                    const next = new Set(prev);
                    next.add(clip.id);
                    return next;
                });
            };

            audio.onerror = () => {
                console.error(`Failed to load audio clip: ${clip.name} (${clip.url})`);
                setLoadedClipIds(prev => {
                    const next = new Set(prev);
                    next.add(clip.id);
                    return next;
                });
            };

            audioRefs.current.set(clip.id, audio);

            try {
                const source = actx.createMediaElementSource(audio);
                const gain = actx.createGain();

                source.connect(gain);
                gain.connect(actx.destination);
                gain.connect(dest);
                
                sourceNodesRef.current.set(clip.id, source);
                gainNodesRef.current.set(clip.id, gain);
            } catch (e) {
                // console.warn("Audio Context Error (Audio):", e);
            }
        }
      }
    });
  }, [project.clips]);

  // Handle Play/Pause Audio Context state
  useEffect(() => {
    if (project.isPlaying && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
  }, [project.isPlaying]);

  // Calculate content duration for implicit looping
  const contentDuration = useMemo(() => {
      return project.clips.reduce((max, c) => Math.max(max, c.offset + (c.end - c.start)), 0);
  }, [project.clips]);


  // Determine the Actual Render Resolution
  // Optimization: When not exporting, we render at the display size to save GPU.
  // When exporting, we render at full project resolution.
  const renderWidth = isExporting ? project.width : width;
  const renderHeight = isExporting ? project.height : height;

  // Calculate scaling factor between Project Coordinates (logical) and Render Coordinates (physical)
  const scaleX = renderWidth / project.width;
  const scaleY = renderHeight / project.height;

  // Main Render Loop Function (Defined before use)
  const renderFrameLogic = useCallback((currentTime: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    // Apply Coordinate Scaling
    // All drawing operations below this line use Project Coordinates (e.g. 1920x1080),
    // but the context automatically scales them to the actual canvas size (e.g. 800x450).
    ctx.save();
    ctx.scale(scaleX, scaleY);

    // 1. Identify active clips
    const activeClips = project.clips.filter(clip => 
        currentTime >= clip.offset && 
        currentTime < clip.offset + (clip.end - clip.start)
    );

    // 2. Identify Upcoming Clips (for Warm-up / Pre-roll)
    // We look ahead 1.0s. If a clip is about to start, we ensure it is parked at its start time.
    const upcomingClips = project.clips.filter(clip => 
        clip.offset > currentTime && 
        clip.offset < currentTime + 1.0
    );

    const activeClipIds = new Set(activeClips.map(c => c.id));
    const isRunning = project.isPlaying || isInternalExporting.current;

    // --- WARM UP LOGIC (Fixes Flash Frames) ---
    upcomingClips.forEach(clip => {
        let mediaEl: HTMLMediaElement | undefined;
        if (clip.type === 'video') mediaEl = videoRefs.current.get(clip.id);
        else if (clip.type === 'audio') mediaEl = audioRefs.current.get(clip.id);

        if (mediaEl) {
            // Ensure paused
            if (!mediaEl.paused) {
                mediaEl.pause();
                mediaEl.playbackRate = 1.0;
            }
            // Ensure parked at start time
            if (Math.abs(mediaEl.currentTime - clip.start) > 0.05) {
                mediaEl.currentTime = clip.start;
            }
        }
    });

    // --- PAUSE LOGIC ---
    // Pause any clips that are NOT active and NOT in the warm-up window
    videoRefs.current.forEach((video, id) => {
        const clip = project.clips.find(c => c.id === id);
        // Keep active and upcoming clips "alive"
        const isUpcoming = clip && clip.offset > currentTime && clip.offset < currentTime + 1.0;
        
        if (!activeClipIds.has(id) && !isUpcoming) {
            if (!video.paused) {
                video.pause();
                video.currentTime = clip ? clip.start : 0; // Reset
            }
        }
    });
    audioRefs.current.forEach((audio, id) => {
        const clip = project.clips.find(c => c.id === id);
        const isUpcoming = clip && clip.offset > currentTime && clip.offset < currentTime + 1.0;
        
        if (!activeClipIds.has(id) && !isUpcoming) {
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = clip ? clip.start : 0;
            }
        }
    });

    // --- SYNC & RENDER LOGIC ---
    activeClips.forEach(clip => {
        let mediaEl: HTMLMediaElement | undefined;
        if (clip.type === 'video') {
            mediaEl = videoRefs.current.get(clip.id);
        } else if (clip.type === 'audio') {
            mediaEl = audioRefs.current.get(clip.id);
        }
        
        // Update Volume Gain
        if (clip.type === 'audio' || (clip.type === 'video' && !clip.muted)) {
            const gainNode = gainNodesRef.current.get(clip.id);
            if (gainNode) {
                const volume = clip.volume !== undefined ? clip.volume : 1.0;
                // Use setTargetAtTime for smooth volume transitions
                gainNode.gain.setTargetAtTime(volume, audioContextRef.current?.currentTime || 0, 0.02);
            }
        }

        if (mediaEl) { 
             const targetClipTime = (currentTime - clip.offset) + clip.start;
             
             if (isRunning) {
                 // --- PLAYBACK MODE (Master Clock Drives) ---
                 const drift = mediaEl.currentTime - targetClipTime;
                 const isSeeking = mediaEl.seeking;

                 if (mediaEl.paused) {
                     // Clip just started or resumed.
                     // Seek to exact start if drift is large (avoids jump)
                     if (Math.abs(drift) > 0.1) {
                         mediaEl.currentTime = targetClipTime;
                     }
                     // Always play
                     const playPromise = mediaEl.play();
                     playPromise?.catch(e => { /* Ignore interruption errors */ });
                 } else {
                     // Running. Check sync.
                     // We use a LOOSE sync to prevent stutter.
                     // Only hard seek if we are WAY off (> 0.25s).
                     if (Math.abs(drift) > 0.25 && !isSeeking) {
                         mediaEl.currentTime = targetClipTime;
                     } 
                     
                     // Optimization: Ensure 1.0 speed
                     if (mediaEl.playbackRate !== 1.0) mediaEl.playbackRate = 1.0;
                 }

             } else {
                 // --- SCRUB MODE (Strict Sync) ---
                 // When paused/scrubbing, we force the video to the exact frame.
                 if (!mediaEl.paused) mediaEl.pause();
                 
                 if (Math.abs(mediaEl.currentTime - targetClipTime) > 0.03) {
                     mediaEl.currentTime = targetClipTime;
                 }
             }

             // --- DRAW VIDEO FRAME ---
             if (clip.type === 'video' && mediaEl instanceof HTMLVideoElement) {
                 // Check ready state to avoid black frames
                 if (mediaEl.readyState >= 2) { 
                     
                     // Determine Draw Params
                     const scale = clip.scale ?? 1;
                     // Default to centering if x/y not set? 
                     // No, if not set, default to 0,0 or center. App sets defaults to center.
                     // If App doesn't set it (legacy), default to fitting logic? 
                     // The requirement is "adjustable... default original size".
                     // If scale is undefined, we can assume legacy full-fit logic OR assume 1.
                     // Let's assume 1 and 0,0 if undefined for safety with new model, OR keep logic clean.
                     // If properties are missing, assume 1.0 scale, 0,0 pos.
                     const drawX = clip.x !== undefined ? clip.x : 0;
                     const drawY = clip.y !== undefined ? clip.y : 0;
                     const drawW = mediaEl.videoWidth * scale;
                     const drawH = mediaEl.videoHeight * scale;

                     // --- TRANSITIONS ---
                     if (clip.transition) {
                         const progress = (currentTime - clip.offset) / clip.transition.duration;
                         
                         if (progress < 1) {
                             // Transition Active
                             ctx.save();
                             
                             if (clip.transition.type === 'fade') {
                                 ctx.globalAlpha = progress;
                                 ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                             } 
                             else if (clip.transition.type === 'wipe-left') {
                                 ctx.beginPath();
                                 ctx.rect(0, 0, project.width * progress, project.height);
                                 ctx.clip();
                                 ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                             }
                             else if (clip.transition.type === 'wipe-right') {
                                 ctx.beginPath();
                                 ctx.rect(project.width * (1 - progress), 0, project.width, project.height);
                                 ctx.clip();
                                 ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                             }
                             else if (clip.transition.type === 'circle') {
                                 ctx.beginPath();
                                 const radius = (Math.sqrt(project.width**2 + project.height**2) / 2) * progress;
                                 ctx.arc(project.width/2, project.height/2, radius, 0, Math.PI * 2);
                                 ctx.clip();
                                 ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                             }
                             else if (clip.transition.type === 'slide-left') {
                                 // For slide, the whole content moves
                                 const slideX = project.width * (1 - progress);
                                 ctx.drawImage(mediaEl, drawX + slideX, drawY, drawW, drawH);
                             }
                             else if (clip.transition.type === 'slide-right') {
                                 const slideX = -project.width * (1 - progress);
                                 ctx.drawImage(mediaEl, drawX + slideX, drawY, drawW, drawH);
                             }

                             ctx.restore();
                         } else {
                             // Transition Finished
                             ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                         }

                     } else {
                         // Standard Draw
                         ctx.globalAlpha = 1.0;
                         // Handle Fade In / Out manually if no complex transition
                         if (clip.fadeIn && (currentTime - clip.offset) < clip.fadeIn) {
                             ctx.globalAlpha = (currentTime - clip.offset) / clip.fadeIn;
                         }
                         if (clip.fadeOut && (currentTime > (clip.offset + (clip.end - clip.start) - clip.fadeOut))) {
                             const remaining = (clip.offset + (clip.end - clip.start)) - currentTime;
                             ctx.globalAlpha = Math.max(0, remaining / clip.fadeOut);
                         }

                         ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH);
                     }
                 }
             }
        }
    });

    // 3. Render Text
    activeClips.filter(c => c.type === 'text').forEach(clip => {
         ctx.save();
         
         // Fades
         let alpha = 1.0;
         if (clip.fadeIn && (currentTime - clip.offset) < clip.fadeIn) {
             alpha = (currentTime - clip.offset) / clip.fadeIn;
         }
         if (clip.fadeOut && (currentTime > (clip.offset + (clip.end - clip.start) - clip.fadeOut))) {
             const remaining = (clip.offset + (clip.end - clip.start)) - currentTime;
             alpha = Math.max(0, remaining / clip.fadeOut);
         }
         ctx.globalAlpha = alpha;

         ctx.font = `${clip.fontSize || 60}px sans-serif`;
         ctx.fillStyle = clip.fontColor || '#ffffff';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(clip.textContent || "Title", clip.x || project.width/2, clip.y || project.height/2);
         ctx.restore();
    });

    ctx.restore(); // Undo Scaling
  }, [project.clips, project.isPlaying, project.width, project.height, renderWidth, renderHeight, scaleX, scaleY]);


  // THE LOOP
  const loop = useCallback((timestamp: number) => {
    if (isStoppingRef.current) return;
    requestRef.current = requestAnimationFrame(loop);

    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    
    // Cap DT to prevent huge jumps (max 100ms)
    const rawDt = (timestamp - lastTimeRef.current) / 1000;
    const dt = Math.min(rawDt, 0.1); 
    
    lastTimeRef.current = timestamp;

    if (project.isPlaying || isInternalExporting.current) {
        // Advance Master Clock
        internalTimeRef.current += dt * playbackSpeedRef.current;
        
        // Loop Check
        if (project.isLooping && !isInternalExporting.current) {
             if (internalTimeRef.current >= contentDuration && contentDuration > 0) {
                 internalTimeRef.current = 0;
             }
        }
    }

    // Render Canvas & Sync Video
    if (timestamp - lastRenderTimeRef.current > (isInternalExporting.current ? 40 : 16)) {
        renderFrameLogic(internalTimeRef.current);
        lastRenderTimeRef.current = timestamp;
    }

    // Throttle React Updates to 15fps
    if (timestamp - lastUiUpdateRef.current > 60) {
        if (!isInternalExporting.current) {
             onTimeUpdate(internalTimeRef.current);
        }
        lastUiUpdateRef.current = timestamp;
    }

    // Export Logic
    if (isInternalExporting.current && exportEndTime && internalTimeRef.current >= exportEndTime) {
        stopExport();
    }

  }, [project.isPlaying, project.isLooping, contentDuration, onTimeUpdate, exportEndTime, renderFrameLogic]);

  // Start/Stop Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  // Handle Export Recording
  useEffect(() => {
    if (isExporting && !isInternalExporting.current) {
        startExport();
    }
  }, [isExporting]);

  const startExport = async () => {
     if (!canvasRef.current || !audioDestinationRef.current) return;
     
     // 1. Reset state
     isInternalExporting.current = true;
     internalTimeRef.current = project.currentTime; // Start from specified time
     recordedChunksRef.current = [];

     // 2. Setup Stream
     // High bitrate for better quality
     const canvasStream = canvasRef.current.captureStream(project.fps); // Sync to project FPS
     const audioStream = audioDestinationRef.current.stream;
     
     const combinedStream = new MediaStream([
         ...canvasStream.getVideoTracks(),
         ...audioStream.getAudioTracks()
     ]);

     // Prefer VP9 or H264
     const mimeTypes = [
         'video/webm;codecs=vp9,opus',
         'video/webm;codecs=vp8,opus',
         'video/webm',
         'video/mp4'
     ];
     let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

     const recorder = new MediaRecorder(combinedStream, {
         mimeType: selectedMime,
         videoBitsPerSecond: 8000000 // 8 Mbps
     });

     recorder.ondataavailable = (e) => {
         if (e.data.size > 0) recordedChunksRef.current.push(e.data);
     };

     recorder.onstop = () => {
         const blob = new Blob(recordedChunksRef.current, { type: selectedMime });
         const url = URL.createObjectURL(blob);
         isInternalExporting.current = false;
         isStoppingRef.current = false;
         if (onExportFinish) onExportFinish(url, selectedMime);
     };

     mediaRecorderRef.current = recorder;
     recorder.start(100); // chunk every 100ms
  };

  const stopExport = () => {
      isStoppingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
  };

  // Drag Handlers (Overlay) - Now supports Text AND Video
  const handleOverlayMouseDown = (e: React.MouseEvent, clipId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setDraggingClipId(clipId);
      
      const clip = project.clips.find(c => c.id === clipId);
      if (clip) {
          dragStartRef.current = {
              x: e.clientX,
              y: e.clientY,
              originalX: clip.x || 0,
              originalY: clip.y || 0
          };
      }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
      if (draggingClipId && dragStartRef.current && onClipUpdate) {
          const dx = (e.clientX - dragStartRef.current.x) / scaleX; // Reverse scale
          const dy = (e.clientY - dragStartRef.current.y) / scaleY;
          
          const clip = project.clips.find(c => c.id === draggingClipId);
          if (clip) {
              onClipUpdate({
                  ...clip,
                  x: dragStartRef.current.originalX + dx,
                  y: dragStartRef.current.originalY + dy
              });
          }
      }
  };

  const handleOverlayMouseUp = () => {
      setDraggingClipId(null);
      dragStartRef.current = null;
  };
  
  // Calculate if we are still loading media
  const isLoading = project.clips.some(c => c.type !== 'text' && !loadedClipIds.has(c.id));

  return (
    <div className="relative bg-black shadow-lg" style={{ width, height }}>
      {/* Off-screen media container */}
      <div 
        ref={hiddenContainerRef} 
        style={{ 
            position: 'absolute', 
            top: '-9999px', 
            left: '-9999px',
            width: '100px',
            height: '100px',
            overflow: 'hidden',
            visibility: 'visible',
            opacity: 0.01 
        }}
      />
      
      <canvas 
        ref={canvasRef}
        width={renderWidth}
        height={renderHeight}
        className="block w-full h-full object-contain cursor-default"
      />

      {/* Overlay for Dragging */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-hidden"
        onMouseMove={handleOverlayMouseMove}
        onMouseUp={handleOverlayMouseUp}
        onMouseLeave={handleOverlayMouseUp}
        style={{ userSelect: 'none' }}
      >
           {/* Render invisible hitboxes for active clips (Text AND Video) */}
           {project.clips.filter(c => (c.type === 'text' || c.type === 'video') && 
                internalTimeRef.current >= c.offset && internalTimeRef.current < c.offset + (c.end - c.start)
            ).map(clip => {
                const isSelected = project.selectedClipId === clip.id;
                
                let displayX = 0, displayY = 0, displayW = 0, displayH = 0;

                if (clip.type === 'text') {
                    const fontSize = (clip.fontSize || 60);
                    const estimatedWidth = (clip.textContent || "Title").length * (fontSize * 0.6);
                    const estimatedHeight = fontSize;
                    displayX = (clip.x || project.width/2) * scaleX;
                    displayY = (clip.y || project.height/2) * scaleY;
                    displayW = estimatedWidth * scaleX;
                    displayH = estimatedHeight * scaleY;
                } else if (clip.type === 'video') {
                    // For video, we need to know the drawn size. 
                    // This is slightly imperfect because we don't have videoWidth here in the render loop without looking up the ref,
                    // but we can try to find it or estimate.
                    // Ideally we should use the rendered rects.
                    // Let's grab the video element to get dimensions.
                    const videoEl = videoRefs.current.get(clip.id);
                    const vW = videoEl?.videoWidth || 100; // fallback
                    const vH = videoEl?.videoHeight || 100;
                    const scale = clip.scale ?? 1;
                    
                    displayX = (clip.x ?? 0) * scaleX;
                    displayY = (clip.y ?? 0) * scaleY;
                    displayW = vW * scale * scaleX;
                    displayH = vH * scale * scaleY;
                    
                    // Video draws from top-left, Text draws from center.
                    // We need to adjust Text hit box to top-left for the div.
                    // Video logic above assumes x,y is top-left.
                }

                // Adjust text centered coordinates to top-left for DOM element
                const finalLeft = clip.type === 'text' ? displayX - displayW/2 : displayX;
                const finalTop = clip.type === 'text' ? displayY - displayH/2 : displayY;

                return (
                    <div
                        key={clip.id}
                        className={`absolute border ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-transparent hover:border-white/30'} pointer-events-auto cursor-move`}
                        style={{
                            left: finalLeft,
                            top: finalTop,
                            width: displayW,
                            height: displayH,
                        }}
                        onMouseDown={(e) => handleOverlayMouseDown(e, clip.id)}
                    />
                );
           })}
      </div>

      {isLoading && (
          <div className="absolute top-2 right-2 flex items-center space-x-2 bg-black/50 px-2 py-1 rounded">
             <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
             <span className="text-[10px] text-white">Loading Media...</span>
          </div>
      )}
    </div>
  );
};

export default Player;