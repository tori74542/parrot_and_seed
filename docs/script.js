import { generateNormalRandom } from './utils.js';
import {
    difficultyTiers,
    BALL_SPAWN_INTERVAL,
    MIN_BALL_SPAWN_INTERVAL,
    BALL_SPAWN_VARIATION_RATIO,
    MEAN_BALL_SPEED_GRIDS,
    MIN_BALL_SPEED_GRIDS,
    BALL_SPEED_VARIATION_RATIO,
    INITIAL_TONGUE_SPEED,
    TONGUE_RETRACT_SPEED,
    INITIAL_PLAYER_MOVE_INTERVAL,
    CLEAR_BONUS_POINTS,
    scoreTiers
} from './difficulty.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Debug
let DEBUG_MODE = false; // Set to true to show collision boxes. Can be toggled with the 'd' key.

// Grid constants
const GRID_SIZE = 15;
const SCREEN_WIDTH_GRIDS = 30;
const SCREEN_HEIGHT_GRIDS = 22;
canvas.width = SCREEN_WIDTH_GRIDS * GRID_SIZE;
canvas.height = SCREEN_HEIGHT_GRIDS * GRID_SIZE;

// Game constants
const GROUND_Y_GRIDS = SCREEN_HEIGHT_GRIDS - 1;
const CHAR_SIZE_GRIDS = 1;
const CHAR_SPEED_GRIDS = 0.5;
const TONGUE_WIDTH_GRIDS = 0.2;
const TONGUE_TIP_COLLISION_RADIUS_GRIDS = 0.6; // Adjust this value to make collision easier
const BALL_SIZE_GRIDS = 1;
const INITIAL_LEVEL = 1; // For debugging, set initial game level
const POINTS_PER_LEVEL = 5000; // Points required to gain one level

// Fireworks constants
const FIREWORKS_THRESHOLD_POINTS = 1000; // Points required to trigger fireworks
const FIREWORKS_PARTICLE_COUNT = 20; // Number of particles in a fireworks effect
const FIREWORKS_PARTICLE_LIFETIME = 1000; // ms
const FIREWORKS_PARTICLE_SPEED = 0.05; // Grids per frame



// Animation constants
const PLAYER_SPRITE_WIDTH = 128;
const PLAYER_SPRITE_HEIGHT = 128;
const PLAYER_WALK_FRAMES = 10;
const PLAYER_ANIMATION_SPEED = 100; // ms per frame
const PLAYER_DRAW_SCALE = 2.0;
const PLAYER_Y_OFFSET_GRIDS = 0.25; // プレイヤー描画時のY軸オフセット

// Seed sprite constants
const SEED_SPRITE_FRAME_WIDTH = 32;
const SEED_SPRITE_FRAME_HEIGHT = 32;
const SEED_DRAW_SCALE = 1.5;

// Game state using a phase machine
const gameState = {
    score: 0,
    gameSpeedMultiplier: 1,
    level: 1,
    phase: 'title', // 'title', 'playing', 'dying', 'gameOver'
    lastAnimationTime: 0,
    nextSpawnTime: 0, // Time when the next ball should spawn
    ballSpawnInterval: BALL_SPAWN_INTERVAL,
    tongueSpeed: INITIAL_TONGUE_SPEED, // Initial tongue speed
    playerMoveInterval: INITIAL_PLAYER_MOVE_INTERVAL // Initial player move interval
};

// --- Web Audio API Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();
const audioBuffers = {}; // To store decoded audio data

// Player sprite
const playerSpriteRight = new Image();
playerSpriteRight.src = 'assets/images/parrot_right.png';

const playerSpriteLeft = new Image();
playerSpriteLeft.src = 'assets/images/parrot_left.png';

const seedSprites = {
    normal: new Image(),
    repair: new Image(),
    clear: new Image()
};
seedSprites.normal.src = 'assets/images/seed.png';
seedSprites.repair.src = 'assets/images/seed_repair.png';
seedSprites.clear.src = 'assets/images/seed_clear.png';

// Background Image (for testing)
const backgroundImage = new Image();
backgroundImage.src = 'assets/images/background.png'; // Create a 450x330px image with this name

// Player
const player = {
    xGrids: SCREEN_WIDTH_GRIDS / 2 - CHAR_SIZE_GRIDS / 2,
    yGrids: GROUND_Y_GRIDS - CHAR_SIZE_GRIDS,
    widthGrids: CHAR_SIZE_GRIDS,
    heightGrids: CHAR_SIZE_GRIDS,
    dxGrids: 0,
    direction: 1, // 1 for right, -1 for left
    currentFrame: 0
};

// Tongue
const tongue = {
    xGrids: 0, // Base X (player's mouth)
    yGrids: 0, // Base Y (player's mouth)
    currentLength: 0,
    isExtending: false,
    isRetracting: false,
    direction: 1, // 1 for right, -1 for left
    tipXGrids: 0,
    tipYGrids: 0
};
// Balls
const balls = [];
const caughtSeeds = [];
const floatingScores = [];
const fireworks = []; // To store active fireworks particles
// Holes
const holes = []; // Stores x-grid positions of holes
const fallingBlocks = []; // Stores blocks falling to repair holes
const repairQueue = []; // Stores x-coordinates of holes queued for repair

// Keyboard input
const keys = {
    right: false,
    left: false
};

/**
 * --- Action Handlers ---
 * These functions centralize player actions, allowing them to be triggered
 * by both keyboard and touch controls.
 */
function startMoveLeft() {
    if (gameState.phase !== 'playing' || tongue.isExtending || tongue.isRetracting) return;
    keys.left = true;
}

function stopMoveLeft() {
    keys.left = false;
}

function startMoveRight() {
    if (gameState.phase !== 'playing' || tongue.isExtending || tongue.isRetracting) return;
    keys.right = true;
}

function stopMoveRight() {
    keys.right = false;
}

function playSound(buffer, volume = 1.0) {
    // Do nothing if the buffer isn't loaded or the context is not running
    if (!buffer || !audioContext || audioContext.state === 'suspended') {
        return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    // Create a GainNode to control the volume
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

    // Connect the nodes and play the sound
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function handleFirstInteraction() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
        console.log("AudioContext resumed.");
    }
}

function extendTongue() {
    if (gameState.phase !== 'playing') return;
    if (!tongue.isExtending && !tongue.isRetracting) {
        tongue.isExtending = true;
        tongue.direction = player.direction;
        playSound(audioBuffers.tongue, 0.5);
    }
}

function retractTongue() {
    if (tongue.isExtending) {
        tongue.isExtending = false;
        tongue.isRetracting = true;
    }
}

function keyDown(e) {
    switch (gameState.phase) {
        case 'title':
            handleFirstInteraction();
            gameState.phase = 'playing';
            // Spawning is now handled by the main game loop (updateGameLogic)
            break;
        case 'gameOver':
            handleFirstInteraction();
            resetGame();
            break;
        case 'playing':
            const key = e.key.toLowerCase();
            if (key === 'arrowright' || key === 'right' || key === 'c') {
                startMoveRight();
            } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
                startMoveLeft();
            } else if (key === 'd') { // 'd' for debug
                DEBUG_MODE = !DEBUG_MODE;
                console.log(`Debug mode toggled to: ${DEBUG_MODE}`);
            } else if (e.key.toLowerCase() === 'enter') {
                extendTongue();
            }
            break;
    }
}

function keyUp(e) {
    if (gameState.phase !== 'playing') return; // Only handle keyUp during gameplay
    const key = e.key.toLowerCase();
    if (key === 'arrowright' || key === 'right' || key === 'c') {
        stopMoveRight();
    } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
        stopMoveLeft();
    } else if (e.key.toLowerCase() === 'enter') {
        retractTongue();
    }
}

document.addEventListener('keydown', keyDown);
document.addEventListener('keyup', keyUp);



function spawnBall() {
    const rand = Math.random();
    let ballType;
    if (rand < 0.05) { // 5% chance for a clear ball
        ballType = 'clear';
    } else if (rand < 0.20) { // 15% chance for a repair ball
        ballType = 'repair';
    } else { // 80% chance for a normal ball
        ballType = 'normal';
    }
    const ball = {
        xGrids: Math.floor(Math.random() * (SCREEN_WIDTH_GRIDS - BALL_SIZE_GRIDS)),
        yGrids: 0,
        widthGrids: BALL_SIZE_GRIDS,
        heightGrids: BALL_SIZE_GRIDS,
        type: ballType,
        animationFrame: 0,
        animationSequenceIndex: 0,
        lastAnimationTime: 0,
        speed: (() => {
            const variation = MEAN_BALL_SPEED_GRIDS * BALL_SPEED_VARIATION_RATIO;
            const stdDev = variation / 2;
            const randomNormal = generateNormalRandom() * stdDev + MEAN_BALL_SPEED_GRIDS;

            // Clamp the value to the intended variation range first.
            const intendedMinSpeed = MEAN_BALL_SPEED_GRIDS - variation;
            const intendedMaxSpeed = MEAN_BALL_SPEED_GRIDS + variation;
            const clampedSpeed = Math.max(intendedMinSpeed, Math.min(randomNormal, intendedMaxSpeed));

            // Finally, ensure the speed does not fall below the absolute minimum.
            return Math.max(MIN_BALL_SPEED_GRIDS, clampedSpeed);
        })()
    };
    balls.push(ball);
}

// --- Drawing ---
function gridToPx(gridValue) {
    return gridValue * GRID_SIZE;
}

function drawPlayer() {
    let currentSprite = playerSpriteRight;
    if (player.direction === -1) {
        currentSprite = playerSpriteLeft;
    }

    const sx = player.currentFrame * PLAYER_SPRITE_WIDTH;
    const sy = 0; // Always 0 as sprites are now single row

    // Calculate scaled dimensions for drawing
    const baseWidthPx = gridToPx(player.widthGrids);
    const baseHeightPx = gridToPx(player.heightGrids);
    const drawWidthPx = baseWidthPx * PLAYER_DRAW_SCALE;
    const drawHeightPx = baseHeightPx * PLAYER_DRAW_SCALE;

    // Adjust position to keep the character centered on its logical position
    const xOffset = (drawWidthPx - baseWidthPx) / 2;
    const yOffset = (drawHeightPx - baseHeightPx) / 2;
    const drawX = gridToPx(player.xGrids) - xOffset;
    const drawY = gridToPx(player.yGrids) - yOffset - gridToPx(PLAYER_Y_OFFSET_GRIDS);

    ctx.drawImage(currentSprite, sx, sy, PLAYER_SPRITE_WIDTH, PLAYER_SPRITE_HEIGHT, drawX, drawY, drawWidthPx, drawHeightPx);

    // Draw collision box in debug mode
    if (DEBUG_MODE) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(gridToPx(player.xGrids), gridToPx(player.yGrids), gridToPx(player.widthGrids), gridToPx(player.heightGrids));
    }
}

function drawGround() {
    const groundBlockColor = '#62614C';
    const groundBlockBorder = '#030000';

    for (let x = 0; x < SCREEN_WIDTH_GRIDS; x++) {
        if (holes.includes(x)) {
            continue; // Skip drawing this block to create a hole.
        }

        ctx.fillStyle = groundBlockColor;
        ctx.fillRect(gridToPx(x), gridToPx(GROUND_Y_GRIDS), GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = groundBlockBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(gridToPx(x), gridToPx(GROUND_Y_GRIDS), GRID_SIZE, GRID_SIZE);
    }
}

function drawTongue() {
    if (tongue.isExtending || tongue.isRetracting || tongue.currentLength > 0) {
        ctx.save(); // Save the current drawing state

        const tongueWidthPx = gridToPx(TONGUE_WIDTH_GRIDS);
        const outlineWidthPx = tongueWidthPx + 2; // Outline is 2px wider

        // To make the tongue look more organic, set the line caps to round.
        ctx.lineCap = 'round';

        // 1. Draw the black outline first
        ctx.strokeStyle = 'black';
        ctx.lineWidth = outlineWidthPx;
        ctx.beginPath();
        ctx.moveTo(gridToPx(tongue.xGrids), gridToPx(tongue.yGrids));
        ctx.lineTo(gridToPx(tongue.tipXGrids), gridToPx(tongue.tipYGrids));
        ctx.stroke();

        // 2. Draw the inner color on top
        ctx.strokeStyle = '#FF8D8B'; // The main color of the tongue
        ctx.lineWidth = tongueWidthPx;
        ctx.beginPath();
        ctx.moveTo(gridToPx(tongue.xGrids), gridToPx(tongue.yGrids));
        ctx.lineTo(gridToPx(tongue.tipXGrids), gridToPx(tongue.tipYGrids));
        ctx.stroke();

        ctx.restore(); // Restore the drawing state (resets lineCap, etc.)

        // Draw tongue tip collision point in debug mode
        if (DEBUG_MODE) {
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(gridToPx(tongue.tipXGrids), gridToPx(tongue.tipYGrids), gridToPx(TONGUE_WIDTH_GRIDS * 2), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function moveTongue() {
    // Set tongue base to player's mouth
    tongue.xGrids = player.xGrids + player.widthGrids / 2;
    tongue.yGrids = player.yGrids + player.heightGrids / 2;

    if (tongue.isExtending) {
        tongue.currentLength += gameState.tongueSpeed * gameState.gameSpeedMultiplier;

        // Check if tongue tip hits screen boundaries
        if (tongue.tipXGrids < 0 || tongue.tipXGrids > SCREEN_WIDTH_GRIDS || tongue.tipYGrids < 0) {
            tongue.isExtending = false;
            tongue.isRetracting = true;
        }
    } else if (tongue.isRetracting) {
        tongue.currentLength -= TONGUE_RETRACT_SPEED;
        if (tongue.currentLength <= 0) {
            tongue.currentLength = 0;
            tongue.isRetracting = false;
            // Clear caught seeds when tongue is fully retracted
            caughtSeeds.length = 0;
        }
    }

    // Calculate tongue tip position based on angle
    const angle = Math.PI / 4; // 45 degrees
    if (tongue.direction === 1) { // Right
        tongue.tipXGrids = tongue.xGrids + tongue.currentLength * Math.cos(angle);
        tongue.tipYGrids = tongue.yGrids - tongue.currentLength * Math.sin(angle);
    } else { // Left
        tongue.tipXGrids = tongue.xGrids - tongue.currentLength * Math.cos(angle);
        tongue.tipYGrids = tongue.yGrids - tongue.currentLength * Math.sin(angle);
    }
}

function drawCaughtSeeds() {
    caughtSeeds.forEach(seed => {
        const spriteToDraw = seedSprites[seed.type] || seedSprites.normal;

        const sx = seed.animationFrame * SEED_SPRITE_FRAME_WIDTH;
        const sy = 0;
        const drawWidth = gridToPx(seed.widthGrids) * SEED_DRAW_SCALE;
        const drawHeight = gridToPx(seed.heightGrids) * SEED_DRAW_SCALE;
        // Draw the seed at the tip of the tongue
        const x = gridToPx(tongue.tipXGrids) - drawWidth / 2;
        const y = gridToPx(tongue.tipYGrids) - drawHeight / 2;
        ctx.drawImage(spriteToDraw, sx, sy, SEED_SPRITE_FRAME_WIDTH, SEED_SPRITE_FRAME_HEIGHT, x, y, drawWidth, drawHeight);
    });
}

function drawBalls() {
    balls.forEach(ball => {
        const spriteToDraw = seedSprites[ball.type] || seedSprites.normal;

        const sx = ball.animationFrame * SEED_SPRITE_FRAME_WIDTH;
        const sy = 0;
        const drawWidth = gridToPx(ball.widthGrids) * SEED_DRAW_SCALE;
        const drawHeight = gridToPx(ball.heightGrids) * SEED_DRAW_SCALE;
        const x = gridToPx(ball.xGrids) - (drawWidth - gridToPx(ball.widthGrids)) / 2;
        const y = gridToPx(ball.yGrids) - (drawHeight - gridToPx(ball.heightGrids)) / 2;
        ctx.drawImage(spriteToDraw, sx, sy, SEED_SPRITE_FRAME_WIDTH, SEED_SPRITE_FRAME_HEIGHT, x, y, drawWidth, drawHeight);

        // Draw collision box in debug mode
        if (DEBUG_MODE) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(gridToPx(ball.xGrids), gridToPx(ball.yGrids), gridToPx(ball.widthGrids), gridToPx(ball.heightGrids));
        }
    });
}

// drawHoles() is now handled inside drawGround()

function drawScore() {
    ctx.globalAlpha = 1; // Ensure full opacity for main score
    // Set color based on game phase
    ctx.fillStyle = (gameState.phase === 'gameOver') ? 'white' : 'black';
    ctx.font = '20px "DotGothic16"';
    ctx.textAlign = 'center'; // Explicitly set alignment for centering

    const paddedScore = gameState.score.toString().padStart(6, '0');
    const scoreText = `${paddedScore}`;

    // 中央のX座標を指定
    const centerX = canvas.width / 2;
    const displayY = 30;

    ctx.fillText(scoreText, centerX, displayY);

    // Reset textAlign to avoid affecting other drawing functions
    ctx.textAlign = 'left';
}

function drawDebugInfo(currentTime) {
    if (!DEBUG_MODE) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; // Red for debug text
    ctx.font = '12px "DotGothic16"';
    ctx.textAlign = 'right';

    // Only update the spawn timer during the 'playing' phase to prevent it from
    // running on the title or game over screens.
    let timeToNextSpawn = 0;
    if (gameState.phase === 'playing') {
        timeToNextSpawn = gameState.nextSpawnTime - currentTime;
    }
    const currentMeanSpeed = MEAN_BALL_SPEED_GRIDS * gameState.gameSpeedMultiplier;
    const currentVariation = currentMeanSpeed * BALL_SPEED_VARIATION_RATIO;

    ctx.fillText(`Level: ${gameState.level}`, canvas.width - 10, 15);
    ctx.fillText(`Player Interval: ${gameState.playerMoveInterval.toFixed(1)}ms`, canvas.width - 10, 29);
    ctx.fillText(`Seed Spd: ${currentMeanSpeed.toFixed(3)} ±${currentVariation.toFixed(3)}`, canvas.width - 10, 43);
    ctx.fillText(`PlayerX: ${player.xGrids.toFixed(2)}`, canvas.width - 10, 57);
    const spawnTimerText = `Avg Spawn: ${gameState.ballSpawnInterval.toFixed(0)}ms`;
    ctx.fillText(spawnTimerText, canvas.width - 10, 71);
    ctx.fillText(`Tongue Spd: ${gameState.tongueSpeed.toFixed(3)}`, canvas.width - 10, 85);
    ctx.textAlign = 'left'; // Reset to default
}

function drawTitleScreen() {
    // This function is called only when gameState.phase is 'title'
    ctx.fillStyle = 'black';
    ctx.font = '16px "DotGothic16"'; // Smaller font for instructions
    ctx.textAlign = 'center';

    const lineHeight = 25;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.fillText('右: C or →', centerX, centerY - lineHeight);
    ctx.fillText('左: Z or ←', centerX, centerY);
    ctx.fillText('舌: Enter  ', centerX, centerY + lineHeight);
}

function drawGameOverScreen() {
    // This function is called only when gameState.phase is 'gameOver'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '20px "DotGothic16"';
    ctx.textAlign = 'center';
    ctx.fillText('game over', canvas.width / 2, canvas.height / 2);
}

function drawFloatingScores() {
    const FADE_DURATION = 1000; // 1 second
    const originalGlobalAlpha = ctx.globalAlpha; // Save original alpha
    const originalTextAlign = ctx.textAlign; // Save original textAlign
    const originalTextBaseline = ctx.textBaseline; // Save original textBaseline

    for (let i = floatingScores.length - 1; i >= 0; i--) {
        const fs = floatingScores[i];
        const elapsedTime = performance.now() - fs.startTime;

        if (elapsedTime > FADE_DURATION) {
            floatingScores.splice(i, 1);
            continue;
        }

        const alpha = 1 - (elapsedTime / FADE_DURATION); // Fade out
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'black';
        ctx.font = 'bold 12px "DotGothic16"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Slightly move up as it fades
        const offsetY = elapsedTime / FADE_DURATION * 20; // Move up 20px

        ctx.fillText(fs.text, gridToPx(fs.x + BALL_SIZE_GRIDS / 2), gridToPx(fs.y + BALL_SIZE_GRIDS / 2) - offsetY);
    }
    ctx.globalAlpha = originalGlobalAlpha; // Restore original alpha
    ctx.textAlign = originalTextAlign; // Restore original textAlign
    ctx.textBaseline = originalTextBaseline; // Restore original textBaseline
}

function drawScoreTiers() {
    if (!DEBUG_MODE || scoreTiers.length === 0) {
        return;
    }

    ctx.save(); // Save the current drawing state

    ctx.setLineDash([5, 3]); // Set to a dashed line
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Red, semi-transparent
    ctx.lineWidth = 1;
    ctx.font = 'bold 12px "DotGothic16"';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'; // Red, semi-transparent
    ctx.textAlign = 'left';

    for (const tier of scoreTiers) {
        const y = gridToPx(tier.heightThreshold);

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
        ctx.fillText(`${tier.points} pts`, 5, y - 4);
    }

    ctx.restore(); // Restore to the original drawing state
}

function drawFireworks() {
    for (let i = fireworks.length - 1; i >= 0; i--) {
        const p = fireworks[i];
        ctx.globalAlpha = p.life / p.maxLife; // Fade out
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(gridToPx(p.x), gridToPx(p.y), 2, 0, Math.PI * 2); // Draw small circles
        ctx.fill();
    }
    ctx.globalAlpha = 1; // Reset alpha
}
    function updateFireworks() {
    for (let i = fireworks.length - 1; i >= 0; i--) {
        const p = fireworks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1000 / 60; // Assuming 60 FPS
        if (p.life <= 0) {
            fireworks.splice(i, 1);
        }
    }
}

function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// --- Updates & Collision ---
function movePlayer() {
    if (player.dxGrids === 0) return;

    const newXGrids = player.xGrids + player.dxGrids;

    // Hole collision
    let collision = false;
    for (const holeX of holes) {
        if (newXGrids < holeX + BALL_SIZE_GRIDS && newXGrids + player.widthGrids > holeX) {
            collision = true;
            break;
        }
    }

    if (!collision) {
        player.xGrids = newXGrids;
    }

    // Wall detection
    if (player.xGrids + player.widthGrids > SCREEN_WIDTH_GRIDS) {
        player.xGrids = SCREEN_WIDTH_GRIDS - player.widthGrids;
    }
    if (player.xGrids < 0) {
        player.xGrids = 0;
    }
}



const animationSequence = [0, 1, 1, 0, 2, 2];

function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        ball.yGrids += ball.speed * gameState.gameSpeedMultiplier;

        if (performance.now() - ball.lastAnimationTime > 300) { // 100ms interval for animation
            ball.animationSequenceIndex = (ball.animationSequenceIndex + 1) % animationSequence.length;
            ball.animationFrame = animationSequence[ball.animationSequenceIndex];
            ball.lastAnimationTime = performance.now();
        }

        if (ball.yGrids + ball.heightGrids >= GROUND_Y_GRIDS) {
            const holeX = Math.floor(ball.xGrids);
            // Prevent duplicate holes at the same grid location
            if (!holes.includes(holeX)) {
                holes.push(holeX);
            }
            balls.splice(i, 1);
        }
    }
}

function getPointsForHeight(yPos) {
    // Find the correct score tier based on the loaded configuration
    for (const tier of scoreTiers) {
        if (yPos < tier.heightThreshold) {
            return tier.points;
        }
    }
    return 0; // Default score if no tier is matched
}

function findClosestHole(targetX, holeArray) {
    if (holeArray.length === 0) return null;

    let closestHoleX = null;
    let minDistance = Infinity;

    for (const holeX of holeArray) {
        const distance = Math.abs(targetX - holeX);
        if (distance < minDistance) {
            minDistance = distance;
            closestHoleX = holeX;
        }
    }
    return closestHoleX;
}

function checkCollisions() {
    // Tongue-Ball collision
    if (tongue.isExtending && scoreTiers.length > 0) {
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];

            // Calculate distance between tongue tip and ball center
            const ballCenterX = ball.xGrids + ball.widthGrids / 2;
            const ballCenterY = ball.yGrids + ball.heightGrids / 2;
            const distance = Math.sqrt(Math.pow(tongue.tipXGrids - ballCenterX, 2) + Math.pow(tongue.tipYGrids - ballCenterY, 2));

            // Check for collision using distance and combined radii
            const ballRadiusApprox = Math.sqrt(Math.pow(ball.widthGrids / 2, 2) + Math.pow(ball.heightGrids / 2, 2));
            if (distance < TONGUE_TIP_COLLISION_RADIUS_GRIDS + ballRadiusApprox) {
                // 2. Add score based on height
                const points = getPointsForHeight(ball.yGrids);
                gameState.score += points;
                floatingScores.push({
                    text: `+${points}`,
                    x: ball.xGrids,
                    y: ball.yGrids,
                    startTime: performance.now()
                });

                // --- Common logic for any caught seed ---
                // 1. Play sound effect
                if (points >= FIREWORKS_THRESHOLD_POINTS) {
                    playSound(audioBuffers.score_high, 0.5);
                } else {
                    playSound(audioBuffers.catch, 0.5);
                }

                // Trigger fireworks if points are high enough
                if (points >= FIREWORKS_THRESHOLD_POINTS) {
                    for (let j = 0; j < FIREWORKS_PARTICLE_COUNT; j++) {
                        fireworks.push({
                            x: ball.xGrids + ball.widthGrids / 2,
                            y: ball.yGrids + ball.heightGrids / 2,
                            vx: (Math.random() - 0.5) * FIREWORKS_PARTICLE_SPEED * 2,
                            vy: (Math.random() - 0.5) * FIREWORKS_PARTICLE_SPEED * 2,
                            life: FIREWORKS_PARTICLE_LIFETIME,
                            maxLife: FIREWORKS_PARTICLE_LIFETIME,
                            color: `hsl(${Math.random() * 360}, 100%, 50%)` // Random color
                        });
                    }
                }

                // 3. Move the ball to the caughtSeeds array
                const caughtSeed = balls.splice(i, 1)[0];
                caughtSeeds.push(caughtSeed);

                // 4. Handle type-specific logic
                if (caughtSeed.type === 'clear') {
                    // For 'clear' seeds, iterate over the remaining seeds on screen
                    const remainingBalls = [...balls]; // Create a copy to iterate over
                    balls.length = 0; // Clear the original array immediately

                    for (const b of remainingBalls) {
                        // Add the fixed bonus points for each cleared seed
                        gameState.score += CLEAR_BONUS_POINTS;
                        // Show floating score, but do NOT play sound
                        floatingScores.push({
                            text: `+${CLEAR_BONUS_POINTS}`,
                            x: b.xGrids,
                            y: b.yGrids,
                            startTime: performance.now()
                        });
                    }

                    // --- Hole Repair Logic ---
                    // Repair a number of holes equal to the number of other seeds cleared.
                    let holesToRepairCount = remainingBalls.length;
                    const availableHoles = [...holes]; // Create a mutable copy of current holes

                    while (holesToRepairCount > 0 && availableHoles.length > 0) {
                        const playerCenterX = player.xGrids + player.widthGrids / 2;
                        // Find the closest hole from the available ones
                        const closestHoleX = findClosestHole(playerCenterX, availableHoles);

                        if (closestHoleX !== null) {
                            // Add to repair queue if not already queued
                            if (!repairQueue.includes(closestHoleX)) {
                                repairQueue.push(closestHoleX);
                            }
                            // Remove from available holes to prevent re-selection
                            const indexToRemove = availableHoles.indexOf(closestHoleX);
                            availableHoles.splice(indexToRemove, 1);
                        }
                        holesToRepairCount--;
                    }

                } else if (caughtSeed.type === 'repair') {
                    if (holes.length > 0) {
                        const playerCenterX = player.xGrids + player.widthGrids / 2;
                        const holeToRepairX = findClosestHole(playerCenterX, holes);
                        if (holeToRepairX !== null) {
                            if (!repairQueue.includes(holeToRepairX)) {
                                repairQueue.push(holeToRepairX);
                            }
                        }
                    }
                }

                // 5. Retract tongue
                tongue.isExtending = false;
                tongue.isRetracting = true;

                // Since a seed was caught, exit the loop for this frame
                break;
            }
        }
    }

    // Ball-Player collision
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        if (player.xGrids < ball.xGrids + ball.widthGrids &&
            player.xGrids + player.widthGrids > ball.xGrids &&
            player.yGrids < ball.yGrids + ball.heightGrids &&
            player.yGrids + player.heightGrids > ball.yGrids) {
            
            endGame();
        }
    }
}

const FALLING_BLOCK_DURATION = 500; // ms

function easeOutQuad(x) {
    return 1 - (1 - x) * (1 - x);
}

function moveFallingBlocks(currentTime) {
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
        const block = fallingBlocks[i];
        const elapsedTime = currentTime - block.startTime;
        let progress = elapsedTime / block.duration;

        if (progress >= 1) {
            progress = 1;
            // Block has landed. Repair the hole officially.
            const holeIndex = holes.findIndex(h => h === block.xGrids);
            if (holeIndex !== -1) {
                holes.splice(holeIndex, 1);
            }
            // Remove the block from the falling animation
            fallingBlocks.splice(i, 1);
            continue; // Continue to the next block
        }

        const easedProgress = easeOutQuad(progress);
        block.yGrids = block.targetYGrids * easedProgress;
    }
}

function drawFallingBlocks() {
    const blockColor = '#8B4513'; // Same as ground
    const borderColor = '#2F4F4F';
    fallingBlocks.forEach(block => {
        ctx.fillStyle = blockColor;
        ctx.fillRect(gridToPx(block.xGrids), gridToPx(block.yGrids), GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(gridToPx(block.xGrids), gridToPx(block.yGrids), GRID_SIZE, GRID_SIZE);
    });
}

function processRepairQueue() {
    if (repairQueue.length > 0) {
        const holeX = repairQueue.shift(); // Get the first hole from the queue
        if (holeX !== undefined) {
            // Start the falling block animation for this hole, if not already falling
            if (!fallingBlocks.some(b => b.xGrids === holeX)) {
                fallingBlocks.push({
                    xGrids: holeX,
                    yGrids: 0,
                    targetYGrids: GROUND_Y_GRIDS,
                    startTime: performance.now(),
                    duration: FALLING_BLOCK_DURATION
                });
            }
        }
    }
}

function endGame() {
    gameState.phase = 'dying';
}

const PLAYER_DEATH_SPEED = 0.033; // Grids per frame. Slower speed for a longer animation.

function updateDyingAnimation() {
    // Move player down through the floor
    player.yGrids += PLAYER_DEATH_SPEED;

    // Once the player is off-screen, transition to the game over screen
    if (player.yGrids > SCREEN_HEIGHT_GRIDS) {
        gameState.phase = 'gameOver';
    }
}

function resetGame() {
    // Reset game state
    gameState.score = 0;
    gameState.gameSpeedMultiplier = 1;
    gameState.level = INITIAL_LEVEL;
    gameState.phase = 'title';
    gameState.lastAnimationTime = 0;
    gameState.nextSpawnTime = 0;
    gameState.ballSpawnInterval = BALL_SPAWN_INTERVAL;
    gameState.tongueSpeed = INITIAL_TONGUE_SPEED;
    gameState.playerMoveInterval = INITIAL_PLAYER_MOVE_INTERVAL;

    // Reset player
    player.xGrids = SCREEN_WIDTH_GRIDS / 2 - CHAR_SIZE_GRIDS / 2;
    player.yGrids = GROUND_Y_GRIDS - CHAR_SIZE_GRIDS;
    player.dxGrids = 0;
    player.direction = 1;
    player.currentFrame = 0;

    // Reset tongue
    tongue.currentLength = 0;
    tongue.isExtending = false;
    tongue.isRetracting = false;

    // Clear all dynamic arrays
    balls.length = 0;
    caughtSeeds.length = 0;
    floatingScores.length = 0;
    holes.length = 0;
    fallingBlocks.length = 0;
    repairQueue.length = 0;
}

    let lastMoveTime = 0;
let animationFrameId;

function update(currentTime) {
    // --- Logic updates based on phase ---
    switch (gameState.phase) {
        case 'playing':
            updateGameLogic(currentTime);
            break;
        case 'dying':
            updateDyingAnimation();
            break;
        // 'title' and 'gameOver' phases don't have logic updates
    }

    // --- Drawing (always happens) ---
    drawGame(currentTime);

    // --- Draw overlays based on phase ---
    if (gameState.phase === 'title') {
        drawTitleScreen();
    } else if (gameState.phase === 'gameOver') {
        drawGameOverScreen();
        drawScore(); // Draw score on top of the overlay
    }

    animationFrameId = requestAnimationFrame(update);
}

function updateGameLogic(currentTime) {
    // On the first frame of 'playing', schedule the first ball spawn.
    if (gameState.nextSpawnTime === 0) {
        // For the very first spawn, just use the base interval without variation
        // to make it predictable. Subsequent spawns will have variability.
        gameState.nextSpawnTime = currentTime + gameState.ballSpawnInterval;
    }

    // Update game speed based on score
    const newLevel = INITIAL_LEVEL + Math.floor(gameState.score / POINTS_PER_LEVEL);
    if (newLevel > gameState.level) {
        // If multiple levels are gained at once, iterate through each level-up.
        for (let levelToProcess = gameState.level + 1; levelToProcess <= newLevel; levelToProcess++) {
            // Find the correct difficulty tier for the level being processed.
            const tier = difficultyTiers.find(t => levelToProcess <= t.levelCap);
            if (tier) {
                // Update speed multiplier
                const speedIncrease = tier.getSpeedIncrease(levelToProcess);
                gameState.gameSpeedMultiplier += speedIncrease;

                // Update tongue speed
                const tongueSpeedIncrease = tier.getTongueSpeedIncrease(levelToProcess);
                gameState.tongueSpeed += tongueSpeedIncrease;

                // Update spawn interval
                const intervalReduction = tier.getSpawnIntervalReduction(levelToProcess);
                gameState.ballSpawnInterval -= intervalReduction;

                // Update player move interval
                const playerIntervalReduction = tier.getPlayerMoveIntervalReduction(levelToProcess);
                gameState.playerMoveInterval -= playerIntervalReduction;
            }
        }

        // Clamp the spawn interval to its minimum value.
        if (gameState.ballSpawnInterval < MIN_BALL_SPAWN_INTERVAL) {
            gameState.ballSpawnInterval = MIN_BALL_SPAWN_INTERVAL;
        }

        gameState.level = newLevel; // Set the new level.
    }

    // Allow movement only when tongue is not active
    if (!tongue.isExtending && !tongue.isRetracting) {
        if (keys.right) {
            player.dxGrids = CHAR_SPEED_GRIDS;
            player.direction = 1;
        } else if (keys.left) {
            player.dxGrids = -CHAR_SPEED_GRIDS;
            player.direction = -1;
        } else {
            player.dxGrids = 0;
        }
    } else {
        player.dxGrids = 0; // Ensure player stops when tongue is out
    }

    // Update animation frame only if moving
    if (player.dxGrids !== 0) {
        if (currentTime - gameState.lastAnimationTime > PLAYER_ANIMATION_SPEED) {
            player.currentFrame = (player.currentFrame + 1) % PLAYER_WALK_FRAMES;
            gameState.lastAnimationTime = currentTime;
        }
    } else {
        player.currentFrame = 0; // Reset to first frame when not moving
    }
    
    const currentMoveInterval = gameState.playerMoveInterval;
    if (currentTime - lastMoveTime > currentMoveInterval) {
        movePlayer();
        lastMoveTime = currentTime;
    }
    processRepairQueue();
    moveFallingBlocks(currentTime);
    moveTongue();
    moveBalls();
    updateFireworks();

    // Spawn balls based on time elapsed within the game loop
    if (currentTime >= gameState.nextSpawnTime) {
        spawnBall();
        // Schedule the next spawn with variability
        const baseInterval = gameState.ballSpawnInterval;
        const variation = baseInterval * BALL_SPAWN_VARIATION_RATIO;
        const randomOffset = (Math.random() * 2 - 1) * variation; // A random value between -variation and +variation
        const nextInterval = baseInterval + randomOffset;
        gameState.nextSpawnTime = currentTime + nextInterval;
    }

    checkCollisions();
}

function drawGame(currentTime) {
    clear();
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    drawGround();
    drawScoreTiers();
    drawFallingBlocks();
    drawTongue();
    drawCaughtSeeds();
    drawPlayer();
    drawBalls();
    drawFloatingScores();
    drawFireworks();
    drawScore();
    drawDebugInfo(currentTime);
}

function setupTouchControls() {
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnTongue = document.getElementById('btn-tongue');

    if (!btnLeft || !btnRight || !btnTongue) return;

    // Helper to add listeners for both mouse and touch events
    const addEventListeners = (element, startAction, endAction) => {
        const onStart = (e) => {
            e.preventDefault();
            handleFirstInteraction();
            // On title or game over screen, any button press starts/restarts the game.
            if (gameState.phase === 'title') {
                gameState.phase = 'playing';
                return; // Don't perform the action on the first press.
            }
            if (gameState.phase === 'gameOver') {
                resetGame();
                return; // Don't perform the action on the first press.
            }
            // Otherwise, perform the regular start action.
            startAction();
        };

        const onEnd = (e) => {
            e.preventDefault();
            endAction();
        };

        // Use { passive: false } to be able to call e.preventDefault()
        element.addEventListener('touchstart', onStart, { passive: false });
        element.addEventListener('touchend', onEnd, { passive: false });
        element.addEventListener('touchcancel', onEnd, { passive: false });

        element.addEventListener('mousedown', onStart);
        element.addEventListener('mouseup', onEnd);
        // Also stop action if the mouse leaves the button area while pressed
        element.addEventListener('mouseleave', onEnd);
    };

    addEventListeners(btnLeft, startMoveLeft, stopMoveLeft);
    addEventListeners(btnRight, startMoveRight, stopMoveRight);
    addEventListeners(btnTongue, extendTongue, retractTongue);

    // Prevent context menu on long press for the entire control area
    document.getElementById('touch-controls').addEventListener('contextmenu', e => e.preventDefault());
}

async function loadSound(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    // Use a callback-based approach for decodeAudioData for wider compatibility
    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(arrayBuffer, resolve, reject);
    });
}

async function loadAllSounds() {
    console.log("Loading sounds...");
    [
        audioBuffers.tongue,
        audioBuffers.catch,
        audioBuffers.score_high
    ] = await Promise.all([
        loadSound('assets/sounds/tongue.wav'),
        loadSound('assets/sounds/score.wav'),
        loadSound('assets/sounds/score_high.wav')
    ]);
    console.log("All sounds loaded and decoded.");
}
async function startGame() {
    try {
        // Load all sounds before starting the game
        await loadAllSounds();

        // Set up touch controls after the main game logic is ready
        setupTouchControls();

        // Start the game loop
        update(0);
    } catch (error) {
        console.error("Could not load game assets:", error);
        // Display a user-friendly error message on the canvas
        ctx.fillStyle = 'red';
        ctx.font = '16px "DotGothic16"';
        ctx.textAlign = 'center';
        ctx.fillText('Error: Could not load game assets.', canvas.width / 2, canvas.height / 2);
    }
}

// Prevent scrolling and zooming on mobile
window.addEventListener('touchmove', function (e) {
    e.preventDefault();
}, { passive: false });

window.addEventListener('wheel', function(e) {
    e.preventDefault();
}, { passive: false });

startGame();