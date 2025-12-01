

export type TransitionType = 'fade' | 'wipe-left' | 'wipe-right' | 'slide-left' | 'slide-right' | 'circle';

export interface LibraryClip {
  id: string;
  name: string;
  url: string;
  duration: number;
  type: 'video' | 'audio';
  width?: number;  // Source width
  height?: number; // Source height
}

export interface Clip {
  id: string;
  name: string;
  url: string;
  duration: number; // Total duration of source
  start: number;    // Start time within source
  end: number;      // End time within source
  offset: number;   // Start time on timeline
  track: number;    // Track index
  type: 'video' | 'audio' | 'text';
  muted?: boolean;  // If true, audio from this clip is suppressed (useful when audio is split to another track)
  volume?: number;  // Volume multiplier (1.0 = 100%)
  fadeIn?: number;  // Duration in seconds (Legacy/Simple opacity)
  fadeOut?: number; // Duration in seconds
  transition?: {
    type: TransitionType;
    duration: number;
  };
  mediaLibraryId?: string; // Reference to LibraryClip/IndexedDB ID for persistence
  
  // Visual properties (Video & Text)
  scale?: number; // 1.0 = original size
  x?: number;
  y?: number;
  
  // Text specific properties
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
}

export interface Track {
  id: number;
  name: string;
  type: 'video' | 'audio' | 'text';
  isMuted: boolean;
  isLocked: boolean;
}

export interface ProjectState {
  id?: string; // Unique ID for server persistence
  name?: string;
  library: LibraryClip[];
  clips: Clip[];
  tracks: Track[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isLooping: boolean; 
  selectedClipId: string | null;
  zoom: number; // Pixels per second
  width: number; // Project Resolution Width
  height: number; // Project Resolution Height
  fps: number; // Project Frame Rate
  lastSeekTime?: number; // Timestamp of last manual seek to force player sync
}

export interface GeminiAnalysis {
  title: string;
  description: string;
  tags: string[];
}