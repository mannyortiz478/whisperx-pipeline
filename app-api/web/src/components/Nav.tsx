import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Nav: React.FC = () => {
  const location = useLocation();
  
  return (
    <nav aria-label="Main navigation" className="bg-surface border-b border-subtle sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link
          to="/"
          aria-label="WhisperX Transcription Pipeline home"
          className="flex items-center gap-3 hover:opacity-80 transition"
        >
          <div aria-hidden="true" className="w-8 h-8 bg-accent rounded flex items-center justify-center font-mono font-bold text-bg text-sm">
            Wx
          </div>
          <span aria-hidden="true" className="font-sans font-semibold text-white hidden sm:inline">
            Transcription Pipeline
          </span>
        </Link>

        <div className="flex gap-6 font-sans">
          <Link
            to="/"
            aria-current={location.pathname === '/' ? 'page' : undefined}
            className={`transition-colors ${
              location.pathname === '/'
                ? 'text-accent border-b-2 border-accent pb-1'
                : 'text-muted hover:text-white'
            }`}
          >
            Upload
          </Link>
          <Link
            to="/history"
            aria-current={location.pathname === '/history' ? 'page' : undefined}
            className={`transition-colors ${
              location.pathname === '/history'
                ? 'text-accent border-b-2 border-accent pb-1'
                : 'text-muted hover:text-white'
            }`}
          >
            History
          </Link>
        </div>
      </div>
    </nav>
  );
};
