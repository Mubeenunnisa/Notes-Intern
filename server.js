const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-for-jwt-development';

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const dbPath = process.env.VERCEL ? '/tmp/database.sqlite' : './database.sqlite';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
    }
});

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
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
            if (err) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            res.status(201).json({ message: 'User created successfully', id: this.lastID });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    });
});

// 3. Get Notes
app.get('/api/notes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(rows);
    });
});

// 4. Create Note
app.post('/api/notes', authenticateToken, (req, res) => {
    const { title, content } = req.body;
    db.run('INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)', [req.user.id, title, content], function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.status(201).json({ id: this.lastID, title, content, created_at: new Date().toISOString() });
    });
});

// 5. Delete Note
app.delete('/api/notes/:id', authenticateToken, (req, res) => {
    const noteId = req.params.id;
    db.run('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteId, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Note not found or unauthorized' });
        res.json({ message: 'Note deleted' });
    });
});

// 6. Update Note
app.put('/api/notes/:id', authenticateToken, (req, res) => {
    const noteId = req.params.id;
    const { title, content } = req.body;
    db.run('UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?', [title, content, noteId, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Note not found or unauthorized' });
        res.json({ message: 'Note updated' });
    });
});

if (process.env.NODE_ENV !== 'production' && require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
