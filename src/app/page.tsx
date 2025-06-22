'use client';

import React, { useState, useRef } from 'react';
import { TARGET_LUFS, TARGET_TP } from '@/lib/config';

interface AnalysisResult {
  filename: string;
  lufs: string | null;
  tp: string | null;
  status: string;
  error?: string;
}



export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const mp3Files = selectedFiles.filter(file => 
      file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
    );
    setFiles(prev => [...prev, ...mp3Files]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const items = e.dataTransfer.items;
    const allFiles: File[] = [];
    
    if (items) {
      // Handle both files and folders
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) {
              // It's a folder - get all files from it
              const files = await getAllFiles(entry);
              allFiles.push(...files);
            } else {
              // It's a single file
              const file = item.getAsFile();
              if (file) allFiles.push(file);
            }
          }
        }
      }
    } else {
      // Fallback for older browsers
      allFiles.push(...Array.from(e.dataTransfer.files));
    }
    
    // Filter for MP3 files only
    const mp3Files = allFiles.filter(file => 
      file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
    );
    
    setFiles(prev => [...prev, ...mp3Files]);
  };

  // Helper function to recursively get all files from a directory
  async function getAllFiles(dirEntry: any): Promise<File[]> {
    const files: File[] = [];
    const reader = dirEntry.createReader();
    
    const readEntries = (): Promise<any[]> => {
      return new Promise((resolve) => {
        reader.readEntries(resolve);
      });
    };
    
    const entries = await readEntries();
    
    for (const entry of entries) {
      if (entry.isFile) {
        const file: File = await new Promise((resolve) => {
          entry.file(resolve);
        });
        files.push(file);
      } else if (entry.isDirectory) {
        const subFiles = await getAllFiles(entry);
        files.push(...subFiles);
      }
    }
    
    return files;
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setAnalysisResults([]);
  };

  const analyzeFiles = async () => {
    if (files.length === 0) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysisResults(data.results);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const normalizeAndDownload = async () => {
    if (files.length === 0) return;

    setIsNormalizing(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/normalize', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Normalization failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `normalized_audio_${files.length}_files.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Normalization error:', error);
      alert('Normalization failed. Please try again.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const formatValue = (value: string | null) => {
    if (!value || value === 'null') return 'N/A';
    return parseFloat(value).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            LUFS Audio Normalizer
          </h1>
                     <p className="text-slate-300 text-lg">
             Normalize your MP3 files to {TARGET_LUFS} LUFS and {TARGET_TP} dBTP
           </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* File Upload Area */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-slate-400 hover:border-purple-400 hover:bg-purple-400/5"
            >
              <input 
                ref={fileInputRef}
                type="file"
                multiple
                accept=".mp3,audio/mpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-white">
                <svg className="mx-auto h-12 w-12 text-slate-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-lg mb-2">Drop MP3 files or folders here, or click to select</p>
                  <p className="text-sm text-slate-400">Supports individual files and entire folders</p>
                </div>
              </div>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
              <h3 className="text-xl font-semibold text-white mb-4">
                Selected Files ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/10"
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="h-6 w-6 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-white font-medium">{file.name}</p>
                        <p className="text-slate-400 text-sm">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {files.length > 0 && (
            <div className="flex flex-col gap-4">
              {/* Primary Action - Normalize */}
              <button
                onClick={normalizeAndDownload}
                disabled={isNormalizing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
              >
                {isNormalizing ? 'Normalizing...' : 'Normalize & Download'}
              </button>
              
              {/* Secondary Action - Analyze */}
              <button
                onClick={analyzeFiles}
                disabled={isAnalyzing}
                className="w-full bg-blue-600/80 hover:bg-blue-600 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-lg transition-colors text-sm"
              >
                {isAnalyzing ? 'Analyzing...' : 'Just Analyze Audio'}
              </button>
            </div>
          )}

          {/* Analysis Results */}
          {analysisResults.length > 0 && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
              <h3 className="text-xl font-semibold text-white mb-4">Analysis Results</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-white font-semibold py-2">File</th>
                      <th className="text-white font-semibold py-2">Current LUFS</th>
                      <th className="text-white font-semibold py-2">Current dBTP</th>
                      <th className="text-white font-semibold py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResults.map((result, index) => (
                      <tr key={index} className="border-b border-white/10">
                        <td className="text-white py-2">{result.filename}</td>
                        <td className="py-2">
                          <span className={`${
                            result.lufs && parseFloat(result.lufs) < TARGET_LUFS 
                              ? 'text-red-400' 
                              : result.lufs && parseFloat(result.lufs) > TARGET_LUFS
                              ? 'text-yellow-400'
                              : 'text-green-400'
                          }`}>
                            {formatValue(result.lufs)}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`${
                            result.tp && parseFloat(result.tp) > TARGET_TP 
                              ? 'text-red-400' 
                              : 'text-green-400'
                          }`}>
                            {formatValue(result.tp)}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`text-sm px-2 py-1 rounded ${
                            result.status === 'success' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {result.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-slate-400">
                <p><strong>Target:</strong> {TARGET_LUFS} LUFS, {TARGET_TP} dBTP</p>
                <p><span className="text-red-400">Red:</span> Needs normalization | <span className="text-yellow-400">Yellow:</span> Above target | <span className="text-green-400">Green:</span> Within range</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
