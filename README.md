# Thirteen Vibes

A mobile-first [Tiến Lên (Thirteen)](https://en.wikipedia.org/wiki/Ti%E1%BA%BFn_l%C3%AAn) card game built with Godot 4.

## Status

**Play now:** [GitHub Pages](https://binhrobles.github.io/thirteen-vibes/) (auto-deploys from main)

Early development. See `bd ready` for current work items.

## Tech

- **Engine:** Godot 4 (GDScript)
- **Target:** Web (HTML5 export), mobile browsers, portrait orientation

## The Game

4-player Vietnamese climbing card game. Cards rank 3 (low) to 2 (high), suits Spades < Clubs < Diamonds < Hearts. Play singles, pairs, triples, runs, quads, and bombs to shed your hand first.

## Development

**Run the game:**
```bash
# Open project in Godot editor
open -a Godot thirteen-vibes/project.godot

# Or run from command line
/Applications/Godot.app/Contents/MacOS/Godot --path /path/to/thirteen-vibes
```

**Issue tracking:**
```bash
bd ready        # See available work
bd show <id>    # View issue details
bd sync         # Sync with git
```

## Building

See [BUILD.md](BUILD.md) for web export instructions.

**Quick start:**
1. Install Godot 4.6 export templates (via Editor → Manage Export Templates)
2. Export: `/Applications/Godot.app/Contents/MacOS/Godot --headless --export-release "Web" ./build/web/index.html`
3. Test: `cd build/web && python3 -m http.server 8000`

## Assets & Attribution

**Card Sprites:**
[Jorel's Card Pack by Jorel](https://games-by-jorel.itch.io/jorels-card-pack) (96x128px pixel art)

**UI Theme:**
[Soft Retro Theme by Intergenic](https://intergenic.itch.io/godot-theme-soft-retro)


