
import { type FC } from 'react';
import { Clip } from '../types';

interface ClipPropertiesProps {
    selectedClip: Clip | null | undefined;
    onUpdateClip: (clip: Clip) => void;
    transitionDuration: number;
    setTransitionDuration: (duration: number) => void;
    onApplyTransition: (type: 'cut' | 'dissolve') => void;
}

const ClipProperties: FC<ClipPropertiesProps> = ({ 
    selectedClip, 
    onUpdateClip, 
    transitionDuration, 
    setTransitionDuration, 
    onApplyTransition 
}) => {
  if (!selectedClip) return null;

  return (
    <div className="mb-6 border-b border-gray-800 pb-4 animate-in fade-in slide-in-from-left-2 duration-200">
        <h2 className="text-sm font-semibold text-blue-400 uppercase mb-3">Selected Clip</h2>
        
        <div className="mb-3">
            <label className="text-[10px] text-gray-500 mb-1 block">Clip Name</label>
            <input 
                type="text" 
                value={selectedClip.name}
                onChange={(e) => onUpdateClip({...selectedClip, name: e.target.value})}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
            />
        </div>

        {/* Text Clip Properties */}
        {selectedClip.type === 'text' && (
            <div className="mb-3 border-t border-gray-700 pt-3">
                <label className="text-[10px] text-gray-500 mb-2 block uppercase tracking-wider">Text Content</label>
                <textarea 
                    value={selectedClip.textContent || ''}
                    onChange={(e) => onUpdateClip({...selectedClip, textContent: e.target.value})}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 min-h-[60px]"
                    placeholder="Enter title text..."
                />
                
                <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">Font Size</label>
                        <input 
                            type="number" 
                            min="10" 
                            max="200"
                            value={selectedClip.fontSize || 60}
                            onChange={(e) => onUpdateClip({...selectedClip, fontSize: Number(e.target.value)})}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                     <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">Color</label>
                        <div className="flex space-x-2">
                            <input 
                                type="color" 
                                value={selectedClip.fontColor || '#ffffff'}
                                onChange={(e) => onUpdateClip({...selectedClip, fontColor: e.target.value})}
                                className="w-8 h-6 bg-transparent border-none p-0 cursor-pointer"
                            />
                            <span className="text-xs text-gray-300 self-center">{selectedClip.fontColor || '#ffffff'}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                     <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">Pos X</label>
                        <input 
                            type="number" 
                            value={selectedClip.x !== undefined ? selectedClip.x : 0} 
                            onChange={(e) => onUpdateClip({...selectedClip, x: Number(e.target.value)})}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                     <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">Pos Y</label>
                        <input 
                            type="number" 
                            value={selectedClip.y !== undefined ? selectedClip.y : 0}
                            onChange={(e) => onUpdateClip({...selectedClip, y: Number(e.target.value)})}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
            </div>
        )}
        
        <div className="mb-3 border-t border-gray-700 pt-3">
            <label className="text-[10px] text-gray-500 mb-2 block uppercase tracking-wider">Transition (In)</label>
            <div className="flex space-x-2 mb-2">
                    <button 
                    onClick={() => onApplyTransition('cut')}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs py-1"
                    >
                    Cut (None)
                    </button>
                    <button 
                    onClick={() => onApplyTransition('dissolve')}
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
                    onChange={(e) => onUpdateClip({...selectedClip, fadeIn: Number(e.target.value)})}
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
                    onChange={(e) => onUpdateClip({...selectedClip, fadeOut: Number(e.target.value)})}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                />
            </div>
        </div>
    </div>
  );
};

export default ClipProperties;
