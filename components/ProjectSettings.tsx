

import { type ChangeEvent, type FC } from 'react';
import { ProjectState } from '../types';
import { RESOLUTIONS, FRAME_RATES } from '../constants';
import DraggableNumberInput from './DraggableNumberInput';

interface ProjectSettingsProps {
    project: ProjectState;
    onResolutionChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    onFpsChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    onDimensionsChange?: (width: number, height: number) => void; // Added callback
}

const ProjectSettings: FC<ProjectSettingsProps & { onDimensionsChange?: (w: number, h: number) => void }> = ({ 
    project, 
    onResolutionChange, 
    onFpsChange,
    onDimensionsChange 
}) => {
  
  // Determine if current dimensions match a preset
  const currentPreset = RESOLUTIONS.find(r => r.width === project.width && r.height === project.height);
  const presetValue = currentPreset ? currentPreset.name : 'Custom';

  return (
    <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Project Settings</h2>
        <div className="mb-3">
            <div className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Project Name</div>
            <div className="text-sm font-medium text-white">{project.name || "Untitled Project"}</div>
        </div>
        
        {/* Resolution Preset */}
        <div className="mb-3">
            <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Resolution Preset</label>
            <select 
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                onChange={onResolutionChange}
                value={presetValue}
            >
                {RESOLUTIONS.map(r => (
                    <option key={r.name} value={r.name}>{r.name} ({r.width}x{r.height})</option>
                ))}
                <option value="Custom">Custom</option>
            </select>
        </div>

        {/* Custom Dimensions */}
        <div className="grid grid-cols-2 gap-3 mb-3">
            <DraggableNumberInput
                label="Width"
                value={project.width}
                onChange={(val) => onDimensionsChange && onDimensionsChange(val, project.height)}
                min={100}
                max={7680}
                step={1}
            />
            <DraggableNumberInput
                label="Height"
                value={project.height}
                onChange={(val) => onDimensionsChange && onDimensionsChange(project.width, val)}
                min={100}
                max={4320}
                step={1}
            />
        </div>

        <div>
            <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Frame Rate (FPS)</label>
            <select 
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                onChange={onFpsChange}
                value={project.fps || 25}
            >
                {FRAME_RATES.map(fps => (
                    <option key={fps} value={fps}>{fps} fps</option>
                ))}
            </select>
        </div>
    </div>
  );
};

export default ProjectSettings;