
import React, { useState, useEffect, useRef } from 'react';
import { ProjectState } from '../types';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ProjectState;
  onLoadProject: (project: ProjectState) => void;
}

const STORAGE_KEY = 'lumina_saved_projects';

const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  isOpen, 
  onClose, 
  currentProject, 
  onLoadProject 
}) => {
  const [savedProjects, setSavedProjects] = useState<Record<string, ProjectState>>({});
  const [saveName, setSaveName] = useState(currentProject.name || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects from localStorage on mount/open
  useEffect(() => {
    if (isOpen) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                try {
                    setSavedProjects(JSON.parse(raw));
                } catch (jsonError) {
                    console.error("Corrupted local storage for projects", jsonError);
                    // Fallback to empty if corrupted
                    setSavedProjects({});
                }
            } else {
                setSavedProjects({});
            }
        } catch (e) {
            console.error("Failed to load projects from storage", e);
            setSavedProjects({});
        }
        setSaveName(currentProject.name || '');
    }
  }, [isOpen, currentProject.name]);

  const handleSave = () => {
    if (!saveName.trim()) {
        alert("Please enter a project name.");
        return;
    }
    
    // Create a safe deep copy to save
    const newProjectState = JSON.parse(JSON.stringify({ 
        ...currentProject, 
        name: saveName.trim() 
    }));
    
    const updatedProjects = { ...savedProjects, [saveName.trim()]: newProjectState };
    
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
        setSavedProjects(updatedProjects);
        // Also update the current live project with the name without reloading everything
        onLoadProject(newProjectState); 
        alert("Project saved successfully!");
    } catch (e) {
        console.error(e);
        alert("Failed to save project. Storage might be full or data is too large.");
    }
  };

  const handleDelete = (name: string) => {
      if (confirm(`Are you sure you want to delete "${name}"?`)) {
          const updated = { ...savedProjects };
          delete updated[name];
          setSavedProjects(updated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
  };

  const handleLoad = (name: string) => {
      const project = savedProjects[name];
      if (project) {
          // Direct load without extra confirmation for smoother UX, 
          // assumes user knows clicking Load replaces current project.
          onLoadProject(project);
          onClose();
      }
  };
  
  const handleClearAll = () => {
      if (confirm("Are you sure you want to delete ALL saved projects? This cannot be undone.")) {
          localStorage.removeItem(STORAGE_KEY);
          setSavedProjects({});
      }
  };

  const handleExportJSON = () => {
      try {
          const jsonString = JSON.stringify(currentProject, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = url;
          // Sanitize filename to be safe
          const filename = (currentProject.name || "project").replace(/[^a-z0-9]/gi, '_').toLowerCase();
          link.download = `${filename}.json`;
          
          document.body.appendChild(link);
          link.click();
          
          // Cleanup
          setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
          }, 100);
      } catch (e) {
          console.error("Export failed:", e);
          alert("Failed to export project to JSON.");
      }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      
      reader.onload = () => {
          try {
              const result = reader.result;
              if (typeof result !== 'string') {
                  throw new Error("Failed to read file as text");
              }
              
              const obj = JSON.parse(result);
              
              // Basic structure validation
              if (obj && (Array.isArray(obj.clips) || Array.isArray(obj.library))) {
                  onLoadProject(obj);
                  onClose();
              } else {
                  alert("Invalid project file: Missing required data.");
              }
          } catch (err) {
              console.error(err);
              alert("Error parsing JSON file. Please ensure it is a valid Lumina Create project file.");
          }
          
          // Reset input to allow selecting the same file again if needed
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      
      reader.onerror = () => {
          alert("Error reading file.");
          if (fileInputRef.current) fileInputRef.current.value = '';
      };

      reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-gray-800 w-[500px] max-h-[80vh] flex flex-col rounded-lg shadow-2xl border border-gray-700">
        
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Project Manager</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            
            {/* Save Section */}
            <div className="mb-8">
                <h3 className="text-xs uppercase text-gray-500 font-semibold mb-2">Current Project</h3>
                <div className="flex space-x-2">
                    <input 
                        type="text" 
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Project Name"
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                    <button 
                        onClick={handleSave}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium"
                    >
                        Save
                    </button>
                </div>
                <div className="mt-2 flex space-x-3 text-xs">
                     <button onClick={handleExportJSON} className="text-blue-400 hover:underline">Export to JSON</button>
                     <span className="text-gray-600">|</span>
                     <button onClick={() => fileInputRef.current?.click()} className="text-blue-400 hover:underline">Import from JSON</button>
                     <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />
                </div>
            </div>

            {/* Saved Projects List */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs uppercase text-gray-500 font-semibold">Saved Projects (LocalStorage)</h3>
                    {Object.keys(savedProjects).length > 0 && (
                        <button onClick={handleClearAll} className="text-[10px] text-red-400 hover:underline">Clear All</button>
                    )}
                </div>
                {Object.keys(savedProjects).length === 0 ? (
                    <div className="text-sm text-gray-500 italic p-4 bg-gray-900/50 rounded text-center border border-gray-800 border-dashed">
                        No saved projects found.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {Object.keys(savedProjects).sort().map(name => (
                            <div key={name} className="flex items-center justify-between bg-gray-900 p-3 rounded border border-gray-700 hover:border-gray-600 group">
                                <span className="text-sm text-white font-medium truncate flex-1 mr-4">{name}</span>
                                <div className="flex space-x-2 opacity-100 sm:opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleLoad(name)}
                                        className="text-xs bg-gray-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition-colors"
                                    >
                                        Load
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(name)}
                                        className="text-xs bg-gray-800 hover:bg-red-900/80 text-red-400 px-3 py-1.5 rounded transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectManager;
