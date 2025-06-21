# LUFS Audio Normalizer Web App

A modern web application for batch audio normalization using LUFS (Loudness Units relative to Full Scale) instead of traditional RMS-based normalization. Built with Next.js and powered by ffmpeg's professional-grade loudnorm filter.

![LUFS Audio Normalizer](https://img.shields.io/badge/LUFS-Audio%20Normalizer-purple?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ Features

- **🎵 Professional LUFS Normalization** - Accurate loudness standardization using EBU R128 standards
- **🖱️ Drag & Drop Interface** - Modern, intuitive file upload with visual feedback
- **📊 Real-time Analysis** - Color-coded LUFS/dBTP analysis with visual indicators
- **⚡ Batch Processing** - Smart batching system handles multiple files efficiently
- **🎯 Precision Targeting** - Two-pass normalization for accurate -7.5 LUFS / 0.0 dBTP results
- **📦 Zip Downloads** - Automatically packages normalized files for easy download
- **🚀 High Performance** - Parallel processing with optimized ffmpeg workflows
- **💎 Quality Preservation** - Maintains original bitrate and sample rate (320kbps/44.1kHz output)

## 🎯 Target Specifications

- **LUFS Target:** -7.5 LUFS (configurable)
- **True Peak Target:** 0.0 dBTP (configurable)
- **Output Quality:** 320kbps MP3, 44.1kHz
- **Processing Accuracy:** ±0.5 LUFS tolerance (professional-grade)

## 🛠️ Technology Stack

- **Frontend:** Next.js 15, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Audio Processing:** ffmpeg with loudnorm filter
- **Architecture:** Serverless-ready with Next.js API routes
- **Deployment:** Optimized for Vercel

## 📋 Requirements

- **Node.js** 18+ 
- **ffmpeg** (must be installed and available in PATH)
- **npm** or **yarn**

## 🚀 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yirvine/audio-normalizer.git
   cd audio-normalizer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Ensure ffmpeg is installed:**
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt update && sudo apt install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

## 💡 How to Use

1. **Upload Files** - Drag and drop MP3 files or click to select
2. **Analyze Audio** - Click "Analyze Audio" to see current LUFS/dBTP values
3. **Review Results** - Color-coded table shows which files need normalization
4. **Normalize & Download** - Click "Normalize & Download" to process and get zip file

### Color Coding
- 🔴 **Red:** Below target LUFS (needs normalization)
- 🟡 **Yellow:** Above target LUFS (needs normalization) 
- 🟢 **Green:** Within acceptable range

## ⚙️ How It Works

### Analysis Phase
- Utilizes ffmpeg's loudnorm filter in analysis mode
- Extracts precise LUFS and True Peak measurements
- Processes files in batches of 20 for optimal performance

### Normalization Phase  
- **Two-pass processing** for maximum accuracy:
  1. **Pass 1:** Analyzes file and generates precise measurements
  2. **Pass 2:** Applies normalization using exact measurements
- Smart batching (8 files simultaneously) prevents system overload
- Preserves original audio quality while adjusting only loudness

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Other Platforms
- **Railway:** Connect GitHub repo, auto-deploy
- **Netlify:** Supports Next.js with API routes
- **Self-hosted:** Standard Node.js deployment

## 🔧 Configuration

Edit target values in both frontend and backend:

**Frontend** (`src/app/page.tsx`):
```typescript
const TARGET_LUFS = -7.5;
const TARGET_TP = 0.0;
```

**Backend** (`src/app/api/*/route.ts`):
```typescript
const TARGET_LUFS = -7.5;
const TARGET_TP = 0.0;
```

## 📈 Performance

- **Analysis:** ~47 seconds for 40 tracks
- **Normalization:** ~85 seconds for 40 tracks  
- **Batch sizes:** 20 files (analysis), 8 files (normalization)
- **Concurrent processing:** Optimized for system resources

## 🎨 UI/UX Features

- **Modern glassmorphism design** with purple gradient theme
- **Responsive layout** works on desktop and mobile
- **Real-time progress feedback** during processing
- **Professional data visualization** with color-coded analysis tables
- **Intuitive drag-and-drop** file upload experience

## 🔍 Technical Details

- **File size limit:** 100MB per request (configurable)
- **Supported formats:** MP3 files
- **Output format:** 320kbps MP3, 44.1kHz, stereo
- **Processing:** Server-side with Node.js and ffmpeg
- **Cleanup:** Automatic temporary file management

## 📝 License

MIT License - feel free to use for personal or commercial projects.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yirvine/audio-normalizer/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yirvine/audio-normalizer/discussions)

---

**Built with ❤️ for audio professionals, DJs, and music enthusiasts who demand precise loudness control.**
