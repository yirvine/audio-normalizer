import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { TARGET_LUFS, TARGET_TP } from '@/lib/config';

const execAsync = promisify(exec);

async function normalizeTrack(inputPath: string, outputPath: string) {
  try {
    // PASS 1: Analyze the file to get precise measurements
    const pass1Command = `ffmpeg -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json" -f null -`;
    const { stderr: pass1Output } = await execAsync(pass1Command, { timeout: 60000 });
    
    // Extract measurements from pass 1
    const jsonMatch = pass1Output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to get analysis data from pass 1');
    }
    
    const measurements = JSON.parse(jsonMatch[0]);
    const measuredI = measurements.input_i;
    const measuredTP = measurements.input_tp;
    const measuredLRA = measurements.input_lra;
    const measuredThresh = measurements.input_thresh;
    const targetOffset = measurements.target_offset;
    
    // PASS 2: Apply precise normalization using pass 1 measurements
    const pass2Command = `ffmpeg -y -threads 4 -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:measured_I=${measuredI}:measured_TP=${measuredTP}:measured_LRA=${measuredLRA}:measured_thresh=${measuredThresh}:offset=${targetOffset}:linear=true:print_format=summary" -ar 44100 -c:a libmp3lame -b:a 320k "${outputPath}"`;
    
    await execAsync(pass2Command, { timeout: 300000 });
    
    return { status: 'success', message: 'Normalized successfully (two-pass)' };
    
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Create temporary directories
    const sessionId = Date.now().toString();
    const tempInputDir = path.join(os.tmpdir(), `input_${sessionId}`);
    const tempOutputDir = path.join(os.tmpdir(), `output_${sessionId}`);
    
    fs.mkdirSync(tempInputDir, { recursive: true });
    fs.mkdirSync(tempOutputDir, { recursive: true });

    try {
      const inputFiles: string[] = [];
      
      // Save uploaded files to temp directory
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.mp3')) {
          continue;
        }
        
        const inputPath = path.join(tempInputDir, file.name);
        const buffer = await file.arrayBuffer();
        fs.writeFileSync(inputPath, Buffer.from(buffer));
        inputFiles.push(inputPath);
      }

      if (inputFiles.length === 0) {
        return NextResponse.json({ error: 'No valid MP3 files found' }, { status: 400 });
      }

      // Normalize files in smart batches - prevents system overload
      const results = [];
      const BATCH_SIZE = 8; // Smaller batches for normalization (more CPU intensive)
      
      for (let i = 0; i < inputFiles.length; i += BATCH_SIZE) {
        const batch = inputFiles.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (inputPath) => {
          const filename = path.basename(inputPath);
          const name = path.parse(filename).name;
          const outputFilename = `${name}_normalized.mp3`;
          const outputPath = path.join(tempOutputDir, outputFilename);
          
          const result = await normalizeTrack(inputPath, outputPath);
          return { result, outputPath, inputPath };
        }));
        results.push(...batchResults);
        
        // Small delay between batches
        if (i + BATCH_SIZE < inputFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Check for errors
      const errors: string[] = [];
      const successfulFiles: string[] = [];
      
      for (const { result, outputPath, inputPath } of results) {
        if (result.status === 'error') {
          errors.push(`${path.basename(inputPath)}: ${result.message}`);
        } else {
          successfulFiles.push(outputPath);
        }
      }

      if (successfulFiles.length === 0) {
        return NextResponse.json({ 
          error: `All files failed to normalize: ${errors.join('; ')}` 
        }, { status: 500 });
      }

      // Create zip archive
      const zipPath = path.join(tempOutputDir, `normalized_audio_${sessionId}.zip`);
      
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));
        
        archive.pipe(output);
        
        for (const filePath of successfulFiles) {
          archive.file(filePath, { name: path.basename(filePath) });
        }
        
        archive.finalize();
      });

      // Read zip file and return as response
      const zipBuffer = fs.readFileSync(zipPath);
      
      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="normalized_audio_${successfulFiles.length}_files.zip"`,
        },
      });

    } finally {
      // Cleanup temp directories
      try {
        fs.rmSync(tempInputDir, { recursive: true, force: true });
        fs.rmSync(tempOutputDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

  } catch (error) {
    console.error('Normalization error:', error);
    return NextResponse.json({ 
      error: 'Normalization failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
} 