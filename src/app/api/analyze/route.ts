import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TARGET_LUFS, TARGET_TP } from '@/lib/config';

const execAsync = promisify(exec);

async function analyzeTrack(filePath: string) {
  const startTime = Date.now();
  try {
    const command = `ffmpeg -threads 2 -i "${filePath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=summary" -f null -`;
    
    const { stderr } = await execAsync(command, { timeout: 30000 }); // Shorter timeout
    
    let lufs = null;
    let tp = null;

    const lines = stderr.split('\n');
    for (const line of lines) {
      if (line.includes('Input Integrated')) {
        const match = line.split(':');
        if (match[1]) {
          lufs = match[1].trim().replace(' LUFS', '');
        }
      }
      if (line.includes('Input True Peak')) {
        const match = line.split(':');
        if (match[1]) {
          tp = match[1].trim().replace(' dBTP', '');
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`${path.basename(filePath)}: ${duration}ms`);
    
    return {
      filename: path.basename(filePath),
      lufs,
      tp,
      status: 'success'
    };

  } catch (error: unknown) {
    return {
      filename: path.basename(filePath),
      lufs: null,
      tp: null,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Create temporary directory
    const tempDir = path.join(os.tmpdir(), `analyze_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const tempFiles: string[] = [];
      
      // Save uploaded files to temp directory
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.mp3')) {
          continue;
        }
        
        const tempFilePath = path.join(tempDir, file.name);
        const buffer = await file.arrayBuffer();
        fs.writeFileSync(tempFilePath, Buffer.from(buffer));
        tempFiles.push(tempFilePath);
      }

      if (tempFiles.length === 0) {
        return NextResponse.json({ error: 'No valid MP3 files found' }, { status: 400 });
      }

      // MAXIMUM SPEED - same as Python but faster
      const startTime = Date.now();
      console.log(`Starting analysis of ${tempFiles.length} files...`);
      
      const BATCH_SIZE = 20; // More aggressive batching
      const results = [];
      
      for (let i = 0; i < tempFiles.length; i += BATCH_SIZE) {
        const batchStart = Date.now();
        const batch = tempFiles.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(analyzeTrack));
        results.push(...batchResults);
        
        const batchTime = Date.now() - batchStart;
        console.log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} files in ${batchTime}ms`);
      }
      
      const totalTime = Date.now() - startTime;
      console.log(`Total analysis time: ${totalTime}ms for ${tempFiles.length} files`);

      return NextResponse.json({ results });

    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

  } catch (error: unknown) {
    console.error('Analysis error:', error);
    return NextResponse.json({ 
      error: 'Analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
} 