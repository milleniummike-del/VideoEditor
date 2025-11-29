
import { useRef, useEffect, useState, useCallback, type FC } from 'react';
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
}

const Player: FC<PlayerProps> = ({ 
  project, 
  onTimeUpdate, 
  isExporting = false,
  exportEndTime,
  onExportFinish,
  width = 800, 
  height = 450 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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
  // Independent time tracker to decouple render loop from React state updates
  const internalTimeRef = useRef<number>(0); 
  const playbackSpeedRef = useRef<number>(1);
  
  // Export refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const isInternalExporting = useRef(false); // Drives the loop during export without affecting global isPlaying state
  const isStoppingRef = useRef(false); // Prevents race conditions during stop

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

  // Sync internal time with project time when NOT playing/exporting (e.g. scrubbing)
  useEffect(() => {
    if (!project.isPlaying && !isInternalExporting.current) {
        internalTimeRef.current = project.currentTime;
    }
  }, [project.currentTime, project.isPlaying]);

  // Initialize video and audio elements for all clips
  useEffect(() => {
    const actx = audioContextRef.current;
    const dest = audioDestinationRef.current;
    if (!actx || !dest) return;

    const currentClipIds = new Set(project.clips.map(c => c.id));

    // Cleanup removed clips
    for (const [id, video] of videoRefs.current) {
        if (!currentClipIds.has(id)) {
            video.pause();
            video.src = "";
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
            
            video.onloadedmetadata = () => {
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
            
            audio.onloadedmetadata = () => {
                setIsMediaLoaded(prev => !prev);
            };

            // Critical: Handle errors
            audio.onerror = () => {
                console.error(`Failed to load audio clip: ${clip.name} (${clip.url})`);
                // Mark loaded anyway so the UI doesn't block
                setIsMediaLoaded(prev => !prev);
            };

            audioRefs.current.set(clip.id, audio);

            // Connect Audio
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

  // Handle Play/Pause Audio Context state for normal playback
  useEffect(() => {
    if (project.isPlaying && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
  }, [project.isPlaying]);

  // Main Render Loop Function (Defined before use)
  const renderFrameLogic = useCallback((currentTime: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Use Project Resolution
    const canvasWidth = project.width;
    const canvasHeight = project.height;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Identify clips active at this time
    const activeClips = project.clips.filter(clip => 
        currentTime >= clip.offset && 
        currentTime < clip.offset + (clip.end - clip.start)
    );

    // 1. Handle Audio & Video Sync for ALL active clips
    activeClips.forEach(clip => {
        let mediaEl: HTMLMediaElement | undefined;
        if (clip.type === 'video') {
            mediaEl = videoRefs.current.get(clip.id);
        } else {
            mediaEl = audioRefs.current.get(clip.id);
        }

        if (mediaEl && (mediaEl.readyState >= 2 || clip.type === 'audio')) { 
             const clipTime = (currentTime - clip.offset) + clip.start;
             
             // Sync Check - Only sync if playing or exporting
             const isRunning = project.isPlaying || isInternalExporting.current;
             
             if (isRunning && Math.abs(mediaEl.currentTime - clipTime) > 0.25) {
                 mediaEl.currentTime = clipTime;
             } else if (!isRunning) {
                 // Scrubbing
                 mediaEl.currentTime = clipTime;
             }

             // Play/Pause
             if (isRunning && mediaEl.paused) {
                 mediaEl.play().catch(e => {
                     // Auto-play policy error or interrupt
                 }); 
             } else if (!isRunning && !mediaEl.paused) {
                 mediaEl.pause();
             }

             // End of clip check
             if (clipTime >= clip.duration) {
                 mediaEl.pause();
             }

             // Handle Fading (Audio Volume)
             const gainNode = gainNodesRef.current.get(clip.id);
             let alpha = 1;
             
             const relativeTime = currentTime - clip.offset;
             const remainingTime = (clip.offset + (clip.end - clip.start)) - currentTime;

             if (clip.fadeIn && clip.fadeIn > 0 && relativeTime < clip.fadeIn) {
                 alpha = relativeTime / clip.fadeIn;
             } else if (clip.fadeOut && clip.fadeOut > 0 && remainingTime < clip.fadeOut) {
                 alpha = remainingTime / clip.fadeOut;
             }
             
             if (gainNode) {
                 gainNode.gain.value = alpha; 
             }
             
             // Store alpha for video drawing
             (clip as any)._renderAlpha = alpha; 
        }
    });

    // 2. Draw Video Frames (Sorted by track to respect layers)
    activeClips
        .filter(c => c.type === 'video')
        .sort((a, b) => a.track - b.track)
        .forEach(clip => {
            const video = videoRefs.current.get(clip.id);
            if (video && video.readyState >= 2) {
                // Calculate Aspect Ratio Fit (Letterbox)
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                const canvasAspect = canvasWidth / canvasHeight;
                const videoAspect = vw / vh;
                
                let drawW, drawH, offsetX, offsetY;
                
                if (videoAspect > canvasAspect) {
                    // Video is wider than canvas
                    drawW = canvasWidth;
                    drawH = canvasWidth / videoAspect;
                    offsetX = 0;
                    offsetY = (canvasHeight - drawH) / 2;
                } else {
                    // Video is taller than canvas
                    drawH = canvasHeight;
                    drawW = canvasHeight * videoAspect;
                    offsetY = 0;
                    offsetX = (canvasWidth - drawW) / 2;
                }
                
                // Apply Fade Opacity
                const alpha = (clip as any)._renderAlpha !== undefined ? (clip as any)._renderAlpha : 1;
                ctx.globalAlpha = alpha;
                
                ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
                
                ctx.globalAlpha = 1.0; // Reset
            }
        });

  }, [project.clips, project.width, project.height, project.isPlaying]);


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
                // Use 30fps for better stability on mobile/tablet exports
                const canvasStream = canvasRef.current.captureStream(30); 
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
                // Priorities: Simple MP4 -> Specific MP4 -> WebM
                const optionsToTry = [
                    'video/mp4', // Modern browsers often default to H264/AAC with this
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
                    // Fallback to default
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
                        alert("Export failed: Video data is empty. The recording duration might have been too short or the format is unsupported on this device.");
                        if (onExportFinish) onExportFinish(null);
                    } else {
                        const url = URL.createObjectURL(blob);
                        if (onExportFinish) onExportFinish(url, selectedMimeType);
                    }
                    
                    recordedChunksRef.current = [];
                    mediaRecorderRef.current = null; // Clear ref
                };

                // 5. Start Recording & Playback
                // Use default start() without timeslice to let browser manage atoms for MP4
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
  }, [isExporting, onExportFinish, project.clips, project.currentTime]); // Depend on start time


  // Animation Loop
  const renderLoop = useCallback(() => {
    // Determine Logic State (Normal Playback vs Export Playback)
    const isPlayingRealtime = project.isPlaying;
    const isExportingActive = isInternalExporting.current;

    // We only update time if we are actually "playing" or "exporting"
    if (isPlayingRealtime || isExportingActive) {
        if (lastTimeRef.current === null) {
            lastTimeRef.current = performance.now();
        } else {
            const now = performance.now();
            const dt = (now - lastTimeRef.current) / 1000;
            lastTimeRef.current = now;
            
            // Advance internal time reference
            internalTimeRef.current += dt * playbackSpeedRef.current;

            // LOOP LOGIC
            // If looping is enabled and we have valid in/out points
            if (project.isLooping && project.inPoint !== null && project.outPoint !== null && !isExportingActive) {
                if (internalTimeRef.current >= project.outPoint) {
                    internalTimeRef.current = project.inPoint;
                }
            }
            
            // Sync Parent UI (Note: this is async and won't affect next frame calculation which uses internalTimeRef)
            onTimeUpdate(internalTimeRef.current);
        }
    } else {
        lastTimeRef.current = null;
    }

    // Stop Export check
    const effectiveEndTime = isExporting && exportEndTime !== undefined ? exportEndTime : project.duration;
    if (isExportingActive && internalTimeRef.current >= effectiveEndTime) {
        // Delayed Stop Logic to ensure last frames are captured
        if (!isStoppingRef.current) {
             isStoppingRef.current = true;
             console.log("Export duration reached. Stopping in 500ms...");
             
             // Continue rendering for 500ms to allow recorder to catch up
             setTimeout(() => {
                 if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                    // State cleanup happens in onstop event
                } else {
                    // If something weird happened and state is already inactive
                    isInternalExporting.current = false;
                    if (onExportFinish) onExportFinish(null);
                }
             }, 500);
        }
    }

    // Call the logic to draw
    renderFrameLogic(internalTimeRef.current);

    requestRef.current = requestAnimationFrame(renderLoop);
  }, [project.isPlaying, project.isLooping, project.inPoint, project.outPoint, isExporting, exportEndTime, onTimeUpdate, renderFrameLogic, onExportFinish]);

  // Start/Stop Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [renderLoop]);

  return (
    <div className="relative shadow-2xl bg-black" style={{ width, height }}>
      {/* Hidden container for media elements to keep them in DOM for playback */}
      <div className="hidden">
         {/* Media elements are created dynamically in memory via JS, but we rely on refs */}
      </div>

      <canvas 
        ref={canvasRef}
        width={project.width}
        height={project.height}
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
