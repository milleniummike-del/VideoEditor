
import { useState, useEffect, useRef, type FC, type ChangeEvent } from 'react';
import { ProjectState } from '../types';
import { fetchProjects, saveProject, deleteProject } from '../services/api';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ProjectState;
  onLoadProject: (project: ProjectState) => void;
  // Storage Props
  useServerStorage: boolean;
  setUseServerStorage: (val: boolean) => void;
  serverUrl: string;
  setServerUrl: (val: string) => void;
}

const STORAGE_KEY = 'lumina_saved_projects';

const ProjectManager: FC<ProjectManagerProps> = ({ 
  isOpen, 
  onClose, 
  currentProject, 
  onLoadProject,
  useServerStorage,
  setUseServerStorage,
  serverUrl,
  setServerUrl
}) => {
  const [localProjects, setLocalProjects] = useState<Record<string, ProjectState>>({});
  const [serverProjects, setServerProjects] = useState<ProjectState[]>([]);
  
  const [saveName, setSaveName] = useState(currentProject.name || '');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects from storage on mount/open or mode switch
  useEffect(() => {
    if (isOpen) {
        setSaveName(currentProject.name || '');

        if (!useServerStorage) {
            // Load Local
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    setLocalProjects(JSON.parse(raw));
                } else {
                    setLocalProjects({});
                }
            } catch (e) {
                console.error("Local storage error", e);
                setLocalProjects({});
            }
        } else {
            // Load Server
            loadServerProjects();
        }
    }
  }, [isOpen, useServerStorage, currentProject.name]);

  const loadServerProjects = async () => {
      setLoading(true);
      try {
          const projects = await fetchProjects({ baseUrl: serverUrl });
          setServerProjects(projects);
      } catch (e) {
          console.error(e);
          alert("Failed to connect to backend. Check URL and ensure server.php is running.");
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
        alert("Please enter a project name.");
        return;
    }
    
    // Create a safe deep copy to save
    const newProjectState: ProjectState = JSON.parse(JSON.stringify({ 
        ...currentProject, 
        name: saveName.trim() 
    }));
    
    if (useServerStorage) {
        setLoading(true);
        try {
            await saveProject({ baseUrl: serverUrl }, newProjectState);
            await loadServerProjects();
            onLoadProject(newProjectState); 
            alert("Project saved to Server!");
        } catch (e) {
            alert("Failed to save to server.");
        } finally {
            setLoading(false);
        }
    } else {
        const updatedProjects = { ...localProjects, [saveName.trim()]: newProjectState };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
            setLocalProjects(updatedProjects);
            onLoadProject(newProjectState); 
            alert("Project saved Locally!");
        } catch (e) {
            console.error(e);
            alert("Failed to save. LocalStorage might be full.");
        }
    }
  };

  const handleDelete = async (keyOrId: string) => {
      if (useServerStorage) {
          if (confirm(`Delete project ID ${keyOrId}?`)) {
              setLoading(true);
              try {
                  await deleteProject({ baseUrl: serverUrl }, keyOrId);
                  await loadServerProjects();
              } catch (e) {
                  alert("Failed to delete.");
              } finally {
                  setLoading(false);
              }
          }
      } else {
          if (confirm(`Are you sure you want to delete "${keyOrId}"?`)) {
              const updated = { ...localProjects };
              delete updated[keyOrId];
              setLocalProjects(updated);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          }
      }
  };

  const handleLoad = (keyOrId: string) => {
      if (useServerStorage) {
          const proj = serverProjects.find(p => p.id === keyOrId);
          if (proj) {
              onLoadProject(proj);
              onClose();
          }
      } else {
          const proj = localProjects[keyOrId];
          if (proj) {
              onLoadProject(proj);
              onClose();
          }
      }
  };

  const handleClearAllLocal = () => {
      if (confirm("Delete ALL local projects? Undonable.")) {
          localStorage.removeItem(STORAGE_KEY);
          setLocalProjects({});
      }
  };

  // JSON Import/Export Logic
  const handleExportJSON = () => {
      try {
          const jsonString = JSON.stringify(currentProject, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const filename = (currentProject.name || "project").replace(/[^a-z0-9]/gi, '_').toLowerCase();
          link.download = `${filename}.json`;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
      } catch (e) { alert("Failed to export JSON."); }
  };

  const handleImportJSON = (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
          try {
              const obj = JSON.parse(reader.result as string);
              if (obj && (Array.isArray(obj.clips) || Array.isArray(obj.library))) {
                  onLoadProject(obj);
                  onClose();
              } else { alert("Invalid project file."); }
          } catch (err) { alert("Error parsing JSON."); }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-gray-800 w-[600px] max-h-[90vh] flex flex-col rounded-lg shadow-2xl border border-gray-700">
        
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Project Manager</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            
            {/* Storage Mode Toggle */}
            <div className="mb-6 bg-gray-900 p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase text-gray-400 font-semibold">Storage Mode</span>
                    <div className="flex bg-gray-800 rounded p-1">
                        <button 
                            onClick={() => setUseServerStorage(false)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${!useServerStorage ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Local Storage
                        </button>
                        <button 
                            onClick={() => setUseServerStorage(true)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${useServerStorage ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Server API
                        </button>
                    </div>
                </div>
                
                {useServerStorage && (
                    <div className="mt-2">
                         <label className="text-[10px] text-gray-500 block mb-1">Backend URL</label>
                         <div className="flex gap-2">
                             <input 
                                type="text"
                                value={serverUrl}
                                onChange={(e) => setServerUrl(e.target.value)}
                                className="flex-1 bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1 rounded"
                             />
                             <button onClick={loadServerProjects} className="text-xs bg-gray-700 hover:bg-gray-600 px-2 rounded">
                                 Refresh
                             </button>
                         </div>
                    </div>
                )}
            </div>

            {/* Current Project Actions */}
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
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Save'}
                    </button>
                </div>
                <div className="mt-2 flex space-x-3 text-xs">
                     <button onClick={handleExportJSON} className="text-blue-400 hover:underline">Export to JSON</button>
                     <span className="text-gray-600">|</span>
                     <button onClick={() => fileInputRef.current?.click()} className="text-blue-400 hover:underline">Import from JSON</button>
                     <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />
                </div>
            </div>

            {/* List */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs uppercase text-gray-500 font-semibold">
                        {useServerStorage ? 'Server Projects' : 'Local Projects'}
                    </h3>
                    {!useServerStorage && Object.keys(localProjects).length > 0 && (
                        <button onClick={handleClearAllLocal} className="text-[10px] text-red-400 hover:underline">Clear All</button>
                    )}
                </div>

                {loading && useServerStorage ? (
                    <div className="text-center py-4 text-gray-500 text-xs">Loading projects...</div>
                ) : (
                    <div className="space-y-2">
                        {useServerStorage ? (
                            // Server List
                            serverProjects.length === 0 ? (
                                <div className="text-sm text-gray-500 italic p-4 text-center">No projects on server.</div>
                            ) : (
                                serverProjects.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-gray-900 p-3 rounded border border-gray-700 hover:border-gray-600 group">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="text-sm text-white font-medium truncate">{p.name || 'Untitled'}</div>
                                            <div className="text-[10px] text-gray-500">ID: {p.id}</div>
                                        </div>
                                        <div className="flex space-x-2">
                                            <button onClick={() => handleLoad(p.id!)} className="text-xs bg-gray-700 hover:bg-blue-600 px-3 py-1.5 rounded">Load</button>
                                            <button onClick={() => handleDelete(p.id!)} className="text-xs bg-gray-800 hover:bg-red-900/80 text-red-400 px-3 py-1.5 rounded">Delete</button>
                                        </div>
                                    </div>
                                ))
                            )
                        ) : (
                            // Local List
                            Object.keys(localProjects).length === 0 ? (
                                <div className="text-sm text-gray-500 italic p-4 text-center">No saved projects.</div>
                            ) : (
                                Object.keys(localProjects).sort().map(name => (
                                    <div key={name} className="flex items-center justify-between bg-gray-900 p-3 rounded border border-gray-700 hover:border-gray-600 group">
                                        <span className="text-sm text-white font-medium truncate flex-1 mr-4">{name}</span>
                                        <div className="flex space-x-2">
                                            <button onClick={() => handleLoad(name)} className="text-xs bg-gray-700 hover:bg-blue-600 px-3 py-1.5 rounded">Load</button>
                                            <button onClick={() => handleDelete(name)} className="text-xs bg-gray-800 hover:bg-red-900/80 text-red-400 px-3 py-1.5 rounded">Delete</button>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;
