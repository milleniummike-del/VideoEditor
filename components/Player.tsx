
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Clip, ProjectState } from '../types';

interface PlayerProps {
  project: ProjectState;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  isExporting?: boolean;
  exportEndTime?: number;
  onExportFinish?: () => void;
  width?: number; // Display Width
  height?: number; // Display Height
}

const Player: React.FC<PlayerProps> = ({ 
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
  const playbackSpeedRef = useRef<number>(1);
  
  // Export refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Initialize Audio Context
  useEffect(() => {
    if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        audioDestinationRef.current = ctx.createMediaStreamDestination();
    }
  }, []);

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

  // Handle Play/Pause Audio Context state
  useEffect(() => {
    if (project.isPlaying && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
  }, [project.isPlaying]);

  // Export Logic
  useEffect(() => {
    if (isExporting && canvasRef.current && !mediaRecorderRef.current && audioDestinationRef.current) {
        // Start Recording
        try {
            const canvasStream = canvasRef.current.captureStream(60); // Video tracks
            const audioStream = audioDestinationRef.current.stream; // Audio tracks
            
            // Combine tracks
            const combinedTracks = [
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ];
            const combinedStream = new MediaStream(combinedTracks);

            const recorder = new MediaRecorder(combinedStream, { 
                mimeType: 'video/webm;codecs=vp9,opus' 
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `lumina_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                
                recordedChunksRef.current = [];
                if (onExportFinish) onExportFinish();
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            console.log("Recording started...");
        } catch (e) {
            console.error("Export failed to start:", e);
            if (onExportFinish) onExportFinish();
        }
    } else if (!isExporting && mediaRecorderRef.current) {
        // Stop manually if cancelled
        if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
    }
  }, [isExporting, onExportFinish]);


  // Main Render Loop
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Use Project Resolution
    const canvasWidth = project.width;
    const canvasHeight = project.height;

    // Time Calculation
    let currentTime = project.currentTime;
    
    if (project.isPlaying) {
        if (lastTimeRef.current === null) {
            lastTimeRef.current = performance.now();
        } else {
            const now = performance.now();
            const dt = (now - lastTimeRef.current) / 1000;
            lastTimeRef.current = now;
            
            // Advance time
            currentTime += dt * playbackSpeedRef.current;
            
            // Notify parent of time update
            onTimeUpdate(currentTime);
        }
    } else {
        lastTimeRef.current = null;
    }

    // Stop Export check
    const effectiveEndTime = isExporting && exportEndTime !== undefined ? exportEndTime : project.duration;
    if (isExporting && currentTime >= effectiveEndTime) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }
        // Ensure we don't loop or continue
        onTimeUpdate(effectiveEndTime);
        return; 
    }

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
             
             // Sync Check
             if (Math.abs(mediaEl.currentTime - clipTime) > 0.25 || !project.isPlaying) {
                 mediaEl.currentTime = clipTime;
             }

             // Play/Pause
             if (project.isPlaying && mediaEl.paused) {
                 mediaEl.play().catch(e => {}); // Ignore play interruptions
             } else if (!project.isPlaying && !mediaEl.paused) {
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
                 // Ensure mute logic is respected if we had track mute, but for now just fade
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

    requestRef.current = requestAnimationFrame(renderFrame);
  }, [project.clips, project.currentTime, project.isPlaying, project.width, project.height, onTimeUpdate, isExporting, exportEndTime]);

  // Start/Stop Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [renderFrame]);

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
