
import { useState, useCallback, useEffect, useMemo, useRef, type FC, type ChangeEvent } from 'react';
import { ProjectState, Clip, LibraryClip, TransitionType } from './types';
import { INITIAL_TRACKS, PIXELS_PER_SECOND_DEFAULT, RESOLUTIONS, DEFAULT_FPS } from './constants';
import Timeline from './components/Timeline';
import Player from './components/Player';
import Toolbar from './components/Toolbar';
import ProjectManager from './components/ProjectManager';
import ProjectSettings from './components/ProjectSettings';
import ClipProperties from './components/ClipProperties';
import MediaLibrary from './components/MediaLibrary';
import ExportModals from './components/ExportModals';
import { saveMedia, getAllMedia, deleteMedia, StoredMedia } from './services/storage';
import { uploadMedia } from './services/api';

// Helper to poll for resource availability (Fixes 412/404 race conditions on upload)
const waitForResource = async (url: string, timeout = 5000): Promise<boolean> => {
    // If it's a blob URL, it's ready immediately
    if (url.startsWith('blob:')) return true;

    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (res.ok) return true;
        } catch (e) {
            // Ignore network errors and retry
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
};

const App: FC = () => {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage Configuration with Persistence
  const [useServerStorage, setUseServerStorage] = useState(() => {
      return localStorage.getItem('lumina_use_server_storage') === 'true';
  });
  const [serverUrl, setServerUrl] = useState(() => {
      return localStorage.getItem('lumina_server_url') || 'http://localhost:8000';
  });

  // Save storage preferences when they change
  useEffect(() => {
      localStorage.setItem('lumina_use_server_storage', String(useServerStorage));
  }, [useServerStorage]);

  useEffect(() => {
      localStorage.setItem('lumina_server_url', serverUrl);
  }, [serverUrl]);

  // Persistence State: Map media IDs to current Blob URLs (Only used for Local Mode)
  const [mediaMap, setMediaMap] = useState<Map<string, string>>(new Map());

  // Player Key to force remount on project load
  const [playerKey, setPlayerKey] = useState(0);

  const [project, setProject] = useState<ProjectState>(() => {
    return {
        id: crypto.randomUUID(),
        clips: [],
        library: [],
        tracks: INITIAL_TRACKS,
        duration: 30, // Initial workspace duration
        currentTime: 0,
        isPlaying: false,
        isLooping: false,
        selectedClipId: null,
        zoom: PIXELS_PER_SECOND_DEFAULT,
        width: RESOLUTIONS[0].width,
        height: RESOLUTIONS[0].height,
        fps: DEFAULT_FPS,
        lastSeekTime: 0,
    };
  });

  // Load Media from IndexedDB on startup (Only if Local Mode intent - but we load anyway to be safe)
  useEffect(() => {
      const loadPersistedMedia = async () => {
          try {
              const storedFiles = await getAllMedia();
              const newMediaMap = new Map<string, string>();
              
              storedFiles.forEach(file => {
                  const url = URL.createObjectURL(file.blob);
                  newMediaMap.set(file.id, url);
              });

              setMediaMap(newMediaMap);
              
              // Only auto-populate library from IndexedDB if we are in a fresh state 
              // and NOT explicitly using server storage (which loads its own project)
              // Logic here is tricky: We just hydration the map. Project loading handles the library list.

          } catch (e) {
              console.error("Failed to load media from IndexedDB", e);
          }
      };

      loadPersistedMedia();
  }, []);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState({ start: 0, end: 0 });
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportMimeType, setExportMimeType] = useState<string>('');

  // Project Manager State
  const [showProjectManager, setShowProjectManager] = useState(false);

  // Transition Settings State
  const [transitionDuration, setTransitionDuration] = useState(1.0);

  const handleTimeUpdate = useCallback((time: number) => {
    setProject(p => {
        if (isExporting) {
            const endTime = exportSettings.end;
            // Stop at end of export range
            if (time >= endTime) {
                return { ...p, currentTime: endTime, isPlaying: false };
            }
            return { ...p, currentTime: time };
        }

        // Calculate actual end of content (last clip end)
        const contentDuration = p.clips.reduce((max, c) => Math.max(max, c.offset + (c.end - c.start)), 0);
        
        // If looping is enabled, we rely on Player to handle the loop jump (or just keep playing)
        // We only update time here.
        if (p.isLooping) {
            return { ...p, currentTime: time };
        }

        // If NOT looping, stop exactly at the end of the last clip
        // Fallback to p.duration if empty (though p.duration includes padding, usually 30s min)
        const stopTime = contentDuration > 0 ? contentDuration : p.duration;

        if (time >= stopTime) {
            return { ...p, currentTime: stopTime, isPlaying: false };
        }

        return { ...p, currentTime: time };
    });
  }, [isExporting, exportSettings.end]);

  const handleSeek = (time: number) => {
    if (isExporting) return;
    setProject(p => ({ 
        ...p, 
        currentTime: time,
        lastSeekTime: Date.now() // Trigger player sync
    }));
  };

  const handleTogglePlay = useCallback(() => {
    if (isExporting) return;
    setProject(p => ({ ...p, isPlaying: !p.isPlaying }));
  }, [isExporting]);

  const handleToggleLoop = () => {
      setProject(p => ({ ...p, isLooping: !p.isLooping }));
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in inputs
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine type
    let detectedType: 'video' | 'audio' = 'video';
    if (file.type.startsWith('audio/')) detectedType = 'audio';
    else if (file.type.startsWith('video/')) detectedType = 'video';
    else {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '')) detectedType = 'audio';
        else detectedType = mediaType;
    }

    // 1. Get Duration using temp element
    // For local preview during upload, we always create a blob URL first
    const objectUrl = URL.createObjectURL(file);
    let tempMedia: HTMLVideoElement | HTMLAudioElement;
    if (detectedType === 'video') tempMedia = document.createElement('video');
    else tempMedia = document.createElement('audio');
    
    tempMedia.src = objectUrl;
    tempMedia.preload = 'metadata';
    
    tempMedia.onloadedmetadata = async () => {
        const duration = tempMedia.duration || 10;
        const id = crypto.randomUUID();
        
        let finalUrl = objectUrl;

        try {
            if (useServerStorage) {
                // SERVER MODE: Upload to Backend
                console.log("Uploading to server...");
                finalUrl = await uploadMedia({ baseUrl: serverUrl }, file);
                console.log("Upload complete:", finalUrl);
                
                // CRITICAL: Wait for the file to be accessible by the browser (HEAD check)
                // This prevents 412/404 errors if the backend/disk is slightly slow to index the file.
                const isReady = await waitForResource(finalUrl);
                if (!isReady) {
                    console.warn("Uploaded resource check failed or timed out. Playback might be delayed.");
                }
            } else {
                // LOCAL MODE: Save to IndexedDB
                const storedMedia: StoredMedia = {
                    id,
                    name: file.name,
                    type: detectedType,
                    blob: file,
                    duration,
                    date: Date.now()
                };
                await saveMedia(storedMedia);
                // Update map for consistency
                setMediaMap(prev => new Map(prev).set(id, objectUrl));
            }

            // 3. Update State
            const newClip: LibraryClip = {
                id: useServerStorage ? crypto.randomUUID() : id,
                name: file.name,
                url: finalUrl,
                duration,
                type: detectedType
            };
            
            setProject(p => {
                // Add to library
                const updatedLibrary = [...p.library, newClip];
                
                // Also Add to Timeline immediately
                const targetTrack = p.tracks.find(t => t.type === newClip.type);
                let updatedClips = p.clips;
                let updatedDuration = p.duration;
                let updatedCurrentTime = p.currentTime;

                if (targetTrack) {
                    const timelineClip: Clip = {
                        id: crypto.randomUUID(),
                        name: newClip.name,
                        url: newClip.url,
                        duration: newClip.duration,
                        start: 0,
                        end: newClip.duration,
                        offset: p.currentTime,
                        track: targetTrack.id,
                        type: newClip.type,
                        fadeIn: 0,
                        fadeOut: 0,
                        mediaLibraryId: useServerStorage ? undefined : newClip.id
                    };
                    updatedClips = [...updatedClips, timelineClip];
                    const newEndTime = timelineClip.offset + timelineClip.duration;
                    updatedDuration = Math.max(p.duration, newEndTime + 10);
                    updatedCurrentTime = newEndTime;
                }

                return { 
                    ...p, 
                    library: updatedLibrary,
                    clips: updatedClips,
                    duration: updatedDuration,
                    currentTime: updatedCurrentTime
                };
            });
            
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (err) {
            console.error("Failed to save media", err);
            alert("Failed to save media: " + (err as Error).message);
        }
        
        tempMedia.remove();
    };

    tempMedia.onerror = () => {
        alert("Failed to load file media.");
        tempMedia.remove();
    };
  };

  const handleAddMedia = () => {
    if (!mediaUrl.trim()) return;
    const url = mediaUrl.trim();
    
    // Create temp element to check duration and validity
    let tempMedia: HTMLVideoElement | HTMLAudioElement;
    if (mediaType === 'video') {
        tempMedia = document.createElement('video');
    } else {
        tempMedia = document.createElement('audio');
    }
    
    tempMedia.crossOrigin = "anonymous";
    
    const handleSuccess = () => {
        const duration = tempMedia.duration;
        if (duration && !isNaN(duration) && duration !== Infinity) {
             const newClip: LibraryClip = {
                id: crypto.randomUUID(), // Transient ID
                name: `${mediaType === 'video' ? 'Video' : 'Audio'} ${project.library.length + 1}`,
                url: tempMedia.src,
                duration: duration, 
                type: mediaType
            };

            setProject(p => {
                const updatedLibrary = [...p.library, newClip];

                // Also Add to Timeline immediately
                const targetTrack = p.tracks.find(t => t.type === newClip.type);
                let updatedClips = p.clips;
                let updatedDuration = p.duration;
                let updatedCurrentTime = p.currentTime;

                if (targetTrack) {
                    const timelineClip: Clip = {
                        id: crypto.randomUUID(),
                        name: newClip.name,
                        url: newClip.url,
                        duration: newClip.duration,
                        start: 0,
                        end: newClip.duration,
                        offset: p.currentTime,
                        track: targetTrack.id,
                        type: newClip.type,
                        fadeIn: 0,
                        fadeOut: 0,
                        mediaLibraryId: newClip.id
                    };
                    updatedClips = [...updatedClips, timelineClip];
                    const newEndTime = timelineClip.offset + timelineClip.duration;
                    updatedDuration = Math.max(p.duration, newEndTime + 10);
                    updatedCurrentTime = newEndTime;
                }

                return { 
                    ...p, 
                    library: updatedLibrary,
                    clips: updatedClips,
                    duration: updatedDuration,
                    currentTime: updatedCurrentTime
                };
            });
            setMediaUrl('');
        } else {
            alert(`Could not determine ${mediaType} duration.`);
        }
        tempMedia.remove();
    };

    const handleError = () => {
        if (!tempMedia.src.includes('corsproxy.io')) {
            tempMedia.src = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        } else {
            alert("Failed to load media. CORS restricted.");
            tempMedia.remove();
        }
    };

    tempMedia.onloadedmetadata = handleSuccess;
    tempMedia.onerror = handleError;
    tempMedia.src = url;
  };

  const handleDeleteFromLibrary = async (index: number) => {
      const clip = project.library[index];
      
      // If Local Mode and it has an ID that exists in our mediaMap, it's a DB file
      if (!useServerStorage && mediaMap.has(clip.id)) {
          try {
              await deleteMedia(clip.id);
              // Revoke URL
              URL.revokeObjectURL(clip.url);
              setMediaMap(prev => {
                  const next = new Map(prev);
                  next.delete(clip.id);
                  return next;
              });
          } catch (e) {
              console.error("Failed to delete from DB", e);
          }
      }
      // If Server Mode: We generally don't delete files from server just by removing from library,
      // as they might be used in other projects. A separate Media Manager would be needed for that.

      setProject(p => ({
          ...p,
          library: p.library.filter((_, i) => i !== index)
      }));
  };

  const handleAddClip = (index: number) => {
    const stock = project.library[index];
    const targetTrack = project.tracks.find(t => t.type === stock.type);
    
    if (!targetTrack) {
        alert(`No track available for ${stock.type} clips.`);
        return;
    }

    const newClip: Clip = {
      id: crypto.randomUUID(),
      name: stock.name,
      url: stock.url,
      duration: stock.duration,
      start: 0,
      end: stock.duration,
      offset: project.currentTime,
      track: targetTrack.id,
      type: stock.type,
      fadeIn: 0,
      fadeOut: 0,
      mediaLibraryId: stock.id // Link for persistence
    };
    
    const newEndTime = newClip.offset + newClip.duration;
    
    setProject(p => ({
        ...p,
        clips: [...p.clips, newClip],
        duration: Math.max(p.duration, newEndTime + 10),
        currentTime: newEndTime // Jump to end of new clip
    }));
  };

  const handleAddTextClip = () => {
    setProject(p => {
        let tracks = [...p.tracks];
        let textTrack = tracks.find(t => t.type === 'text');
        
        if (!textTrack) {
             const defaultTextTrack = INITIAL_TRACKS.find(t => t.type === 'text');
             if (defaultTextTrack) {
                 textTrack = defaultTextTrack;
                 tracks.push(textTrack);
             } else {
                 return p; 
             }
        }

        const newClip: Clip = {
            id: crypto.randomUUID(),
            name: "New Title",
            url: "", 
            duration: 5,
            start: 0,
            end: 5,
            offset: p.currentTime,
            track: textTrack.id,
            type: 'text',
            textContent: "Double click to edit",
            fontSize: 60,
            fontColor: "#ffffff",
            x: p.width / 2,
            y: p.height / 2,
            fadeIn: 0,
            fadeOut: 0
        };
        
        const newEndTime = newClip.offset + newClip.duration;

        return {
            ...p,
            tracks,
            clips: [...p.clips, newClip],
            duration: Math.max(p.duration, newEndTime + 10),
            currentTime: newEndTime,
            selectedClipId: newClip.id // Auto-select to edit
        };
    });
  };

  const handleUpdateClip = (updatedClip: Clip) => {
    setProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === updatedClip.id ? updatedClip : c)
    }));
  };

  const handleApplyTransition = (type: TransitionType | 'cut') => {
      if (!project.selectedClipId) return;
      const currentClip = project.clips.find(c => c.id === project.selectedClipId);
      if (!currentClip) return;

      const sortedTrackClips = project.clips
          .filter(c => c.track === currentClip.track && c.id !== currentClip.id)
          .sort((a, b) => a.offset - b.offset);
      
      const prevClip = sortedTrackClips.filter(c => c.offset < currentClip.offset).pop();

      if (!prevClip) {
          if (type !== 'cut') {
              handleUpdateClip({ 
                  ...currentClip, 
                  transition: { type, duration: transitionDuration },
                  fadeIn: 0 
              });
          } else {
              handleUpdateClip({ 
                  ...currentClip, 
                  transition: undefined,
                  fadeIn: 0 
              });
          }
          return;
      }

      let updatedCurrent = { ...currentClip };

      if (type !== 'cut') {
          const prevClipEnd = prevClip.offset + (prevClip.end - prevClip.start);
          const desiredOffset = prevClipEnd - transitionDuration;
          if (desiredOffset < 0) return; 

          updatedCurrent.offset = desiredOffset;
          updatedCurrent.transition = { type, duration: transitionDuration };
          updatedCurrent.fadeIn = 0; 
          
      } else {
          const prevClipEnd = prevClip.offset + (prevClip.end - prevClip.start);
          updatedCurrent.offset = prevClipEnd;
          updatedCurrent.transition = undefined;
          updatedCurrent.fadeIn = 0;
      }

      setProject(p => ({
          ...p,
          clips: p.clips.map(c => {
              if (c.id === updatedCurrent.id) return updatedCurrent;
              return c;
          })
      }));
  };

  const handleSelectClip = (id: string | null) => {
    setProject(p => ({ ...p, selectedClipId: id }));
  };

  const handleSplit = () => {
    if (!project.selectedClipId) return;
    const clip = project.clips.find(c => c.id === project.selectedClipId);
    if (!clip) return;

    const relativeTime = project.currentTime - clip.offset;
    if (relativeTime <= 0 || relativeTime >= (clip.end - clip.start)) {
        alert("Playhead must be inside the selected clip to split.");
        return;
    }

    const splitPointSource = clip.start + relativeTime;

    const leftClip: Clip = {
        ...clip,
        end: splitPointSource
    };

    const rightClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        start: splitPointSource,
        end: clip.end,
        offset: project.currentTime,
        fadeIn: 0,
        transition: undefined
    };

    setProject(p => ({
        ...p,
        clips: p.clips.map(c => c.id === clip.id ? leftClip : c).concat(rightClip),
        selectedClipId: null 
    }));
  };

  const handleDelete = () => {
    if (!project.selectedClipId) return;
    setProject(p => ({
        ...p,
        clips: p.clips.filter(c => c.id !== p.selectedClipId),
        selectedClipId: null
    }));
  };

  const handleExportClick = () => {
    const maxContentTime = project.clips.reduce((max, clip) => Math.max(max, clip.offset + (clip.end - clip.start)), 0);
    if (maxContentTime === 0) {
        alert("Timeline is empty.");
        return;
    }
    setExportSettings({ start: 0, end: maxContentTime });
    setExportUrl(null);
    setExportMimeType('');
    setShowExportModal(true);
  };

  const startExport = () => {
    setShowExportModal(false);
    setProject(p => ({ ...p, currentTime: exportSettings.start, isPlaying: false }));
    setIsExporting(true);
  };

  const handleExportFinish = (url: string | null, mimeType?: string) => {
      setIsExporting(false);
      setProject(p => ({ ...p, isPlaying: false }));
      if (url) {
          setExportUrl(url);
          setExportMimeType(mimeType || '');
      }
  };

  const downloadExportedVideo = () => {
      if (!exportUrl) return;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = exportUrl;
      let extension = 'webm';
      if (exportMimeType.includes('mp4')) extension = 'mp4';
      else if (exportMimeType.includes('webm')) extension = 'webm';
      a.download = `lumina_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
          document.body.removeChild(a);
          setExportUrl(null);
          URL.revokeObjectURL(exportUrl);
      }, 100);
  };

  const handleResolutionChange = (e: ChangeEvent<HTMLSelectElement>) => {
      const selected = RESOLUTIONS.find(r => r.name === e.target.value);
      if (selected) {
          setProject(p => ({ ...p, width: selected.width, height: selected.height }));
      }
  };

  const handleFpsChange = (e: ChangeEvent<HTMLSelectElement>) => {
      const fps = parseInt(e.target.value, 10);
      if (!isNaN(fps)) {
          setProject(p => ({ ...p, fps }));
      }
  };

  const handleLoadProject = (loadedProject: ProjectState) => {
    if (!loadedProject) return;

    // Revitalization Logic (Local vs Server)
    
    // 1. If loading a local project, revitalize blob URLs from mediaMap (IndexedDB)
    // 2. If loading a server project, the URLs are likely already absolute (http://...), so we keep them.
    // However, if the server project was saved with Blob URLs (mistake), they won't work. 
    // Assumption: Server projects save with Server URLs.

    const restoredClips = (loadedProject.clips || []).map(c => {
        // If we have a local map match, prefer it (Local Mode)
        if (c.mediaLibraryId && mediaMap.has(c.mediaLibraryId)) {
            return { ...c, url: mediaMap.get(c.mediaLibraryId)! };
        }
        return c;
    });

    const restoredLibrary = (loadedProject.library || []).map(l => {
        if (l.id && mediaMap.has(l.id)) {
            return { ...l, url: mediaMap.get(l.id)! };
        }
        return l;
    });

    // Ensure tracks array exists
    let tracks = Array.isArray(loadedProject.tracks) ? loadedProject.tracks : INITIAL_TRACKS;
    if (!tracks.find(t => t.type === 'text')) {
        const defaultTextTrack = INITIAL_TRACKS.find(t => t.type === 'text');
        if (defaultTextTrack) tracks = [...tracks, defaultTextTrack];
    }

    const safeProject: ProjectState = {
        id: loadedProject.id || crypto.randomUUID(),
        name: loadedProject.name || "Imported Project",
        library: restoredLibrary,
        clips: restoredClips,
        tracks: tracks,
        duration: typeof loadedProject.duration === 'number' ? loadedProject.duration : 30,
        currentTime: 0,
        isPlaying: false,
        isLooping: !!loadedProject.isLooping,
        selectedClipId: null,
        zoom: loadedProject.zoom || PIXELS_PER_SECOND_DEFAULT,
        width: loadedProject.width || RESOLUTIONS[0].width,
        height: loadedProject.height || RESOLUTIONS[0].height,
        fps: loadedProject.fps || DEFAULT_FPS,
        lastSeekTime: Date.now(), // Force sync on load
    };

    setProject(safeProject);
    setPlayerKey(k => k + 1); // FORCE Player Component Remount to ensure all media elements are re-created from source
  };

  const playerDimensions = useMemo(() => {
      const maxWidth = 800;
      const maxHeight = 500;
      const aspect = project.width / project.height;
      let w = maxWidth;
      let h = w / aspect;
      if (h > maxHeight) {
          h = maxHeight;
          w = h * aspect;
      }
      return { width: w, height: h };
  }, [project.width, project.height]);

  const selectedClip = project.selectedClipId 
    ? project.clips.find(c => c.id === project.selectedClipId) 
    : null;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white font-sans">
      <Toolbar 
        project={project}
        onAddClip={() => {}} 
        onSplit={handleSplit}
        onDelete={handleDelete}
        onTogglePlay={handleTogglePlay}
        onExport={handleExportClick}
        onOpenProjectManager={() => setShowProjectManager(true)}
        isExporting={isExporting}
        onToggleLoop={handleToggleLoop}
        onAddText={handleAddTextClip}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col overflow-y-auto custom-scrollbar">
           <ProjectSettings 
                project={project} 
                onResolutionChange={handleResolutionChange}
                onFpsChange={handleFpsChange}
           />
           <ClipProperties 
                selectedClip={selectedClip}
                onUpdateClip={handleUpdateClip}
                transitionDuration={transitionDuration}
                setTransitionDuration={setTransitionDuration}
                onApplyTransition={handleApplyTransition}
           />
           <MediaLibrary 
                project={project}
                mediaUrl={mediaUrl}
                setMediaUrl={setMediaUrl}
                mediaType={mediaType}
                setMediaType={setMediaType}
                onAddMedia={handleAddMedia}
                fileInputRef={fileInputRef}
                onFileUpload={handleFileUpload}
                onAddClip={handleAddClip}
                onDeleteFromLibrary={handleDeleteFromLibrary}
           />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 bg-gray-950 flex items-center justify-center p-8 relative overflow-hidden">
                <Player 
                    key={playerKey}
                    project={project} 
                    onTimeUpdate={handleTimeUpdate}
                    onDurationChange={() => {}}
                    isExporting={isExporting}
                    exportEndTime={exportSettings.end}
                    onExportFinish={handleExportFinish}
                    width={playerDimensions.width}
                    height={playerDimensions.height}
                    onClipUpdate={handleUpdateClip}
                />
                
                {isExporting && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <h3 className="text-xl font-bold">Rendering & Recording...</h3>
                            <p className="text-gray-400">Please wait while we generate your video.</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="h-64 flex flex-col border-t border-gray-800">
                <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between">
                    <span className="text-xs text-gray-500">Timeline</span>
                    <div className="text-xs font-mono text-gray-400">
                        {Math.floor(project.currentTime / 60)}:{(Math.floor(project.currentTime) % 60).toString().padStart(2, '0')}.
                        {(Math.floor((project.currentTime % 1) * 100)).toString().padStart(2, '0')}
                    </div>
                </div>
                <Timeline 
                    project={project}
                    onSeek={handleSeek}
                    onClipUpdate={handleUpdateClip}
                    onClipSelect={handleSelectClip}
                />
            </div>
        </div>

        <ProjectManager 
            isOpen={showProjectManager} 
            onClose={() => setShowProjectManager(false)} 
            currentProject={project}
            onLoadProject={handleLoadProject}
            useServerStorage={useServerStorage}
            setUseServerStorage={setUseServerStorage}
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
        />

        <ExportModals 
            showExportModal={showExportModal}
            setShowExportModal={setShowExportModal}
            exportSettings={exportSettings}
            setExportSettings={setExportSettings}
            startExport={startExport}
            exportUrl={exportUrl}
            downloadExportedVideo={downloadExportedVideo}
            setExportUrl={setExportUrl}
            project={project}
        />

      </div>
    </div>
  );
};

export default App;
