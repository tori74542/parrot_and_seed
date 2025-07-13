export const BALL_SPAWN_INTERVAL = 3000; // ms, Initial spawn interval.
export const MIN_BALL_SPAWN_INTERVAL = 500; // ms, The fastest possible spawn rate.

// Scoring constants
export const CLEAR_BONUS_POINTS = 100; // Points for seeds cleared by a 'clear' seed

// Difficulty settings table. Defines how the game's difficulty scales with the level.
export const difficultyTiers = [
    // For levels 1-5, a gentle introduction.
    {
        levelCap: 5,
        getSpeedIncrease: (level) => 0.05,
        getSpawnIntervalReduction: (level) => 300 // ms
    },
    // For levels 6-10, the difficulty ramps up.
    {
        levelCap: 10,
        getSpeedIncrease: (level) => 0.10,
        getSpawnIntervalReduction: (level) => 200 // ms
    },
    // For levels 11-15, a slight breather.
    {
        levelCap: 15,
        getSpeedIncrease: (level) => 0.10,
        getSpawnIntervalReduction: (level) => 50 // ms
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
        }
    },
    // For levels 31 and above, the difficulty increase is minimal (soft cap).
    {
        levelCap: Infinity,
        getSpeedIncrease: (level) => 0.02,
        getSpawnIntervalReduction: (level) => 10 // ms
    }
];