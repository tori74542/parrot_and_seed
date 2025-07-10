const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
const TONGUE_SPEED_GRIDS = 1;
const BALL_SIZE_GRIDS = 1;
const BALL_SPEED_GRIDS = 0.05;
const BALL_SPAWN_INTERVAL = 2000; // ms

// Animation constants
const PLAYER_SPRITE_WIDTH = 128;
const PLAYER_SPRITE_HEIGHT = 128;
const PLAYER_WALK_FRAMES = 10;
const PLAYER_ANIMATION_SPEED = 100; // ms per frame
const PLAYER_DRAW_SCALE = 1.5;

// Game state
let score = 0;
let gameOver = false;
let animationFrameId;
let lastAnimationTime = 0;

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
    if (gameOver) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowright' || key === 'right' || key === 'c') {
        keys.right = true;
    } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
        keys.left = true;
    } else if (e.key === 'Enter') {
            if (!tongue.isExtending && !tongue.isRetracting) {
                tongue.isExtending = true;
                tongue.direction = player.direction;
                // 効果音再生
                tongueSound.currentTime = 0; // 再生位置を先頭に戻す
                tongueSound.play();
            }
        }
}

function keyUp(e) {
    const key = e.key.toLowerCase();
    if (key === 'arrowright' || key === 'right' || key === 'c') {
        keys.right = false;
    } else if (key === 'arrowleft' || key === 'left' || key === 'z') {
        keys.left = false;
    } else if (key === 'enter') {
        if (tongue.isExtending) {
            tongue.isExtending = false;
            tongue.isRetracting = true;
        }
    }
}

document.addEventListener('keydown', keyDown);
document.addEventListener('keyup', keyUp);



function spawnBall() {
    if (gameOver) return;
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
        lastAnimationTime: 0
    };
    balls.push(ball);
}

const ballSpawner = setInterval(spawnBall, BALL_SPAWN_INTERVAL);

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
    const drawY = gridToPx(player.yGrids) - yOffset;

    ctx.drawImage(currentSprite, sx, sy, PLAYER_SPRITE_WIDTH, PLAYER_SPRITE_HEIGHT, drawX, drawY, drawWidthPx, drawHeightPx);
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
    }
}

function moveTongue() {
    // Set tongue base to player's mouth
    tongue.xGrids = player.xGrids + player.widthGrids / 2;
    tongue.yGrids = player.yGrids + player.heightGrids / 2;

    if (tongue.isExtending) {
        tongue.currentLength += tongue.speed;

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

function drawBalls() {
    balls.forEach(ball => {
        // Set filter based on ball type
        switch (ball.type) {
            case 'repair':
                ctx.filter = 'sepia(100%) brightness(150%) saturate(30%)'; // Cream
                break;
            case 'clear':
                ctx.filter = 'hue-rotate(180deg)'; // Blueish
                break;
            default: // 'normal'
                ctx.filter = 'none';
                break;
        }

        const sx = ball.animationFrame * 32; // 32 is the width of a single frame
        const sy = 0;
        const drawWidth = gridToPx(ball.widthGrids) * 1.5;
        const drawHeight = gridToPx(ball.heightGrids) * 1.5;
        const x = gridToPx(ball.xGrids) - (drawWidth - gridToPx(ball.widthGrids)) / 2;
        const y = gridToPx(ball.yGrids) - (drawHeight - gridToPx(ball.heightGrids)) / 2;
        ctx.drawImage(seedSprite, sx, sy, 32, 32, x, y, drawWidth, drawHeight);

        // Reset filter to avoid affecting other drawings
        ctx.filter = 'none';
    });
}

// drawHoles() is now handled inside drawGround()

function drawScore() {
    ctx.fillStyle = 'black';
    ctx.font = '20px "Courier New"'; // フォント変更

    const paddedScore = score.toString().padStart(6, '0');
    const scoreText = `${paddedScore}`;

    // テキストの幅を測定
    const textMetrics = ctx.measureText(scoreText);
    const textWidth = textMetrics.width;

    // 中央揃えのX座標を計算
    const centerX = (canvas.width - textWidth) / 2;
    const displayY = 30; // Y座標は既存のものを流用

    ctx.fillText(scoreText, centerX, displayY);
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



const animationSequence = [0, 1, 0, 2];

function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        ball.yGrids += BALL_SPEED_GRIDS;

        if (performance.now() - ball.lastAnimationTime > 300) { // 100ms interval for animation
            ball.animationSequenceIndex = (ball.animationSequenceIndex + 1) % animationSequence.length;
            ball.animationFrame = animationSequence[ball.animationSequenceIndex];
            ball.lastAnimationTime = performance.now();
        }

        if (ball.yGrids + ball.heightGrids >= GROUND_Y_GRIDS) {
            holes.push(Math.floor(ball.xGrids));
            balls.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // Tongue-Ball collision
    if (tongue.isExtending) {
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            const tongueTipX = tongue.direction === 1 ? tongue.xGrids + tongue.widthGrids : tongue.xGrids;

            if (tongue.tipXGrids > ball.xGrids && tongue.tipXGrids < ball.xGrids + ball.widthGrids &&
                tongue.tipYGrids > ball.yGrids && tongue.tipYGrids < ball.yGrids + ball.heightGrids) {

                // Check if the hit ball is a 'clear' ball
                if (ball.type === 'clear') {
                    const ballsToClearCount = balls.length;
                    let holesToRepairCount = ballsToClearCount - 1; // Don't count the clear ball itself

                    // Add score for all balls on screen
                    for (const b of balls) {
                        const yPos = b.yGrids;
                        if (yPos < 5) {
                            score += 10;
                        } else if (yPos < 10) {
                            score += 5;
                        } else if (yPos < 15) {
                            score += 3;
                        } else {
                            score += 1;
                        }
                    }

                    // --- Queue holes for repair for 'clear' ball ---
                    const tempHoles = [...holes];
                    const holesToQueue = [];

                    while (holesToRepairCount > 0 && tempHoles.length > 0) {
                        let closestHoleIndex = -1;
                        let minDistance = Infinity;
                        const playerCenterX = player.xGrids + player.widthGrids / 2;

                        for (let j = 0; j < tempHoles.length; j++) {
                            const holeX = tempHoles[j];
                            const distance = Math.abs(playerCenterX - holeX);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestHoleIndex = j;
                            }
                        }

                        if (closestHoleIndex !== -1) {
                            holesToQueue.push(tempHoles[closestHoleIndex]);
                            tempHoles.splice(closestHoleIndex, 1);
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
                        let closestHoleIndex = -1;
                        let minDistance = Infinity;
                        const playerCenterX = player.xGrids + player.widthGrids / 2;

                        for (let j = 0; j < holes.length; j++) {
                            const holeX = holes[j];
                            const distance = Math.abs(playerCenterX - holeX);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestHoleIndex = j;
                            }
                        }

                        if (closestHoleIndex !== -1) {
                            const holeToRepairX = holes[closestHoleIndex];
                            // Queue the hole for repair
                            repairQueue.push(holeToRepairX);
                        }
                    }
                }

                // Add score based on height, regardless of ball type
                const yPos = ball.yGrids;
                if (yPos < 5) {
                    score += 10;
                } else if (yPos < 10) {
                    score += 5;
                } else if (yPos < 15) {
                    score += 3;
                } else {
                    score += 1;
                }

                balls.splice(i, 1);
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
    gameOver = true;
    clearInterval(ballSpawner);
    cancelAnimationFrame(animationFrameId);
    alert(`Game Over! Your score: ${score}`);
}

let lastMoveTime = 0;
const MOVE_INTERVAL = 50; // ms, adjust for desired speed

function update(currentTime) {
    if (gameOver) return;

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
        if (currentTime - lastAnimationTime > PLAYER_ANIMATION_SPEED) {
            player.currentFrame = (player.currentFrame + 1) % PLAYER_WALK_FRAMES;
            lastAnimationTime = currentTime;
        }
    } else {
        player.currentFrame = 0; // Reset to first frame when not moving
    }
    
    if (currentTime - lastMoveTime > MOVE_INTERVAL) {
        movePlayer();
        lastMoveTime = currentTime;
    }


    clear();

    drawGround();
    drawFallingBlocks();
    drawTongue();
    drawPlayer();
    drawBalls();
    drawScore();

    processRepairQueue();
    moveFallingBlocks(currentTime);
    moveTongue();
    moveBalls();
    checkCollisions();

    animationFrameId = requestAnimationFrame(update);
}

update(0);