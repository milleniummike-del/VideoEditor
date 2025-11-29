
import { useState, useCallback, useEffect, useMemo, useRef, type FC, type ChangeEvent } from 'react';
import { ProjectState, Clip, Track, LibraryClip } from './types';
import { INITIAL_TRACKS, STOCK_CLIPS, PIXELS_PER_SECOND_DEFAULT, RESOLUTIONS } from './constants';
import Timeline from './components/Timeline';
import Player from './components/Player';
import Toolbar from './components/Toolbar';
import ProjectManager from './components/ProjectManager';

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

    // Sanitize and default missing fields to prevent crashes with old/malformed JSONs
    // Create a new object to ensure state update triggers
    const safeProject: ProjectState = {
        name: loadedProject.name || "Imported Project",
        library: Array.isArray(loadedProject.library) ? loadedProject.library : [],
        clips: Array.isArray(loadedProject.clips) ? loadedProject.clips : [],
        tracks: Array.isArray(loadedProject.tracks) ? loadedProject.tracks : INITIAL_TRACKS,
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
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar / Media Library */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col overflow-y-auto custom-scrollbar">
           
           {/* Project Settings */}
           <div className="mb-6 border-b border-gray-800 pb-4">
               <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Project Settings</h2>
               <div className="mb-3">
                 <div className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Project Name</div>
                 <div className="text-sm font-medium text-white">{project.name || "Untitled Project"}</div>
               </div>
               <div>
                   <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Resolution</label>
                   <select 
                       className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                       onChange={handleResolutionChange}
                       value={RESOLUTIONS.find(r => r.width === project.width && r.height === project.height)?.name || ''}
                   >
                       {RESOLUTIONS.map(r => (
                           <option key={r.name} value={r.name}>{r.name} ({r.width}x{r.height})</option>
                       ))}
                   </select>
               </div>
           </div>

           {/* Selected Clip Properties */}
           {selectedClip && (
               <div className="mb-6 border-b border-gray-800 pb-4 animate-in fade-in slide-in-from-left-2 duration-200">
                   <h2 className="text-sm font-semibold text-blue-400 uppercase mb-3">Selected Clip</h2>
                   
                   <div className="mb-3">
                       <label className="text-[10px] text-gray-500 mb-1 block">Clip Name</label>
                       <input 
                           type="text" 
                           value={selectedClip.name}
                           onChange={(e) => handleUpdateClip({...selectedClip, name: e.target.value})}
                           onKeyDown={(e) => e.stopPropagation()}
                           className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                       />
                   </div>
                   
                   <div className="mb-3 border-t border-gray-700 pt-3">
                        <label className="text-[10px] text-gray-500 mb-2 block uppercase tracking-wider">Transition (In)</label>
                        <div className="flex space-x-2 mb-2">
                             <button 
                                onClick={() => handleApplyTransition('cut')}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs py-1"
                             >
                                Cut (None)
                             </button>
                             <button 
                                onClick={() => handleApplyTransition('dissolve')}
                                className="flex-1 bg-blue-900/50 hover:bg-blue-800 border border-blue-800 rounded text-xs py-1 text-blue-200"
                             >
                                Cross Dissolve
                             </button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <label className="text-[10px] text-gray-500">Duration:</label>
                             <input 
                               type="number" 
                               min="0.1"
                               max="5"
                               step="0.1"
                               value={transitionDuration}
                               onChange={(e) => setTransitionDuration(Number(e.target.value))}
                               className="w-16 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                           />
                           <span className="text-[10px] text-gray-500">s</span>
                        </div>
                        <p className="text-[9px] text-gray-500 mt-1 italic">
                            'Dissolve' overlaps clip with previous clip.
                        </p>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3 border-t border-gray-700 pt-3">
                       <div>
                           <label className="text-[10px] text-gray-500 mb-1 block">Fade In (s)</label>
                           <input 
                               type="number" 
                               min="0"
                               max="5"
                               step="0.1"
                               value={selectedClip.fadeIn || 0}
                               onChange={(e) => handleUpdateClip({...selectedClip, fadeIn: Number(e.target.value)})}
                               className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                           />
                       </div>
                       <div>
                           <label className="text-[10px] text-gray-500 mb-1 block">Fade Out (s)</label>
                           <input 
                               type="number" 
                               min="0"
                               max="5"
                               step="0.1"
                               value={selectedClip.fadeOut || 0}
                               onChange={(e) => handleUpdateClip({...selectedClip, fadeOut: Number(e.target.value)})}
                               className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                           />
                       </div>
                   </div>
               </div>
           )}

           <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">Media Library</h2>
           
           {/* Add Custom URL Section */}
           <div className="mb-6">
              <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Add from URL</div>
              
              <div className="flex space-x-2 mb-2">
                 <button 
                    onClick={() => setMediaType('video')}
                    className={`flex-1 text-[10px] py-1 rounded border ${mediaType === 'video' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                 >
                    Video
                 </button>
                 <button 
                    onClick={() => setMediaType('audio')}
                    className={`flex-1 text-[10px] py-1 rounded border ${mediaType === 'audio' ? 'bg-green-600 border-green-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                 >
                    Audio
                 </button>
              </div>

              <div className="flex flex-col space-y-2">
                  <input 
                      type="text" 
                      placeholder="https://..."
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()} // Stop propagation so spacebar doesn't trigger play
                      className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                  />
                  <button 
                      onClick={handleAddMedia}
                      disabled={!mediaUrl}
                      className={`w-full py-1.5 disabled:opacity-50 text-xs font-medium rounded text-white transition-colors ${mediaType === 'video' ? 'bg-blue-600/80 hover:bg-blue-500' : 'bg-green-600/80 hover:bg-green-500'}`}
                  >
                      Add {mediaType === 'video' ? 'Video' : 'Audio'} to Library
                  </button>
              </div>

              {/* Upload Section */}
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Upload Media</div>
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept={mediaType === 'video' ? "video/*, .mp4, .mov, .webm, .mkv" : "audio/*, .mp3, .wav, .ogg, .m4a, .aac, .flac"}
                    onChange={handleFileUpload}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors flex items-center justify-center"
                >
                    <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Upload {mediaType === 'video' ? 'Video' : 'Audio'}
                </button>
                <div className="mt-1 text-[9px] text-gray-500 italic text-center">
                    Note: Uploaded files are not saved permanently in projects.
                </div>
              </div>
           </div>

           <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Clips</div>
           {project.library.length === 0 ? (
               <div className="text-xs text-gray-600 italic">No clips in library.</div>
           ) : (
             <div className="space-y-3 pb-4">
               {project.library.map((clip, idx) => (
                 <div key={idx} className="relative group p-3 bg-gray-800 rounded hover:bg-gray-700 transition cursor-pointer border border-transparent hover:border-gray-600" onClick={() => handleAddClip(idx)}>
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium text-white truncate max-w-[110px]">{clip.name}</div>
                        <span className={`text-[9px] px-1 rounded ${clip.type === 'video' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'}`}>{clip.type === 'video' ? 'VID' : 'AUD'}</span>
                    </div>
                    <div className="text-xs text-gray-500">{clip.duration.toFixed(1)}s</div>
                    <div className="mt-2 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to Add</div>
                    
                    {/* Delete Button */}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFromLibrary(idx);
                        }}
                        className="absolute bottom-2 right-2 p-1.5 text-gray-500 hover:text-red-400"
                        title="Remove from Library"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                 </div>
               ))}
             </div>
           )}
           
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

        {/* Export Configuration Modal */}
        {showExportModal && (
            <div className="absolute inset-0 z-[60] bg-black/70 flex items-center justify-center">
                <div className="bg-gray-800 p-6 rounded-lg shadow-2xl w-96 border border-gray-700">
                    <h3 className="text-lg font-bold mb-4">Export Video</h3>
                    
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Start Time (seconds)</label>
                            <input 
                                type="number" 
                                value={exportSettings.start}
                                onChange={(e) => setExportSettings(s => ({...s, start: Number(e.target.value)}))}
                                onKeyDown={(e) => e.stopPropagation()} // Stop propagation
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                                min="0"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">End Time (seconds)</label>
                            <input 
                                type="number" 
                                value={exportSettings.end}
                                onChange={(e) => setExportSettings(s => ({...s, end: Number(e.target.value)}))}
                                onKeyDown={(e) => e.stopPropagation()} // Stop propagation
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                                min="0"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Defaults to In/Out points if set, or end of last clip.</p>
                        </div>
                        <div className="pt-2 border-t border-gray-700">
                            <p className="text-xs text-gray-400">Output Resolution: <span className="text-white">{project.width}x{project.height}</span></p>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button 
                            onClick={() => setShowExportModal(false)}
                            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={startExport}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
                        >
                            Start Export
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Download Ready Modal */}
        {exportUrl && (
            <div className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center">
                <div className="bg-gray-800 p-6 rounded-lg shadow-2xl w-96 border border-gray-700 text-center">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="text-xl font-bold mb-2">Export Complete!</h3>
                    <p className="text-gray-400 text-sm mb-6">Your video is ready to be downloaded.</p>
                    
                    <div className="flex flex-col space-y-3">
                        <button 
                            onClick={downloadExportedVideo}
                            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold text-white shadow-lg transition-transform active:scale-95"
                        >
                            Download Video
                        </button>
                        <button 
                            onClick={() => {
                                setExportUrl(null);
                                URL.revokeObjectURL(exportUrl);
                            }}
                            className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
