import { generateNormalRandom } from './utils.js';
import { difficultyTiers, BALL_SPAWN_INTERVAL, MIN_BALL_SPAWN_INTERVAL } from './difficulty.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Debug
const DEBUG_MODE = false; // Set to true to show collision boxes

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
const TONGUE_SPEED_GRIDS = 1;
const BALL_SIZE_GRIDS = 1;
const MIN_BALL_SPEED_GRIDS = 0.03;
const MAX_BALL_SPEED_GRIDS = 0.07;
const INITIAL_LEVEL = 1; // For debugging, set initial game level

// Animation constants
const PLAYER_SPRITE_WIDTH = 128;
const PLAYER_SPRITE_HEIGHT = 128;
const PLAYER_WALK_FRAMES = 10;
const PLAYER_ANIMATION_SPEED = 100; // ms per frame
const PLAYER_DRAW_SCALE = 1.5;
const PLAYER_Y_OFFSET_GRIDS = 0.25; // プレイヤー描画時のY軸オフセット

// Seed sprite constants
const SEED_SPRITE_FRAME_WIDTH = 32;
const SEED_SPRITE_FRAME_HEIGHT = 32;
const SEED_DRAW_SCALE = 1.5;

// Game Configuration (loaded from config.json)
let scoreTiers = [];

// Game state using a phase machine
const gameState = {
    score: 0,
    gameSpeedMultiplier: 1,
    level: 1,
    phase: 'title', // 'title', 'playing', 'dying', 'gameOver'
    lastAnimationTime: 0,
    lastSpawnTime: 0,
    ballSpawnInterval: BALL_SPAWN_INTERVAL
};

// Sound effects
const tongueSound = new Audio('tongue.mp3');
tongueSound.preload = 'auto'; // 事前読み込み
tongueSound.volume = 0.5; // 音量調整 (任意)

// Player sprite
const playerSpriteRight = new Image();
playerSpriteRight.src = 'parrot_right.png';

const playerSpriteLeft = new Image();
playerSpriteLeft.src = 'parrot_left.png';

const seedSprite = new Image();
seedSprite.src = 'seed.png';

// Background Image (for testing)
const backgroundImage = new Image();
backgroundImage.src = 'background.png'; // Create a 450x330px image with this name

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
    speed: TONGUE_SPEED_GRIDS, // Max length of the tongue
    direction: 1, // 1 for right, -1 for left
    tipXGrids: 0,
    tipYGrids: 0
};
// Balls
const balls = [];
const caughtSeeds = [];
const floatingScores = [];
// Holes
const holes = []; // Stores x-grid positions of holes
const fallingBlocks = []; // Stores blocks falling to repair holes
const repairQueue = []; // Stores x-coordinates of holes queued for repair

// Keyboard input
const keys = {
    right: false,
    left: false
};

function keyDown(e) {
    switch (gameState.phase) {
        case 'title':
            gameState.phase = 'playing';
            // Spawning is now handled by the main game loop (updateGameLogic)
            break;
        case 'gameOver':
            resetGame();
            break;
        case 'playing':
            const key = e.key.toLowerCase();
            if (key === 'arrowright' || key === 'right' || key === 'c') {
                keys.right = true;
            } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
                keys.left = true;
            } else if (e.key === 'Enter') {
                // Allow tongue action only when not extending/retracting
            if (!tongue.isExtending && !tongue.isRetracting) {
                tongue.isExtending = true;
                tongue.direction = player.direction;
                    tongueSound.currentTime = 0;
                tongueSound.play();
            }
            }
            break;
    }
}

function keyUp(e) {
    if (gameState.phase !== 'playing') return; // Only handle keyUp during gameplay
    const key = e.key.toLowerCase();
    if (key === 'arrowright' || key === 'right' || key === 'c') {
        keys.right = false;
    } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
        keys.left = false;
    } else if (e.key === 'enter') {
        if (tongue.isExtending) {
            tongue.isExtending = false;
            tongue.isRetracting = true;
        }
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
            const mean = (MIN_BALL_SPEED_GRIDS + MAX_BALL_SPEED_GRIDS) / 2;
            // Set standard deviation so that ~95% of values fall within the min/max range
            const stdDev = (MAX_BALL_SPEED_GRIDS - MIN_BALL_SPEED_GRIDS) / 4; 
            const randomNormal = generateNormalRandom() * stdDev + mean;
            // Clamp the value to ensure it's within the defined min/max bounds
            return Math.max(MIN_BALL_SPEED_GRIDS, Math.min(randomNormal, MAX_BALL_SPEED_GRIDS));
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
        ctx.strokeStyle = 'pink';
        ctx.lineWidth = gridToPx(TONGUE_WIDTH_GRIDS);
        ctx.beginPath();
        ctx.moveTo(gridToPx(tongue.xGrids), gridToPx(tongue.yGrids));
        ctx.lineTo(gridToPx(tongue.tipXGrids), gridToPx(tongue.tipYGrids));
        ctx.stroke();

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
        tongue.currentLength += tongue.speed * gameState.gameSpeedMultiplier;

        // Check if tongue tip hits screen boundaries
        if (tongue.tipXGrids < 0 || tongue.tipXGrids > SCREEN_WIDTH_GRIDS || tongue.tipYGrids < 0) {
            tongue.isExtending = false;
            tongue.isRetracting = true;
        }
    } else if (tongue.isRetracting) {
        tongue.currentLength -= tongue.speed;
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

function applyItemStyle(ctx, itemType) {
    switch (itemType) {
        case 'repair':
            ctx.filter = 'sepia(100%) brightness(150%) saturate(30%)'; // Cream
            break;
        case 'clear':
            // Alternating brightness effect every 200ms
            if (Math.floor(performance.now() / 200) % 2 === 0) {
                ctx.filter = 'hue-rotate(330deg) brightness(1.5)'; // Bright reddish
            } else {
                ctx.filter = 'hue-rotate(330deg) brightness(0.7)'; // Dark reddish
            }
            break;
        default: // 'normal'
            ctx.filter = 'none';
            break;
    }
}

function drawCaughtSeeds() {
    caughtSeeds.forEach(seed => {
        applyItemStyle(ctx, seed.type);

        const sx = seed.animationFrame * SEED_SPRITE_FRAME_WIDTH;
        const sy = 0;
        const drawWidth = gridToPx(seed.widthGrids) * SEED_DRAW_SCALE;
        const drawHeight = gridToPx(seed.heightGrids) * SEED_DRAW_SCALE;
        // Draw the seed at the tip of the tongue
        const x = gridToPx(tongue.tipXGrids) - drawWidth / 2;
        const y = gridToPx(tongue.tipYGrids) - drawHeight / 2;
        ctx.drawImage(seedSprite, sx, sy, SEED_SPRITE_FRAME_WIDTH, SEED_SPRITE_FRAME_HEIGHT, x, y, drawWidth, drawHeight);

        // Reset filter
        ctx.filter = 'none';
    });
}

function drawBalls() {
    balls.forEach(ball => {
        applyItemStyle(ctx, ball.type);

        const sx = ball.animationFrame * SEED_SPRITE_FRAME_WIDTH;
        const sy = 0;
        const drawWidth = gridToPx(ball.widthGrids) * SEED_DRAW_SCALE;
        const drawHeight = gridToPx(ball.heightGrids) * SEED_DRAW_SCALE;
        const x = gridToPx(ball.xGrids) - (drawWidth - gridToPx(ball.widthGrids)) / 2;
        const y = gridToPx(ball.yGrids) - (drawHeight - gridToPx(ball.heightGrids)) / 2;
        ctx.drawImage(seedSprite, sx, sy, SEED_SPRITE_FRAME_WIDTH, SEED_SPRITE_FRAME_HEIGHT, x, y, drawWidth, drawHeight);

        // Draw collision box in debug mode
        if (DEBUG_MODE) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(gridToPx(ball.xGrids), gridToPx(ball.yGrids), gridToPx(ball.widthGrids), gridToPx(ball.heightGrids));
        }

        // Reset filter to avoid affecting other drawings
        ctx.filter = 'none';
    });
}

// drawHoles() is now handled inside drawGround()

function drawScore() {
    ctx.globalAlpha = 1; // Ensure full opacity for main score
    ctx.fillStyle = 'black';
    ctx.font = '20px "Courier New"';
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
    ctx.font = '12px "Courier New"';
    ctx.textAlign = 'right';

    // Only update the spawn timer during the 'playing' phase to prevent it from
    // running on the title or game over screens.
    let elapsedSinceSpawn = 0;
    if (gameState.phase === 'playing') {
        elapsedSinceSpawn = currentTime - gameState.lastSpawnTime;
    }
    const playerMoveInterval = MOVE_INTERVAL / gameState.gameSpeedMultiplier;
    const minSeedSpeed = MIN_BALL_SPEED_GRIDS * gameState.gameSpeedMultiplier;
    const maxSeedSpeed = MAX_BALL_SPEED_GRIDS * gameState.gameSpeedMultiplier;

    ctx.fillText(`Level: ${gameState.level}`, canvas.width - 10, 15);
    ctx.fillText(`Player Interval: ${playerMoveInterval.toFixed(1)}ms`, canvas.width - 10, 29);
    ctx.fillText(`Seed Spd Range: ${minSeedSpeed.toFixed(3)}-${maxSeedSpeed.toFixed(3)}`, canvas.width - 10, 43);
    ctx.fillText(`PlayerX: ${player.xGrids.toFixed(2)}`, canvas.width - 10, 57);
    const spawnTimerText = `Spawn: ${elapsedSinceSpawn.toFixed(0)} / ${gameState.ballSpawnInterval.toFixed(0)}`;
    ctx.fillText(spawnTimerText, canvas.width - 10, 71);
    ctx.textAlign = 'left'; // Reset to default
}

function drawTitleScreen() {
    // This function is called only when gameState.isTitleScreen is true
    ctx.fillStyle = 'black';
    ctx.font = '20px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText('parrot and seed', canvas.width / 2, canvas.height / 2);
}

function drawGameOverScreen() {
    // This function is called only when gameState.phase is 'gameOver'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '40px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '20px "Courier New"';
    ctx.fillText('Press any key to restart', canvas.width / 2, canvas.height / 2 + 20);
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
        ctx.font = 'bold 12px "Courier New"';
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
    ctx.font = 'bold 12px "Courier New"';
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
    if (tongue.isExtending && scoreTiers.length > 0) { // Ensure config is loaded
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            
            // Calculate distance between tongue tip and ball center
            const ballCenterX = ball.xGrids + ball.widthGrids / 2;
            const ballCenterY = ball.yGrids + ball.heightGrids / 2;
            const distance = Math.sqrt(Math.pow(tongue.tipXGrids - ballCenterX, 2) + Math.pow(tongue.tipYGrids - ballCenterY, 2));

            // Check for collision using distance and combined radii (ball is square, so use half diagonal as radius approximation)
            const ballRadiusApprox = Math.sqrt(Math.pow(ball.widthGrids / 2, 2) + Math.pow(ball.heightGrids / 2, 2));
            if (distance < TONGUE_TIP_COLLISION_RADIUS_GRIDS + ballRadiusApprox) {

                // Check if the hit ball is a 'clear' ball
                if (ball.type === 'clear') {
                    const ballsToClearCount = balls.length;
                    let holesToRepairCount = ballsToClearCount - 1; // Don't count the clear ball itself

                    // Add score for all balls on screen and create floating scores
                    for (const b of balls) {
                        const points = getPointsForHeight(b.yGrids);
                        gameState.score += points;
                        floatingScores.push({
                            text: `+${points}`,
                            x: b.xGrids,
                            y: b.yGrids,
                            startTime: performance.now()
                        });
                    }

                    // --- Queue holes for repair for 'clear' ball ---
                    const tempHoles = [...holes];
                    const holesToQueue = [];

                    while (holesToRepairCount > 0 && tempHoles.length > 0) {
                        const playerCenterX = player.xGrids + player.widthGrids / 2;
                        const closestHoleX = findClosestHole(playerCenterX, tempHoles);
                        if (closestHoleX !== null) {
                            holesToQueue.push(closestHoleX);
                            tempHoles.splice(tempHoles.indexOf(closestHoleX), 1);
                        }
                        holesToRepairCount--;
                    }

                    // Add the found holes to the global repair queue
                    if (holesToQueue.length > 0) {
                        repairQueue.push(...holesToQueue);
                    }
                    // --- End queuing ---

                    // Clear all balls from the screen
                    balls.length = 0;

                    // Retract tongue and exit the collision check for this frame
                    tongue.isExtending = false;
                    tongue.isRetracting = true;
                    break; // Exit the for loop
                }


                // --- Logic for 'normal' and 'repair' balls ---
                if (ball.type === 'repair') {
                    if (holes.length > 0) {
                        const playerCenterX = player.xGrids + player.widthGrids / 2;
                        const holeToRepairX = findClosestHole(playerCenterX, holes);
                        if (holeToRepairX !== null) {
                           // Queue the hole for repair, but only if it's not already queued
                           if (!repairQueue.includes(holeToRepairX)) {
                                repairQueue.push(holeToRepairX);
                           }
                        }
                    }
                }

                // Add score based on height, regardless of ball type
                const points = getPointsForHeight(ball.yGrids);
                gameState.score += points;
                floatingScores.push({
                    text: `+${points}`,
                    x: ball.xGrids,
                    y: ball.yGrids,
                    startTime: performance.now()
                });

                // Move the ball to the caughtSeeds array instead of deleting it
                const caughtSeed = balls.splice(i, 1)[0];
                caughtSeeds.push(caughtSeed);

                tongue.isExtending = false;
                tongue.isRetracting = true;
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
    gameState.lastSpawnTime = 0;
    gameState.ballSpawnInterval = BALL_SPAWN_INTERVAL;

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
const MOVE_INTERVAL = 50; // ms, adjust for desired speed
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
    }

    animationFrameId = requestAnimationFrame(update);
}

function updateGameLogic(currentTime) {
    // Initialize spawn timer on the first frame of 'playing'
    if (gameState.lastSpawnTime === 0) {
        gameState.lastSpawnTime = currentTime;
    }

    // Update game speed based on score
    const newLevel = INITIAL_LEVEL + Math.floor(gameState.score / 1000);
    if (newLevel > gameState.level) {
        // If multiple levels are gained at once, iterate through each level-up.
        for (let levelToProcess = gameState.level + 1; levelToProcess <= newLevel; levelToProcess++) {
            // Find the correct difficulty tier for the level being processed.
            const tier = difficultyTiers.find(t => levelToProcess <= t.levelCap);
            if (tier) {
                // Update speed multiplier
                const speedIncrease = tier.getSpeedIncrease(levelToProcess);
                gameState.gameSpeedMultiplier += speedIncrease;

                // Update spawn interval
                const intervalReduction = tier.getSpawnIntervalReduction(levelToProcess);
                gameState.ballSpawnInterval -= intervalReduction;
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
    
    const currentMoveInterval = MOVE_INTERVAL / gameState.gameSpeedMultiplier;
    if (currentTime - lastMoveTime > currentMoveInterval) {
        movePlayer();
        lastMoveTime = currentTime;
    }
    processRepairQueue();
    moveFallingBlocks(currentTime);
    moveTongue();
    moveBalls();

    // Spawn balls based on time elapsed within the game loop
    if (currentTime - gameState.lastSpawnTime > gameState.ballSpawnInterval) {
        spawnBall();
        gameState.lastSpawnTime = currentTime;
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
    drawScore();
    drawDebugInfo(currentTime);
}

async function initGame() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const configData = await response.json();
        scoreTiers = configData.scoreTiers;

        // Start the game loop only after config is loaded successfully
        update(0);
    } catch (error) {
        console.error("Could not load game configuration:", error);
        // Display a user-friendly error message on the canvas
        ctx.fillStyle = 'red';
        ctx.font = '16px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('Error: Could not load game config.', canvas.width / 2, canvas.height / 2);
    }
}

initGame();