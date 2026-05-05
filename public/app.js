document.addEventListener('DOMContentLoaded', () => {
    // API URL
    const API_URL = 'http://localhost:3000/api';

    // DOM Elements - Auth
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const authForm = document.getElementById('auth-form');
    const toggleLogin = document.getElementById('toggle-login');
    const toggleSignup = document.getElementById('toggle-signup');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // DOM Elements - App
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const notesList = document.getElementById('notes-list');
    const newNoteBtn = document.getElementById('new-note-btn');
    const emptyState = document.getElementById('empty-state');
    const activeEditor = document.getElementById('active-editor');
    const noteTitle = document.getElementById('note-title');
    const noteContent = document.getElementById('note-content');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const saveStatus = document.getElementById('save-status');
    const toastContainer = document.getElementById('toast-container');

    // State
    let isLoginMode = true;
    let currentNoteId = null;
    let notes = [];
    let saveTimeout = null;

    // Check Auth Status on Load
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
        showApp(username);
    }

    // Auth Event Listeners
    toggleLogin.addEventListener('click', () => setAuthMode(true));
    toggleSignup.addEventListener('click', () => setAuthMode(false));
    
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = usernameInput.value.trim();
        const pass = passwordInput.value;
        
        if (!user || !pass) return showToast('Please fill all fields', 'error');

        const endpoint = isLoginMode ? '/login' : '/signup';
        
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Authentication failed');

            if (isLoginMode) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                showToast('Login successful!');
                showApp(data.username);
            } else {
                showToast('Signup successful! Please login.');
                setAuthMode(true);
                usernameInput.value = user;
                passwordInput.value = '';
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        showAuth();
    });

    // App Event Listeners
    newNoteBtn.addEventListener('click', createNote);
    
    noteTitle.addEventListener('input', scheduleSave);
    noteContent.addEventListener('input', scheduleSave);
    
    deleteNoteBtn.addEventListener('click', deleteNote);

    // Functions
    function setAuthMode(login) {
        isLoginMode = login;
        toggleLogin.classList.toggle('active', login);
        toggleSignup.classList.toggle('active', !login);
        authSubmitBtn.textContent = login ? 'Login' : 'Sign Up';
    }

    function showApp(username) {
        authContainer.classList.remove('active');
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        userGreeting.textContent = `Hello, ${username}`;
        fetchNotes();
    }

    function showAuth() {
        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        authContainer.classList.add('active');
        usernameInput.value = '';
        passwordInput.value = '';
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            if(toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3300);
    }

    async function fetchNotes() {
        try {
            const res = await fetch(`${API_URL}/notes`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.status === 401 || res.status === 403) return logoutBtn.click();
            notes = await res.json();
            renderNotesList();
        } catch (err) {
            showToast('Failed to load notes', 'error');
        }
    }

    function renderNotesList() {
        notesList.innerHTML = '';
        notes.forEach(note => {
            const el = document.createElement('div');
            el.className = `note-item ${currentNoteId === note.id ? 'active' : ''}`;
            el.innerHTML = `
                <div class="note-item-title">${note.title || 'Untitled Note'}</div>
                <div class="note-item-preview">${note.content ? note.content.substring(0, 30) + '...' : 'No content'}</div>
            `;
            el.addEventListener('click', () => selectNote(note));
            notesList.appendChild(el);
        });
    }

    function selectNote(note) {
        currentNoteId = note.id;
        emptyState.classList.remove('active');
        emptyState.classList.add('hidden');
        activeEditor.classList.remove('hidden');
        activeEditor.classList.add('active');
        
        noteTitle.value = note.title;
        noteContent.value = note.content;
        saveStatus.textContent = 'Saved';
        
        renderNotesList();
    }

    async function createNote() {
        try {
            const res = await fetch(`${API_URL}/notes`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({ title: '', content: '' })
            });
            const newNote = await res.json();
            notes.unshift(newNote);
            selectNote(newNote);
        } catch (err) {
            showToast('Failed to create note', 'error');
        }
    }

    function scheduleSave() {
        saveStatus.textContent = 'Saving...';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNote, 1000);
    }

    async function saveNote() {
        if (!currentNoteId) return;
        
        const title = noteTitle.value;
        const content = noteContent.value;

        try {
            await fetch(`${API_URL}/notes/${currentNoteId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({ title, content })
            });
            
            saveStatus.textContent = 'Saved';
            
            // Update local state
            const noteIndex = notes.findIndex(n => n.id === currentNoteId);
            if (noteIndex > -1) {
                notes[noteIndex].title = title;
                notes[noteIndex].content = content;
                renderNotesList();
            }
        } catch (err) {
            saveStatus.textContent = 'Failed to save';
            showToast('Failed to save note', 'error');
        }
    }

    async function deleteNote() {
        if (!currentNoteId) return;
        if (!confirm('Are you sure you want to delete this note?')) return;

        try {
            await fetch(`${API_URL}/notes/${currentNoteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            
            notes = notes.filter(n => n.id !== currentNoteId);
            currentNoteId = null;
            
            activeEditor.classList.remove('active');
            activeEditor.classList.add('hidden');
            emptyState.classList.remove('hidden');
            emptyState.classList.add('active');
            
            renderNotesList();
            showToast('Note deleted');
        } catch (err) {
            showToast('Failed to delete note', 'error');
        }
    }
});
