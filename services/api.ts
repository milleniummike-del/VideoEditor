
import { ProjectState } from '../types';

export interface ApiConfig {
    baseUrl: string;
}

// Helper to remove trailing slashes
const cleanUrl = (url: string) => url.replace(/\/+$/, '');

export const fetchProjects = async (config: ApiConfig): Promise<ProjectState[]> => {
    try {
        const res = await fetch(`${cleanUrl(config.baseUrl)}/api/projects`);
        if (!res.ok) throw new Error("Failed to fetch projects");
        return await res.json();
    } catch (e) {
        console.error("API Error:", e);
        throw e;
    }
};

export const saveProject = async (config: ApiConfig, project: ProjectState): Promise<ProjectState> => {
    try {
        const res = await fetch(`${cleanUrl(config.baseUrl)}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
        if (!res.ok) throw new Error("Failed to save project");
        return await res.json();
    } catch (e) {
        console.error("API Error:", e);
        throw e;
    }
};

export const deleteProject = async (config: ApiConfig, id: string): Promise<void> => {
    try {
        const res = await fetch(`${cleanUrl(config.baseUrl)}/api/projects/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error("Failed to delete project");
    } catch (e) {
        console.error("API Error:", e);
        throw e;
    }
};

export const uploadMedia = async (config: ApiConfig, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${cleanUrl(config.baseUrl)}/api/upload`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error("Failed to upload media");
        const data = await res.json();
        return data.url;
    } catch (e) {
        console.error("API Error:", e);
        throw e;
    }
};
