

import { type ChangeEvent, type FC } from 'react';
import { ProjectState } from '../types';
import { RESOLUTIONS, FRAME_RATES } from '../constants';

interface ProjectSettingsProps {
    project: ProjectState;
    onResolutionChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    onFpsChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}

const ProjectSettings: FC<ProjectSettingsProps> = ({ project, onResolutionChange, onFpsChange }) => {
  return (
    <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Project Settings</h2>
        <div className="mb-3">
            <div className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Project Name</div>
            <div className="text-sm font-medium text-white">{project.name || "Untitled Project"}</div>
        </div>
        <div className="mb-3">
            <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wider">Resolution</label>
            <select 
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                onChange={onResolutionChange}
                value={RESOLUTIONS.find(r => r.width === project.width && r.height === project.height)?.name || ''}
            >
                {RESOLUTIONS.map(r => (
                    <option key={r.name} value={r.name}>{r.name} ({r.width}x{r.height})</option>
                ))}
            </select>
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