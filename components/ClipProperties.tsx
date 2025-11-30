
import { type FC } from 'react';
import { Clip, TransitionType } from '../types';
import DraggableNumberInput from './DraggableNumberInput';

interface ClipPropertiesProps {
    selectedClip: Clip | null | undefined;
    onUpdateClip: (clip: Clip) => void;
    transitionDuration: number;
    setTransitionDuration: (duration: number) => void;
    onApplyTransition: (type: TransitionType | 'cut') => void;
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
                    <DraggableNumberInput
                        label="Font Size"
                        value={selectedClip.fontSize || 60}
                        onChange={(val) => onUpdateClip({...selectedClip, fontSize: val})}
                        min={10}
                        max={200}
                        step={1}
                        className="w-full"
                    />
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
                     <DraggableNumberInput
                        label="Pos X"
                        value={selectedClip.x !== undefined ? selectedClip.x : 0}
                        onChange={(val) => onUpdateClip({...selectedClip, x: val})}
                        step={1}
                        className="w-full"
                    />
                     <DraggableNumberInput
                        label="Pos Y"
                        value={selectedClip.y !== undefined ? selectedClip.y : 0}
                        onChange={(val) => onUpdateClip({...selectedClip, y: val})}
                        step={1}
                        className="w-full"
                    />
                </div>
            </div>
        )}
        
        <div className="mb-3 border-t border-gray-700 pt-3">
            <label className="text-[10px] text-gray-500 mb-2 block uppercase tracking-wider">Transition In</label>
            
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                  onClick={() => onApplyTransition('cut')}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] py-1 text-gray-300"
                >
                  None
                </button>
                <button 
                  onClick={() => onApplyTransition('fade')}
                  className="bg-blue-900/40 hover:bg-blue-800/60 border border-blue-800/50 rounded text-[10px] py-1 text-blue-200"
                >
                  Dissolve
                </button>
                <button 
                  onClick={() => onApplyTransition('circle')}
                  className="bg-purple-900/40 hover:bg-purple-800/60 border border-purple-800/50 rounded text-[10px] py-1 text-purple-200"
                >
                  Circle
                </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-2">
                <button onClick={() => onApplyTransition('wipe-right')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] py-1">Wipe Right</button>
                <button onClick={() => onApplyTransition('wipe-left')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] py-1">Wipe Left</button>
                <button onClick={() => onApplyTransition('slide-right')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] py-1">Slide Right</button>
                <button onClick={() => onApplyTransition('slide-left')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] py-1">Slide Left</button>
            </div>
            
            <DraggableNumberInput
                label="Duration (s)"
                value={transitionDuration}
                onChange={setTransitionDuration}
                min={0.1}
                max={5}
                step={0.1}
                className="mt-2"
            />
            
            <p className="text-[9px] text-gray-500 mt-1 italic">
                Applies overlap with previous clip.
            </p>
        </div>
        
        <div className="grid grid-cols-2 gap-3 border-t border-gray-700 pt-3">
            <DraggableNumberInput
                label="Fade In (s)"
                value={selectedClip.fadeIn || 0}
                onChange={(val) => onUpdateClip({...selectedClip, fadeIn: val})}
                min={0}
                max={5}
                step={0.1}
                className="w-full"
            />
            <DraggableNumberInput
                label="Fade Out (s)"
                value={selectedClip.fadeOut || 0}
                onChange={(val) => onUpdateClip({...selectedClip, fadeOut: val})}
                min={0}
                max={5}
                step={0.1}
                className="w-full"
            />
        </div>
    </div>
  );
};

export default ClipProperties;
