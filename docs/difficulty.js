// seed frequency constants
export const BALL_SPAWN_INTERVAL = 2500; // ms, Initial spawn interval.
export const MIN_BALL_SPAWN_INTERVAL = 100; // ms, The fastest possible spawn rate.
export const BALL_SPAWN_VARIATION_RATIO = 0.5; // The range of spawn time variation as a ratio of the mean (e.g., 0.5 means +/- 50%).

// Seed speed constants
export const MEAN_BALL_SPEED_GRIDS = 0.04; // The average speed of a seed.
export const MIN_BALL_SPEED_GRIDS = 0.02; // The absolute minimum speed for a seed, to prevent it from going upwards.
export const BALL_SPEED_VARIATION_RATIO = 1.5; // The range of speed variation as a ratio of the mean (e.g., 2.0 means +/- 200%).

// Tongue speed constants
export const INITIAL_TONGUE_SPEED = 0.5; // The initial speed of the tongue.
export const TONGUE_RETRACT_SPEED = 3.0; // The speed at which the tongue retracts.

// Player movement constants
export const INITIAL_PLAYER_MOVE_INTERVAL = 70; // ms, The initial interval for player movement.

// Scoring constants
export const CLEAR_BONUS_POINTS = 100; // Points for seeds cleared by a 'clear' seed

// Difficulty settings table. Defines how the game's difficulty scales with the level.
export const difficultyTiers = [
    // For levels 1-5, a gentle introduction.
    {
        levelCap: 3,
        getSpeedIncrease: (level) => 0.05,
        getSpawnIntervalReduction: (level) => 700, // ms
        getTongueSpeedIncrease: (level) => 0.08,
        getPlayerMoveIntervalReduction: (level) => 5 // ms
    },
    // For levels 6-10, the difficulty ramps up.
    {
        levelCap: 10,
        getSpeedIncrease: (level) => 0.10,
        getSpawnIntervalReduction: (level) => 60, // ms
        getTongueSpeedIncrease: (level) => 0.02,
        getPlayerMoveIntervalReduction: (level) => 2 // ms
    },
    // For levels 11-15, a slight breather.
    {
        levelCap: 15,
        getSpeedIncrease: (level) => 0.10,
        getSpawnIntervalReduction: (level) => 60, // ms
        getTongueSpeedIncrease: (level) => 0.00,
        getPlayerMoveIntervalReduction: (level) => 0 // ms
    },
    // For levels 16-30, use a logarithmic curve for both speed and spawn rate.
    // The increase/reduction amount gets smaller as the level gets higher.
    {
        levelCap: 30,
        getSpeedIncrease: (level) => {
            const startLevelOfTier = 16;
            const scale = 0.5; // Adjust this to control the curve's flatness.
            return scale / (level - startLevelOfTier + 1);
        },
        getSpawnIntervalReduction: (level) => {
            const startLevelOfTier = 16;
            const scale = 100; // Base reduction amount
            return scale / (level - startLevelOfTier + 1);
        },
        getTongueSpeedIncrease: (level) => 0.00,
        getPlayerMoveIntervalReduction: (level) => 0.00
    },
    // For levels 31 and above, the difficulty increase is minimal (soft cap).
    {
        levelCap: Infinity,
        getSpeedIncrease: (level) => 0.02,
        getSpawnIntervalReduction: (level) => 10, // ms
        getTongueSpeedIncrease: (level) => 0.01,
        getPlayerMoveIntervalReduction: (level) => 0 // ms
    }
];

// Scoring tiers based on height.
export const scoreTiers = [
    { heightThreshold: 4, points: 1000 },
    { heightThreshold: 6, points: 800 },
    { heightThreshold: 8, points: 400 },
    { heightThreshold: 12, points: 200 },
    { heightThreshold: 18, points: 100 },
    { heightThreshold: 999, points: 50 }
];