
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { ProjectState } from '../types';

interface ExportModalsProps {
    showExportModal: boolean;
    setShowExportModal: (show: boolean) => void;
    exportSettings: { start: number; end: number };
    setExportSettings: Dispatch<SetStateAction<{ start: number; end: number }>>;
    startExport: () => void;
    exportUrl: string | null;
    downloadExportedVideo: () => void;
    setExportUrl: (url: string | null) => void;
    project: ProjectState;
}

const ExportModals: FC<ExportModalsProps> = ({
    showExportModal,
    setShowExportModal,
    exportSettings,
    setExportSettings,
    startExport,
    exportUrl,
    downloadExportedVideo,
    setExportUrl,
    project
}) => {
  return (
    <>
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
    </>
  );
};

export default ExportModals;
