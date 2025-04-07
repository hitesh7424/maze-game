// DOM
const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');
const mzCtx = ctx; // alias for smooth animation drawing
const levelSelect = document.getElementById('level');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const stats = document.getElementById('stats');
const elMoves = document.getElementById('moves');
const elTimer = document.getElementById('timer');
const elScore = document.getElementById('score'); // NEW: Get score display element

let COLS, ROWS, CELL;
let maze, player, goal, moves, startTime, timerInterval;
let isAnimating = false;           // NEW global flag for animation state
let currentAnimPos = { x: 0, y: 0 }; // NEW global for current animation position (in cell units)
let animationFrameId;              // NEW global for requestAnimationFrame id
let currentTarget = null;          // NEW global to store current animation target cell
let pathTrace = [];                // NEW: store travelled path as array of {x, y}
let score = 0;                     // NEW: cumulative score

// NEW: Define level configurations and extra level counter for custom increases at highest level
const levels = [
  { value: 'easy',     cols: 15, rows: 11 },
  { value: 'medium',   cols: 25, rows: 17 },
  { value: 'hard',     cols: 35, rows: 23 },
  { value: 'insane',   cols: 45, rows: 29 },
  { value: 'nightmare',cols: 55, rows: 37 }
];
let extraLevelCount = 0; // for additional increases once at 'nightmare'

// UTIL
const shuffle = arr => arr.sort(() => Math.random() - 0.5);

// RESIZE CANVAS
function resizeCanvas() {
  // choose cell size to fit viewport
  const vw = window.innerWidth * 0.95;
  const vh = window.innerHeight * 0.8;
  const cellW = Math.floor(vw / COLS);
  const cellH = Math.floor(vh / ROWS);
  CELL = Math.max(20, Math.min(cellW, cellH)); // min size 20px
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  drawMaze();
}

// MAZE GENERATOR: Recursive Backtracker
function generateMaze() {
  const grid = Array(ROWS).fill().map(() => Array(COLS).fill(1));
  function carve(x, y) {
    grid[y][x] = 0;
    shuffle([[1,0],[-1,0],[0,1],[0,-1]]).forEach(([dx, dy]) => {
      const nx = x + dx * 2, ny = y + dy * 2;
      if (ny > 0 && ny < ROWS && nx > 0 && nx < COLS && grid[ny][nx]) {
        grid[y + dy][x + dx] = 0;
        carve(nx, ny);
      }
    });
  }
  carve(1, 1);
  return grid;
}

// DRAW MAZE BACKGROUND (walls & goal)
function drawMazeBackground() {
  // walls
  mzCtx.fillStyle = '#333';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (maze[y][x]) mzCtx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  // goal
  mzCtx.fillStyle = '#ff5722';
  mzCtx.fillRect(goal.x * CELL + CELL * 0.1, goal.y * CELL + CELL * 0.1, CELL * 0.8, CELL * 0.8);
}

// DRAW MAZE
function drawMaze() {
  mzCtx.clearRect(0, 0, canvas.width, canvas.height);
  drawMazeBackground();
  // NEW: Draw travelled path
  pathTrace.forEach(pos => {
    mzCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    mzCtx.beginPath();
    mzCtx.arc(pos.x * CELL + CELL / 2, pos.y * CELL + CELL / 2, CELL * 0.15, 0, Math.PI * 2);
    mzCtx.fill();
  });
  // ball at cell center
  mzCtx.fillStyle = '#03a9f4';
  mzCtx.beginPath();
  mzCtx.arc(player.x * CELL + CELL / 2, player.y * CELL + CELL / 2, CELL * 0.4, 0, Math.PI * 2);
  mzCtx.fill();
}

// MOVE
// Count open neighbors (up/down/left/right) of cell (x,y)
function countOpenNeighbors(x, y) {
  let cnt = 0;
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && maze[ny][nx] === 0) {
      cnt++;
    }
  });
  return cnt;
}

// Compute target cell for sliding
function findSlideTarget(dx, dy) {
  let x = player.x, y = player.y, steps = 0;
  while (true) {
    const nx = x + dx, ny = y + dy;
    if (maze[ny]?.[nx] !== 0) break; // wall ahead
    x = nx; y = ny; steps++;
    if (x === goal.x && y === goal.y) break; // reached goal
    const open = countOpenNeighbors(x, y);
    if (open !== 2) break;
    const backX = x - dx, backY = y - dy;
    const forwardOpen = maze[y + dy]?.[x + dx] === 0;
    const backOpen    = maze[backY]?.[backX] === 0;
    if (!(forwardOpen && backOpen)) break;
  }
  return { x, y, steps };
}

// UPDATED: Smooth animation: animateSlide with easing and updating currentAnimPos
function animateSlide(sx, sy, tx, ty, totalDuration, callback) {
  currentTarget = { x: tx, y: ty }; // NEW: store target cell
  isAnimating = true;
  const start = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3); // ease-out cubic easing
  function step(now) {
    let t = Math.min((now - start) / totalDuration, 1);
    const easedT = ease(t);
    currentAnimPos.x = sx + (tx - sx) * easedT;
    currentAnimPos.y = sy + (ty - sy) * easedT;
    const cx = currentAnimPos.x * CELL;
    const cy = currentAnimPos.y * CELL;
    mzCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawMazeBackground();
    // ball
    mzCtx.fillStyle = '#03a9f4';
    mzCtx.beginPath();
    mzCtx.arc(cx + CELL / 2, cy + CELL / 2, CELL * 0.4, 0, Math.PI * 2);
    mzCtx.fill();
    if (t < 1 && isAnimating) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      isAnimating = false;
      callback();
    }
  }
  animationFrameId = requestAnimationFrame(step);
}

// TIMER
function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  elTimer.textContent = 0;
  timerInterval = setInterval(() => {
    elTimer.textContent = Math.floor((Date.now() - startTime) / 1000);
  }, 200);
}

// UPDATED: Function to display win popup with "New Game", "Next Level", and "Close" options
function showWinPopup(moves, time) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '1000';
  
  const popup = document.createElement('div');
  popup.style.background = '#fff';
  popup.style.padding = '20px';
  popup.style.borderRadius = '5px';
  popup.style.textAlign = 'center';
  popup.innerHTML = `<h2>Congratulations!</h2>
    <p>You finished in ${moves} moves and ${time} seconds!</p>
    <button id="popup-new">New Game</button>
    <button id="popup-next">Next Level</button>
    <button id="popup-close">Close</button>`;
  overlay.appendChild(popup);
  
  document.body.appendChild(overlay);
  
  document.getElementById("popup-new").addEventListener('click', () => {
    document.body.removeChild(overlay);
    initGame(false);
  });
  document.getElementById("popup-next").addEventListener('click', () => {
    document.body.removeChild(overlay);
    increaseDifficulty();
    initGame(true);  // Retain score for next level
  });
  document.getElementById("popup-close").addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
}

// NEW: Increase difficulty by advancing to the next level in the levels array.
// If already at the highest ("nightmare"), increase extra level counter.
function increaseDifficulty() {
  const current = levelSelect.value;
  const idx = levels.findIndex(l => l.value === current);
  if (idx < levels.length - 1) {
    levelSelect.value = levels[idx + 1].value;
    extraLevelCount = 0; // reset extra increases when changing level
  } else if (current === 'nightmare') {
    extraLevelCount++;
  }
}

// NEW: Function to display initial "maze" message on canvas
function drawInitialMessage() {
  mzCtx.clearRect(0, 0, canvas.width, canvas.height);
  mzCtx.font = 'bold 48px sans-serif';
  mzCtx.fillStyle = '#ccc';
  mzCtx.textAlign = 'center';
  mzCtx.textBaseline = 'middle';
  mzCtx.fillText('maze', canvas.width / 2, canvas.height / 2);
}

// NEW: Helper function to determine score increment based on level played
function getScoreIncrement() {
  switch(levelSelect.value) {
    case 'easy': return 10;
    case 'medium': return 20;
    case 'hard': return 30;
    case 'insane': return 40;
    case 'nightmare': return 50 + extraLevelCount * 10;
    default: return 0;
  }
}

// Modified INIT GAME to accept a retainScore parameter (default is false)
function initGame(retainScore = false) {
  // Remove initial big controls on game start
  document.getElementById('ui').classList.remove('initial-ui');
  // NEW: Look up level configuration from levels
  const lvl = levelSelect.value;
  const levelObj = levels.find(l => l.value === lvl);
  if (levelObj) {
    COLS = levelObj.cols;
    ROWS = levelObj.rows;
    // For 'nightmare', add extra complexity on each win
    if(lvl === 'nightmare' && extraLevelCount > 0) {
      COLS += extraLevelCount * 5;
      ROWS += extraLevelCount * 3;
    }
  } else {
    // fallback if not found
    COLS = 15; ROWS = 11;
  }
  maze = generateMaze();
  player = { x: 1, y: 1 };
  goal   = { x: COLS - 2, y: ROWS - 2 };
  moves = 0; elMoves.textContent = 0;
  pathTrace = []; // RESET path trace on new game
  if (!retainScore) {
    score = 0; elScore.textContent = 0; // RESET score when not retaining
  }
  resizeCanvas();
  stats.classList.remove('hidden');
  startTimer();
}

// EVENT LISTENERS
btnStart.addEventListener('click', () => initGame(false));
btnReset.addEventListener('click', () => initGame(false));

window.addEventListener('resize', resizeCanvas);
document.addEventListener('keydown', e => {
  if (!maze) return;
  // If an animation is in progress, force complete the current move
  if (isAnimating) {
    cancelAnimationFrame(animationFrameId);
    isAnimating = false;
    // Instead of rounding currentAnimPos, use the pre-computed target cell
    player = currentTarget;
    drawMaze();
  }
  let dir;
  if (e.key === 'ArrowUp')    dir = {dx: 0, dy: -1};
  if (e.key === 'ArrowDown')  dir = {dx: 0, dy: 1};
  if (e.key === 'ArrowLeft')  dir = {dx: -1, dy: 0};
  if (e.key === 'ArrowRight') dir = {dx: 1, dy: 0};
  if (!dir) return;
  
  const { x: tx, y: ty, steps } = findSlideTarget(dir.dx, dir.dy);
  if (steps === 0) return; // no movement
  
  const sx = player.x, sy = player.y;
  const duration = steps * 100; // reduced duration per cell
  
  animateSlide(sx, sy, tx, ty, duration, () => {
    // NEW: Record travelled cells
    const dx = Math.sign(tx - sx);
    const dy = Math.sign(ty - sy);
    for (let i = 1; i <= steps; i++) {
      pathTrace.push({ x: sx + i * dx, y: sy + i * dy });
    }
    // finalize position and update moves after animation
    player = { x: tx, y: ty };
    moves += steps;
    elMoves.textContent = moves;
    drawMaze();
    if (tx === goal.x && ty === goal.y) {
      clearInterval(timerInterval);
      const inc = getScoreIncrement(); // NEW: Compute score increment
      score += inc;
      elScore.textContent = score;
      setTimeout(() => {
        showWinPopup(moves, elTimer.textContent);
      }, 100);
    }
  });
});

document.addEventListener('touchend', e => {
  if (e.changedTouches.length !== 1) return;
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const diffX = touchEndX - touchStartX, diffY = touchEndY - touchStartY;
  if (Math.abs(diffX) < 30 && Math.abs(diffY) < 30) return; // ignore small swipes
  // If an animation is in progress, force complete the current move
  if (isAnimating) {
    cancelAnimationFrame(animationFrameId);
    isAnimating = false;
    player = currentTarget;
    drawMaze();
  }
  let dir;
  if (Math.abs(diffX) > Math.abs(diffY)) { // horizontal swipe
    dir = diffX > 0 ? {dx: 1, dy: 0} : {dx: -1, dy: 0};
  } else { // vertical swipe
    dir = diffY > 0 ? {dx: 0, dy: 1} : {dx: 0, dy: -1};
  }
  const { x: tx, y: ty, steps } = findSlideTarget(dir.dx, dir.dy);
  if (steps === 0) return;
  const sx = player.x, sy = player.y;
  const duration = steps * 100; // same per cell duration as keydown
  animateSlide(sx, sy, tx, ty, duration, () => {
    // NEW: Record travelled cells
    const dx = Math.sign(tx - sx);
    const dy = Math.sign(ty - sy);
    for (let i = 1; i <= steps; i++) {
      pathTrace.push({ x: sx + i * dx, y: sy + i * dy });
    }
    player = { x: tx, y: ty };
    moves += steps;
    elMoves.textContent = moves;
    drawMaze();
    if (tx === goal.x && ty === goal.y) {
      clearInterval(timerInterval);
      const inc = getScoreIncrement(); // NEW: Compute score increment
      score += inc;
      elScore.textContent = score;
      setTimeout(() => {
        showWinPopup(moves, elTimer.textContent);
      }, 100);
    }
  });
}, false);

// INITIAL SETUP
// hide stats until start
stats.classList.add('hidden');
drawInitialMessage();
