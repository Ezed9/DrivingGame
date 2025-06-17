// Game state and logic
class Game {
    constructor() {
        this.rooms = new Map(); // roomId -> { players: Map, objects: [] }
        this.maxPlayersPerRoom = 10;
    }

    // Create a new room
    createRoom() {
        const roomId = Math.random().toString(36).substr(2, 9);
        this.rooms.set(roomId, {
            players: new Map(),
            objects: [],
            lastActivity: Date.now()
        });
        console.log(`Created new room: ${roomId}`);
        return roomId;
    }

    // Find a room with available space or create a new one
    findAvailableRoom() {
        // Try to find a non-full room first
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.players.size < this.maxPlayersPerRoom) {
                return roomId;
            }
        }
        // If all rooms are full, create a new one
        return this.createRoom();
    }

    // Add player to a room
    addPlayer(socket, playerData) {
        const roomId = this.findAvailableRoom();
        const room = this.rooms.get(roomId);
        
        // Join the socket.io room
        socket.join(roomId);
        
        // Create player object
        const player = {
            id: socket.id,
            name: playerData.name || `Player_${socket.id.substring(0, 4)}`,
            position: playerData.position || { x: 0, y: 0, z: 0 },
            rotation: playerData.rotation || 0,
            velocity: { x: 0, y: 0, z: 0 },
            roomId,
            lastUpdate: Date.now(),
            input: { forward: false, backward: false, left: false, right: false }
        };
        
        room.players.set(socket.id, player);
        room.lastActivity = Date.now();
        
        console.log(`Player ${player.name} joined room ${roomId} (${room.players.size}/${this.maxPlayersPerRoom} players)`);
        
        return { player, room };
    }
    
    // Remove player from their room
    removePlayer(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.players.has(socketId)) {
                const player = room.players.get(socketId);
                room.players.delete(socketId);
                
                console.log(`Player ${player.name} left room ${roomId}`);
                
                // Clean up empty rooms
                if (room.players.size === 0) {
                    this.rooms.delete(roomId);
                    console.log(`Room ${roomId} is empty and has been removed`);
                }
                
                return { player, roomId };
            }
        }
        return null;
    }
    
    // Update player state
    updatePlayer(socketId, data) {
        for (const room of this.rooms.values()) {
            if (room.players.has(socketId)) {
                const player = room.players.get(socketId);
                
                // Update input state
                if (data.input) {
                    Object.assign(player.input, data.input);
                }
                
                // Update position/rotation if provided
                if (data.position) {
                    player.position = { ...player.position, ...data.position };
                }
                if (data.rotation !== undefined) {
                    player.rotation = data.rotation;
                }
                
                player.lastUpdate = Date.now();
                return { player, room };
            }
        }
        return null;
    }
    
    // Get player by socket ID
    getPlayer(socketId) {
        for (const room of this.rooms.values()) {
            if (room.players.has(socketId)) {
                return room.players.get(socketId);
            }
        }
        return null;
    }
    
    // Get all players in the same room as the given player
    getRoomPlayers(socketId) {
        for (const room of this.rooms.values()) {
            if (room.players.has(socketId)) {
                return Array.from(room.players.values());
            }
        }
        return [];
    }
    
    // Get all players in the same room except the given player
    getOtherPlayers(socketId) {
        for (const room of this.rooms.values()) {
            if (room.players.has(socketId)) {
                return Array.from(room.players.values())
                    .filter(player => player.id !== socketId);
            }
        }
        return [];
    }
    
    // Clean up inactive rooms
    cleanupInactiveRooms(maxInactiveTime = 5 * 60 * 1000) { // 5 minutes
        const now = Date.now();
        let removed = 0;
        
        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.lastActivity > maxInactiveTime) {
                console.log(`Room ${roomId} has been inactive and is being removed`);
                this.rooms.delete(roomId);
                removed++;
            }
        }
        
        if (removed > 0) {
            console.log(`Cleaned up ${removed} inactive rooms`);
        }
        
        return removed;
    }
}

module.exports = Game;
