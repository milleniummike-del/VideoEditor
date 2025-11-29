
import { useState, useCallback, useEffect, useMemo, useRef, type FC, type ChangeEvent } from 'react';
import { ProjectState, Clip, LibraryClip } from './types';
import { INITIAL_TRACKS, PIXELS_PER_SECOND_DEFAULT, RESOLUTIONS } from './constants';
import Timeline from './components/Timeline';
import Player from './components/Player';
import Toolbar from './components/Toolbar';
import ProjectManager from './components/ProjectManager';
import ProjectSettings from './components/ProjectSettings';
import ClipProperties from './components/ClipProperties';
import MediaLibrary from './components/MediaLibrary';
import ExportModals from './components/ExportModals';

const App: FC = () => {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ProjectState>(() => {
    // Migration: Check for old library data in localStorage
    let initialLibrary: LibraryClip[] = [];
    try {
        const savedLib = localStorage.getItem('lumina_library');
        if (savedLib) {
            const parsed = JSON.parse(savedLib);
            initialLibrary = parsed.map((c: any) => ({ ...c, type: c.type || 'video' }));
        }
    } catch (e) {
        // ignore
    }

    return {
        clips: [],
        library: initialLibrary,
        tracks: INITIAL_TRACKS,
        duration: 30, // Initial workspace duration
        currentTime: 0,
        isPlaying: false,
        isLooping: false,
        inPoint: null,
        outPoint: null,
        selectedClipId: null,
        zoom: PIXELS_PER_SECOND_DEFAULT,
        width: RESOLUTIONS[0].width,
        height: RESOLUTIONS[0].height,
    };
  });

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
        // If exporting, use exportSettings.end
        const endTime = isExporting ? exportSettings.end : p.duration;

        // Stop at end
        if (time >= endTime) {
            return { ...p, currentTime: endTime, isPlaying: false };
        }
        return { ...p, currentTime: time };
    });
  }, [isExporting, exportSettings.end]);

  const handleSeek = (time: number) => {
    if (isExporting) return;
    setProject(p => ({ ...p, currentTime: time }));
  };

  const handleTogglePlay = useCallback(() => {
    if (isExporting) return;
    setProject(p => ({ ...p, isPlaying: !p.isPlaying }));
  }, [isExporting]);

  // Marker Handlers
  const handleSetInPoint = () => {
      setProject(p => {
          let newIn = p.currentTime;
          // Ensure In is before Out
          if (p.outPoint !== null && newIn >= p.outPoint) {
              return { ...p, inPoint: newIn, outPoint: null };
          }
          return { ...p, inPoint: newIn };
      });
  };

  const handleSetOutPoint = () => {
      setProject(p => {
          let newOut = p.currentTime;
          // Ensure Out is after In
          if (p.inPoint !== null && newOut <= p.inPoint) {
              // If dragging backwards, maybe swap? simpler to just prevent or clear In
              return { ...p, outPoint: newOut, inPoint: null };
          }
          return { ...p, outPoint: newOut };
      });
  };

  const handleClearMarkers = () => {
      setProject(p => ({ ...p, inPoint: null, outPoint: null }));
  };
  
  const handleMarkerUpdate = (inPoint: number | null, outPoint: number | null) => {
      setProject(p => ({ ...p, inPoint, outPoint }));
  };

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
      } else if (e.key.toLowerCase() === 'i') {
          handleSetInPoint();
      } else if (e.key.toLowerCase() === 'o') {
          handleSetOutPoint();
      } else if (e.shiftKey && e.key.toLowerCase() === 'x') {
          handleClearMarkers();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    
    // Robust Type Detection
    // 1. Check mime type
    // 2. Fallback to extension
    let detectedType: 'video' | 'audio' = 'video';
    
    if (file.type.startsWith('audio/')) {
        detectedType = 'audio';
    } else if (file.type.startsWith('video/')) {
        detectedType = 'video';
    } else {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '')) {
            detectedType = 'audio';
        } else {
            // Default to mediaType tab context if completely unknown, or default to video
            detectedType = mediaType;
        }
    }

    const type = detectedType; 
    
    let tempMedia: HTMLVideoElement | HTMLAudioElement;
    if (type === 'video') {
        tempMedia = document.createElement('video');
    } else {
        tempMedia = document.createElement('audio');
    }
    
    tempMedia.src = objectUrl;
    tempMedia.preload = 'metadata';
    
    tempMedia.onloadedmetadata = () => {
        const duration = tempMedia.duration;
         const newClip: LibraryClip = {
            name: file.name,
            url: objectUrl,
            duration: duration || 10,
            type: type
        };
        setProject(p => ({ ...p, library: [...p.library, newClip] }));
        tempMedia.remove();
        
        // Reset input so same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    tempMedia.onerror = (e) => {
        console.error("File load error", e);
        alert(`Failed to load file "${file.name}". The format might not be supported.`);
        tempMedia.remove();
        if (fileInputRef.current) fileInputRef.current.value = '';
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
    
    // IMPORTANT: Set crossOrigin BEFORE src to ensure correct CORS request
    tempMedia.crossOrigin = "anonymous";
    
    const handleSuccess = () => {
        const duration = tempMedia.duration;
        if (duration && !isNaN(duration) && duration !== Infinity) {
             const newClip: LibraryClip = {
                name: `${mediaType === 'video' ? 'Video' : 'Audio'} ${project.library.length + 1}`,
                url: tempMedia.src,
                duration: duration, 
                type: mediaType
            };
            setProject(p => ({ ...p, library: [...p.library, newClip] }));
            setMediaUrl('');
        } else {
            alert(`Could not determine ${mediaType} duration. The format might not be supported.`);
        }
        tempMedia.remove();
    };

    const handleError = () => {
        // If the src is not already using the proxy, try the proxy
        if (!tempMedia.src.includes('corsproxy.io')) {
            console.log("Direct load failed, attempting CORS proxy...");
            // Use a public CORS proxy to bypass headers issue
            // We use encodeURIComponent to ensure special chars in URL are handled
            tempMedia.src = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        } else {
            // Already tried proxy and failed
            alert("Failed to load media. The resource likely restricts access or does not support CORS even via proxy.");
            tempMedia.remove();
        }
    };

    tempMedia.onloadedmetadata = handleSuccess;
    tempMedia.onerror = handleError;
    
    // Initial attempt: Direct URL
    tempMedia.src = url;
  };

  const handleDeleteFromLibrary = (index: number) => {
      setProject(p => ({
          ...p,
          library: p.library.filter((_, i) => i !== index)
      }));
  };

  const handleAddClip = (index: number) => {
    const stock = project.library[index];
    
    // Find appropriate track based on type
    // If Video, find video track. If Audio, find audio track.
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
      offset: project.currentTime, // Add at playhead
      track: targetTrack.id,
      type: stock.type,
      fadeIn: 0,
      fadeOut: 0
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
    // Robustly find or create the text track
    setProject(p => {
        let tracks = [...p.tracks];
        let textTrack = tracks.find(t => t.type === 'text');
        
        if (!textTrack) {
             const defaultTextTrack = INITIAL_TRACKS.find(t => t.type === 'text');
             if (defaultTextTrack) {
                 textTrack = defaultTextTrack;
                 tracks.push(textTrack);
             } else {
                 // Fallback if constants are missing it for some reason
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

  const handleApplyTransition = (type: 'cut' | 'dissolve') => {
      if (!project.selectedClipId) return;
      const currentClip = project.clips.find(c => c.id === project.selectedClipId);
      if (!currentClip) return;

      // Find previous clip on same track
      const sortedTrackClips = project.clips
          .filter(c => c.track === currentClip.track && c.id !== currentClip.id)
          .sort((a, b) => a.offset - b.offset);
      
      const prevClip = sortedTrackClips.filter(c => c.offset < currentClip.offset).pop();

      if (!prevClip) {
          // If no previous clip, we can still set fade in/out but no overlap
          if (type === 'dissolve') {
              handleUpdateClip({ ...currentClip, fadeIn: transitionDuration });
          } else {
              handleUpdateClip({ ...currentClip, fadeIn: 0 });
          }
          return;
      }

      let updatedCurrent = { ...currentClip };
      let updatedPrev = { ...prevClip }; // We might modify prev clip too? Usually only next.

      if (type === 'dissolve') {
          // AUTO OVERLAP LOGIC
          // 1. Calculate desired start point for current clip: PrevClip.End - Duration
          const prevClipEnd = prevClip.offset + (prevClip.end - prevClip.start);
          const desiredOffset = prevClipEnd - transitionDuration;
          
          if (desiredOffset < 0) return; // Can't move before start

          // 2. Move current clip to overlap
          updatedCurrent.offset = desiredOffset;
          updatedCurrent.fadeIn = transitionDuration;
          
          // Optional: Extend prev clip? No, assuming prev clip is long enough or we just overlap what exists.
      } else {
          // CUT: Remove Fade, Snap to end of prev clip (remove overlap)
          const prevClipEnd = prevClip.offset + (prevClip.end - prevClip.start);
          updatedCurrent.offset = prevClipEnd;
          updatedCurrent.fadeIn = 0;
      }

      setProject(p => ({
          ...p,
          clips: p.clips.map(c => {
              if (c.id === updatedCurrent.id) return updatedCurrent;
              // if (c.id === updatedPrev.id) return updatedPrev;
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

    // Check if playhead is inside clip
    const relativeTime = project.currentTime - clip.offset;
    if (relativeTime <= 0 || relativeTime >= (clip.end - clip.start)) {
        alert("Playhead must be inside the selected clip to split.");
        return;
    }

    // Split point in source media time
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
        fadeIn: 0 // Reset fade for new split part
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
    // Calculate content bounds
    const maxContentTime = project.clips.reduce((max, clip) => Math.max(max, clip.offset + (clip.end - clip.start)), 0);
    
    // Default to In/Out points if set, otherwise max content
    let start = 0;
    let end = maxContentTime;
    
    if (project.inPoint !== null) start = project.inPoint;
    if (project.outPoint !== null && project.outPoint > start) end = project.outPoint;
    
    if (maxContentTime === 0 && (project.inPoint === null || project.outPoint === null)) {
        alert("Timeline is empty.");
        return;
    }

    setExportSettings({
        start: start,
        end: end
    });
    setExportUrl(null);
    setExportMimeType('');
    setShowExportModal(true);
  };

  const startExport = () => {
    setShowExportModal(false);
    // Set up project for export: Start at beginning, but DO NOT play yet. 
    // Player will handle internal playback sync with recorder.
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
      
      // Smart extension handling
      let extension = 'webm';
      if (exportMimeType.includes('mp4')) {
          extension = 'mp4';
      } else if (exportMimeType.includes('webm')) {
          extension = 'webm';
      }
      
      a.download = `lumina_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
          document.body.removeChild(a);
          setExportUrl(null);
          // Revoke URL to free memory, but only after we are sure user clicked
          URL.revokeObjectURL(exportUrl);
      }, 100);
  };

  const handleResolutionChange = (e: ChangeEvent<HTMLSelectElement>) => {
      const selected = RESOLUTIONS.find(r => r.name === e.target.value);
      if (selected) {
          setProject(p => ({
              ...p,
              width: selected.width,
              height: selected.height
          }));
      }
  };

  const handleLoadProject = (loadedProject: ProjectState) => {
    // If the project object is null or undefined (e.g. cancelled load), do nothing
    if (!loadedProject) return;

    // Ensure tracks array exists
    let tracks = Array.isArray(loadedProject.tracks) ? loadedProject.tracks : INITIAL_TRACKS;

    // Migration: Ensure Text Track exists if loading old project
    if (!tracks.find(t => t.type === 'text')) {
        const defaultTextTrack = INITIAL_TRACKS.find(t => t.type === 'text');
        if (defaultTextTrack) {
            tracks = [...tracks, defaultTextTrack];
        }
    }

    // Sanitize and default missing fields to prevent crashes with old/malformed JSONs
    // Create a new object to ensure state update triggers
    const safeProject: ProjectState = {
        name: loadedProject.name || "Imported Project",
        library: Array.isArray(loadedProject.library) ? loadedProject.library : [],
        clips: Array.isArray(loadedProject.clips) ? loadedProject.clips : [],
        tracks: tracks,
        duration: typeof loadedProject.duration === 'number' ? loadedProject.duration : 30,
        currentTime: 0,
        isPlaying: false,
        isLooping: !!loadedProject.isLooping,
        inPoint: typeof loadedProject.inPoint === 'number' ? loadedProject.inPoint : null,
        outPoint: typeof loadedProject.outPoint === 'number' ? loadedProject.outPoint : null,
        selectedClipId: null,
        zoom: loadedProject.zoom || PIXELS_PER_SECOND_DEFAULT,
        width: loadedProject.width || RESOLUTIONS[0].width,
        height: loadedProject.height || RESOLUTIONS[0].height,
    };

    setProject(safeProject);
  };

  // Calculate player display dimensions to fit within a container while maintaining aspect ratio
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
      {/* Header / Toolbar */}
      <Toolbar 
        project={project}
        onAddClip={() => {}} 
        onSplit={handleSplit}
        onDelete={handleDelete}
        onTogglePlay={handleTogglePlay}
        onExport={handleExportClick}
        onOpenProjectManager={() => setShowProjectManager(true)}
        isExporting={isExporting}
        onSetInPoint={handleSetInPoint}
        onSetOutPoint={handleSetOutPoint}
        onClearMarkers={handleClearMarkers}
        onToggleLoop={handleToggleLoop}
        onAddText={handleAddTextClip}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar / Media Library */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col overflow-y-auto custom-scrollbar">
           
           <ProjectSettings 
                project={project} 
                onResolutionChange={handleResolutionChange} 
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

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
            {/* Player Preview */}
            <div className="flex-1 bg-gray-950 flex items-center justify-center p-8 relative overflow-hidden">
                <Player 
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
                
                {/* Export Overlay */}
                {isExporting && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <h3 className="text-xl font-bold">Rendering & Recording...</h3>
                            <p className="text-gray-400">Please wait while we generate your video.</p>
                            <p className="text-gray-500 text-sm mt-2">Do not switch tabs.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Timeline */}
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
                    onMarkerUpdate={handleMarkerUpdate}
                />
            </div>
        </div>

        {/* Project Manager Modal */}
        <ProjectManager 
            isOpen={showProjectManager} 
            onClose={() => setShowProjectManager(false)} 
            currentProject={project}
            onLoadProject={handleLoadProject}
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
