#!/usr/bin/env python3
"""
Render printable card images for The Descent board game using Pillow.

Composites background art, icons, text, and overlays into final card images
matching the game's visual style.

Usage:
    # Render all cards
    python render_cards.py

    # Render only trail cards
    python render_cards.py --type trail

    # Render a specific trail pack
    python render_cards.py --type trail --pack tiger-mountain

    # Render with placeholder backgrounds (no AI assets needed)
    python render_cards.py --placeholder

Requires:
    pip install Pillow
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageColor

from card_data import (
    SYMBOL_COLORS,
    SYMBOL_NAMES,
    SYMBOL_EMOJI,
    TECHNIQUE_DEFS,
    PENALTY_DEFS,
    OBSTACLE_DEFS,
    UPGRADE_DEFS,
    TRAIL_PACKS,
    build_trail_cards,
    MainTrailCard,
)

ASSETS_DIR = Path(__file__).parent / "assets"
OUTPUT_DIR = Path(__file__).parent / "output"

# ── Card Dimensions (pixels at 300 DPI) ──
# Standard poker size: 2.5" x 3.5" → 750 x 1050 at 300 DPI
CARD_W = 750
CARD_H = 1050
CORNER_RADIUS = 36
BORDER_WIDTH = 12
INNER_BORDER_OFFSET = 24
INNER_DASH_LEN = 12
INNER_DASH_GAP = 8


# ── Color Palette ──

COLORS = {
    # Trail card
    "trail_border_outer": "#6a3093",
    "trail_border_inner": "#a044ff",
    "trail_border_dark": "#3a0d6e",
    "trail_dash": (80, 180, 255, 128),
    "trail_name_bg": (0, 0, 0, 220),

    # Obstacle card
    "obstacle_border": "#8b0000",
    "obstacle_bg_top": "#1a0000",
    "obstacle_bg_bot": "#3d0a0a",

    # Technique card
    "technique_bg_top": "#1a1a2e",
    "technique_bg_bot": "#16213e",

    # Penalty card
    "penalty_border": "#8b4513",
    "penalty_bg_top": "#4a1a0a",
    "penalty_bg_bot": "#2a0a00",

    # Upgrade card
    "upgrade_border": "#b8860b",
    "upgrade_bg_top": "#2a1f00",
    "upgrade_bg_bot": "#1a1200",

    # Shared
    "white": "#ffffff",
    "text_primary": "#ffffff",
    "text_secondary": (200, 200, 200),
    "text_dim": (150, 150, 150),
    "speed_badge_bg": (0, 100, 200, 230),
    "row_indicator_bg": (0, 180, 216),
    "row_indicator_border": (200, 240, 255, 160),
}


# ── Font Loading ──

def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Try to load a good system font, fall back to default."""
    candidates = [
        # macOS
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size)


FONT_TITLE = load_font(42, bold=True)
FONT_SUBTITLE = load_font(28, bold=True)
FONT_BODY = load_font(24)
FONT_SMALL = load_font(20)
FONT_BADGE = load_font(52, bold=True)
FONT_BADGE_SM = load_font(30, bold=True)
FONT_INDICATOR = load_font(22, bold=True)


# ── Drawing Helpers ──

def rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    """Create an alpha mask with rounded corners."""
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size[0] - 1, size[1] - 1)], radius=radius, fill=255)
    return mask


def draw_rounded_rect(draw: ImageDraw.Draw, bbox: tuple, radius: int, fill=None, outline=None, width: int = 1):
    """Draw a rounded rectangle."""
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)


def draw_dashed_rounded_rect(img: Image.Image, bbox: tuple, radius: int,
                              color=(80, 180, 255, 128), dash_len: int = 12, gap_len: int = 8, width: int = 3):
    """Draw a dashed rounded rectangle border."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    x1, y1, x2, y2 = bbox
    r = radius

    # Build path points along the rounded rectangle
    points: list[tuple[float, float]] = []
    steps_corner = 16

    # Top-left corner
    for i in range(steps_corner + 1):
        angle = math.pi + (math.pi / 2) * (i / steps_corner)
        points.append((x1 + r + r * math.cos(angle), y1 + r + r * math.sin(angle)))
    # Top edge
    points.append((x2 - r, y1))
    # Top-right corner
    for i in range(steps_corner + 1):
        angle = -math.pi / 2 + (math.pi / 2) * (i / steps_corner)
        points.append((x2 - r + r * math.cos(angle), y1 + r + r * math.sin(angle)))
    # Right edge
    points.append((x2, y2 - r))
    # Bottom-right corner
    for i in range(steps_corner + 1):
        angle = 0 + (math.pi / 2) * (i / steps_corner)
        points.append((x2 - r + r * math.cos(angle), y2 - r + r * math.sin(angle)))
    # Bottom edge
    points.append((x1 + r, y2))
    # Bottom-left corner
    for i in range(steps_corner + 1):
        angle = math.pi / 2 + (math.pi / 2) * (i / steps_corner)
        points.append((x1 + r + r * math.cos(angle), y2 - r + r * math.sin(angle)))

    # Draw dashes along the path
    cum_dist = 0.0
    drawing = True
    for i in range(len(points) - 1):
        x_a, y_a = points[i]
        x_b, y_b = points[i + 1]
        seg_len = math.hypot(x_b - x_a, y_b - y_a)
        if seg_len == 0:
            continue

        pos = 0.0
        while pos < seg_len:
            threshold = dash_len if drawing else gap_len
            remaining = threshold - (cum_dist % (dash_len + gap_len) if not drawing else cum_dist % (dash_len + gap_len))
            if remaining <= 0:
                remaining = threshold

            step = min(remaining, seg_len - pos)
            t1 = pos / seg_len
            t2 = (pos + step) / seg_len

            if drawing:
                sx = x_a + (x_b - x_a) * t1
                sy = y_a + (y_b - y_a) * t1
                ex = x_a + (x_b - x_a) * t2
                ey = y_a + (y_b - y_a) * t2
                draw.line([(sx, sy), (ex, ey)], fill=color, width=width)

            pos += step
            cum_dist += step
            if cum_dist >= (dash_len if drawing else gap_len):
                drawing = not drawing
                cum_dist = 0.0

    img.alpha_composite(overlay)


def gradient_rect(draw: ImageDraw.Draw, bbox: tuple, color_top: str | tuple, color_bot: str | tuple):
    """Fill a rectangle with a vertical gradient."""
    x1, y1, x2, y2 = bbox
    if isinstance(color_top, str):
        color_top = ImageColor.getrgb(color_top)
    if isinstance(color_bot, str):
        color_bot = ImageColor.getrgb(color_bot)

    h = y2 - y1
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        draw.line([(x1, y1 + y), (x2, y1 + y)], fill=(r, g, b))


def load_asset(slug: str, category: str, fallback_size: tuple[int, int]) -> Image.Image:
    """Load an asset image, or create a placeholder gradient."""
    path = ASSETS_DIR / category / f"{slug}.png"
    if path.exists():
        return Image.open(path).convert("RGBA")

    # Generate a placeholder
    img = Image.new("RGBA", fallback_size)
    draw = ImageDraw.Draw(img)
    gradient_rect(draw, (0, 0, *fallback_size), (20, 80, 40), (50, 35, 15))
    # Add subtle noise-like texture with lines
    for y in range(0, fallback_size[1], 40):
        draw.line([(0, y), (fallback_size[0], y + 20)], fill=(255, 255, 255, 8), width=2)
    return img


def draw_text_centered(draw: ImageDraw.Draw, text: str, y: int, font: ImageFont.FreeTypeFont,
                        fill=(255, 255, 255), card_width: int = CARD_W):
    """Draw text horizontally centered."""
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (card_width - tw) // 2
    draw.text((x, y), text, font=font, fill=fill)


def draw_text_wrapped(draw: ImageDraw.Draw, text: str, x: int, y: int, max_width: int,
                       font: ImageFont.FreeTypeFont, fill=(255, 255, 255), line_spacing: int = 4) -> int:
    """Draw word-wrapped text. Returns the y position after the last line."""
    words = text.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)

    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((0, 0), line, font=font)
        y += (bbox[3] - bbox[1]) + line_spacing
    return y


def draw_mountain_icon(draw: ImageDraw.Draw, cx: int, cy: int, size: int = 36, color=(255, 255, 255)):
    """Draw a simple mountain/chevron icon."""
    half = size // 2
    # Outer mountain
    draw.line([(cx - half, cy + half // 2), (cx, cy - half // 2), (cx + half, cy + half // 2)],
              fill=color, width=4, joint="curve")
    # Inner mountain
    inner = size // 3
    draw.line([(cx - inner, cy + half // 2), (cx, cy), (cx + inner, cy + half // 2)],
              fill=(100, 200, 255, 180), width=2, joint="curve")


# ── Card Renderers ──

def render_trail_card(card: MainTrailCard, use_placeholder: bool = False) -> Image.Image:
    """Render a Main Trail Card matching the game's visual style."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))

    # 1. Background image
    pack = next((p for p in TRAIL_PACKS if p.pack_id == card.trail_pack), TRAIL_PACKS[0])
    bg_slug = f"trail_{card.trail_pack}_{card.name.lower().replace(' ', '_').replace('(', '').replace(')', '')}"

    if use_placeholder:
        bg = load_asset("__placeholder__", "backgrounds", (CARD_W, CARD_H))
    else:
        bg = load_asset(bg_slug, "backgrounds", (CARD_W, CARD_H))

    bg = bg.resize((CARD_W, CARD_H), Image.LANCZOS)
    img.paste(bg, (0, 0))

    # 2. Border — purple gradient
    border_overlay = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border_overlay)

    # Outer border
    draw_rounded_rect(bd, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=COLORS["trail_border_outer"], width=BORDER_WIDTH)
    draw_rounded_rect(bd, (4, 4, CARD_W - 5, CARD_H - 5), CORNER_RADIUS - 2,
                       outline=COLORS["trail_border_inner"], width=4)
    draw_rounded_rect(bd, (BORDER_WIDTH, BORDER_WIDTH, CARD_W - BORDER_WIDTH - 1, CARD_H - BORDER_WIDTH - 1),
                       CORNER_RADIUS - 6, outline=COLORS["trail_border_dark"], width=2)

    img.alpha_composite(border_overlay)

    # 3. Inner dashed border
    inset = INNER_BORDER_OFFSET
    draw_dashed_rounded_rect(
        img,
        (inset, inset, CARD_W - inset, CARD_H - inset),
        radius=CORNER_RADIUS - 10,
        color=COLORS["trail_dash"],
        dash_len=INNER_DASH_LEN,
        gap_len=INNER_DASH_GAP,
        width=3,
    )

    # 4. Speed limit badge — top left
    badge_x, badge_y = 48, 48
    badge_w, badge_h = 140, 64
    badge_overlay = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge_overlay)
    draw_rounded_rect(badge_draw, (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
                       radius=12, fill=COLORS["speed_badge_bg"])
    # Mountain icon
    draw_mountain_icon(badge_draw, badge_x + 40, badge_y + badge_h // 2, size=36)
    # Speed number
    badge_draw.text((badge_x + 72, badge_y + 6), str(card.speed_limit),
                     font=FONT_BADGE, fill=(255, 255, 255))
    # Blue glow border
    draw_rounded_rect(badge_draw, (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
                       radius=12, outline=(100, 180, 255, 128), width=2)
    img.alpha_composite(badge_overlay)

    # 5. Row check indicators — right side
    indicator_x = CARD_W - 72
    indicator_top = 130
    indicator_bot = CARD_H - 120
    num_rows = 5
    row_spacing = (indicator_bot - indicator_top) / max(num_rows - 1, 1)

    checked_set = set(card.checked_rows)
    indicator_overlay = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    ind_draw = ImageDraw.Draw(indicator_overlay)

    # Connecting dashed lines between checked indicators
    checked_positions: list[tuple[int, int]] = []
    for r in range(num_rows):
        cy = int(indicator_top + r * row_spacing)
        if r in checked_set:
            checked_positions.append((indicator_x, cy))

    for i in range(len(checked_positions) - 1):
        x1, y1 = checked_positions[i]
        x2, y2 = checked_positions[i + 1]
        # Dashed line
        seg_len = abs(y2 - y1)
        dash = 8
        gap = 6
        y = y1
        drawing = True
        while y < y2:
            step = dash if drawing else gap
            end = min(y + step, y2)
            if drawing:
                ind_draw.line([(x1, y), (x2, end)], fill=(80, 200, 240, 128), width=3)
            y = end
            drawing = not drawing

    # Draw indicators
    for r in range(num_rows):
        cy = int(indicator_top + r * row_spacing)
        if r in checked_set:
            idx = card.checked_rows.index(r)
            lane = card.target_lanes[idx]
            label = f"C{lane + 1}"
            # Filled cyan circle
            circle_r = 24
            ind_draw.ellipse(
                (indicator_x - circle_r, cy - circle_r, indicator_x + circle_r, cy + circle_r),
                fill=COLORS["row_indicator_bg"],
                outline=COLORS["row_indicator_border"],
                width=2,
            )
            # Column label
            bbox = ind_draw.textbbox((0, 0), label, font=FONT_INDICATOR)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            ind_draw.text((indicator_x - tw // 2, cy - th // 2 - 2), label,
                          font=FONT_INDICATOR, fill=(255, 255, 255))
        else:
            # Small dim dot
            dot_r = 6
            ind_draw.ellipse(
                (indicator_x - dot_r, cy - dot_r, indicator_x + dot_r, cy + dot_r),
                fill=(255, 255, 255, 40),
                outline=(255, 255, 255, 25),
            )

    img.alpha_composite(indicator_overlay)

    # 6. Card name banner — bottom
    banner_h = 100
    banner_y = CARD_H - banner_h
    banner = Image.new("RGBA", (CARD_W, banner_h), (0, 0, 0, 0))
    banner_draw = ImageDraw.Draw(banner)
    # Gradient from transparent to dark
    for y_off in range(banner_h):
        alpha = int(220 * (y_off / banner_h))
        banner_draw.line([(0, y_off), (CARD_W, y_off)], fill=(0, 0, 0, alpha))
    img.paste(banner, (0, banner_y), banner)

    draw = ImageDraw.Draw(img)
    draw_text_centered(draw, card.name, banner_y + 20, FONT_TITLE, fill=(255, 255, 255))

    # Subtitle: "X rows checked"
    n_checked = len(card.checked_rows)
    subtitle = f"{n_checked} row{'s' if n_checked != 1 else ''} checked"
    draw_text_centered(draw, subtitle, banner_y + 66, FONT_SMALL, fill=(100, 220, 240, 180))

    # 7. Apply rounded corner mask to entire card
    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def render_obstacle_card(obs, use_placeholder: bool = False) -> Image.Image:
    """Render an Obstacle Card."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background gradient
    gradient_rect(draw, (0, 0, CARD_W, CARD_H), COLORS["obstacle_bg_top"], COLORS["obstacle_bg_bot"])

    # Load obstacle art if available
    slug = f"obstacle_{obs.obs_id}_{obs.name.lower().replace(' ', '_')}"
    art = load_asset(slug, "obstacles", (CARD_W - 80, 500))
    art = art.resize((CARD_W - 80, 500), Image.LANCZOS)
    # Paste art centered, with fade
    art_y = 160
    img.paste(art, (40, art_y), art)
    # Darken overlay on art for readability
    dark = Image.new("RGBA", (CARD_W, 500), (0, 0, 0, 80))
    img.alpha_composite(dark, (0, art_y))

    draw = ImageDraw.Draw(img)

    # Border
    draw_rounded_rect(draw, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=COLORS["obstacle_border"], width=BORDER_WIDTH)

    # Difficulty indicator (top-left)
    difficulty = "EASY" if len(obs.symbols) == 1 else ("HARD" if obs.match_mode == "all" else "MEDIUM")
    diff_colors = {"EASY": (46, 204, 113), "MEDIUM": (241, 196, 15), "HARD": (231, 76, 60)}
    diff_color = diff_colors[difficulty]
    draw_rounded_rect(draw, (40, 40, 180, 84), radius=8, fill=(*diff_color, 200))
    draw.text((56, 46), difficulty, font=FONT_BADGE_SM, fill=(255, 255, 255))

    # Send It cost (top-right)
    cost_text = f"Send It: {obs.send_it_cost}M"
    draw_rounded_rect(draw, (CARD_W - 220, 40, CARD_W - 40, 84), radius=8, fill=(180, 120, 0, 200))
    draw.text((CARD_W - 204, 46), cost_text, font=FONT_BADGE_SM, fill=(255, 255, 255))

    # Symbol badges (centered, below art)
    sym_y = art_y + 500 + 30
    sym_total_w = len(obs.symbols) * 80 + (len(obs.symbols) - 1) * 16
    sym_x = (CARD_W - sym_total_w) // 2
    for sym in obs.symbols:
        color = ImageColor.getrgb(SYMBOL_COLORS[sym])
        draw_rounded_rect(draw, (sym_x, sym_y, sym_x + 80, sym_y + 80), radius=12, fill=(*color, 220))
        label = SYMBOL_NAMES[sym][:3].upper()
        bbox = draw.textbbox((0, 0), label, font=FONT_BADGE_SM)
        tw = bbox[2] - bbox[0]
        draw.text((sym_x + (80 - tw) // 2, sym_y + 22), label, font=FONT_BADGE_SM, fill=(255, 255, 255))
        sym_x += 96

    # Card name
    name_y = sym_y + 100
    draw_text_centered(draw, obs.name, name_y, FONT_TITLE)

    # Penalty type
    draw_text_centered(draw, obs.penalty_type, name_y + 52, FONT_SUBTITLE, fill=(*diff_color, 255))

    # Blow-by text
    text_x = 60
    text_y = name_y + 100
    draw_text_wrapped(draw, obs.blow_by_text, text_x, text_y, CARD_W - 120, FONT_BODY, fill=COLORS["text_secondary"])

    # Match mode indicator
    mode_text = f"Match: {'Any 1 symbol' if obs.match_mode == 'any' else 'All symbols required'}"
    draw_text_centered(draw, mode_text, CARD_H - 80, FONT_SMALL, fill=COLORS["text_dim"])

    # Rounded corners
    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def render_technique_card(tech, use_placeholder: bool = False) -> Image.Image:
    """Render a Technique Card."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    gradient_rect(draw, (0, 0, CARD_W, CARD_H), COLORS["technique_bg_top"], COLORS["technique_bg_bot"])

    # Load technique art
    slug = f"technique_{tech.name.lower().replace(' ', '_')}"
    art = load_asset(slug, "techniques", (CARD_W - 80, 480))
    art = art.resize((CARD_W - 80, 480), Image.LANCZOS)
    img.paste(art, (40, 140), art)

    draw = ImageDraw.Draw(img)

    # Symbol color stripe at top
    sym_color = ImageColor.getrgb(SYMBOL_COLORS[tech.symbol])
    draw.rectangle([(0, 0), (CARD_W, 8)], fill=sym_color)

    # Border with symbol color
    draw_rounded_rect(draw, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=sym_color, width=BORDER_WIDTH)

    # Symbol badge (top-left)
    badge_size = 90
    draw_rounded_rect(draw, (36, 36, 36 + badge_size, 36 + badge_size), radius=16,
                       fill=(*sym_color, 220), outline=(255, 255, 255, 80), width=2)
    sym_label = SYMBOL_NAMES[tech.symbol][:3].upper()
    bbox = draw.textbbox((0, 0), sym_label, font=FONT_BADGE_SM)
    tw = bbox[2] - bbox[0]
    draw.text((36 + (badge_size - tw) // 2, 55), sym_label, font=FONT_BADGE_SM, fill=(255, 255, 255))

    # Card name
    name_y = 660
    draw_text_centered(draw, tech.name, name_y, FONT_TITLE)

    # Symbol name subtitle
    draw_text_centered(draw, SYMBOL_NAMES[tech.symbol], name_y + 52, FONT_SUBTITLE, fill=(*sym_color, 255))

    # Action text
    text_y = name_y + 100
    draw_text_wrapped(draw, tech.action_text, 60, text_y, CARD_W - 120, FONT_BODY, fill=COLORS["text_secondary"])

    # "TECHNIQUE" label at bottom
    draw_text_centered(draw, "TECHNIQUE", CARD_H - 70, FONT_SMALL, fill=COLORS["text_dim"])

    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def render_penalty_card(penalty, use_placeholder: bool = False) -> Image.Image:
    """Render a Penalty Card."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    gradient_rect(draw, (0, 0, CARD_W, CARD_H), COLORS["penalty_bg_top"], COLORS["penalty_bg_bot"])

    # Border
    draw_rounded_rect(draw, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=COLORS["penalty_border"], width=BORDER_WIDTH)

    # Warning stripes at top
    stripe_h = 60
    for x in range(0, CARD_W + stripe_h, stripe_h):
        draw.polygon([
            (x, 0), (x + stripe_h // 2, 0),
            (x - stripe_h // 2, stripe_h), (x - stripe_h, stripe_h)
        ], fill=(180, 100, 20, 60))

    # "PENALTY" header
    header_y = 100
    draw_rounded_rect(draw, (60, header_y, CARD_W - 60, header_y + 70), radius=12,
                       fill=(139, 69, 19, 180))
    draw_text_centered(draw, "PENALTY", header_y + 12, FONT_TITLE, fill=(255, 200, 100))

    # Skull / warning icon area (placeholder with X)
    icon_y = 260
    icon_size = 200
    cx = CARD_W // 2
    cy = icon_y + icon_size // 2
    draw.ellipse((cx - icon_size // 2, cy - icon_size // 2, cx + icon_size // 2, cy + icon_size // 2),
                  fill=(100, 40, 10, 150), outline=(180, 100, 20, 180), width=4)
    draw.line([(cx - 50, cy - 50), (cx + 50, cy + 50)], fill=(255, 100, 50, 200), width=8)
    draw.line([(cx - 50, cy + 50), (cx + 50, cy - 50)], fill=(255, 100, 50, 200), width=8)

    # Card name
    name_y = 520
    draw_text_centered(draw, penalty.name, name_y, FONT_TITLE, fill=(255, 180, 100))

    # Description
    text_y = name_y + 70
    draw_text_wrapped(draw, penalty.description, 60, text_y, CARD_W - 120, FONT_BODY, fill=(255, 200, 150))

    # Bottom flavor
    draw_text_centered(draw, "Repair with Recover or Stage Break", CARD_H - 80, FONT_SMALL, fill=COLORS["text_dim"])

    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def render_upgrade_card(upgrade, use_placeholder: bool = False) -> Image.Image:
    """Render an Upgrade Card."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    gradient_rect(draw, (0, 0, CARD_W, CARD_H), COLORS["upgrade_bg_top"], COLORS["upgrade_bg_bot"])

    # Border
    draw_rounded_rect(draw, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=COLORS["upgrade_border"], width=BORDER_WIDTH)

    # Gold accent line at top
    draw.rectangle([(0, 0), (CARD_W, 6)], fill=(184, 134, 11))

    # "UPGRADE" header
    header_y = 60
    draw_rounded_rect(draw, (60, header_y, CARD_W - 60, header_y + 64), radius=12,
                       fill=(184, 134, 11, 160))
    draw_text_centered(draw, "UPGRADE", header_y + 10, FONT_TITLE, fill=(255, 240, 180))

    # Flow cost badge (centered)
    cost_y = 200
    cost_r = 70
    cx = CARD_W // 2
    draw.ellipse((cx - cost_r, cost_y, cx + cost_r, cost_y + cost_r * 2),
                  fill=(184, 134, 11, 200), outline=(255, 215, 0, 180), width=3)
    cost_text = str(upgrade.flow_cost)
    bbox = draw.textbbox((0, 0), cost_text, font=FONT_BADGE)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, cost_y + 20), cost_text, font=FONT_BADGE, fill=(255, 255, 255))
    draw_text_centered(draw, "FLOW", cost_y + cost_r * 2 - 30, FONT_SMALL, fill=(255, 215, 0))

    # Gear icon (placeholder circles)
    gear_y = 420
    for angle_step in range(8):
        angle = (angle_step / 8) * 2 * math.pi
        gx = cx + int(60 * math.cos(angle))
        gy = gear_y + int(60 * math.sin(angle))
        draw.ellipse((gx - 12, gy - 12, gx + 12, gy + 12), fill=(184, 134, 11, 100))
    draw.ellipse((cx - 30, gear_y - 30, cx + 30, gear_y + 30), fill=(100, 80, 20, 180),
                  outline=(184, 134, 11, 200), width=3)

    # Card name
    name_y = 560
    draw_text_centered(draw, upgrade.name, name_y, FONT_TITLE, fill=(255, 220, 130))

    # Description
    text_y = name_y + 60
    draw_text_wrapped(draw, upgrade.description, 60, text_y, CARD_W - 120, FONT_BODY, fill=(255, 230, 180))

    # "Stage Break Shop" footer
    draw_text_centered(draw, "Stage Break Shop", CARD_H - 80, FONT_SMALL, fill=COLORS["text_dim"])

    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def render_card_back(use_placeholder: bool = False) -> Image.Image:
    """Render the universal card back design."""
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Deep forest gradient
    gradient_rect(draw, (0, 0, CARD_W, CARD_H), (10, 40, 20), (5, 20, 10))

    # Topographic line pattern
    for i in range(20):
        y = 50 + i * 50
        amplitude = 30 + (i % 3) * 15
        points = []
        for x in range(0, CARD_W + 10, 10):
            py = y + int(amplitude * math.sin(x / 80 + i * 0.7))
            points.append((x, py))
        if len(points) >= 2:
            draw.line(points, fill=(100, 180, 80, 30 + i * 2), width=2)

    # Tire tread pattern (center vertical)
    cx = CARD_W // 2
    for y in range(100, CARD_H - 100, 40):
        w = 20
        draw.rectangle([(cx - w, y), (cx - w + 12, y + 20)], fill=(80, 60, 30, 40))
        draw.rectangle([(cx + w - 12, y + 10), (cx + w, y + 30)], fill=(80, 60, 30, 40))

    # Central emblem
    emblem_y = CARD_H // 2
    draw.ellipse((cx - 80, emblem_y - 80, cx + 80, emblem_y + 80),
                  fill=(20, 60, 30, 200), outline=(100, 200, 100, 100), width=3)
    draw_mountain_icon(draw, cx, emblem_y - 10, size=60, color=(150, 220, 150))
    draw_text_centered(draw, "THE", emblem_y + 20, FONT_SMALL, fill=(150, 220, 150, 180))
    draw_text_centered(draw, "DESCENT", emblem_y + 42, FONT_SUBTITLE, fill=(150, 220, 150))

    # Border
    draw_rounded_rect(draw, (0, 0, CARD_W - 1, CARD_H - 1), CORNER_RADIUS,
                       outline=(40, 100, 50), width=BORDER_WIDTH)
    draw_rounded_rect(draw, (8, 8, CARD_W - 9, CARD_H - 9), CORNER_RADIUS - 4,
                       outline=(80, 160, 90, 100), width=2)

    mask = rounded_rect_mask((CARD_W, CARD_H), CORNER_RADIUS)
    final = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Render card images for The Descent")
    parser.add_argument("--type", choices=["trail", "obstacle", "technique", "penalty", "upgrade", "back", "all"],
                        default="all", help="Which card type(s) to render")
    parser.add_argument("--pack", default="whistler-a-line", help="Trail pack ID for trail cards")
    parser.add_argument("--placeholder", action="store_true",
                        help="Use placeholder backgrounds instead of AI-generated assets")
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR, help="Output directory")
    args = parser.parse_args()

    out = args.output
    out.mkdir(parents=True, exist_ok=True)

    card_types = [args.type] if args.type != "all" else ["trail", "obstacle", "technique", "penalty", "upgrade", "back"]
    total = 0

    for card_type in card_types:
        type_dir = out / card_type
        type_dir.mkdir(parents=True, exist_ok=True)

        if card_type == "trail":
            cards = build_trail_cards(args.pack)
            for card in cards:
                fname = f"{card.stage_num:02d}_{card.name.lower().replace(' ', '_').replace('(', '').replace(')', '')}.png"
                print(f"  Rendering trail/{fname}...")
                img = render_trail_card(card, use_placeholder=args.placeholder)
                img.save(type_dir / fname, "PNG")
                total += 1

        elif card_type == "obstacle":
            for obs in OBSTACLE_DEFS:
                fname = f"{obs.obs_id}_{obs.name.lower().replace(' ', '_')}.png"
                print(f"  Rendering obstacle/{fname}...")
                img = render_obstacle_card(obs, use_placeholder=args.placeholder)
                img.save(type_dir / fname, "PNG")
                total += 1

        elif card_type == "technique":
            for tech in TECHNIQUE_DEFS:
                fname = f"{tech.name.lower().replace(' ', '_')}.png"
                print(f"  Rendering technique/{fname}...")
                img = render_technique_card(tech, use_placeholder=args.placeholder)
                img.save(type_dir / fname, "PNG")
                total += 1

        elif card_type == "penalty":
            for pen in PENALTY_DEFS:
                fname = f"{pen.name.lower().replace(' ', '_')}.png"
                print(f"  Rendering penalty/{fname}...")
                img = render_penalty_card(pen, use_placeholder=args.placeholder)
                img.save(type_dir / fname, "PNG")
                total += 1

        elif card_type == "upgrade":
            for upg in UPGRADE_DEFS:
                fname = f"{upg.upgrade_id}_{upg.name.lower().replace(' ', '_').replace('-', '_')}.png"
                print(f"  Rendering upgrade/{fname}...")
                img = render_upgrade_card(upg, use_placeholder=args.placeholder)
                img.save(type_dir / fname, "PNG")
                total += 1

        elif card_type == "back":
            print(f"  Rendering back/card_back.png...")
            img = render_card_back(use_placeholder=args.placeholder)
            img.save(type_dir / "card_back.png", "PNG")
            total += 1

    print(f"\nDone! Rendered {total} cards to {out}/")


if __name__ == "__main__":
    main()
