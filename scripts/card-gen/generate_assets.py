#!/usr/bin/env python3
"""
Generate image assets for Treadline card game using Google Gemini (Nano/Flash).

Usage:
    # Generate all assets
    python generate_assets.py

    # Generate only trail backgrounds
    python generate_assets.py --category trail

    # Generate icons with background removal
    python generate_assets.py --category icons --remove-bg

    # Use a specific model
    python generate_assets.py --model gemini-2.0-flash-exp

Requires:
    pip install google-genai Pillow rembg onnxruntime

Environment:
    GEMINI_API_KEY  – your Google AI Studio API key
"""

import argparse
import json
import os
import sys
import base64
from pathlib import Path
from io import BytesIO

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False
    genai = None
    types = None

from PIL import Image

from card_data import (
    TRAIL_PACKS,
    OBSTACLE_DEFS,
    TECHNIQUE_DEFS,
    PENALTY_DEFS,
    UPGRADE_DEFS,
    SYMBOL_NAMES,
    build_trail_cards,
)

ASSETS_DIR = Path(__file__).parent / "assets"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"

# ── Asset Categories & Prompts ──

def trail_background_prompts() -> list[dict]:
    """One background image per trail stage across all packs."""
    terrain_desc = {
        # speed_limit -> terrain style
        1: "extremely technical rocky and root-covered terrain with steep drops",
        2: "technical rocky features, exposed roots, and tight switchbacks",
        3: "moderate terrain with packed dirt berms, scattered roots, and natural features",
        4: "flowing singletrack with banked turns and gentle undulations through the forest",
        5: "smooth high-speed berms and tabletop jumps with groomed dirt surfaces",
        6: "massive jumps, wide-open berms, and perfectly sculpted bike park features",
    }

    items = []
    for pack in TRAIL_PACKS:
        for name, speed_limit, _targets in pack.stages:
            slug = f"trail_{pack.pack_id}_{name.lower().replace(' ', '_').replace('(', '').replace(')', '')}"
            terrain = terrain_desc.get(speed_limit, terrain_desc[3])
            items.append({
                "slug": slug,
                "category": "backgrounds",
                "prompt": (
                    f"A lush, richly detailed digital painting of a mountain bike trail section called '{name}' "
                    f"on {pack.name} in {pack.location}. "
                    f"The scene shows {terrain}. "
                    f"Dense Pacific Northwest forest with towering evergreen trees, ferns, moss-covered logs, "
                    f"and dappled golden sunlight filtering through the canopy onto the dirt trail. "
                    f"Painterly illustrated art style with rich saturated colors, visible brushwork texture, "
                    f"warm golden-hour lighting, and deep atmospheric perspective. "
                    f"The trail curves through the scene as the focal point. "
                    f"Vertical composition for a playing card (3:4 aspect ratio). "
                    f"No text, no people, no bikes, no UI elements."
                ),
                "size": (560, 800),
            })
    return items


def symbol_icon_prompts() -> list[dict]:
    """Icon for each card symbol (grip, air, agility, balance)."""
    icon_descriptions = {
        "grip": "A rugged mountain bike tire tread pattern, aggressive knobs gripping dirt, dynamic angle, red-tinted lighting",
        "air": "A coiled suspension spring with motion blur compression lines, metallic blue chrome finish, dynamic energy",
        "agility": "Mountain bike handlebars from rider POV with sharp turn motion blur, green energy trail, dynamic steering",
        "balance": "A precision balance scale with mountain bike components, golden amber glow, perfect equilibrium",
    }
    items = []
    for symbol, desc in icon_descriptions.items():
        items.append({
            "slug": f"icon_{symbol}",
            "category": "icons",
            "prompt": (
                f"{desc}. "
                f"Clean icon style on a solid dark background, centered composition, "
                f"high contrast, game UI asset, no text. Square 1:1 aspect ratio."
            ),
            "size": (256, 256),
            "remove_bg": True,
        })
    return items


def obstacle_art_prompts() -> list[dict]:
    """Art for each unique obstacle."""
    items = []
    for obs in OBSTACLE_DEFS:
        slug = f"obstacle_{obs.obs_id}_{obs.name.lower().replace(' ', '_')}"
        symbols_desc = " and ".join(SYMBOL_NAMES[s] for s in obs.symbols)
        items.append({
            "slug": slug,
            "category": "obstacles",
            "prompt": (
                f"A dramatic mountain bike trail obstacle: '{obs.name}'. "
                f"This obstacle tests {symbols_desc} skills. "
                f"Penalty for failure: {obs.penalty_type} — {obs.blow_by_text} "
                f"Photorealistic forest trail setting, dramatic lighting, "
                f"sense of danger and challenge. Vertical 3:4 composition. "
                f"No text, no people, no bikes."
            ),
            "size": (420, 560),
        })
    return items


def technique_art_prompts() -> list[dict]:
    """Art for each unique technique card."""
    technique_descriptions = {
        "Inside Line": "A tight inside corner on a banked mountain bike berm, tire tracks cutting the optimal racing line through red dirt",
        "Manual": "A mountain bike with front wheel lifted high in a perfect manual position, trail dust floating, forest backdrop",
        "Flick": "Dynamic motion of a mountain bike mid-whip with the rear end kicked out, dirt spray, forest blur background",
        "Recover": "A mountain bike rider's hands adjusting suspension and components mid-trail, mechanical precision, forest setting",
        "Pump": "Rolling terrain with pump track bumps, showing the flow and rhythm of a pump section, golden light on berms",
        "Whip": "An explosive tail whip off a jump lip, bike frame twisted dramatically, dirt trail below, trees framing the shot",
    }
    items = []
    for tech in TECHNIQUE_DEFS:
        slug = f"technique_{tech.name.lower().replace(' ', '_')}"
        desc = technique_descriptions.get(tech.name, f"Mountain bike technique: {tech.name}")
        items.append({
            "slug": slug,
            "category": "techniques",
            "prompt": (
                f"{desc}. "
                f"Cinematic action photography style, dramatic lighting, "
                f"rich forest colors, high energy. Vertical 3:4 composition. "
                f"No text, no people visible."
            ),
            "size": (420, 560),
        })
    return items


def misc_prompts() -> list[dict]:
    """Card backs, speed limit badge backgrounds, etc."""
    return [
        {
            "slug": "card_back",
            "category": "misc",
            "prompt": (
                "An intricate mountain bike trail map pattern for a playing card back design. "
                "Deep forest green and earth brown tones with gold accent lines showing trail paths. "
                "Topographic contour lines, subtle tree silhouettes, tire tread patterns woven in. "
                "Symmetrical design suitable for a card back. No text. Vertical 3:4."
            ),
            "size": (560, 800),
        },
        {
            "slug": "speed_badge_bg",
            "category": "icons",
            "prompt": (
                "A blue diamond-shaped trail difficulty rating sign, mountain silhouette, "
                "clean vector icon style on dark background. Square 1:1."
            ),
            "size": (128, 128),
            "remove_bg": True,
        },
    ]


# ── Gemini Client ──

def get_client():
    if not HAS_GENAI:
        print("ERROR: google-genai not installed. Run: pip install google-genai")
        sys.exit(1)
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.")
        print("  Get a key at https://aistudio.google.com/apikey")
        sys.exit(1)
    return genai.Client(api_key=api_key)


def generate_image(client, prompt: str, model: str) -> Image.Image | None:
    """Generate a single image using Gemini or Imagen."""
    try:
        if "imagen" in model:
            # Use Imagen API
            response = client.models.generate_images(
                model=model,
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                ),
            )
            if response.generated_images:
                img_bytes = response.generated_images[0].image.image_bytes
                return Image.open(BytesIO(img_bytes))
            print(f"  WARNING: No image returned from Imagen")
            return None
        else:
            # Use Gemini multimodal generation
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                ),
            )
            if response.candidates:
                for part in response.candidates[0].content.parts:
                    if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                        img_bytes = part.inline_data.data
                        return Image.open(BytesIO(img_bytes))

            print(f"  WARNING: No image in response. Text: {response.text[:200] if response.text else 'none'}")
            return None

    except Exception as e:
        print(f"  ERROR generating image: {e}")
        return None


def remove_background(img: Image.Image) -> Image.Image:
    """Remove background using rembg."""
    try:
        from rembg import remove
        # Convert to bytes, process, convert back
        buf = BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        result = remove(buf.read())
        return Image.open(BytesIO(result)).convert("RGBA")
    except ImportError:
        print("  WARNING: rembg not installed, skipping bg removal. Run: pip install rembg onnxruntime")
        return img


# ── Main Generation Loop ──

def gather_items(category: str | None) -> list[dict]:
    """Collect all asset generation items, optionally filtered by category."""
    all_items = (
        trail_background_prompts()
        + symbol_icon_prompts()
        + obstacle_art_prompts()
        + technique_art_prompts()
        + misc_prompts()
    )
    if category:
        all_items = [item for item in all_items if item["category"] == category]
    return all_items


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text())
    return {}


def save_manifest(manifest: dict):
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Generate image assets for Treadline card game")
    parser.add_argument("--category", choices=["backgrounds", "icons", "obstacles", "techniques", "misc"],
                        help="Only generate assets in this category")
    parser.add_argument("--remove-bg", action="store_true",
                        help="Force background removal on all generated images")
    parser.add_argument("--model", default="imagen-4.0-generate-001",
                        help="Model to use (default: imagen-4.0-generate-001)")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="Skip assets that already exist (default: true)")
    parser.add_argument("--no-skip-existing", action="store_false", dest="skip_existing",
                        help="Regenerate all assets even if they exist")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be generated without calling the API")
    parser.add_argument("--list", action="store_true",
                        help="List all asset slugs and exit")
    args = parser.parse_args()

    items = gather_items(args.category)

    if args.list:
        for item in items:
            path = ASSETS_DIR / item["category"] / f"{item['slug']}.png"
            exists = "EXISTS" if path.exists() else "MISSING"
            print(f"  [{exists}] {item['category']}/{item['slug']}  ({item['size'][0]}x{item['size'][1]})")
        print(f"\nTotal: {len(items)} assets")
        return

    manifest = load_manifest()

    if args.dry_run:
        for item in items:
            rm = " + bg removal" if item.get("remove_bg") or args.remove_bg else ""
            print(f"  [DRY RUN] {item['category']}/{item['slug']} {item['size']}{rm}")
            print(f"    Prompt: {item['prompt'][:120]}...")
        print(f"\nWould generate {len(items)} images")
        return

    client = get_client()
    generated = 0
    skipped = 0

    for i, item in enumerate(items, 1):
        slug = item["slug"]
        category = item["category"]
        out_dir = ASSETS_DIR / category
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{slug}.png"

        if args.skip_existing and out_path.exists():
            skipped += 1
            continue

        print(f"[{i}/{len(items)}] Generating {category}/{slug}...")

        img = generate_image(client, item["prompt"], args.model)
        if img is None:
            print(f"  FAILED — skipping")
            continue

        # Resize to target dimensions
        target_w, target_h = item["size"]
        img = img.resize((target_w, target_h), Image.LANCZOS)

        # Background removal
        if item.get("remove_bg") or args.remove_bg:
            print(f"  Removing background...")
            img = remove_background(img)

        img.save(out_path, "PNG")
        print(f"  Saved: {out_path}")

        manifest[slug] = {
            "path": str(out_path.relative_to(ASSETS_DIR)),
            "category": category,
            "size": list(item["size"]),
            "prompt": item["prompt"],
        }
        generated += 1

    save_manifest(manifest)
    print(f"\nDone! Generated: {generated}, Skipped: {skipped}, Total: {len(items)}")
    print(f"Assets directory: {ASSETS_DIR}")


if __name__ == "__main__":
    main()
