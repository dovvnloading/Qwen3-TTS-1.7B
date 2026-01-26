import React from 'react';

interface EditorPanelProps {
  text: string;
  onChange: (val: string) => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ text, onChange }) => {
  return (
    <div className="flex-1 p-8 md:p-12 flex flex-col h-full bg-background">
      
      <div className="flex items-center justify-between mb-8 px-2">
         <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
          QWEN3<span className="text-text-muted">TTS</span>
        </h1>
        <div className="text-xs font-bold text-text-muted bg-background px-4 py-2 rounded-full shadow-neu-flat">
          MODEL v1.7B
        </div>
      </div>
      
      {/* The Text Tray - A massive inset container */}
      <div className="flex-1 relative rounded-3xl shadow-neu-pressed p-2">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text to synthesize..."
          className="w-full h-full bg-transparent p-8 text-lg md:text-xl leading-relaxed text-gray-200 placeholder-gray-600 outline-none resize-none font-sans border-none"
          spellCheck={false}
        />
        
        {/* Character Count */}
        <div className="absolute bottom-6 right-8 text-xs font-bold text-text-muted bg-background px-3 py-1 rounded-lg shadow-neu-flat">
          {text.length} chars
        </div>
      </div>
    </div>
  );
};