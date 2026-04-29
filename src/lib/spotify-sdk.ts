// Shared Spotify Web Playback SDK type declarations (global, ambient).
declare global {
  interface SpotifyPlayer {
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: string, cb: (data: unknown) => void): void;
    removeListener(event: string): void;
    togglePlay(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    setVolume(v: number): Promise<void>;
    getCurrentState(): Promise<{ position: number; duration: number; paused: boolean } | null>;
  }

  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export {};
