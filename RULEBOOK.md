# Descenders: The Board Game — Rulebook

> A downhill mountain biking board game for 2-6 players. Race down the trail, tackle obstacles, manage your momentum, and use technique cards strategically to cross the finish line first.

---

## Components

| Component | Count | Description |
|-----------|-------|-------------|
| Technique Cards | 20 (5 per symbol) | 4 unique cards with grip, air, agility, or balance symbols |
| Obstacle Cards | 30 (3 per type) | 10 unique obstacles requiring symbol matches |
| Penalty Cards | 24 (2 per type) | 12 unique mechanical failures |
| Trail Cards | 15 | Define the course layout and speed limits |
| Trail Hazards | 30+ | Environmental effects that shift token positions |
| Upgrade Cards | 6 | Purchasable bike improvements |
| Player Grid | 1 per player | 6 rows x 5 columns (lanes C1-C5) |
| Tokens | 5 per player | Placed on the player grid |
| Hazard Dice | Pool | d6 dice accumulated through the game |

All card data is defined in the `data/` directory as CSV files for easy editing and export to card creation tools.

---

## Setup

1. Each player receives a **6x5 grid**. Place tokens in the **center lane (C3)** of Rows 1-5.
2. Shuffle the **Technique Deck** (20 cards), **Obstacle Deck** (30 cards), **Penalty Deck** (24 cards), and **Trail Hazard** deck.
3. Place the **Trail Deck** (15 cards) in order — these define the 15-round course.
4. Each player starts with:
   - **Momentum: 2**
   - **Flow: 0**
   - **Hazard Dice: 0**
   - **Actions per Turn: 5**
   - **Commitment: Main Line**

---

## Game Structure

The game lasts **15 rounds**. Each round has 8 phases played in order:

### Phase 1: Scroll & Descent

1. Flip the next **Trail Card** — it becomes the active trail.
2. Queue the following trail card face-up (visible to all).
3. **Shift all tokens down 1 row** on every player's grid. A new token enters Row 1 matching the lane of the token that exited Row 6.
4. Clear any leftover obstacles from the previous round.

### Phase 2: Commitment

Each player chooses a **line** for this round:

| Line | Benefit | Restriction |
|------|---------|-------------|
| **Main Line** | +1 Progress when obstacles matched | Normal play |
| **Pro Line** | +2 Progress when obstacles matched | Cannot Brake; extra +1 Hazard Die on blow-by; draws penalty on blow-by |

### Phase 3: Environment

Draw a **Trail Hazard** card. All players' tokens are shifted according to the hazard effect (e.g., "Shift Rows 1-3 one lane Left").

### Phase 4: Preparation

Each player draws technique cards from the deck:

- **Draw count = Momentum** (minimum 2, maximum 6)

**Speed Trap**: If a player's Momentum exceeds the active Trail Card's **speed limit**, the excess is converted to Hazard Dice and Momentum is capped at the speed limit. Players must use Brake actions during the Sprint to manage their speed before the next round's Preparation phase.

### Phase 5: The Sprint

Players take turns in **standings order** — the player with the **highest progress (leader) goes first**. Each player gets **5 Actions** per turn.

#### Trail Read (Key Mechanic)

The leader draws obstacles **blind** from the deck. But every player behind them can **see** what the leader faced. This creates a stacking information advantage for trailing players:

- **Reuse a Revealed Obstacle**: Instead of drawing blind, a trailing player can choose to tackle an obstacle that a player ahead already revealed. Since they know exactly what symbols it requires, they can check their hand first — a major advantage.
- **Draw Fresh**: The player can instead draw a new obstacle from the deck (blind, like the leader). **However, once you draw fresh, you can no longer reuse revealed obstacles for the rest of your turn.**
- **Stacking Advantage**: The further back you are in standings, the more revealed obstacles you can see. Player 4 can see obstacles from Players 1, 2, and 3.

This makes going first a **disadvantage** — the leader blazes the trail blind while trailing players read the terrain.

#### Actions (cost 1 Action each unless noted):

| Action | Effect | Cost |
|--------|--------|------|
| **Pedal** | +1 Momentum | 1 Action |
| **Brake** | -1 Momentum | 1 Action |
| **Steer** | Move 1 token 1 lane left or right | 1 Action |
| **Play Technique Card** | Play a card from hand for its effect | 1 Action |
| **End Turn** | End your turn early | Free |

#### Free Actions (cost 0 Actions):

| Action | Effect |
|--------|--------|
| **Draw Obstacle** | Flip the top obstacle card face-up (locks you out of revealed pool) |
| **Reuse Obstacle** | Tackle a revealed obstacle from a player ahead (only before drawing fresh) |
| **Resolve Obstacle** | Match it with hand cards (including wilds) or take the blow-by penalty |
| **Send It** | Spend 2 Momentum to force-clear an active obstacle |

#### Flow Actions (spend Flow resource):

| Action | Flow Cost | Effect |
|--------|-----------|--------|
| **Ghost Copy** | 1 | Duplicate a card symbol to help match an obstacle |
| **Reroll** | 1 | Clear all hazard dice before the reckoning roll |
| **Brace** | 1 | Ignore one environmental hazard push this round |
| **Scrub** | 3 | Remove 1 Hazard Die from your pool |

### Phase 6: Alignment Check

Compare each player's token positions against the active Trail Card's target lanes.

- For each checked row: if the token is in the **target lane**, that row is a match.
- **Perfect Alignment** (all checked rows match): **+1 Flow**, counts as a perfect match for tiebreaking.
- Each **misaligned row**: **+1 Hazard Die**.

### Phase 7: The Reckoning

Each player rolls their accumulated **Hazard Dice** (max 5 rolled at once):

1. Roll each die (d6).
2. If **any die shows a 6**: draw a **Penalty Card**.
3. **Crash Check**: If a player had **6 or more Hazard Dice** accumulated:
   - All tokens reset to center (C3)
   - Draw 1 additional Penalty Card
   - Lose 3 Momentum
4. All Hazard Dice are cleared to 0.

### Phase 8: Stage Break (every 3 rounds)

After rounds 3, 6, 9, and 12:

1. **Last place** draws 2 extra cards (Regroup).
2. **Last place** gains +1 Flow (catch-up bonus).
3. Each player may **repair 1 Penalty Card** (discard it).
4. Players may **purchase Upgrades** from the shop using Flow.

---

## Technique Cards

There are 4 unique technique cards (5 copies each = 20 total). Each card has a **symbol** used for obstacle matching and an **action effect** when played.

| Card | Symbol | Effect When Played |
|------|--------|--------------------|
| **Inside Line** | Grip (red) | Ignore all Grip penalties this turn. **+2 Momentum.** |
| **Manual** | Air (blue) | Swap Row 1 and Row 2 tokens. **Draw 1 card** (draw 2 if they were in different lanes). |
| **Flick** | Agility (green) | Shift tokens in Rows 1-2 one lane toward center. **+1 Momentum.** |
| **Recover** | Balance (orange) | Remove 2 Hazard Dice (or repair 1 Penalty if at 0 dice). **Draw 1 card.** |

Playing a technique card costs **1 Action** and discards the card. The card's symbol is consumed — it cannot also be used to match an obstacle.

> **Design Note:** Every technique card generates momentum or draws cards when played, so no hand is ever dead weight. Playing cards for their effects is always productive, even when you can't match obstacles.

**Bonus Draw Cap:** A player can draw at most **3 bonus cards per turn** from technique card effects (Manual, Recover). This prevents runaway card-chaining.

### The Combo System

Playing multiple technique cards in a single turn triggers combo bonuses. This creates a strategic tension: **use a card now to match an obstacle, or hold it for a more powerful combo?**

#### Synergy (2 cards of the same symbol)

| Symbol Pair | Synergy Bonus |
|-------------|---------------|
| Grip x2 | +2 Momentum burst |
| Air x2 | Recover 1 Action (the second card is effectively free) |
| Agility x2 | Realign ALL tokens across all 6 rows toward center |
| Balance x2 | Clear ALL Hazard Dice |

#### Versatility (3 unique symbols in one turn)

- +1 Momentum

#### Mastery (4 unique symbols in one turn)

- Remove 2 Hazard Dice and repair 1 Penalty Card

#### Pro Line Combo Bonus

- Playing 2+ technique cards while on the Pro Line grants +1 Momentum.

---

## Obstacles

Obstacles are flipped face-up during the Sprint phase as a free action. Players must then resolve each obstacle before taking other actions.

### Matching an Obstacle

- Check the obstacle's required **symbols** and **match mode**.
- **"All" mode**: Player must discard cards matching ALL listed symbols (using different cards for each).
- **"Any" mode**: Player needs just ONE card matching any listed symbol.
- On success: **+1 Momentum**, **+1 Progress** (or +2 on Pro Line). Obstacle is discarded.

### "Forced Through" — Wild Matching

Any **2 cards of the same symbol** can substitute for **1 card of any other symbol** when matching obstacles. You're muscling through with raw technique even if it's not the ideal skill.

- Example: Need a Grip card but only have 2 Agility cards? Discard both Agility cards to match the Grip requirement.
- Multiple wilds can be stacked — 4 Balance cards could cover 2 different missing symbols.
- Wild matches consume 2 cards each, so they cost more hand resources than exact matches.

### "Send It" — Momentum-Powered Clear

Spend **2 Momentum** to force-clear any active obstacle, regardless of hand cards. This is a **free action** (no Action cost).

- On success: **+1 Progress** (or +2 on Pro Line). Obstacle is discarded and counts as cleared.
- **Does NOT grant** the usual +1 Momentum reward (you spent momentum, not cards).
- Useful when your hand can't match but you've built up speed.

### Blow-By (Failing to Match)

If you can't (or choose not to) match the obstacle:

1. **+1 Hazard Die** (always)
2. **-1 Momentum**
3. Apply the obstacle's specific **penalty effect**
4. If on **Pro Line**: +1 additional Hazard Die and draw a Penalty Card
5. **Crash Check**: If Hazard Dice reach 6+, you crash immediately (tokens reset to center, draw Penalty Card)

### Obstacle List

| Obstacle | Symbols | Mode | Penalty | Blow-By Effect |
|----------|---------|------|---------|----------------|
| Loose Scree | Grip | All | Slide Out | Row 1 shifts 2 lanes randomly |
| The Mud Bog | Grip | All | Heavy Drag | Lose 2 Momentum and 1 card |
| Double Jump | Air | All | Case It | Lose 2 Momentum |
| The 10ft Drop | Air | All | Bottom Out | Take 2 Hazard Dice instead of 1 |
| Tight Trees | Agility | All | Wide Turn | Row 1 shifts 1 lane from center |
| Rapid Berms | Agility | All | Whiplash | Shift Rows 2-3 one lane right |
| Log Skinny | Balance | All | Stall | Cannot Pedal this turn |
| Granite Slab | Balance | All | Locked | Row 1 token cannot move next turn |
| Rooty Drop | Grip, Air | Any | Wipeout | +2 Hazard Dice, end turn immediately |
| Slippery Berm | Grip, Agility | Any | Wash Out | Shift Rows 1-2 three lanes |

---

## Penalty Cards

Drawn when rolling a 6 during Reckoning or from Pro Line blow-by. Each represents mechanical damage. **2 copies** of each in the deck.

| Penalty | Effect |
|---------|--------|
| Bent Derailleur | Cannot use Pedal action |
| Snapped Brake | Cannot use Brake action |
| Tacoed Rim | Columns 1 and 5 are Locked (+1 Hazard Die if hit) |
| Blown Seals | Cannot use Flow to Ghost (copy) symbols |
| Dropped Chain | Max Momentum capped at 2 |
| Arm Pump | Max Actions reduced to 3 per turn |
| Slipped Pedal | Discard 2 random cards immediately |
| Loose Headset | Every Steer action adds +1 Hazard Die |
| Flat Tire | Must spend 2 Momentum to tackle any Obstacle |
| Muddy Goggles | Cannot see the Queued Trail Card |
| Stretched Cable | Must discard 1 card to Steer |
| Bent Bars | Row 3 and Row 4 tokens must move together |

---

## Upgrades (Shop)

Purchased during **Stage Break** phases using Flow. Each upgrade can only be purchased once per player.

| Upgrade | Flow Cost | Effect |
|---------|-----------|--------|
| High-Engagement Hubs | 3 | 1st Pedal action per turn costs 0 Actions |
| Oversized Rotors | 4 | 1 Brake action drops Momentum by 2 |
| Carbon Frame | 5 | Max Momentum = 12; Min Hand Size = 4 |
| Electronic Shifting | 5 | 1 Steer action per turn costs 0 Actions |
| Telemetry System | 6 | Look at top 3 Obstacles at turn start; keep 1 |
| Factory Suspension | 8 | Pro Line combos gain +2 Flow instead of 1 |

---

## Trail Cards

15 cards played in order, defining each round's course section. Each has:

- **Speed Limit**: Momentum is capped at this value each round during Preparation. Any excess converts to Hazard Dice. Players must brake during the Sprint to manage speed for upcoming trail sections.
- **Target Lanes**: Specific lanes (C1-C5) for checked rows. Used during Alignment to determine matches.

| # | Trail | Speed Limit | Checked Rows & Targets |
|---|-------|-------------|----------------------|
| 1 | Start Gate | 6 | R1:C3, R2:C3, R3:C3 |
| 2 | Right Hip | 4 | R1:C3, R2:C4, R3:C5, R4:C5 |
| 3 | Lower Bridge | 5 | R1:C5, R2:C4, R3:C3 |
| 4 | Rock Drop | 2 | R1:C3, R2:C3, R3:C3, R4:C3, R5:C3 |
| 5 | Berms (Left) | 3 | R1:C3, R2:C2, R3:C1, R4:C1 |
| 6 | The Tabletop | 6 | R1:C1, R2:C2, R3:C3 |
| 7 | Shark Fin | 4 | R1:C3, R2:C3, R3:C4, R4:C5, R5:C5 |
| 8 | Ski Jumps | 5 | R1:C5, R2:C4, R3:C3 |
| 9 | Moon Booter | 5 | R1:C3, R2:C3, R3:C3, R4:C3, R5:C3 |
| 10 | Merchant Link | 4 | R1:C3, R2:C3, R3:C2, R4:C1 |
| 11 | Tech Woods | 2 | R1:C1, R2:C1, R3:C2, R4:C3, R5:C3 |
| 12 | Brake Bumps | 3 | R1:C3, R2:C4, R3:C2, R4:C4 |
| 13 | Tombstone | 4 | R1:C3, R2:C4, R3:C3, R4:C2 |
| 14 | High Berms | 4 | R1:C1, R2:C1, R3:C1 |
| 15 | Hero Shot | 6 | R1:C3, R2:C3, R3:C3, R4:C3, R5:C3 |

---

## Trail Hazards

Drawn during the Environment phase. Each affects specific rows on all players' grids.

| Hazard | Rows Affected | Direction | Effect |
|--------|--------------|-----------|--------|
| Camber Left | 1, 2, 3 | Left | Shift tokens 1 lane left |
| Camber Right | 1, 2, 3 | Right | Shift tokens 1 lane right |
| Brake Bumps | 1, 2 | Edge | Shift toward nearest edge |
| Compression | 3, 4 | Center | Shift toward center |
| Loose Dirt | 5, 6 | Random | Shift 1 lane in random direction |

---

## Key Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Rounds per game | 15 | Fixed course length |
| Actions per turn | 5 | Reset each sprint |
| Starting Momentum | 2 | |
| Max Momentum | 12 | Hard cap (also capped per trail card speed limit) |
| Min card draw | 2 | Floor on preparation draw |
| Max card draw | 6 | Cap on preparation draw |
| Crash threshold | 6 | Hazard Dice count triggering a crash |
| Hazard dice rolled | min(5, dice) | Max 5 rolled during Reckoning |
| Reckoning penalty trigger | Roll a 6 | On any die |
| Crash momentum penalty | -3 | Lost on crash |
| Turn order | Leader first | Highest progress goes first each sprint |
| Stage Break interval | Every 3 rounds | Rounds 3, 6, 9, 12 |
| Technique deck size | 20 | 4 cards x 5 copies |
| Obstacle deck size | 30 | 10 types x 3 copies |
| Penalty deck size | 24 | 12 types x 2 copies |

---

## Winning the Game

After 15 rounds, the player with the most **obstacles cleared** wins.

**Tiebreakers** (in order):
1. Most progress points
2. Most perfect alignment matches
3. Fewest penalty cards
4. Most Flow remaining
5. Highest Momentum

---

## Card Data Files

All card definitions are stored as CSV files in the `data/` directory for easy editing and import into card creation tools:

| File | Contents |
|------|----------|
| `data/technique-cards.csv` | Technique card names, symbols, effects, copy counts |
| `data/obstacles.csv` | Obstacle names, required symbols, match modes, penalties |
| `data/penalties.csv` | Penalty card names and effects |
| `data/upgrades.csv` | Upgrade names, Flow costs, and effects |
| `data/trail-cards.csv` | Trail card names, speed limits, and target lanes |
| `data/trail-hazards.csv` | Hazard names, affected rows, and shift directions |

To modify cards, edit the CSV files and the corresponding definitions in `src/lib/cards.ts`.
