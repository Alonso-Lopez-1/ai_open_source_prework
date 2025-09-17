class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.players = {};
        this.avatars = {};
        this.myPlayerId = null;
        this.myPlayer = null;
        this.avatarImages = {}; // Cache for preloaded avatar images
        
        // Movement state
        this.keysPressed = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.isMoving = false;
        
        // Viewport/camera
        this.viewportX = 0;
        this.viewportY = 0;
        
        // WebSocket
        this.ws = null;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupEventListeners();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.updateViewport();
            this.drawWorld();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.drawWorld();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    drawWorld() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportX, this.viewportY, this.canvas.width, this.canvas.height,  // Source rectangle (viewport)
            0, 0, this.canvas.width, this.canvas.height  // Destination rectangle (full canvas)
        );
        
        // Draw all players
        this.drawPlayers();
    }
    
    drawPlayers() {
        Object.values(this.players).forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    drawPlayer(player) {
        if (!this.avatars[player.avatar] || !this.avatarImages[player.avatar]) return;
        
        // Calculate screen position (world position - viewport offset)
        const screenX = player.x - this.viewportX;
        const screenY = player.y - this.viewportY;
        
        // Only draw if player is visible on screen
        if (screenX < -50 || screenX > this.canvas.width + 50 || 
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        const direction = player.facing;
        const frame = player.animationFrame || 0;
        
        // Get the appropriate frame for the direction
        let img;
        let flipHorizontal = false;
        
        if (direction === 'west') {
            img = this.avatarImages[player.avatar].east[frame];
            flipHorizontal = true;
        } else {
            img = this.avatarImages[player.avatar][direction][frame];
        }
        
        if (!img || !img.complete) return;
        
        // Save context state
        this.ctx.save();
        
        // Move to player position and flip if needed
        this.ctx.translate(screenX, screenY);
        if (flipHorizontal) {
            this.ctx.scale(-1, 1);
        }
        
        // Draw avatar (assuming 32x32 size, adjust as needed)
        const avatarSize = 32;
        this.ctx.drawImage(img, -avatarSize/2, -avatarSize/2, avatarSize, avatarSize);
        
        // Restore context state
        this.ctx.restore();
        
        // Draw username label
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const labelX = screenX;
        const labelY = screenY - avatarSize/2 - 5;
        
        // Draw text with outline
        this.ctx.strokeText(player.username, labelX, labelY);
        this.ctx.fillText(player.username, labelX, labelY);
        
        this.ctx.restore();
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    console.error('Error parsing server message:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    this.connectToServer();
                }, 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Alonso'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
        console.log('Sent join game message');
    }
    
    handleServerMessage(message) {
        console.log('Received message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.myPlayerId = message.playerId;
                    this.players = message.players;
                    this.avatars = message.avatars;
                    this.myPlayer = this.players[this.myPlayerId];
                    this.preloadAvatarImages();
                    this.updateViewport();
                    this.drawWorld();
                    console.log('Successfully joined game as', this.myPlayer.username);
                } else {
                    console.error('Failed to join game:', message.error);
                }
                break;
                
            case 'player_joined':
                this.players[message.player.id] = message.player;
                this.avatars[message.avatar.name] = message.avatar;
                this.preloadAvatarImages();
                this.drawWorld();
                break;
                
            case 'players_moved':
                Object.assign(this.players, message.players);
                this.updateViewport();
                this.drawWorld();
                break;
                
            case 'player_left':
                delete this.players[message.playerId];
                this.drawWorld();
                break;
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    preloadAvatarImages() {
        Object.values(this.avatars).forEach(avatar => {
            if (!this.avatarImages[avatar.name]) {
                this.avatarImages[avatar.name] = {};
                
                // Preload all frames for all directions
                ['north', 'south', 'east'].forEach(direction => {
                    this.avatarImages[avatar.name][direction] = [];
                    avatar.frames[direction].forEach((frameData, index) => {
                        const img = new Image();
                        img.src = frameData;
                        this.avatarImages[avatar.name][direction][index] = img;
                    });
                });
            }
        });
    }
    
    sendMoveCommand(direction) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.ws.send(JSON.stringify(moveMessage));
        console.log(`Moving ${direction}`);
    }
    
    sendStopCommand() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(stopMessage));
        console.log('Stopped moving');
    }
    
    checkMovementState() {
        const wasMoving = this.isMoving;
        this.isMoving = Object.values(this.keysPressed).some(pressed => pressed);
        
        // If we were moving but now we're not, send stop command
        if (wasMoving && !this.isMoving) {
            this.sendStopCommand();
        }
    }
    
    updateViewport() {
        if (!this.myPlayer) return;
        
        // Center the viewport on my avatar
        this.viewportX = this.myPlayer.x - this.canvas.width / 2;
        this.viewportY = this.myPlayer.y - this.canvas.height / 2;
        
        // Clamp viewport to world boundaries
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
    }

    setupEventListeners() {
        // Add click event for future click-to-move functionality
        this.canvas.addEventListener('click', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            console.log(`Clicked at: (${x}, ${y})`);
        });
        
        // Add keyboard event listeners for movement
        document.addEventListener('keydown', (event) => {
            // Prevent default browser behavior for arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
            }
            
            let direction = null;
            let keyName = null;
            
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'up';
                    keyName = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'down';
                    keyName = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'left';
                    keyName = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'right';
                    keyName = 'right';
                    break;
            }
            
            if (direction && keyName && !this.keysPressed[keyName]) {
                this.keysPressed[keyName] = true;
                this.sendMoveCommand(direction);
                this.checkMovementState();
            }
        });
        
        document.addEventListener('keyup', (event) => {
            let keyName = null;
            
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    keyName = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    keyName = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    keyName = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    keyName = 'right';
                    break;
            }
            
            if (keyName && this.keysPressed[keyName]) {
                this.keysPressed[keyName] = false;
                this.checkMovementState();
            }
        });
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
