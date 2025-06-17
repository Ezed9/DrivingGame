const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingInterval: 10000,  // 10 seconds
    pingTimeout: 5000,    // 5 seconds
    maxHttpBufferSize: 1e6 // 1MB
});

// Initialize game
const game = new Game();

// Serve static files from the public and client directories
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../client')));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        rooms: game.rooms.size,
        players: Array.from(game.rooms.values())
            .reduce((sum, room) => sum + room.players.size, 0)
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Handle player joining
    socket.on('player-join', (playerData) => {
        try {
            const { player, room } = game.addPlayer(socket, playerData);
            
            // Send room info to the new player
            const roomPlayers = Array.from(room.players.values())
                .filter(p => p.id !== socket.id)
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    position: p.position,
                    rotation: p.rotation
                }));
            
            socket.emit('join-success', {
                id: player.id,
                roomId: player.roomId,
                players: roomPlayers
            });
            
            // Notify other players in the room about the new player
            socket.to(player.roomId).emit('player-joined', {
                id: player.id,
                name: player.name,
                position: player.position,
                rotation: player.rotation
            });
            
        } catch (error) {
            console.error('Error adding player:', error);
            socket.emit('error', { message: 'Failed to join game' });
        }
    });
    
    // Handle player input
    socket.on('player-input', (input) => {
        try {
            const result = game.updatePlayer(socket.id, { input });
            if (result) {
                // Broadcast input to room (for prediction/reconciliation)
                socket.to(result.player.roomId).emit('player-input-update', {
                    id: socket.id,
                    input: result.player.input
                });
            }
        } catch (error) {
            console.error('Error updating player input:', error);
        }
    });
    
    // Handle player movement update
    socket.on('player-update', (data) => {
        try {
            const result = game.updatePlayer(socket.id, data);
            if (result) {
                // Broadcast update to other players in the same room
                socket.to(result.player.roomId).emit('player-updated', {
                    id: socket.id,
                    position: result.player.position,
                    rotation: result.player.rotation,
                    velocity: result.player.velocity,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error updating player:', error);
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        try {
            const result = game.removePlayer(socket.id);
            if (result) {
                console.log(`Player ${result.player.name} (${socket.id}) disconnected`);
                // Notify other players in the room
                io.to(result.roomId).emit('player-left', { id: socket.id });
            }
        } catch (error) {
            console.error('Error removing player:', error);
        }
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Clean up inactive rooms every 5 minutes
setInterval(() => game.cleanupInactiveRooms(), 5 * 60 * 1000);

// Handle server shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Max players per room: ${game.maxPlayersPerRoom}`);
});
