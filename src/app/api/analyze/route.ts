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
    // Use more robust ffmpeg command with increased timeout for large files
    const command = `ffmpeg -hide_banner -threads 2 -i "${filePath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=summary" -f null - 2>&1`;
    
         const { stdout, stderr } = await execAsync(command, { 
       timeout: 45000, // Increased timeout
       maxBuffer: 1024 * 1024 // 1MB buffer
     });
     
     let lufs = null;
     let tp = null;

     // With 2>&1, output goes to stdout
     const output = stdout || stderr || '';
     const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('Input Integrated')) {
        const match = line.split(':');
        if (match[1]) {
          const lufsValue = match[1].trim().replace(' LUFS', '');
          lufs = parseFloat(lufsValue);
        }
      }
      if (line.includes('Input True Peak')) {
        const match = line.split(':');
        if (match[1]) {
          const tpValue = match[1].trim().replace(' dBTP', '');
          tp = parseFloat(tpValue);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`${path.basename(filePath)}: ${duration}ms`);
    
    return {
      filename: path.basename(filePath),
      lufs,
      peak: tp,
      status: 'success'
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Analysis failed for ${path.basename(filePath)}:`, errorMessage);
    
    return {
      filename: path.basename(filePath),
      lufs: null,
      peak: null,
      status: 'error',
      error: errorMessage
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