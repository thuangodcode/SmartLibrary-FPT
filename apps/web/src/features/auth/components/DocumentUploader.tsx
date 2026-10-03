import React, { useState, useRef } from 'react';
import { X, Camera, RefreshCw } from 'lucide-react';
// import imageCompression from 'browser-image-compression'; // Assume installed or install later

interface DocumentUploaderProps {
  label: string;
  onFileSelect: (file: File | null) => void;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({ label, onFileSelect }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, use browser-image-compression here
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onFileSelect(file);
    }
  };

  const clearFile = () => {
    setPreview(null);
    onFileSelect(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
      
      {!preview ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
        >
          <Camera className="w-8 h-8 text-slate-400 mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
            Nhấn để chụp hoặc tải ảnh lên <br/>
            <span className="text-[10px]">(Định dạng: JPEG/PNG. Tối đa 5MB)</span>
          </p>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
          <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-white rounded-full text-indigo-600 hover:scale-110 transition-transform"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={clearFile}
              className="p-2 bg-white rounded-full text-rose-600 hover:scale-110 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      
      <input 
        type="file" 
        accept="image/jpeg, image/png, image/webp" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </div>
  );
};
