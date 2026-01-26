import React from 'react';
import { Wand2, Zap } from 'lucide-react';
import { TTSConfig } from '../types';
import { SPEAKERS, LANGUAGES } from '../constants';
import { Select } from './ui/Select';
import { Button } from './ui/Button';

interface SettingsPanelProps {
  config: TTSConfig;
  setConfig: React.Dispatch<React.SetStateAction<TTSConfig>>;
  onGenerate: () => void;
  isGenerating: boolean;
  isModelReady: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  config, 
  setConfig, 
  onGenerate, 
  isGenerating,
  isModelReady 
}) => {
  
  const handleChange = (field: keyof TTSConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="w-full md:w-96 bg-background flex flex-col z-20 md:shadow-neu-flat relative">
      <div className="p-8 flex flex-col gap-10 h-full overflow-y-auto">
        
        {/* Status Indicator */}
        <div className="flex justify-center">
            <div className={`
                px-6 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 transition-all
                ${isModelReady ? 'text-green-500 shadow-neu-pressed' : 'text-red-500 shadow-neu-flat'}
            `}>
                <div className={`w-2 h-2 rounded-full ${isModelReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {isModelReady ? 'Engine Ready' : 'Loading Model...'}
            </div>
        </div>

        {/* Form Controls */}
        <div className="flex flex-col gap-8 flex-1">
          
          <Select 
            label="Speaker Voice" 
            options={SPEAKERS} 
            value={config.speaker}
            onChange={(e) => handleChange('speaker', e.target.value)}
          />

          <Select 
            label="Target Language" 
            options={LANGUAGES} 
            value={config.language}
            onChange={(e) => handleChange('language', e.target.value)}
          />

          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest pl-2">
              Style Instruction
            </label>
            {/* Neumorphic Textarea */}
            <div className="rounded-2xl shadow-neu-pressed p-1 bg-background">
                <textarea
                value={config.styleInstruction}
                onChange={(e) => handleChange('styleInstruction', e.target.value)}
                placeholder="e.g. Whispering, Excited..."
                className="w-full h-32 bg-transparent rounded-xl p-4 text-sm text-text placeholder-text-muted outline-none resize-none border-none"
                />
            </div>
          </div>

        </div>

        {/* Generate Button - Big and Tactile */}
        <div className="pt-4">
          <Button 
            variant="primary" 
            size="lg"
            className="w-full"
            onClick={onGenerate}
            loading={isGenerating}
            disabled={!isModelReady || !config.text.trim()}
          >
            {isGenerating ? 'SYNTHESIZING...' : 'GENERATE AUDIO'}
          </Button>
        </div>
      </div>
    </div>
  );
};