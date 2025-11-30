

import { type ChangeEvent, type FC, type RefObject } from 'react';
import { ProjectState } from '../types';

interface MediaLibraryProps {
    project: ProjectState;
    mediaUrl: string;
    setMediaUrl: (url: string) => void;
    mediaType: 'video' | 'audio';
    setMediaType: (type: 'video' | 'audio') => void;
    onAddMedia: () => void;
    fileInputRef: RefObject<HTMLInputElement>;
    onFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
    onAddClip: (index: number) => void;
    onDeleteFromLibrary: (index: number) => void;
}

const MediaLibrary: FC<MediaLibraryProps> = ({
    project,
    mediaUrl,
    setMediaUrl,
    mediaType,
    setMediaType,
    onAddMedia,
    fileInputRef,
    onFileUpload,
    onAddClip,
    onDeleteFromLibrary
}) => {
  return (
    <>
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
                    onClick={onAddMedia}
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
                onChange={onFileUpload}
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors flex items-center justify-center"
            >
                <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Upload {mediaType === 'video' ? 'Video' : 'Audio'}
            </button>
            <div className="mt-1 text-[9px] text-gray-500 italic text-center">
                Stored locally on this device.
            </div>
            </div>
        </div>

        <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Clips</div>
        {project.library.length === 0 ? (
            <div className="text-xs text-gray-600 italic">No clips in library.</div>
        ) : (
            <div className="space-y-3 pb-4">
            {project.library.map((clip, idx) => (
                <div key={clip.id} className="relative group p-3 bg-gray-800 rounded hover:bg-gray-700 transition cursor-pointer border border-transparent hover:border-gray-600" onClick={() => onAddClip(idx)}>
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
                        onDeleteFromLibrary(idx);
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
    </>
  );
};

export default MediaLibrary;