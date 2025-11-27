import React from 'react';
import { Clip, ProjectState } from '../types';

interface ToolbarProps {
  project: ProjectState;
  onAddClip: (url: string, name: string) => void;
  onSplit: () => void;
  onDelete: () => void;
  onTogglePlay: () => void;
  onExport: () => void;
  onAnalysis: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  project, 
  onSplit, 
  onDelete, 
  onTogglePlay,
  onExport,
  onAnalysis
}) => {
  return (
    <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between">
      <div className="flex items-center space-x-4">
        <button 
          onClick={onTogglePlay}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${project.isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
        >
          {project.isPlaying ? (
             <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
             <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <div className="h-6 w-px bg-gray-600 mx-2" />

        <button 
            onClick={onSplit}
            disabled={!project.selectedClipId}
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm8.486-8.486a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243z" /></svg>
            Split
        </button>

        <button 
            onClick={onDelete}
            disabled={!project.selectedClipId}
            className="flex items-center px-3 py-1.5 bg-gray-700 hover:bg-red-900/50 text-red-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Delete
        </button>
      </div>

      <div className="flex items-center space-x-3">
        <button
            onClick={onAnalysis}
            className="flex items-center px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded text-sm font-medium shadow-lg shadow-indigo-500/20"
        >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            AI Analyze
        </button>
        <button 
            onClick={onExport}
            className="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
            Export Video
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
