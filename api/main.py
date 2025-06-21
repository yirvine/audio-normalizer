from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import tempfile
import os
import zipfile
import shutil
from typing import List
import concurrent.futures
from pathlib import Path
import uuid

app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-domain.vercel.app"],  # Update with your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file (will be limited by Vercel anyway)

TARGET_LUFS = -9
TARGET_TP = 0

def analyze_track(file_path: str):
    """Analyze a track to get current LUFS and TP values"""
    try:
        result = subprocess.run([
            "ffmpeg", "-threads", "4", "-i", file_path,
            "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=11:print_format=summary",
            "-f", "null", "-"
        ], stderr=subprocess.PIPE, text=True, timeout=60)

        output = result.stderr
        lufs = None
        tp = None

        for line in output.splitlines():
            if "Input Integrated" in line:
                lufs = line.split(":")[1].strip().replace(" LUFS", "")
            if "Input True Peak" in line:
                tp = line.split(":")[1].strip().replace(" dBTP", "")

        return {
            "filename": os.path.basename(file_path),
            "lufs": lufs,
            "tp": tp,
            "status": "success"
        }

    except subprocess.TimeoutExpired:
        return {
            "filename": os.path.basename(file_path),
            "lufs": None,
            "tp": None,
            "status": "timeout",
            "error": "Analysis timed out"
        }
    except Exception as e:
        return {
            "filename": os.path.basename(file_path),
            "lufs": None,
            "tp": None,
            "status": "error",
            "error": str(e)
        }

def normalize_track(input_path: str, output_path: str):
    """Normalize a track to target LUFS and TP"""
    try:
        result = subprocess.run([
            "ffmpeg", "-y", "-threads", "4", "-i", input_path,
            "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=11",
            "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "320k",
            output_path
        ], stderr=subprocess.PIPE, text=True, timeout=300)
        
        if result.returncode == 0:
            return {"status": "success", "message": "Normalized successfully"}
        else:
            return {"status": "error", "message": result.stderr}
            
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Normalization timed out"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
async def root():
    return {"message": "LUFS Audio Normalizer API"}

@app.post("/analyze")
async def analyze_files(files: List[UploadFile] = File(...)):
    """Analyze uploaded MP3 files to get current LUFS and TP values"""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    # Create temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_files = []
        
        # Save uploaded files
        for file in files:
            if not file.filename.lower().endswith('.mp3'):
                raise HTTPException(status_code=400, detail=f"File {file.filename} is not an MP3")
            
            temp_path = os.path.join(temp_dir, file.filename)
            with open(temp_path, "wb") as temp_file:
                content = await file.read()
                temp_file.write(content)
            temp_files.append(temp_path)
        
        # Analyze files in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(analyze_track, temp_files))
    
    return {"results": results}

@app.post("/normalize")
async def normalize_files(files: List[UploadFile] = File(...)):
    """Normalize uploaded MP3 files and return a zip archive"""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    # Create unique temporary directories
    session_id = str(uuid.uuid4())
    temp_input_dir = tempfile.mkdtemp(prefix=f"input_{session_id}_")
    temp_output_dir = tempfile.mkdtemp(prefix=f"output_{session_id}_")
    
    try:
        input_files = []
        
        # Save uploaded files
        for file in files:
            if not file.filename.lower().endswith('.mp3'):
                raise HTTPException(status_code=400, detail=f"File {file.filename} is not an MP3")
            
            input_path = os.path.join(temp_input_dir, file.filename)
            with open(input_path, "wb") as temp_file:
                content = await file.read()
                temp_file.write(content)
            input_files.append(input_path)
        
        # Normalize files in parallel
        def normalize_file(input_path):
            filename = os.path.basename(input_path)
            name, ext = os.path.splitext(filename)
            output_filename = f"{name}_normalized{ext}"
            output_path = os.path.join(temp_output_dir, output_filename)
            return normalize_track(input_path, output_path), output_path
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(normalize_file, input_files))
        
        # Check for errors
        errors = []
        successful_files = []
        for (result, output_path), input_file in zip(results, input_files):
            if result["status"] == "error":
                errors.append(f"{os.path.basename(input_file)}: {result['message']}")
            else:
                successful_files.append(output_path)
        
        if not successful_files:
            raise HTTPException(status_code=500, detail=f"All files failed to normalize: {'; '.join(errors)}")
        
        # Create zip archive
        zip_path = os.path.join(temp_output_dir, f"normalized_audio_{session_id}.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in successful_files:
                zipf.write(file_path, os.path.basename(file_path))
        
        # Return the zip file
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=f"normalized_audio_{len(successful_files)}_files.zip",
            background=lambda: [shutil.rmtree(temp_input_dir, ignore_errors=True), 
                              shutil.rmtree(temp_output_dir, ignore_errors=True)]
        )
        
    except Exception as e:
        # Cleanup on error
        shutil.rmtree(temp_input_dir, ignore_errors=True)
        shutil.rmtree(temp_output_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test if ffmpeg is available
        result = subprocess.run(["ffmpeg", "-version"], 
                              capture_output=True, text=True, timeout=5)
        ffmpeg_available = result.returncode == 0
    except:
        ffmpeg_available = False
    
    return {
        "status": "healthy",
        "ffmpeg_available": ffmpeg_available
    } 