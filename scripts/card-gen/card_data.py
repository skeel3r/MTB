"""
Card definitions for Treadline board game.
Mirrors src/lib/cards.ts so the Python renderer has access to all card data.
"""

from dataclasses import dataclass, field
from typing import Optional

# ── Symbol System ──

SYMBOLS = ["grip", "air", "agility", "balance"]

SYMBOL_NAMES = {
    "grip": "Tire",
    "air": "Spring",
    "agility": "Bars",
    "balance": "Level",
}

SYMBOL_COLORS = {
    "grip": "#e74c3c",
    "air": "#3498db",
    "agility": "#2ecc71",
    "balance": "#f39c12",
}

SYMBOL_EMOJI = {
    "grip": "\U0001f6de",   # 🛞
    "air": "\U0001f300",    # 🌀
    "agility": "\U0001f500", # 🔀
    "balance": "\u2696\ufe0f", # ⚖️
}

# Column aliases (0-indexed lanes)
C1, C2, C3, C4, C5 = 0, 1, 2, 3, 4


# ── Data Classes ──

@dataclass
class TechniqueCard:
    name: str
    symbol: str
    action_text: str
    copies: int = 1


@dataclass
class PenaltyCard:
    name: str
    description: str


@dataclass
class MainTrailCard:
    stage_num: int
    name: str
    speed_limit: int
    checked_rows: list[int]
    target_lanes: list[int]
    trail_pack: str = "whistler-a-line"


@dataclass
class ProgressObstacle:
    obs_id: str
    name: str
    symbols: list[str]
    penalty_type: str
    blow_by_text: str
    match_mode: str = "all"
    send_it_cost: int = 2


@dataclass
class Upgrade:
    upgrade_id: str
    name: str
    flow_cost: int
    description: str


@dataclass
class TrailPack:
    pack_id: str
    name: str
    location: str
    description: str
    stages: list[tuple[str, int, list[int]]]


# ── Card Definitions ──

TECHNIQUE_DEFS: list[TechniqueCard] = [
    TechniqueCard("Inside Line", "grip", "Ignore Grip penalties this turn. Shift any 1 token up to 2 lanes.", 10),
    TechniqueCard("Manual", "air", "Swap any 2 adjacent-row tokens.", 10),
    TechniqueCard("Flick", "agility", "Shift tokens in Rows 1-3 one lane toward center.", 9),
    TechniqueCard("Recover", "balance", "Remove 2 Hazard Dice (or repair 1 Penalty). Center any 1 token.", 9),
    TechniqueCard("Pump", "air", "Shift tokens in Rows 4-6 one lane toward center.", 7),
    TechniqueCard("Whip", "grip", "Move any 1 token directly to any lane.", 7),
]

PENALTY_DEFS: list[PenaltyCard] = [
    PenaltyCard("Bent Derailleur", "Cannot use Pedal action."),
    PenaltyCard("Snapped Brake", "Cannot use Brake action."),
    PenaltyCard("Tacoed Rim", "Columns 1 and 5 are Locked (hitting them = +1 Hazard Die)."),
    PenaltyCard("Blown Seals", "Cannot use Flow Tokens to Ghost (copy) symbols."),
    PenaltyCard("Dropped Chain", "Max Momentum capped at 2."),
    PenaltyCard("Arm Pump", "Max Actions reduced to 3 per turn."),
    PenaltyCard("Slipped Pedal", "Discard 2 random cards from hand immediately."),
    PenaltyCard("Loose Headset", "Every Steer action adds +1 Hazard Die."),
    PenaltyCard("Flat Tire", "Must spend 2 Momentum to tackle any Obstacle."),
    PenaltyCard("Muddy Goggles", "Cannot see the Queued Main Trail Card."),
    PenaltyCard("Stretched Cable", "Must discard 1 card to perform a Steer action."),
    PenaltyCard("Bent Bars", "Row 3 and Row 4 tokens must move together."),
]

OBSTACLE_DEFS: list[ProgressObstacle] = [
    # Easy (1 symbol, any match)
    ProgressObstacle("obs-1", "Loose Scree", ["grip"], "Slide Out", "Row 1 token shifts 2 lanes randomly.", "any"),
    ProgressObstacle("obs-2", "The Mud Bog", ["grip"], "Heavy Drag", "Lose 2 Momentum and 1 card from hand.", "any"),
    ProgressObstacle("obs-3", "Double Jump", ["air"], "Case It", "Lose 2 Momentum immediately.", "any"),
    ProgressObstacle("obs-4", "The 10ft Drop", ["air"], "Bottom Out", "Take 2 Hazard Dice instead of 1.", "any"),
    ProgressObstacle("obs-5", "Tight Trees", ["agility"], "Wide Turn", "Row 1 shifts 1 lane away from Center.", "any"),
    ProgressObstacle("obs-6", "Rapid Berms", ["agility"], "Whiplash", "Shift Row 2 and Row 3 one lane Right.", "any"),
    ProgressObstacle("obs-7", "Log Skinny", ["balance"], "Stall", "Cannot Pedal or use Momentum this turn.", "any"),
    ProgressObstacle("obs-8", "Granite Slab", ["balance"], "Locked", "Your Row 1 token cannot move next turn.", "any"),
    # Medium (2 symbols, any match)
    ProgressObstacle("obs-9", "Rooty Drop", ["grip", "air"], "Wipeout", "Take 2 Hazard Dice and end turn immediately.", "any"),
    ProgressObstacle("obs-10", "Slippery Berm", ["grip", "agility"], "Wash Out", "Shift Row 1 and Row 2 three lanes.", "any"),
    # Hard (2 symbols, all match, 3 momentum)
    ProgressObstacle("obs-11", "The Canyon Gap", ["air", "balance"], "Full Send", "Shift Rows 1 and 2 two lanes away from center.", "all", 3),
    ProgressObstacle("obs-12", "Rock Garden", ["grip", "agility"], "Pinball", "Shift Rows 1-3 one lane away from center.", "all", 3),
    ProgressObstacle("obs-13", "Gnarly Root Web", ["balance", "grip"], "Tangled", "Shift Rows 2-4 one lane left.", "all", 3),
    ProgressObstacle("obs-14", "Steep Chute", ["air", "agility"], "Overshoot", "Shift Row 1 two lanes and Row 3 one lane away from center.", "all", 3),
]

UPGRADE_DEFS: list[Upgrade] = [
    Upgrade("upgrade-1", "High-Engagement Hubs", 3, "1st Pedal action/turn is 0 Actions."),
    Upgrade("upgrade-2", "Oversized Rotors", 4, "1 Brake action drops Momentum by 2."),
    Upgrade("upgrade-3", "Carbon Frame", 5, "Max Momentum = 12; Min Hand Size = 4."),
    Upgrade("upgrade-4", "Electronic Shifting", 5, "1 Steer action/turn is 0 Actions."),
    Upgrade("upgrade-5", "Telemetry System", 6, "Look at top 3 Obstacles at turn start; keep 1."),
    Upgrade("upgrade-6", "Factory Suspension", 8, "Pro Line obstacle clears gain +2 Flow instead of 1."),
]

TRAIL_PACKS: list[TrailPack] = [
    TrailPack(
        "whistler-a-line",
        "Whistler A-Line",
        "Whistler, BC",
        "The iconic jump trail. Big airs, fast berms, and hero moments.",
        [
            ("Start Gate",     6, [C3, C3, C3, -1, -1]),
            ("Right Hip",      4, [C3, C4, C5, C5, -1]),
            ("Lower Bridge",   5, [C5, C4, C3, -1, -1]),
            ("Rock Drop",      2, [C3, C3, C3, C3, C3]),
            ("Berms (Left)",   3, [C3, C2, C1, C1, -1]),
            ("The Tabletop",   6, [C1, C2, C3, -1, -1]),
            ("Shark Fin",      4, [C3, C3, C4, C5, C5]),
            ("Ski Jumps",      5, [C5, C4, C3, -1, -1]),
            ("Moon Booter",    5, [C3, C3, C3, C3, C3]),
            ("Merchant Link",  4, [C3, C3, C2, C1, -1]),
            ("Tech Woods",     2, [C1, C1, C2, C3, C3]),
            ("Brake Bumps",    3, [C3, C4, C2, C4, -1]),
            ("Tombstone",      4, [C3, C4, C3, C2, -1]),
            ("High Berms",     4, [C1, C1, C1, -1, -1]),
            ("Hero Shot",      6, [C3, C3, C3, C3, C3]),
        ],
    ),
    TrailPack(
        "tiger-mountain",
        'Tiger Mountain "The Predator"',
        "Issaquah, WA",
        "A classic PNW steeps trail. Tight trees, root nests, and constant vertical drops.",
        [
            ("The High Traverse",  4, [C3, C3, C3, -1, -1]),
            ("Root Garden Entry",  2, [C3, C2, C1, C2, C3]),
            ("The Vertical Chute", 5, [C3, C3, C3, -1, -1]),
            ("Needle Eye Gap",     4, [C2, C2, C2, C1, -1]),
            ("Loamy Switchbacks",  3, [C1, C2, C3, C4, C5]),
            ("The Waterfall",      2, [C3, C3, C3, C3, C3]),
            ("Mossy Slab",         4, [C4, C5, C5, C4, -1]),
            ("Brake Bump Gully",   3, [C3, C4, C2, C4, -1]),
            ("The Cedar Gap",      5, [C3, C3, C3, -1, -1]),
            ("Final Tech Sprint",  4, [C3, C2, C1, C2, C3]),
            ("The Stump Jump",     5, [C3, C3, C4, C5, -1]),
            ("Exit Woods",         4, [C3, C3, C3, -1, -1]),
        ],
    ),
]


def build_trail_cards(pack_id: str = "whistler-a-line") -> list[MainTrailCard]:
    """Build MainTrailCard list from a trail pack, same logic as createTrailDeck()."""
    pack = next((p for p in TRAIL_PACKS if p.pack_id == pack_id), TRAIL_PACKS[0])
    cards: list[MainTrailCard] = []
    for i, (name, speed_limit, targets) in enumerate(pack.stages):
        checked_rows = [r for r, t in enumerate(targets) if t >= 0]
        target_lanes = [t for t in targets if t >= 0]
        cards.append(MainTrailCard(
            stage_num=i + 1,
            name=name,
            speed_limit=speed_limit,
            checked_rows=checked_rows,
            target_lanes=target_lanes,
            trail_pack=pack_id,
        ))
    return cards
