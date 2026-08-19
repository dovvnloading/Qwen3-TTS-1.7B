import React from 'react'; 

interface EditorPanelProps {
  text: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ text, onChange, onSubmit }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter generates without reaching for the mouse.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex-1 min-w-0 p-5 flex flex-col">
      <div className="flex-1 relative rounded-xl shadow-neu-pressed">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter text to synthesize…"
          aria-label="Text to synthesize"
          className="w-full h-full bg-transparent rounded-xl px-5 py-4 pb-10 text-[15px] leading-relaxed
                     text-text placeholder:text-text-muted/70 outline-none resize-none border-none"
          spellCheck={false}
        />

        <div className="absolute bottom-3 right-4 flex items-center gap-2.5 pointer-events-none">
          <kbd className="text-[10px] font-semibold text-text-muted/70 tracking-wide">Ctrl+↵</kbd>
          <span className="text-[10px] font-semibold text-text-muted tabular-nums">
            {text.length}
          </span>
        </div>
      </div>
    </div>
  );
};
