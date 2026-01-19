const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// EXACT working configuration from sample
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // 10MB for voice messages
});

app.use(express.static(path.join(process.cwd())));

let waitingUser = null;
let onlineCount = 0;

// Add gender check in matching logic
io.on('connection', (socket) => {
    // ... existing code ...
    
    socket.on('find-match', (userData) => {
        socket.userData = userData;
        
        // Fix: Ensure gender is properly passed
        if (!userData.gender) {
            userData.gender = 'Other'; // Default value
        }
        
        console.log('User joined:', userData.name, 'Gender:', userData.gender);
        
        if (waitingUser && waitingUser.id !== socket.id) {
            const partner = waitingUser;
            // Create match regardless of gender (for testing)
            // For production, you can add gender preference logic here
            
            const roomId = `room-${socket.id}-${partner.id}`;
            
            socket.join(roomId);
            partner.join(roomId);
            
            socket.currentRoom = roomId;
            partner.currentRoom = roomId;
            socket.partnerId = partner.id;
            partner.partnerId = socket.id;

            // Send CORRECT gender data
            socket.emit('match-found', {
                name: partner.userData.name,
                age: partner.userData.age,
                gender: partner.userData.gender, // FIXED: Use partner's actual gender
                city: partner.userData.city,
                icon: getGenderIcon(partner.userData.gender) // FIXED: Get correct icon
            });
            
            partner.emit('match-found', {
                name: socket.userData.name,
                age: socket.userData.age,
                gender: socket.userData.gender, // FIXED: Use correct gender
                city: socket.userData.city,
                icon: getGenderIcon(socket.userData.gender) // FIXED: Get correct icon
            });
            
            waitingUser = null;
        } else {
            waitingUser = socket;
            socket.emit('status', 'Waiting for partner...');
        }
    });
    
    // ... rest of code ...
});

// Helper function to get gender icon
function getGenderIcon(gender) {
    switch(gender?.toLowerCase()) {
        case 'male': return '👨';
        case 'female': return '👩';
        default: return '👤';
    }
}

// Serve your HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'chat.html'));
});

app.get('/privacy.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'privacy.html'));
});

app.get('/terms.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'terms.html'));
});

// Add these socket events to your existing server.js

io.on('connection', (socket) => {
    // ... existing code ...
    
    // Typing indicators
    socket.on('typing-start', () => {
        const partnerId = socket.partnerId;
        if (partnerId && io.sockets.sockets.get(partnerId)) {
            io.to(partnerId).emit('typing-start');
        }
    });
    
    socket.on('typing-stop', () => {
        const partnerId = socket.partnerId;
        if (partnerId && io.sockets.sockets.get(partnerId)) {
            io.to(partnerId).emit('typing-stop');
        }
    });
    
    // Message status (seen/delivered)
    socket.on('message-status', (data) => {
        if (data.partnerId && io.sockets.sockets.get(data.partnerId)) {
            io.to(data.partnerId).emit('message-seen', data);
        }
    });
    
    // ... rest of existing code ...
});

// SOCKET.IO LOGIC FROM WORKING SAMPLE
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    onlineCount++;
    io.emit('user-count', onlineCount);

    socket.on('find-match', (userData) => {
        console.log('User wants match:', userData.name);
        socket.userData = userData;
        
        if (waitingUser && waitingUser.id !== socket.id) {
            const partner = waitingUser;
            const roomId = `room-${socket.id}-${partner.id}`;
            
            socket.join(roomId);
            partner.join(roomId);
            
            socket.currentRoom = roomId;
            partner.currentRoom = roomId;
            socket.partnerId = partner.id;
            partner.partnerId = socket.id;

            socket.emit('match-found', partner.userData);
            partner.emit('match-found', socket.userData);
            waitingUser = null;
            
            console.log(`Matched: ${socket.userData.name} with ${partner.userData.name}`);
        } else {
            waitingUser = socket;
            socket.emit('status', { message: 'Waiting for partner...', count: onlineCount });
        }
    });

    socket.on('send-message', (content) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('receive-message', content);
        }
    });

    socket.on('end-chat', () => {
        const partnerId = socket.partnerId;
        if (partnerId && io.sockets.sockets.get(partnerId)) {
            io.to(partnerId).emit('partner-disconnected');
            io.sockets.sockets.get(partnerId).partnerId = null;
            io.sockets.sockets.get(partnerId).currentRoom = null;
        }
        socket.partnerId = null;
        socket.currentRoom = null;
        waitingUser = socket;
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        onlineCount = Math.max(0, onlineCount - 1);
        io.emit('user-count', onlineCount);

        if (socket.currentRoom) {
            io.to(socket.currentRoom).emit('partner-disconnected');
            const partnerSocket = io.sockets.sockets.get(socket.partnerId);
            if (partnerSocket) {
                partnerSocket.leave(socket.currentRoom);
                partnerSocket.currentRoom = null;
                partnerSocket.partnerId = null;
            }
        }
        if (waitingUser && waitingUser.id === socket.id) waitingUser = null;
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        online: onlineCount,
        waiting: waitingUser ? 1 : 0,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Indian Omegle Server running on port ${PORT}`);
    console.log(`🌐 Live at: http://localhost:${PORT}`);
});
