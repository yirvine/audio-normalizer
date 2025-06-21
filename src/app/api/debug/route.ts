import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Test ffmpeg availability and performance
    const startTime = Date.now();
    
    const { stderr } = await execAsync('ffmpeg -version');
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      ffmpeg_available: true,
      version_check_time: `${duration}ms`,
      version_info: stderr.split('\n')[0]
    });
    
  } catch (error) {
    return NextResponse.json({
      ffmpeg_available: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 