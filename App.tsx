
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ProjectState, Clip, Track, GeminiAnalysis } from './types';
import { INITIAL_TRACKS, STOCK_CLIPS, PIXELS_PER_SECOND_DEFAULT, RESOLUTIONS } from './constants';
import Timeline from './components/Timeline';
import Player from './components/Player';
import Toolbar from './components/Toolbar';
import { generateProjectMetadata } from './services/geminiService';

interface LibraryClip {
  name: string;
  url: string;
  duration: number;
  type: 'video' | 'audio';
}

const App: React.FC = () => {
  // Initialize from LocalStorage or empty array
  const [libraryClips, setLibraryClips] = useState<LibraryClip[]>(() => {
    try {
        const saved = localStorage.getItem('lumina_library');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Migration for old data without type
            return parsed.map((c: any) => ({ ...c, type: c.type || 'video' }));
        }
        return [];
    } catch (e) {
        return [];
    }
  });
  
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ProjectState>({
    clips: [],
    tracks: INITIAL_TRACKS,
    duration: 30, // Initial workspace duration
    currentTime: 0,
    isPlaying: false,
    selectedClipId: null,
    zoom: PIXELS_PER_SECOND_DEFAULT,
    width: RESOLUTIONS[0].width,
    height: RESOLUTIONS[0].height,
  });

  const [aiMetadata, setAiMetadata] = useState<GeminiAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState({ start: 0, end: 0 });

  // Save library to LocalStorage
  useEffect(() => {
    localStorage.setItem('lumina_library', JSON.stringify(libraryClips));
  }, [libraryClips]);

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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Avoid triggering when user is typing in inputs
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') {
          return;
        }
        
        e.preventDefault(); // Prevent page scrolling
        handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const type = file.type.startsWith('audio/') ? 'audio' : 'video';
    
    let tempMedia: HTMLVideoElement | HTMLAudioElement;
    if (type === 'video') {
        tempMedia = document.createElement('video');
    } else {
        tempMedia = document.createElement('audio');
    }
    
    tempMedia.src = objectUrl;
    
    tempMedia.onloadedmetadata = () => {
        const duration = tempMedia.duration;
         const newClip: LibraryClip = {
            name: file.name,
            url: objectUrl,
            duration: duration || 10,
            type: type
        };
        setLibraryClips(prev => [...prev, newClip]);
        tempMedia.remove();
        
        // Reset input so same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    tempMedia.onerror = () => {
        alert("Failed to load file. Format might not be supported.");
        tempMedia.remove();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
  };

  const handleAddMedia = () => {
    if (!mediaUrl.trim()) return;
    
    // Create temp element to check duration and validity
    let tempMedia: HTMLVideoElement | HTMLAudioElement;
    if (mediaType === 'video') {
        tempMedia = document.createElement('video');
    } else {
        tempMedia = document.createElement('audio');
    }
    
    tempMedia.src = mediaUrl.trim();
    tempMedia.crossOrigin = "anonymous";
    
    // We need to wait for metadata to get duration
    tempMedia.onloadedmetadata = () => {
        const duration = tempMedia.duration;
        if (duration && !isNaN(duration) && duration !== Infinity) {
             const newClip: LibraryClip = {
                name: `${mediaType === 'video' ? 'Video' : 'Audio'} ${libraryClips.length + 1}`,
                url: mediaUrl.trim(),
                duration: duration, 
                type: mediaType
            };
            setLibraryClips(prev => [...prev, newClip]);
            setMediaUrl('');
        } else {
            alert(`Could not determine ${mediaType} duration. The format might not be supported or duration is infinite (stream).`);
        }
        tempMedia.remove();
    };

    tempMedia.onerror = () => {
        alert("Failed to load media. Please check the URL and ensure it allows CORS if external.");
        tempMedia.remove();
    };
  };

  const handleDeleteFromLibrary = (index: number) => {
      setLibraryClips(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddClip = (index: number) => {
    const stock = libraryClips[index];
    
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
      type: stock.type
    };
    setProject(p => ({
        ...p,
        clips: [...p.clips, newClip],
        duration: Math.max(p.duration, newClip.offset + newClip.duration + 10)
    }));
  };

  const handleUpdateClip = (updatedClip: Clip) => {
    setProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === updatedClip.id ? updatedClip : c)
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
        offset: project.currentTime
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

  const handleAiAnalysis = async () => {
    // Paywall Check
    if ((window as any).aistudio) {
        try {
            const hasKey = await (window as any).aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
            console.error("Paywall check error:", e);
        }
    }

    setIsAnalyzing(true);
    try {
        const result = await generateProjectMetadata(project.clips);
        setAiMetadata(result);
    } catch (e) {
        alert("Failed to analyze project. Please ensure you have a valid API Key.");
        console.error(e);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleExportClick = () => {
    // Calculate content bounds
    const maxContentTime = project.clips.reduce((max, clip) => Math.max(max, clip.offset + (clip.end - clip.start)), 0);
    
    if (maxContentTime === 0) {
        alert("Timeline is empty.");
        return;
    }

    setExportSettings({
        start: 0,
        end: maxContentTime
    });
    setShowExportModal(true);
  };

  const startExport = () => {
    setShowExportModal(false);
    
    // Set up project for export
    setProject(p => ({ ...p, currentTime: exportSettings.start, isPlaying: true }));
    setIsExporting(true);
  };

  const handleExportFinish = () => {
      setIsExporting(false);
      setProject(p => ({ ...p, isPlaying: false }));
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = RESOLUTIONS.find(r => r.name === e.target.value);
      if (selected) {
          setProject(p => ({
              ...p,
              width: selected.width,
              height: selected.height
          }));
      }
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

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans">
      {/* Header / Toolbar */}
      <Toolbar 
        project={project}
        onAddClip={() => {}} 
        onSplit={handleSplit}
        onDelete={handleDelete}
        onTogglePlay={handleTogglePlay}
        onExport={handleExportClick}
        onAnalysis={handleAiAnalysis}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar / Media Library */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
           
           {/* Project Settings */}
           <div className="mb-6 border-b border-gray-800 pb-4">
               <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Project Settings</h2>
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
                    accept="video/*,audio/*"
                    onChange={handleFileUpload}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors flex items-center justify-center"
                >
                    <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Upload File
                </button>
              </div>
           </div>

           <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Clips</div>
           {libraryClips.length === 0 ? (
               <div className="text-xs text-gray-600 italic">No clips in library.</div>
           ) : (
             <div className="space-y-3 overflow-y-auto flex-1 pr-1 custom-scrollbar">
               {libraryClips.map((clip, idx) => (
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
           
           {/* AI Metadata Display */}
           {isAnalyzing && <div className="mt-8 p-4 bg-gray-800/50 rounded animate-pulse text-xs">Gemini is analyzing your timeline...</div>}
           {aiMetadata && (
               <div className="mt-auto border-t border-gray-800 pt-4">
                   <h3 className="text-xs font-bold text-purple-400 uppercase mb-2">AI Suggestion</h3>
                   <div className="mb-2">
                       <label className="text-[10px] text-gray-500">Title</label>
                       <p className="text-sm font-semibold">{aiMetadata.title}</p>
                   </div>
                   <div className="mb-2">
                       <label className="text-[10px] text-gray-500">Description</label>
                       <p className="text-xs text-gray-300 line-clamp-3">{aiMetadata.description}</p>
                   </div>
                   <div className="flex flex-wrap gap-1">
                       {aiMetadata.tags.map(tag => (
                           <span key={tag} className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">#{tag}</span>
                       ))}
                   </div>
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
                />
            </div>
        </div>

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
                            <p className="text-[10px] text-gray-500 mt-1">Defaults to the end of the last clip.</p>
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

      </div>
    </div>
  );
};

export default App;
