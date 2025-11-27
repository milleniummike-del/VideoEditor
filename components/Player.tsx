
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
            if (source) {
                source.disconnect();
                sourceNodesRef.current.delete(id);
            }
        }
    }
    for (const [id, audio] of audioRefs.current) {
        if (!currentClipIds.has(id)) {
            audio.pause();
            audio.src = "";
            audioRefs.current.delete(id);
             const source = sourceNodesRef.current.get(id);
            if (source) {
                source.disconnect();
                sourceNodesRef.current.delete(id);
            }
        }
    }

    // Add new clips
    project.clips.forEach(clip => {
      if (clip.type === 'video') {
        if (!videoRefs.current.has(clip.id)) {
            const video = document.createElement('video');
            video.src = clip.url;
            video.crossOrigin = "anonymous";
            video.preload = "auto";
            video.muted = false; // We use WebAudio to capture it
            
            video.onloadedmetadata = () => {
                setIsMediaLoaded(prev => !prev);
            };
            videoRefs.current.set(clip.id, video);

            // Connect Audio
            try {
                const source = actx.createMediaElementSource(video);
                source.connect(actx.destination); // For local playback
                source.connect(dest); // For export stream
                sourceNodesRef.current.set(clip.id, source);
            } catch (e) {
                console.warn("Audio Context Error (Video):", e);
            }
        }
      } else if (clip.type === 'audio') {
        if (!audioRefs.current.has(clip.id)) {
            const audio = document.createElement('audio');
            audio.src = clip.url;
            audio.crossOrigin = "anonymous";
            audio.preload = "auto";
            
            audio.onloadedmetadata = () => {
                setIsMediaLoaded(prev => !prev);
            };
            audioRefs.current.set(clip.id, audio);

            // Connect Audio
            try {
                const source = actx.createMediaElementSource(audio);
                source.connect(actx.destination);
                source.connect(dest);
                sourceNodesRef.current.set(clip.id, source);
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
        }
    });

    // 2. Pause inactive clips to prevent background audio leaks
    project.clips.forEach(clip => {
        const isActive = currentTime >= clip.offset && currentTime < clip.offset + (clip.end - clip.start);
        if (!isActive) {
            let mediaEl: HTMLMediaElement | undefined;
            if (clip.type === 'video') mediaEl = videoRefs.current.get(clip.id);
            else mediaEl = audioRefs.current.get(clip.id);

            if (mediaEl && !mediaEl.paused) {
                mediaEl.pause();
            }
        }
    });


    // 3. Draw Video Clips to Canvas
    const activeVideoClips = activeClips
      .filter(c => c.type === 'video')
      .sort((a, b) => a.track - b.track);

    activeVideoClips.forEach(clip => {
      const video = videoRefs.current.get(clip.id);
      if (video && video.readyState >= 2) {
        // Calculate Aspect Ratio Fit (Contain / Letterbox)
        const scale = Math.min(canvasWidth / video.videoWidth, canvasHeight / video.videoHeight);
        const dWidth = video.videoWidth * scale;
        const dHeight = video.videoHeight * scale;
        const dx = (canvasWidth - dWidth) / 2;
        const dy = (canvasHeight - dHeight) / 2;

        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, dx, dy, dWidth, dHeight);
      }
    });

    requestRef.current = requestAnimationFrame(renderFrame);
  }, [project.currentTime, project.clips, project.isPlaying, project.duration, project.width, project.height, isExporting, exportEndTime, onTimeUpdate]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [renderFrame]);

  return (
    <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 flex items-center justify-center" style={{ width, height }}>
      <canvas 
        ref={canvasRef} 
        width={project.width} 
        height={project.height}
        className="block"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
      {!isMediaLoaded && project.clips.length > 0 && (videoRefs.current.size + audioRefs.current.size) === 0 && (
         <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50">
           Loading resources...
         </div>
      )}
    </div>
  );
};

export default Player;
