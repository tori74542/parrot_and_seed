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
const TONGUE_WIDTH_GRIDS = 0.5;
const TONGUE_SPEED_GRIDS = 1;
const BALL_SIZE_GRIDS = 1;
const BALL_SPEED_GRIDS = 0.05;
const BALL_SPAWN_INTERVAL = 2000; // ms

// Animation constants
const PLAYER_SPRITE_WIDTH = 40;
const PLAYER_SPRITE_HEIGHT = 40;
const PLAYER_WALK_FRAMES = 4;
const PLAYER_ANIMATION_SPEED = 100; // ms per frame

// Game state
let score = 0;
let gameOver = false;
let animationFrameId;
let lastAnimationTime = 0;

// Player sprite
const playerSprite = new Image();
playerSprite.src = 'image.png';

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
    const isRepairBall = Math.random() < 0.2; // 20% chance for a repair ball
    const ball = {
        xGrids: Math.floor(Math.random() * (SCREEN_WIDTH_GRIDS - BALL_SIZE_GRIDS)),
        yGrids: 0,
        widthGrids: BALL_SIZE_GRIDS,
        heightGrids: BALL_SIZE_GRIDS,
        type: isRepairBall ? 'repair' : 'normal'
    };
    balls.push(ball);
}

const ballSpawner = setInterval(spawnBall, BALL_SPAWN_INTERVAL);

// --- Drawing ---
function gridToPx(gridValue) {
    return gridValue * GRID_SIZE;
}

function drawPlayer() {
    let spriteRow = 0;
    if (player.direction === -1) {
        spriteRow = 1;
    }

    const sx = player.currentFrame * PLAYER_SPRITE_WIDTH;
    const sy = spriteRow * PLAYER_SPRITE_HEIGHT;

    ctx.drawImage(playerSprite, sx, sy, PLAYER_SPRITE_WIDTH, PLAYER_SPRITE_HEIGHT, gridToPx(player.xGrids), gridToPx(player.yGrids), gridToPx(player.widthGrids), gridToPx(player.heightGrids));
}

function drawGround() {
    const groundBlockColor = '#8B4513'; // SaddleBrown
    const groundBlockBorder = '#2F4F4F'; // DarkSlateGray

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
        ctx.fillStyle = ball.type === 'repair' ? 'green' : 'blue';
        ctx.beginPath();
        ctx.arc(gridToPx(ball.xGrids + ball.widthGrids / 2), gridToPx(ball.yGrids + ball.heightGrids / 2), gridToPx(ball.widthGrids / 2), 0, Math.PI * 2);
        ctx.fill();
    });
}

// drawHoles() is now handled inside drawGround()

function drawScore() {
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}`, 10, 30);
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



function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        ball.yGrids += BALL_SPEED_GRIDS;

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

                if (ball.type === 'repair') {
                    if (holes.length > 0) {
                        let closestHoleIndex = -1;
                        let minDistance = Infinity;
                        const playerCenterX = player.xGrids + player.widthGrids / 2;

                        for (let i = 0; i < holes.length; i++) {
                            const holeX = holes[i];
                            const distance = Math.abs(playerCenterX - holeX);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestHoleIndex = i;
                            }
                        }

                        if (closestHoleIndex !== -1) {
                            holes.splice(closestHoleIndex, 1);
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
    drawPlayer();
    drawTongue();
    drawBalls();
    drawScore();

    moveTongue();
    moveBalls();
    checkCollisions();

    animationFrameId = requestAnimationFrame(update);
}

update(0);