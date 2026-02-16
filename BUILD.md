# Building Thirteen Vibes

## Web (HTML5) Export

### Prerequisites

1. **Godot 4.6 installed** (already present at `/Applications/Godot.app`)
2. **Export templates** - Download Godot 4.6 export templates:
   - Open Godot Editor
   - Go to **Editor → Manage Export Templates**
   - Click **Download and Install**
   - This downloads templates to: `~/Library/Application Support/Godot/export_templates/4.6.stable/`

### Build for Web

```bash
# Export to HTML5 (after templates are installed)
/Applications/Godot.app/Contents/MacOS/Godot --headless --export-release "Web" ./build/web/index.html

# Or export debug build
/Applications/Godot.app/Contents/MacOS/Godot --headless --export-debug "Web" ./build/web/index.html
```

### Test Locally

```bash
# Start a local web server
cd build/web
python3 -m http.server 8000

# Open in browser (mobile simulation)
# Desktop: http://localhost:8000
# Mobile: http://<your-ip>:8000
```

**Mobile Testing:**
- Use Chrome DevTools Device Emulator for quick testing
- For real device testing:
  - Find your local IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
  - Ensure phone is on same WiFi network
  - Navigate to `http://<your-ip>:8000` on mobile browser

### Export Settings

Configured in `export_presets.cfg`:
- **Platform:** Web (HTML5)
- **Canvas resize policy:** Adaptive (fits mobile screens)
- **Orientation:** Portrait (locked for mobile)
- **VRAM compression:** Desktop (better quality for web)

### Deployment

For production deployment:
1. Upload `build/web/` contents to web server or hosting service
2. Ensure server serves with correct MIME types:
   - `.wasm` → `application/wasm`
   - `.pck` → `application/octet-stream`
3. Enable HTTPS for best mobile compatibility
4. Consider enabling PWA for installable experience

### Common Issues

**SharedArrayBuffer not available:**
- Web export uses `web_nothreads` template (no threading)
- If you need threading, enable COOP/COEP headers on your server

**Touch not working:**
- Godot automatically handles touch as mouse events
- Test on actual mobile device, not just emulator

**Performance issues:**
- Use mobile renderer (already configured in project.godot)
- Profile with Chrome DevTools on mobile
- Consider reducing resolution or visual effects
