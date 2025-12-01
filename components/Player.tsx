

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
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  
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
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
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
            video.muted = false; // We use WebAudio to capture it
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
                setIsMediaLoaded(prev => !prev);
            };
            
            // Critical: Handle errors (e.g. expired blob URLs) so app doesn't hang
            video.onerror = () => {
                console.error(`Failed to load video clip: ${clip.name} (${clip.url})`);
                // Mark loaded anyway so the UI doesn't block
                setIsMediaLoaded(prev => !prev);
            };

            videoRefs.current.set(clip.id, video);

            // Connect Audio
            try {
                const source = actx.createMediaElementSource(video);
                const gain = actx.createGain();
                
                source.connect(gain);
                gain.connect(actx.destination); // For local playback
                gain.connect(dest); // For export stream
                
                sourceNodesRef.current.set(clip.id, source);
                gainNodesRef.current.set(clip.id, gain);
            } catch (e) {
                console.warn("Audio Context Error (Video):", e);
            }
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
                setIsMediaLoaded(prev => !prev);
            };

            audio.onerror = () => {
                console.error(`Failed to load audio clip: ${clip.name} (${clip.url})`);
                setIsMediaLoaded(prev => !prev);
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
                console.warn("Audio Context Error (Audio):", e);
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

        if (mediaEl) { 
             const targetClipTime = (currentTime - clip.offset) + clip.start;
             
             if (isRunning) {
                 // --- PLAYBACK MODE (Master Clock Drives) ---
                 const drift = mediaEl.currentTime - targetClipTime;
                 const isSeeking = mediaEl.seeking;

                 if (mediaEl.paused) {
                     // Clip just started or resumed.
                     // Seek to exact start if significant drift
                     if (Math.abs(drift) > 0.05) {
                         mediaEl.currentTime = targetClipTime;
                     } 
                     // Play if ready
                     if (mediaEl.readyState >= 2) {
                         const playPromise = mediaEl.play();
                         if (playPromise !== undefined) playPromise.catch(() => {});
                     }
                 } else {
                     // Already Playing - Check Drift
                     // Relaxed threshold to 0.25s to allow for browser timing jitter without stuttering.
                     if (Math.abs(drift) > 0.25) {
                         // Only seek if drift is massive
                         if (!isSeeking) {
                             mediaEl.currentTime = targetClipTime;
                         }
                     }
                     // Removed adaptive playbackRate scaling. 
                     // Trusting the browser to play at 1.0x is smoother than constant micro-adjustments.
                     if (mediaEl.playbackRate !== 1.0) {
                         mediaEl.playbackRate = 1.0;
                     }
                 }
             } else {
                 // --- SCRUB MODE (Paused) ---
                 if (!mediaEl.paused) {
                     mediaEl.pause();
                 }
                 
                 // Strict Scrub Sync
                 if (Math.abs(mediaEl.currentTime - targetClipTime) > 0.01) {
                     mediaEl.currentTime = targetClipTime;
                 }
             }

             // Handle Fading (Audio Volume)
             const gainNode = gainNodesRef.current.get(clip.id);
             let alpha = 1;
             
             const relativeTime = currentTime - clip.offset;
             const remainingTime = (clip.offset + (clip.end - clip.start)) - currentTime;

             const entryDuration = clip.transition ? clip.transition.duration : (clip.fadeIn || 0);

             if (entryDuration > 0 && relativeTime < entryDuration) {
                 alpha = relativeTime / entryDuration;
             } else if (clip.fadeOut && clip.fadeOut > 0 && remainingTime < clip.fadeOut) {
                 alpha = remainingTime / clip.fadeOut;
             }
             
             if (gainNode) {
                 gainNode.gain.value = alpha; 
             }
             
             (clip as any)._renderAlpha = alpha; 
        } else if (clip.type === 'text') {
             // Logic for text clips
             let alpha = 1;
             const relativeTime = currentTime - clip.offset;
             const remainingTime = (clip.offset + (clip.end - clip.start)) - currentTime;

             const entryDuration = clip.transition ? clip.transition.duration : (clip.fadeIn || 0);

             if (entryDuration > 0 && relativeTime < entryDuration) {
                 alpha = relativeTime / entryDuration;
             } else if (clip.fadeOut && clip.fadeOut > 0 && remainingTime < clip.fadeOut) {
                 alpha = remainingTime / clip.fadeOut;
             }
             (clip as any)._renderAlpha = alpha;
        }
    });

    // 2. Draw Video Frames (Sorted by track)
    activeClips
        .filter(c => c.type === 'video')
        .sort((a, b) => a.track - b.track)
        .forEach(clip => {
            const video = videoRefs.current.get(clip.id);
            if (video && video.readyState >= 1) { // HAVE_METADATA or better
                
                const relativeTime = currentTime - clip.offset;

                // Calculate Aspect Ratio Fit (Letterbox)
                // We use project.width/height because of ctx.scale
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                const canvasAspect = project.width / project.height;
                const videoAspect = vw / vh;
                
                let drawW, drawH, offsetX, offsetY;
                
                if (videoAspect > canvasAspect) {
                    // Video is wider
                    drawW = project.width;
                    drawH = project.width / videoAspect;
                    offsetX = 0;
                    offsetY = (project.height - drawH) / 2;
                } else {
                    // Video is taller
                    drawH = project.height;
                    drawW = project.height * videoAspect;
                    offsetY = 0;
                    offsetX = (project.width - drawW) / 2;
                }
                
                ctx.save();

                // Apply Transition Effects
                if (clip.transition && relativeTime < clip.transition.duration) {
                    const p = relativeTime / clip.transition.duration; // 0.0 to 1.0
                    
                    switch (clip.transition.type) {
                        case 'fade':
                            ctx.globalAlpha = p;
                            break;
                        case 'wipe-right':
                            ctx.beginPath();
                            ctx.rect(0, 0, project.width * p, project.height);
                            ctx.clip();
                            break;
                        case 'wipe-left':
                            ctx.beginPath();
                            ctx.rect(project.width * (1 - p), 0, project.width * p, project.height);
                            ctx.clip();
                            break;
                        case 'slide-right':
                            ctx.translate(-project.width * (1 - p), 0);
                            break;
                        case 'slide-left':
                            ctx.translate(project.width * (1 - p), 0);
                            break;
                        case 'circle':
                            ctx.beginPath();
                            const maxRadius = Math.sqrt(Math.pow(project.width, 2) + Math.pow(project.height, 2));
                            ctx.arc(project.width / 2, project.height / 2, maxRadius * p, 0, Math.PI * 2);
                            ctx.clip();
                            break;
                        default:
                            ctx.globalAlpha = (clip as any)._renderAlpha;
                            break;
                    }
                } else {
                    // Basic fade fallback
                    ctx.globalAlpha = (clip as any)._renderAlpha;
                }
                
                ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
                
                ctx.restore(); 
            }
        });

    // 3. Draw Text Clips (Layered on top)
    activeClips
        .filter(c => c.type === 'text')
        .forEach(clip => {
            ctx.save();

            // Apply Transition Effects for Text
            const relativeTime = currentTime - clip.offset;
            if (clip.transition && relativeTime < clip.transition.duration) {
                 const p = relativeTime / clip.transition.duration;
                 switch (clip.transition.type) {
                    case 'fade': ctx.globalAlpha = p; break;
                    case 'wipe-right': ctx.beginPath(); ctx.rect(0, 0, project.width * p, project.height); ctx.clip(); break;
                    case 'wipe-left': ctx.beginPath(); ctx.rect(project.width * (1 - p), 0, project.width * p, project.height); ctx.clip(); break;
                    case 'slide-right': ctx.translate(-project.width * (1 - p), 0); break;
                    case 'slide-left': ctx.translate(project.width * (1 - p), 0); break;
                    case 'circle': 
                         ctx.beginPath();
                         const maxRadius = Math.sqrt(Math.pow(project.width, 2) + Math.pow(project.height, 2));
                         ctx.arc(project.width / 2, project.height / 2, maxRadius * p, 0, Math.PI * 2);
                         ctx.clip();
                         break;
                    default: ctx.globalAlpha = (clip as any)._renderAlpha; break;
                 }
            } else {
                ctx.globalAlpha = (clip as any)._renderAlpha;
            }
            
            ctx.font = `${clip.fontSize || 60}px sans-serif`;
            ctx.fillStyle = clip.fontColor || '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const x = clip.x !== undefined ? clip.x : project.width / 2;
            const y = clip.y !== undefined ? clip.y : project.height / 2;
            
            ctx.fillText(clip.textContent || "", x, y);
            
            ctx.restore();
        });

    // Restore Coordinate Scale for next frame (though we clear, it's good practice)
    ctx.restore();

  }, [project.clips, renderWidth, renderHeight, scaleX, scaleY, project.isPlaying, project.width, project.height]);


  // Export Logic
  useEffect(() => {
    const initExport = async () => {
        // If export requested AND not already recording
        if (isExporting && canvasRef.current && !mediaRecorderRef.current && audioDestinationRef.current) {
            
            console.log("Initializing Export...");
            isStoppingRef.current = false;

            // 1. Ensure Audio is Ready
            if (audioContextRef.current?.state === 'suspended') {
                try {
                    await audioContextRef.current.resume();
                } catch(e) {
                    console.error("Failed to resume audio for export", e);
                }
            }

            try {
                // Initialize internal time to start point for clean export loop
                internalTimeRef.current = project.currentTime; 
                
                // WARM UP: Render the first frame to ensure the canvas isn't black when recording starts
                renderFrameLogic(internalTimeRef.current);
                
                // 2. Prepare Stream
                // Use project configured frame rate for export
                const fps = project.fps || 24;
                const canvasStream = canvasRef.current.captureStream(fps); 
                const combinedTracks = [...canvasStream.getVideoTracks()];

                // Only add audio track if we actually have audio clips or video with audio
                const hasAudioContent = project.clips.some(c => c.type === 'audio' || c.type === 'video');
                
                if (hasAudioContent) {
                    const audioTracks = audioDestinationRef.current.stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        combinedTracks.push(audioTracks[0]);
                    }
                }
                
                const combinedStream = new MediaStream(combinedTracks);

                // 3. Select Best Supported MIME Type
                const optionsToTry = [
                    'video/mp4',
                    'video/mp4;codecs=h264,aac',
                    'video/webm;codecs=h264',
                    'video/webm'
                ];

                let recorder: MediaRecorder | null = null;
                let selectedMimeType = '';

                for (const mime of optionsToTry) {
                    if (MediaRecorder.isTypeSupported(mime)) {
                        try {
                            recorder = new MediaRecorder(combinedStream, { mimeType: mime });
                            selectedMimeType = mime;
                            console.log(`Successfully created MediaRecorder with: ${mime}`);
                            break;
                        } catch (e) {
                            console.warn(`Failed to init MediaRecorder with ${mime}`, e);
                        }
                    }
                }

                if (!recorder) {
                    try {
                        recorder = new MediaRecorder(combinedStream);
                        selectedMimeType = recorder.mimeType;
                        console.log(`Fallback MediaRecorder created. Default Mime: ${selectedMimeType}`);
                    } catch (e) {
                        throw new Error("Browser does not support MediaRecorder creation.");
                    }
                }

                // 4. Setup Recorder Events
                recordedChunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        recordedChunksRef.current.push(e.data);
                    }
                };

                recorder.onstop = () => {
                    console.log("Export Finished. Chunks:", recordedChunksRef.current.length);
                    const blob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
                    
                    isInternalExporting.current = false; // Stop internal loop

                    if (blob.size === 0) {
                        console.error("Recorded blob is empty");
                        alert("Export failed: Video data is empty.");
                        if (onExportFinish) onExportFinish(null);
                    } else {
                        const url = URL.createObjectURL(blob);
                        if (onExportFinish) onExportFinish(url, selectedMimeType);
                    }
                    
                    recordedChunksRef.current = [];
                    mediaRecorderRef.current = null; // Clear ref
                };

                // 5. Start Recording & Playback
                recorder.start(); 
                mediaRecorderRef.current = recorder;
                
                // Start the internal export loop
                lastTimeRef.current = performance.now();
                isInternalExporting.current = true; 

            } catch (e) {
                console.error("Export failed to start:", e);
                alert("Export initialization failed. Please try again.");
                if (onExportFinish) onExportFinish(null);
            }
        } else if (!isExporting && mediaRecorderRef.current) {
            // Stop manually if cancelled from outside
            if (mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            mediaRecorderRef.current = null;
            isInternalExporting.current = false;
        }
    };

    initExport();
  }, [isExporting, onExportFinish, project.clips, project.currentTime, project.fps, renderFrameLogic, project.width, project.height]);


  // Animation Loop
  const renderLoop = useCallback(() => {
    // Determine Logic State (Normal Playback vs Export Playback)
    const isPlayingRealtime = project.isPlaying;
    const isExportingActive = isInternalExporting.current;

    requestRef.current = requestAnimationFrame(renderLoop);

    const now = performance.now();
    
    // Frame Rate Throttling Logic
    let shouldRender = true;
    let dt = 0;

    if (isExportingActive) {
        // Enforce strict FPS during export
        const fps = project.fps || 24;
        const fpsInterval = 1000 / fps;
        const delta = now - lastRenderTimeRef.current;
        
        if (delta > fpsInterval) {
            lastRenderTimeRef.current = now - (delta % fpsInterval);
            dt = 1 / fps; 
            shouldRender = true;
        } else {
            shouldRender = false;
        }
    } else {
        // Normal Playback: Run as fast as possible (Monitor Refresh Rate)
        shouldRender = true;
        if (lastTimeRef.current === null) {
            dt = 0;
        } else {
            dt = (now - lastTimeRef.current) / 1000;
            // Cap DT to prevent massive jumps (e.g. if tab backgrounded)
            if (dt > 0.1) dt = 0.1; 
        }
        lastTimeRef.current = now;
    }

    if (shouldRender) {
        // Update Internal Time
        if (isPlayingRealtime || isExportingActive) {
            if (!isExportingActive && lastTimeRef.current === null) {
                // First frame of play
                lastTimeRef.current = now;
            } else {
                internalTimeRef.current += dt * playbackSpeedRef.current;

                // LOOP LOGIC
                if (project.isLooping && !isExportingActive) {
                    if (contentDuration > 0) {
                        if (internalTimeRef.current >= contentDuration) {
                            internalTimeRef.current = 0;
                        }
                    }
                }
                
                // Sync Parent UI (THROTTLED)
                if (now - lastUiUpdateRef.current > 100) {
                    onTimeUpdate(internalTimeRef.current);
                    lastUiUpdateRef.current = now;
                }
            }
        } else {
            lastTimeRef.current = null;
        }

        // Stop Export check
        const effectiveEndTime = isExporting && exportEndTime !== undefined ? exportEndTime : project.duration;
        if (isExportingActive && internalTimeRef.current >= effectiveEndTime) {
            if (!isStoppingRef.current) {
                isStoppingRef.current = true;
                setTimeout(() => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    } else {
                        isInternalExporting.current = false;
                        if (onExportFinish) onExportFinish(null);
                    }
                }, 500);
            }
        }

        // Call the logic to draw
        renderFrameLogic(internalTimeRef.current);
    }
  }, [project.isPlaying, project.isLooping, project.fps, isExporting, exportEndTime, onTimeUpdate, renderFrameLogic, onExportFinish, contentDuration]);

  // Start/Stop Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [renderLoop]);

  // -- INTERACTIVE TEXT OVERLAY LOGIC --
  const handleTextMouseDown = (e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onClipUpdate) return;
    
    setDraggingTextId(clip.id);
    dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        originalX: clip.x !== undefined ? clip.x : project.width / 2,
        originalY: clip.y !== undefined ? clip.y : project.height / 2
    };
  };

  const handleTextTouchStart = (e: React.TouchEvent, clip: Clip) => {
    e.stopPropagation();
    if (!onClipUpdate) return;
    
    const touch = e.touches[0];
    setDraggingTextId(clip.id);
    dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        originalX: clip.x !== undefined ? clip.x : project.width / 2,
        originalY: clip.y !== undefined ? clip.y : project.height / 2
    };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!draggingTextId || !dragStartRef.current || !onClipUpdate) return;
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault(); // Stop scrolling on touch
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        
        // Scale Factor calculation: Project Pixels per Screen Pixel
        const pScaleX = project.width / renderWidth;
        const pScaleY = project.height / renderHeight;
        
        // Use average scale or strictly X? X is safer for 1:1 movement feels
        const scale = pScaleX;
        
        const newX = dragStartRef.current.originalX + (dx * scale);
        const newY = dragStartRef.current.originalY + (dy * scale);
        
        const clip = project.clips.find(c => c.id === draggingTextId);
        if (clip) {
             onClipUpdate({ ...clip, x: newX, y: newY });
        }
    };

    const handleUp = () => {
        setDraggingTextId(null);
        dragStartRef.current = null;
    };

    if (draggingTextId) {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleUp);
    };
  }, [draggingTextId, renderWidth, renderHeight, project.width, project.height, onClipUpdate, project.clips]);


  return (
    <div className="relative shadow-2xl bg-black" style={{ width, height }}>
      {/* Hidden Container for Media Elements - Keeps them in DOM for reliable decoding */}
      <div 
        ref={hiddenContainerRef} 
        style={{ 
            position: 'fixed', 
            top: '-9999px', 
            left: '-9999px', 
            width: '10px', 
            height: '10px', 
            overflow: 'hidden', 
            opacity: 0.001,
            pointerEvents: 'none',
            zIndex: -9999 
        }} 
      />

      {/* Interactive Overlay Layer */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {project.clips
            .filter(c => c.type === 'text' && 
                         project.currentTime >= c.offset && 
                         project.currentTime < c.offset + (c.end - c.start) &&
                         project.selectedClipId === c.id
            )
            .map(clip => {
                 const scale = renderWidth / project.width;
                 const screenX = (clip.x !== undefined ? clip.x : project.width / 2) * scale;
                 const screenY = (clip.y !== undefined ? clip.y : project.height / 2) * scale;
                 
                 return (
                     <div 
                        key={clip.id}
                        className="absolute w-6 h-6 -ml-3 -mt-3 border-2 border-blue-500 bg-blue-500/20 rounded-full cursor-move pointer-events-auto"
                        style={{ left: screenX, top: screenY }}
                        onMouseDown={(e) => handleTextMouseDown(e, clip)}
                        onTouchStart={(e) => handleTextTouchStart(e, clip)}
                     >
                         <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-blue-500 text-white px-1 rounded whitespace-nowrap">
                             Drag
                         </div>
                     </div>
                 );
            })
        }
      </div>

      <canvas 
        ref={canvasRef}
        width={renderWidth}
        height={renderHeight}
        className="w-full h-full block"
      />
      
      {!isMediaLoaded && project.clips.length > 0 && (videoRefs.current.size + audioRefs.current.size) === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white z-10 pointer-events-none">
              <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                  <span className="text-sm">Loading resources...</span>
              </div>
          </div>
      )}
    </div>
  );
};

export default Player;