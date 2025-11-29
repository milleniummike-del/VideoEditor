
import { type FC } from 'react';
import { ProjectState } from '../types';

interface ToolbarProps {
  project: ProjectState;
  onAddClip: (url: string, name: string) => void;
  onSplit: () => void;
  onDelete: () => void;
  onTogglePlay: () => void;
  onExport: () => void;
  onOpenProjectManager: () => void;
  isExporting: boolean;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onClearMarkers: () => void;
  onToggleLoop: () => void;
  onAddText: () => void;
}

const Toolbar: FC<ToolbarProps> = ({ 
  project, 
  onSplit, 
  onDelete, 
  onTogglePlay,
  onExport,
  onOpenProjectManager,
  isExporting,
  onSetInPoint,
  onSetOutPoint,
  onClearMarkers,
  onToggleLoop,
  onAddText
}) => {
  return (
    <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between">
      <div className="flex items-center space-x-4">
        {/* Playback Controls */}
        <button 
          onClick={onTogglePlay}
          disabled={isExporting}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${project.isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
        >
          {project.isPlaying ? (
             <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
             <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <button 
          onClick={onToggleLoop}
          disabled={isExporting}
          title="Toggle Loop Playback"
          className={`p-2 rounded hover:bg-gray-700 transition-colors disabled:opacity-50 ${project.isLooping ? 'text-blue-400 bg-gray-900' : 'text-gray-400'}`}
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>

        <div className="h-6 w-px bg-gray-600 mx-2" />

        {/* Marker Controls */}
        <div className="flex bg-gray-700 rounded overflow-hidden">
            <button 
                onClick={onSetInPoint}
                disabled={isExporting}
                title="Set In Point (I)"
                className="px-3 py-1.5 hover:bg-gray-600 text-xs font-mono text-gray-200 border-r border-gray-600 disabled:opacity-50"
            >
                [ In
            </button>
            <button 
                onClick={onSetOutPoint}
                disabled={isExporting}
                title="Set Out Point (O)"
                className="px-3 py-1.5 hover:bg-gray-600 text-xs font-mono text-gray-200 border-r border-gray-600 disabled:opacity-50"
            >
                Out ]
            </button>
            <button 
                onClick={onClearMarkers}
                disabled={isExporting}
                title="Clear Markers (Shift+X)"
                className="px-2 py-1.5 hover:bg-red-900/50 text-gray-400 hover:text-red-300 disabled:opacity-50"
            >
                ✕
            </button>
        </div>

        <div className="h-6 w-px bg-gray-600 mx-2" />

        <button 
            onClick={onAddText}
            disabled={isExporting}
            title="Add Title"
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-purple-900/50 text-purple-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/30"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Title
        </button>

        <button 
            onClick={onSplit}
            disabled={!project.selectedClipId || isExporting}
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed ml-2"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm8.486-8.486a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243z" /></svg>
            Split
        </button>

        <button 
            onClick={onDelete}
            disabled={!project.selectedClipId || isExporting}
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-red-900/50 text-red-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed ml-2"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Delete
        </button>
      </div>

      <div className="flex items-center space-x-3">
        <button 
            onClick={onOpenProjectManager}
            disabled={isExporting}
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            Projects
        </button>

        <button 
            onClick={onExport}
            disabled={isExporting}
            className="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
            Export Video
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
