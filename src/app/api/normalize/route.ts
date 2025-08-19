import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { TARGET_LUFS, TARGET_TP } from '@/lib/config';

const execAsync = promisify(exec);

async function normalizeTrack(inputPath: string, outputPath: string, gainMultiplier: number) {
  try {
    console.log(`Starting normalization for: ${path.basename(inputPath)} with gain multiplier: ${gainMultiplier}`);

    // STEP 1: Analyze to get input LUFS
    const analyzeCommand = `ffmpeg -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json" -f null -`;
    const { stderr: analyzeOutput } = await execAsync(analyzeCommand, { timeout: 60000 });

    const jsonMatch = analyzeOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to get analysis data');
    }

    const measurements = JSON.parse(jsonMatch[0]);
    const inputLufs = parseFloat(measurements.input_i);
    console.log(`Input: ${inputLufs} LUFS`);

    // STEP 2: Calculate gain using a multiplier to prevent over-correction in multi-pass scenarios.
    const baseGain = TARGET_LUFS - inputLufs;
    const totalGain = baseGain * gainMultiplier;

    console.log(`Base gain: ${baseGain.toFixed(2)}dB, Using multiplier: ${gainMultiplier}, Total Gain: ${totalGain.toFixed(2)}dB`);

    // STEP 3: Build the correct filter chain for true peak limiting
    // From ffmpeg docs: upsample before alimiter to catch inter-sample peaks.
    const limiterValue = Math.pow(10, TARGET_TP / 20); // -0.4 dBTP ≈ 0.955 linear

    const filterchain = [
      `volume=${totalGain.toFixed(2)}dB`,
      'aresample=resampler=soxr:out_sample_rate=192000', // Upsample for true peak detection
      `alimiter=limit=${limiterValue.toFixed(3)}:attack=1:release=50:level=false`,
      'aresample=resampler=soxr:out_sample_rate=44100'  // Downsample back to original rate
    ].join(',');

    const normalizeCommand = `ffmpeg -y -threads 4 -i "${inputPath}" -af "${filterchain}" -ar 44100 -c:a libmp3lame -b:a 320k "${outputPath}"`;
    console.log(`Normalize command: ${normalizeCommand}`);

    await execAsync(normalizeCommand, { timeout: 300000 });

    console.log(`Successfully normalized: ${path.basename(inputPath)}`);
    return { status: 'success', message: `Normalized successfully (gain: ${totalGain.toFixed(1)}dB)` };

  } catch (error) {
    console.error(`Error normalizing ${path.basename(inputPath)}:`, error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function findCommonBaseName(files: File[]): string {
  if (files.length === 0) {
    return 'normalized_audio';
  }

  const firstFileName = files[0].name.replace(/\.[^/.]+$/, ""); // remove extension
  if (files.length === 1) {
    return firstFileName;
  }

  let commonPrefix = '';
  for (let i = 0; i < firstFileName.length; i++) {
    const char = firstFileName[i];
    for (let j = 1; j < files.length; j++) {
      if (i >= files[j].name.length || files[j].name[i] !== char) {
        // Trim to last separator to avoid partial words
        const lastSeparatorIndex = commonPrefix.lastIndexOf(' ');
        return lastSeparatorIndex > 0 ? commonPrefix.substring(0, lastSeparatorIndex) : (commonPrefix || firstFileName.split(' ')[0]);
      }
    }
    commonPrefix += char;
  }

  return commonPrefix || 'normalized_audio';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const isDoublePass = formData.get('double_pass') === 'true';
    const isTriplePass = formData.get('triple_pass') === 'true';

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
          const finalOutputPath = path.join(tempOutputDir, filename);

          let result;

          if (isTriplePass) {
            console.log(`Performing triple-pass normalization for ${filename}`);
            const firstPassTempPath = path.join(tempOutputDir, `firstpass_${filename}`);
            const secondPassTempPath = path.join(tempOutputDir, `secondpass_${filename}`);

            // First pass
            const firstPassResult = await normalizeTrack(inputPath, firstPassTempPath, 1.8);
            if (firstPassResult.status !== 'success') {
              result = firstPassResult;
            } else {
              // Second pass
              const secondPassResult = await normalizeTrack(firstPassTempPath, secondPassTempPath, 1.4);
              if (secondPassResult.status !== 'success') {
                result = secondPassResult;
              } else {
                // Third pass
                result = await normalizeTrack(secondPassTempPath, finalOutputPath, 1.2);
              }
            }
            // Clean up intermediate files
            try { fs.unlinkSync(firstPassTempPath); } catch { /* ignore */ }
            try { fs.unlinkSync(secondPassTempPath); } catch { /* ignore */ }

          } else if (isDoublePass) {
            console.log(`Performing double-pass normalization for ${filename}`);
            const firstPassTempPath = path.join(tempOutputDir, `firstpass_${filename}`);
            
            // First pass
            const firstPassResult = await normalizeTrack(inputPath, firstPassTempPath, 1.8);
            
            if (firstPassResult.status === 'success') {
              // Second pass, using the output of the first as input
              result = await normalizeTrack(firstPassTempPath, finalOutputPath, 1.6);
              // Clean up the intermediate file
              try { fs.unlinkSync(firstPassTempPath); } catch (e) { console.error(`Failed to delete temp file: ${firstPassTempPath}`, e); }
            } else {
              // If the first pass fails, the entire process fails for this file
              result = firstPassResult;
            }
          } else {
            // Standard single-pass normalization
            result = await normalizeTrack(inputPath, finalOutputPath, 1.8);
          }

          return { result, outputPath: finalOutputPath, inputPath };
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

      // Create zip archive with appropriate naming
      const baseName = findCommonBaseName(files);
      let suffix = '_SN'; // Single Pass
      if (isTriplePass) {
        suffix = '_TN'; // Triple Pass
      } else if (isDoublePass) {
        suffix = '_DN'; // Double Pass
      }
      
      const zipFilename = `${baseName}${suffix}.zip`;
      const zipPath = path.join(tempOutputDir, zipFilename);
      
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
          'Content-Disposition': `attachment; filename="${zipFilename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
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