// Game constants
const CONSTANTS = {
    // Physics
    ACCELERATION: 15.0,
    ROTATION_SPEED: 2.5,
    MAX_SPEED: 30.0,
    DRAG: 0.95,
    
    // Network
    SEND_RATE: 20, // Updates per second
    INTERPOLATION_BUFFER_SIZE: 10,
    LERP_FACTOR: 0.2, // How quickly to interpolate between positions (0-1)
    PREDICTION: true, // Enable client-side prediction
    
    // Game
    MAP_SIZE: 1000,
    OBSTACLE_COUNT: 50
};

// Game state
const gameState = {
    // Player info
    playerId: null,
    playerName: `Player${Math.floor(Math.random() * 1000)}`,
    roomId: null,
    
    // Game objects
    players: {},
    scene: null,
    camera: null,
    renderer: null,
    car: null,
    
    // Physics
    clock: new THREE.Clock(),
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    lastSentPosition: new THREE.Vector3(),
    lastSentRotation: 0,
    lastSendTime: 0,
    
    // Input
    keys: {},
    input: {
        forward: false,
        backward: false,
        left: false,
        right: false
    },
    
    // Touch controls
    touchControls: {
        activeTouches: {},
        forward: { active: false, element: null },
        backward: { active: false, element: null },
        left: { active: false, element: null },
        right: { active: false, element: null }
    },
    
    // Networking
    socket: null,
    
    // Stats
    stats: {
        fps: 0,
        ping: 0,
        players: 0
    },
    
    // Debug
    debug: {
        showStats: true,
        showHitboxes: false
    }
};

// Initialize the game
function init() {
    // Set up event listeners
    setupEventListeners();
    
    // Initialize Three.js
    initThree();
    
    // Initialize debug stats
    initStats();
    
    // Start the game loop
    animate();
}

// Set up event listeners
function setupEventListeners() {
    // Start button
    document.getElementById('start-btn').addEventListener('click', startGame);
    
    // Keyboard input
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Touch controls for mobile
    setupTouchControls();
    
    // Window resize
    window.addEventListener('resize', onWindowResize, false);
}

// Handle keyboard input
function onKeyDown(event) {
    // Prevent default for game control keys to avoid browser hotkeys
    const controlKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
    if (controlKeys.includes(event.code)) {
        event.preventDefault();
    }
    
    gameState.keys[event.code] = true;
    
    // Update input state
    gameState.input.forward = gameState.keys['ArrowUp'] || gameState.keys['KeyW'] || false;
    gameState.input.backward = gameState.keys['ArrowDown'] || gameState.keys['KeyS'] || false;
    gameState.input.left = gameState.keys['ArrowLeft'] || gameState.keys['KeyA'] || false;
    gameState.input.right = gameState.keys['ArrowRight'] || gameState.keys['KeyD'] || false;
    
    // Toggle debug panel with F3
    if (event.code === 'F3') {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
        }
        event.preventDefault();
    }
    
    // Toggle fullscreen with F11
    if (event.code === 'F11') {
        toggleFullscreen();
        event.preventDefault();
    }
}

function onKeyUp(event) {
    gameState.keys[event.code] = false;
    
    // Update input state
    gameState.input.forward = gameState.keys['ArrowUp'] || gameState.keys['KeyW'] || false;
    gameState.input.backward = gameState.keys['ArrowDown'] || gameState.keys['KeyS'] || false;
    gameState.input.left = gameState.keys['ArrowLeft'] || gameState.keys['KeyA'] || false;
    gameState.input.right = gameState.keys['ArrowRight'] || gameState.keys['KeyD'] || false;
}

// Update input state and send to server
function updateInputState() {
    const newInput = {
        forward: gameState.keys['KeyW'] || gameState.keys['ArrowUp'],
        backward: gameState.keys['KeyS'] || gameState.keys['ArrowDown'],
        left: gameState.keys['KeyA'] || gameState.keys['ArrowLeft'],
        right: gameState.keys['KeyD'] || gameState.keys['ArrowRight']
    };
    
    // Only send if input changed
    if (JSON.stringify(newInput) !== JSON.stringify(gameState.input)) {
        gameState.input = newInput;
        
        // Send input to server
        if (gameState.socket && gameState.socket.connected) {
            gameState.socket.emit('player-input', gameState.input);
        }
    }
}

// Set up touch controls for mobile
function setupTouchControls() {
    // Only setup touch controls on mobile devices
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
        return;
    }
    
    // Create touch controls container
    const controls = document.createElement('div');
    controls.id = 'touch-controls';
    controls.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: space-between;
        padding: 0 20px;
        z-index: 1000;
        touch-action: manipulation;
        user-select: none;
        pointer-events: none;
    `;
    
    // Create directional pad (left side)
    const dpad = document.createElement('div');
    dpad.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 5px;
        pointer-events: auto;
    `;
    
    // Create action buttons (right side)
    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: auto;
    `;
    
    // Helper function to create control buttons
    function createButton(id, label, position) {
        const btn = document.createElement('div');
        btn.id = `${id}-btn`;
        btn.textContent = label;
        btn.style.cssText = `
            width: 60px;
            height: 60px;
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
            touch-action: manipulation;
            user-select: none;
            pointer-events: auto;
        `;
        
        // Add touch events
        const setActive = (active) => {
            gameState.touchControls[id].active = active;
            btn.style.background = active 
                ? 'rgba(255, 255, 255, 0.4)' 
                : 'rgba(255, 255, 255, 0.2)';
            
            // Update input state
            gameState.input[id] = active;
        };
        
        // Handle touch start
        const handleTouchStart = (e) => {
            e.preventDefault();
            setActive(true);
            // Store which touch is controlling which button
            for (let i = 0; i < e.changedTouches.length; i++) {
                gameState.touchControls.activeTouches[e.changedTouches[i].identifier] = id;
            }
        };
        
        // Handle touch end
        const handleTouchEnd = (e) => {
            e.preventDefault();
            // Only deactivate if this touch was controlling this button
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touchId = e.changedTouches[i].identifier;
                if (gameState.touchControls.activeTouches[touchId] === id) {
                    delete gameState.touchControls.activeTouches[touchId];
                    // Check if there are no more touches controlling this button
                    const isStillActive = Object.values(gameState.touchControls.activeTouches).some(v => v === id);
                    if (!isStillActive) {
                        setActive(false);
                    }
                }
            }
        };
        
        // Add event listeners
        btn.addEventListener('touchstart', handleTouchStart, { passive: false });
        btn.addEventListener('touchend', handleTouchEnd, { passive: false });
        btn.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        // For testing on desktop
        btn.addEventListener('mousedown', () => setActive(true));
        btn.addEventListener('mouseup', () => setActive(false));
        btn.addEventListener('mouseleave', () => setActive(false));
        
        // Store reference
        gameState.touchControls[id].element = btn;
        
        return btn;
    };
    
    // Create D-pad buttons
    const up = document.createElement('div');
    const left = document.createElement('div');
    const center = document.createElement('div');
    const right = document.createElement('div');
    const down = document.createElement('div');
    
    up.gridArea = '1 / 2 / 2 / 3';
    left.gridArea = '2 / 1 / 3 / 2';
    center.gridArea = '2 / 2 / 3 / 3';
    right.gridArea = '2 / 3 / 3 / 4';
    down.gridArea = '3 / 2 / 4 / 3';
    
    // Create and add buttons to the grid
    [up, left, center, right, down].forEach(el => {
        el.style.gridArea = el.gridArea;
        dpad.appendChild(el);
    });
    
    // Add control buttons to the D-pad
    createButton('forward', '↑', up);
    createButton('left', '←', left);
    createButton('right', '→', right);
    createButton('backward', '↓', down);
    
    // Add to controls container
    controls.appendChild(dpad);
    document.body.appendChild(controls);
    
    // Prevent touch events from propagating to the document
    const preventDefault = (e) => e.preventDefault();
    controls.addEventListener('touchstart', preventDefault, { passive: false });
    controls.addEventListener('touchmove', preventDefault, { passive: false });
    controls.addEventListener('touchend', preventDefault, { passive: false });
    
    // Handle document-level touch end to prevent stuck controls
    document.addEventListener('touchend', (e) => {
        // If no more touches, clear all active controls
        if (e.touches.length === 0) {
            Object.keys(gameState.touchControls.activeTouches).forEach(touchId => {
                const controlId = gameState.touchControls.activeTouches[touchId];
                if (gameState.touchControls[controlId]) {
                    gameState.touchControls[controlId].active = false;
                    if (gameState.touchControls[controlId].element) {
                        gameState.touchControls[controlId].element.style.background = 'rgba(255, 255, 255, 0.2)';
                    }
                }
            });
            gameState.touchControls.activeTouches = {};
            
            // Reset input states
            Object.keys(gameState.input).forEach(key => {
                gameState.input[key] = false;
            });
        }
    });
    
    // Prevent context menu on long press
    document.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Initialize stats panel
function initStats() {
    const statsPanel = document.createElement('div');
    statsPanel.id = 'stats-panel';
    statsPanel.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.5);
        color: #0f0;
        font-family: monospace;
        padding: 10px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 12px;
        display: none;
    `;
    
    statsPanel.innerHTML = `
        <div>FPS: <span id="fps">0</span></div>
        <div>Ping: <span id="ping">0</span>ms</div>
        <div>Players: <span id="player-count">1</span></div>
    `;
    
    document.body.appendChild(statsPanel);
    
    // Toggle stats with F3
    document.addEventListener('keydown', (e) => {
        if (e.code === 'F3') {
            statsPanel.style.display = statsPanel.style.display === 'none' ? 'block' : 'none';
        }
    });
}

// Initialize Three.js
function initThree() {
    // Create scene
    gameState.scene = new THREE.Scene();
    
    // Create camera
    gameState.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    gameState.camera.position.set(0, 5, 10);
    gameState.camera.lookAt(0, 0, 0);
    
    // Create renderer
    gameState.renderer = new THREE.WebGLRenderer({ antialias: true });
    gameState.renderer.setSize(window.innerWidth, window.innerHeight);
    gameState.renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(gameState.renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    gameState.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    gameState.scene.add(directionalLight);
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a5f0b,
        side: THREE.DoubleSide 
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    gameState.scene.add(ground);
    
    // Create a simple car
    createCar();
}

// Create a simple car
function createCar() {
    const car = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 4);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = 0.25;
    car.add(body);
    
    // Car top
    const topGeometry = new THREE.BoxGeometry(1.5, 0.5, 2);
    const topMaterial = new THREE.MeshPhongMaterial({ color: 0x2980b9 });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.castShadow = true;
    top.receiveShadow = true;
    top.position.y = 0.5;
    top.position.z = -0.3;
    car.add(top);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    
    const wheels = [];
    const wheelPositions = [
        { x: -0.8, y: -0.2, z: 1.2 },
        { x: 0.8, y: -0.2, z: 1.2 },
        { x: -0.8, y: -0.2, z: -1.2 },
        { x: 0.8, y: -0.2, z: -1.2 }
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        car.add(wheel);
        wheels.push(wheel);
    });
    
    car.wheels = wheels;
    gameState.car = car;
    gameState.scene.add(car);
}

// Toggle fullscreen mode
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Handle window resize
function onWindowResize() {
    if (gameState.camera && gameState.renderer) {
        gameState.camera.aspect = window.innerWidth / window.innerHeight;
        gameState.camera.updateProjectionMatrix();
        gameState.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Add a name tag above a car
function addNameTag(car, name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    
    // Draw name tag background
    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw name
    context.font = 'Bold 40px Arial';
    context.textAlign = 'center';
    context.fillStyle = 'white';
    context.fillText(name, canvas.width / 2, canvas.height / 2 + 15);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        depthTest: false
    });
    
    // Create sprite and add to car
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3, 1.5, 1);
    sprite.position.y = 2;
    car.add(sprite);
    
    return sprite;
}

// Create a car for another player
function createPlayerCar(playerData) {
    const car = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 4);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xe74c3c, // Different color for other players
        transparent: true,
        opacity: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = 0.25;
    car.add(body);
    
    // Car top
    const topGeometry = new THREE.BoxGeometry(1.5, 0.5, 2);
    const topMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xc0392b,
        transparent: true,
        opacity: 0.8
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.castShadow = true;
    top.receiveShadow = true;
    top.position.y = 0.5;
    top.position.z = -0.3;
    car.add(top);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    
    const wheelPositions = [
        { x: -0.8, y: -0.2, z: 1.2 },
        { x: 0.8, y: -0.2, z: 1.2 },
        { x: -0.8, y: -0.2, z: -1.2 },
        { x: 0.8, y: -0.2, z: -1.2 }
    ];
    
    const wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        car.add(wheel);
        wheels.push(wheel);
    });
    
    // Store wheels for animation
    car.wheels = wheels;
    
    return car;
}

// Start the game
function startGame() {
    const nameInput = document.getElementById('player-name');
    gameState.playerName = nameInput.value.trim() || 'Player';
    
    if (gameState.playerName.length < 2 || gameState.playerName.length > 20) {
        alert('Please enter a name between 2 and 20 characters');
        return;
    }
    
    // Hide start screen with fade out
    const startScreen = document.getElementById('start-screen');
    startScreen.style.transition = 'opacity 0.5s';
    startScreen.style.opacity = '0';
    
    setTimeout(() => {
        startScreen.classList.add('hidden');
        startScreen.style.opacity = '1';
    }, 500);
    
    // Show loading indicator
    const loading = document.createElement('div');
    loading.id = 'loading';
    loading.textContent = 'Connecting to server...';
    loading.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 24px;
        text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
        z-index: 1000;
    `;
    document.body.appendChild(loading);
    
    // Connect to server
    connectToServer();
}

// Connect to the server
function connectToServer() {
    // Connect to the server
    gameState.socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
    });
    
    // Connection established
    gameState.socket.on('connect', () => {
        console.log('Connected to server with ID:', gameState.socket.id);
        
        // Hide loading indicator
        const loading = document.getElementById('loading');
        if (loading) loading.remove();
        
        // Send join request
        gameState.socket.emit('player-join', {
            name: gameState.playerName,
            position: { x: 0, y: 0, z: 0 },
            rotation: 0
        });
    });
    
    // Handle successful join
    gameState.socket.on('join-success', (data) => {
        console.log('Joined room:', data.roomId);
        gameState.playerId = data.id;
        gameState.roomId = data.roomId;
        
        // Add existing players
        data.players.forEach(player => {
            addOtherPlayer(player);
        });
        
        updatePlayerCount();
    });
    
    // Handle new player joining
    gameState.socket.on('player-joined', (player) => {
        console.log('New player joined:', player);
        if (player.id !== gameState.playerId) {
            addOtherPlayer(player);
            updatePlayerCount();
        }
    });
    
    // Handle player input updates (for prediction/reconciliation)
    gameState.socket.on('player-input-update', (data) => {
        const player = gameState.players[data.id];
        if (player) {
            player.input = data.input;
        }
    });
    
    // Handle player state updates
    gameState.socket.on('player-updated', (data) => {
        const now = Date.now();
        const player = gameState.players[data.id];
        
        if (player) {
            // Update interpolation buffer
            if (!player.buffer) {
                player.buffer = [];
            }
            
            // Add new state to buffer with timestamp
            player.buffer.push({
                position: data.position,
                rotation: data.rotation,
                velocity: data.velocity,
                timestamp: data.timestamp || now
            });
            
            // Keep buffer size limited
            if (player.buffer.length > CONSTANTS.INTERPOLATION_BUFFER_SIZE) {
                player.buffer.shift();
            }
            
            // Update ping
            if (data.id === gameState.playerId) {
                const rtt = now - data.timestamp;
                gameState.stats.ping = Math.round(rtt / 2);
                updateStats();
            }
        }
    });
    
    // Handle player disconnection
    gameState.socket.on('player-left', (data) => {
        console.log('Player left:', data.id);
        removePlayer(data.id);
        updatePlayerCount();
    });
    
    // Handle errors
    gameState.socket.on('error', (error) => {
        console.error('Socket error:', error);
        showNotification(`Error: ${error.message || 'Connection error'}`, 'error');
    });
    
    gameState.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showNotification('Connection error. Attempting to reconnect...', 'error');
    });
    
    gameState.socket.on('reconnect_attempt', () => {
        console.log('Attempting to reconnect...');
    });
    
    gameState.socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect');
        showNotification('Failed to connect to server. Please refresh the page.', 'error');
    });
}

// Show notification to the user
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: ${type === 'error' ? '#ff4444' : '#4CAF50'};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: none;
    `;
    
    document.body.appendChild(notification);
    
    // Trigger reflow
    void notification.offsetWidth;
    
    // Show notification
    notification.style.opacity = '1';
    notification.style.transform = 'translate(-50%, 10px)';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -20px)';
        
        // Remove from DOM after fade out
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Update player count display
function updatePlayerCount() {
    const count = Object.keys(gameState.players).length + 1; // +1 for local player
    gameState.stats.players = count;
    updateStats();
    
    const countElement = document.getElementById('player-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

// Update stats display
function updateStats() {
    const fpsElement = document.getElementById('fps');
    const pingElement = document.getElementById('ping');
    const playersElement = document.getElementById('player-count');
    
    if (fpsElement) fpsElement.textContent = Math.round(gameState.stats.fps);
    if (pingElement) pingElement.textContent = gameState.stats.ping;
    if (playersElement) playersElement.textContent = gameState.stats.players;
}

// Add a new player to the game
function addOtherPlayer(playerData) {
    if (!gameState.players[playerData.id]) {
        const car = createPlayerCar(playerData.id);
        car.position.set(
            playerData.position.x || 0,
            playerData.position.y || 0,
            playerData.position.z || 0
        );
        car.rotation.y = playerData.rotation || 0;
        
        gameState.players[playerData.id] = {
            id: playerData.id,
            name: playerData.name,
            mesh: car,
            position: { ...playerData.position },
            rotation: playerData.rotation || 0
        };
        
        gameState.scene.add(car);
    }
}

// Remove a player from the game
function removePlayer(playerId) {
    if (gameState.players[playerId]) {
        if (gameState.players[playerId].mesh) {
            gameState.scene.remove(gameState.players[playerId].mesh);
        }
        delete gameState.players[playerId];
    }
}

// Update player count display
function updatePlayerCount() {
    document.getElementById('player-count').textContent = `Players: ${Object.keys(gameState.players).length + 1}`;
}

// Game state update function
function updateGameState(deltaTime) {
    // Update local player
    updateLocalPlayer(deltaTime);
    
    // Update other players
    updateRemotePlayers(deltaTime);
    
    // Update camera
    updateCamera(deltaTime);
    
    // Update stats
    updateStats();
}

// Update local player movement and physics
function updateLocalPlayer(deltaTime) {
    if (!gameState.car) return;
    
    const car = gameState.car;
    const input = gameState.input;
    let moved = false;
    
    // Update input state based on keys
    input.forward = gameState.keys['ArrowUp'] || gameState.keys['KeyW'] || false;
    input.backward = gameState.keys['ArrowDown'] || gameState.keys['KeyS'] || false;
    input.left = gameState.keys['ArrowLeft'] || gameState.keys['KeyA'] || false;
    input.right = gameState.keys['ArrowRight'] || gameState.keys['KeyD'] || false;
    
    // Apply forces based on input
    if (input.forward) {
        gameState.velocity.z -= Math.cos(car.rotation.y) * CONSTANTS.ACCELERATION * deltaTime;
        gameState.velocity.x -= Math.sin(car.rotation.y) * CONSTANTS.ACCELERATION * deltaTime;
        moved = true;
    }
    
    if (input.backward) {
        gameState.velocity.z += Math.cos(car.rotation.y) * CONSTANTS.ACCELERATION * 0.6 * deltaTime;
        gameState.velocity.x += Math.sin(car.rotation.y) * CONSTANTS.ACCELERATION * 0.6 * deltaTime;
        moved = true;
    }
    
    // Apply rotation
    if (Math.abs(gameState.velocity.x) > 0.1 || Math.abs(gameState.velocity.z) > 0.1) {
        if (input.left) {
            car.rotation.y += CONSTANTS.ROTATION_SPEED * deltaTime * Math.sign(gameState.velocity.z);
            moved = true;
        }
        if (input.right) {
            car.rotation.y -= CONSTANTS.ROTATION_SPEED * deltaTime * Math.sign(gameState.velocity.z);
            moved = true;
        }
    }
    
    // Apply drag
    gameState.velocity.x *= Math.pow(CONSTANTS.DRAG, deltaTime);
    gameState.velocity.z *= Math.pow(CONSTANTS.DRAG, deltaTime);
    
    // Limit maximum speed
    const speed = Math.sqrt(gameState.velocity.x * gameState.velocity.x + gameState.velocity.z * gameState.velocity.z);
    if (speed > CONSTANTS.MAX_SPEED) {
        gameState.velocity.x = (gameState.velocity.x / speed) * CONSTANTS.MAX_SPEED;
        gameState.velocity.z = (gameState.velocity.z / speed) * CONSTANTS.MAX_SPEED;
    }
    
    // Apply velocity
    car.position.x += gameState.velocity.x * deltaTime;
    car.position.z += gameState.velocity.z * deltaTime;
    
    // Keep car on the ground
    car.position.y = 0.5;
    
    // Update wheel rotation and steering
    updateWheels(deltaTime, moved);
    
    // Send updates to server
    sendPlayerUpdate(moved);
}

// Update wheel rotation and steering
function updateWheels(deltaTime, isMoving) {
    if (!gameState.car?.wheels) return;
    
    const speed = Math.sqrt(
        gameState.velocity.x * gameState.velocity.x + 
        gameState.velocity.z * gameState.velocity.z
    );
    
    gameState.car.wheels.forEach((wheel, index) => {
        // Rotate wheels based on speed
        if (isMoving) {
            wheel.rotation.x += speed * 2 * deltaTime * Math.sign(gameState.velocity.z);
        }
        
        // Steer front wheels
        if (index < 2) { // Front wheels
            let targetRotation = Math.PI / 2; // Straight
            
            if (gameState.input.left) {
                targetRotation = Math.PI / 2 - 0.5;
            } else if (gameState.input.right) {
                targetRotation = Math.PI / 2 + 0.5;
            }
            
            // Smooth steering
            wheel.rotation.z += (targetRotation - wheel.rotation.z) * 0.2;
        }
    });
}

// Send player update to server
function sendPlayerUpdate(force = false) {
    if (!gameState.socket || !gameState.car) return;
    
    const now = Date.now();
    const pos = gameState.car.position;
    const rot = gameState.car.rotation.y;
    
    // Throttle updates
    if (force || now - gameState.lastSendTime > 1000 / CONSTANTS.SEND_RATE) {
        // Only send if position or rotation has changed significantly
        if (force || 
            Math.abs(pos.x - gameState.lastSentPosition.x) > 0.01 ||
            Math.abs(pos.z - gameState.lastSentPosition.z) > 0.01 ||
            Math.abs(rot - gameState.lastSentRotation) > 0.01) {
            
            gameState.lastSentPosition.copy(pos);
            gameState.lastSentRotation = rot;
            gameState.lastSendTime = now;
            
            gameState.socket.emit('player-update', {
                position: { x: pos.x, y: pos.y, z: pos.z },
                rotation: rot,
                velocity: {
                    x: gameState.velocity.x,
                    y: gameState.velocity.y,
                    z: gameState.velocity.z
                },
                timestamp: now
            });
        }
    }
}

// Update remote players with interpolation
function updateRemotePlayers(deltaTime) {
    const now = Date.now();
    
    Object.values(gameState.players).forEach(player => {
        if (!player.mesh) return;
        
        // Skip if no interpolation data
        if (!player.buffer || player.buffer.length === 0) {
            return;
        }
        
        // Find the two most recent positions to interpolate between
        let targetIndex = player.buffer.length - 1;
        while (targetIndex > 0 && player.buffer[targetIndex].timestamp > now - 100) {
            targetIndex--;
        }
        
        const target = player.buffer[targetIndex];
        
        // Remove old positions from buffer
        player.buffer = player.buffer.filter(
            p => p.timestamp > now - 1000 // Keep positions from the last second
        );
        
        // If we have a next position, interpolate
        if (targetIndex < player.buffer.length - 1) {
            const next = player.buffer[targetIndex + 1];
            const alpha = (now - target.timestamp) / (next.timestamp - target.timestamp);
            
            // Interpolate position
            player.mesh.position.lerpVectors(
                new THREE.Vector3(
                    target.position.x,
                    target.position.y,
                    target.position.z
                ),
                new THREE.Vector3(
                    next.position.x,
                    next.position.y,
                    next.position.z
                ),
                alpha
            );
            
            // Interpolate rotation (handle wrapping around 2*PI)
            player.mesh.rotation.y = target.rotation + 
                shortAngleDist(target.rotation, next.rotation) * alpha;
            
            // Update wheels
            if (player.mesh.wheels) {
                const speed = player.velocity ? 
                    Math.sqrt(
                        player.velocity.x * player.velocity.x + 
                        player.velocity.z * player.velocity.z
                    ) : 0;
                
                player.mesh.wheels.forEach((wheel, i) => {
                    if (speed > 0.1) {
                        wheel.rotation.x += speed * deltaTime * 2;
                    }
                });
            }
        } else if (player.velocity) {
            // If no next position but we have velocity, extrapolate
            const extrapolationTime = (now - target.timestamp) / 1000; // in seconds
            const extrapolatedPos = new THREE.Vector3(
                target.position.x + player.velocity.x * extrapolationTime,
                target.position.y,
                target.position.z + player.velocity.z * extrapolationTime
            );
            
            player.mesh.position.lerp(extrapolatedPos, 0.1);
            
            if (player.angularVelocity) {
                player.mesh.rotation.y = target.rotation + player.angularVelocity * extrapolationTime;
            }
        }
    });
}

// Helper function to find shortest angle distance
function shortAngleDist(a, b) {
    const max = Math.PI * 2;
    const da = (b - a) % max;
    return ((2 * da) % max) - da;
}

// Update camera to follow player
function updateCamera(deltaTime) {
    if (!gameState.camera || !gameState.car) return;
    
    // Calculate camera position behind and above the car
    const distance = 8;
    const height = 5;
    const lookAhead = 5;
    
    const targetPosition = new THREE.Vector3(
        gameState.car.position.x - Math.sin(gameState.car.rotation.y) * distance,
        gameState.car.position.y + height,
        gameState.car.position.z - Math.cos(gameState.car.rotation.y) * distance
    );
    
    // Smooth camera movement
    gameState.camera.position.lerp(targetPosition, 1 - Math.exp(-10 * deltaTime));
    
    // Look slightly ahead of the car
    const lookAtPosition = new THREE.Vector3(
        gameState.car.position.x + Math.sin(gameState.car.rotation.y) * lookAhead,
        gameState.car.position.y,
        gameState.car.position.z + Math.cos(gameState.car.rotation.y) * lookAhead
    );
    
    gameState.camera.lookAt(lookAtPosition);
}

// Main game loop
let lastTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    
    // Calculate delta time in seconds
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap at 100ms
    lastTime = currentTime;
    
    // Update FPS counter
    frameCount++;
    if (currentTime - lastFpsUpdate >= 1000) {
        gameState.stats.fps = Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = currentTime;
    }
    
    // Update game state
    updateGameState(deltaTime);
    
    // Render the scene
    if (gameState.renderer && gameState.scene && gameState.camera) {
        gameState.renderer.render(gameState.scene, gameState.camera);
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    if (gameState.camera && gameState.renderer) {
        gameState.camera.aspect = window.innerWidth / window.innerHeight;
        gameState.camera.updateProjectionMatrix();
        gameState.renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Start the game when the page loads
window.onload = init;
