const express = require('express');
const { db } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-for-jwt-development';

// Middleware
app.use(express.json());
app.use(cors());

// Database Initialization (Postgres)
const initDB = async () => {
    try {
        const client = await db.connect();
        await client.sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );
        `;
        await client.sql`
            CREATE TABLE IF NOT EXISTS notes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                title TEXT,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('Postgres Database initialized');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Routes
// 1. Signup
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { rows } = await db.sql`
            INSERT INTO users (username, password) 
            VALUES (${username}, ${hashedPassword}) 
            RETURNING id
        `;
        res.status(201).json({ message: 'User created successfully', id: rows[0].id });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Username already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const { rows } = await db.sql`SELECT * FROM users WHERE username = ${username}`;
        const user = rows[0];

        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3. Get Notes
app.get('/api/notes', authenticateToken, async (req, res) => {
    try {
        const { rows } = await db.sql`
            SELECT * FROM notes 
            WHERE user_id = ${req.user.id} 
            ORDER BY created_at DESC
        `;
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. Create Note
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { title, content } = req.body;
    try {
        const { rows } = await db.sql`
            INSERT INTO notes (user_id, title, content) 
            VALUES (${req.user.id}, ${title}, ${content}) 
            RETURNING id, title, content, created_at
        `;
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. Delete Note
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const noteId = req.params.id;
    try {
        const { rowCount } = await db.sql`
            DELETE FROM notes 
            WHERE id = ${noteId} AND user_id = ${req.user.id}
        `;
        if (rowCount === 0) return res.status(404).json({ error: 'Note not found or unauthorized' });
        res.json({ message: 'Note deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 6. Update Note
app.put('/api/notes/:id', authenticateToken, async (req, res) => {
    const noteId = req.params.id;
    const { title, content } = req.body;
    try {
        const { rowCount } = await db.sql`
            UPDATE notes 
            SET title = ${title}, content = ${content} 
            WHERE id = ${noteId} AND user_id = ${req.user.id}
        `;
        if (rowCount === 0) return res.status(404).json({ error: 'Note not found or unauthorized' });
        res.json({ message: 'Note updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Initialize DB tables
initDB();

module.exports = app;
