const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Environment Variables with validation
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('⚠️ WARNING: Using default JWT_SECRET. Set JWT_SECRET in .env for production!');
    return 'your-super-secret-jwt-key-change-this';
})();
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'railway';
const DB_PORT = process.env.DB_PORT

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    console.log('✅ Created uploads directory');
}

// MIDDLEWARE CONFIGURATION (CORRECT ORDER)

// 1. CORS must come FIRST
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// 2. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Static files and uploads
app.use('/uploads', express.static('uploads'));
app.use(express.static('.'));

// File Upload Configuration with security
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'team-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, JPG, PNG and GIF images allowed.'), false);
    }
};

const upload = multer({ 
    storage, 
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    },
    fileFilter 
});



// Database Configuration
const dbConfig = {
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
    ssl: {
        rejectUnauthorized: false 
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);




// Test database connection
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Connection Pool established.');
        console.log(`✅ Database: ${DB_NAME}`);
        connection.release();
    })
    .catch(err => {
        console.error('❌ FATAL: Database connection error:', err.message);
        console.error('Check your .env file and ensure MySQL is running');
        console.error(`Trying to connect to: ${DB_HOST} as ${DB_USER}`);
        process.exit(1);
    });

// Email Transporter
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    console.log('✅ Email transporter configured');
} else {
    console.warn('⚠️ Email not configured. Set EMAIL_USER and EMAIL_PASS in .env');
}


// HELPER FUNCTIONS


async function sendEmail(to, subject, html) {
    if (!transporter) {
        console.warn('⚠️ Email not sent - transporter not configured');
        return false;
    }
    
    try {
        await transporter.sendMail({
            from: `"Tournament Portal" <${EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`✅ Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return false;
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Sport-specific position definitions
const SPORT_POSITIONS = {
    'Football (11v11)': ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'],
    'Cricket (T20)': ['Batsman', 'Bowler', 'All-rounder', 'Wicket-keeper'],
    'Basketball (5v5)': ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
    'Volleyball (6v6)': ['Setter', 'Outside Hitter', 'Middle Blocker', 'Opposite', 'Libero'],
    'Badminton (Singles)': ['Singles Player']
};

function validatePlayers(players, sportName, teamSize, maxSubs) {
    const errors = [];
    const positions = SPORT_POSITIONS[sportName] || [];
    
    // Count players by type
    const mainPlayers = players.filter(p => p.player_type === 'main');
    const subPlayers = players.filter(p => p.player_type === 'substitute');
    
    console.log(`Validating: ${mainPlayers.length} main, ${subPlayers.length} subs for sport requiring ${teamSize} main, max ${maxSubs} subs`);
    
    // Check main players count
    if (mainPlayers.length !== parseInt(teamSize)) {
        errors.push(`Exactly ${teamSize} main players required, got ${mainPlayers.length}`);
    }
    
    //  Player limit validation
    if (subPlayers.length > parseInt(maxSubs)) {
        errors.push(`Maximum ${maxSubs} substitutes allowed, got ${subPlayers.length}`);
    }
    
    // Check jersey uniqueness
    const jerseyNumbers = players.map(p => p.jersey_no);
    const duplicateJerseys = jerseyNumbers.filter((item, index) => jerseyNumbers.indexOf(item) !== index);
    if (duplicateJerseys.length > 0) {
        errors.push(`Duplicate jersey numbers: ${[...new Set(duplicateJerseys)].join(', ')}`);
    }
    
    // Validate positions if sport has defined positions
    if (positions.length > 0) {
        players.forEach((player, idx) => {
            if (player.position && !positions.includes(player.position)) {
                errors.push(`Invalid position "${player.position}" for player ${idx + 1}`);
            }
        });
    }
    
    // Sport-specific validations
    if (sportName === 'Football (11v11)') {
        const goalkeepers = mainPlayers.filter(p => p.position === 'Goalkeeper');
        if (goalkeepers.length !== 1) {
            errors.push('Exactly 1 Goalkeeper required in main players');
        }
    }
    
    if (sportName === 'Cricket (T20)') {
        const wicketkeepers = mainPlayers.filter(p => p.position === 'Wicket-keeper');
        if (wicketkeepers.length !== 1) {
            errors.push('Exactly 1 Wicket-keeper required in main players');
        }
    }
    
    return errors;
}

/**
 * Calculate registration status based on dates
 */
function calculateRegistrationStatus(startDate, endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    if (today < start) return 'not_started';
    if (today > end) return 'closed';
    return 'open';
}

function validateRegistrationDates(regStart, regEnd, eventStart, eventEnd) {
    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const regStartDate = new Date(regStart);
    regStartDate.setHours(0, 0, 0, 0);
    
    const regEndDate = new Date(regEnd);
    regEndDate.setHours(0, 0, 0, 0);
    
    const eventStartDate = new Date(eventStart);
    eventStartDate.setHours(0, 0, 0, 0);
    
    const eventEndDate = new Date(eventEnd);
    eventEndDate.setHours(0, 0, 0, 0);
    
    // Registration start must be today or future
    if (regStartDate < today) {
        errors.push('Registration start date cannot be in the past');
    }
    
    // Registration end must be on or after start (allow same day)
    if (regEndDate < regStartDate) {
        errors.push('Registration end date cannot be before start date');
    }
    
    // Registration must end on or before event starts (allow same day)
    if (regEndDate > eventStartDate) {
        errors.push('Registration must close on or before event starts');
    }
    
    // Event end must be on or after event start (allow same day)
    if (eventEndDate < eventStartDate) {
        errors.push('Event end date cannot be before start date');
    }
    
    return errors;
}


// MIDDLEWARE


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Access token required' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('Token verification failed:', err.message);
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

async function checkAuthStatus() {
    if (APP_DATA.token) {
        try {
            const user = await apiCall('/auth/me', { silent: true });
            APP_DATA.currentUser = user;
            updateUIForLoggedInUser();
        } catch (error) {
            console.error('Session expired');
            localStorage.removeItem('authToken');
            APP_DATA.token = null;
            APP_DATA.currentUser = null;
            updateUIForLoggedOutUser();
            showSuccess('Session expired. Please login again.');
        }
    }
}

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};


// AUTHENTICATION ROUTES


// Signup with password reset token generation 
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields required' });
    }
    
    if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    
    if (username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    try {
        const [existing] = await pool.query('SELECT * FROM Users WHERE email = ?', [email.toLowerCase()]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.query(
            'INSERT INTO Users (username, email, password, role, email_verified) VALUES (?, ?, ?, ?, ?)',
            [username.trim(), email.toLowerCase(), hashedPassword, 'manager', false]
        );
        
        await sendEmail(email, 'Welcome to Tournament Portal!', `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0078ff;">Welcome to Tournament Portal!</h2>
                <p>Hi <strong>${username}</strong>,</p>
                <p>Your account has been successfully created.</p>
            </div>
        `);
        
        res.status(201).json({ 
            message: 'Account created successfully!',
            userId: result.insertId 
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
});

// Login with token refresh consideration
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    
    try {
        const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email.toLowerCase()]);
        
        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // 7-day token (refresh mechanism would need separate endpoint)
        const token = jwt.sign(
            { userId: user.user_id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                userId: user.user_id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Password Reset Request
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ message: 'Valid email required' });
    }
    
    try {
        const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email.toLowerCase()]);
        
        if (users.length === 0) {
            // Don't reveal if email exists
            return res.json({ message: 'If email exists, reset link sent' });
        }
        
        const user = users[0];
        const resetToken = jwt.sign(
            { userId: user.user_id, purpose: 'password-reset' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        // Store reset token
        await pool.query(
            'UPDATE Users SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE user_id = ?',
            [resetToken, user.user_id]
        );
        
        const resetLink = `http://localhost:3000/reset-password.html?token=${resetToken}`;
        
        await sendEmail(email, 'Password Reset Request', `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0078ff;">Password Reset</h2>
                <p>Hi <strong>${user.username}</strong>,</p>
                <p>Click the link below to reset your password (valid for 1 hour):</p>
                <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #0078ff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
                <p style="margin-top: 20px; color: #666; font-size: 12px;">If you didn't request this, ignore this email.</p>
            </div>
        `);
        
        res.json({ message: 'If email exists, reset link sent' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

//  Password Reset Confirmation
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password required' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.purpose !== 'password-reset') {
            return res.status(400).json({ message: 'Invalid reset token' });
        }
        
        const [users] = await pool.query(
            'SELECT * FROM Users WHERE user_id = ? AND reset_token = ? AND reset_token_expires > NOW()',
            [decoded.userId, token]
        );
        
        if (users.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await pool.query(
            'UPDATE Users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE user_id = ?',
            [hashedPassword, decoded.userId]
        );
        
        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Invalid or expired token' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT user_id, username, email, role FROM Users WHERE user_id = ?',
            [req.user.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// EVENT MANAGEMENT ROUTES


// Get All Events (Only show active event data where applicable)
app.get('/api/events', async (req, res) => {
    try {
        const [events] = await pool.query(`
            SELECT e.event_id, e.event_name, 
            DATE_FORMAT(e.start_date, '%Y-%m-%d') as start_date,
            DATE_FORMAT(e.end_date, '%Y-%m-%d') as end_date,
            DATE_FORMAT(e.registration_start_date, '%Y-%m-%d') as registration_start_date,
            DATE_FORMAT(e.registration_end_date, '%Y-%m-%d') as registration_end_date,
            e.registration_status,
            e.location, e.description, e.status,
            (SELECT COUNT(*) FROM Teams WHERE event_id = e.event_id AND status = 'approved') as team_count,
            (SELECT COUNT(*) FROM Matches WHERE event_id = e.event_id) as match_count,
            (SELECT COUNT(DISTINCT sport_id) FROM Teams WHERE event_id = e.event_id AND status = 'approved') as sport_count
            FROM Events e
            ORDER BY 
                CASE e.status
                    WHEN 'registration_open' THEN 1
                    WHEN 'active' THEN 2
                    WHEN 'planned' THEN 3
                    WHEN 'completed' THEN 4
                END,
                e.start_date DESC
        `);
        
        // Auto-update registration status based on current date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const event of events) {
            if (event.registration_start_date && event.registration_end_date) {
                const regStart = new Date(event.registration_start_date);
                regStart.setHours(0, 0, 0, 0);
                
                const regEnd = new Date(event.registration_end_date);
                regEnd.setHours(23, 59, 59, 999);
                
                let calculatedStatus;
                if (today < regStart) {
                    calculatedStatus = 'not_started';
                } else if (today > regEnd) {
                    calculatedStatus = 'closed';
                } else {
                    calculatedStatus = 'open';
                }
                
                // Update if status changed
                if (calculatedStatus !== event.registration_status) {
                    await pool.query(
                        'UPDATE Events SET registration_status = ? WHERE event_id = ?',
                        [calculatedStatus, event.event_id]
                    );
                    event.registration_status = calculatedStatus;
                }
            }
        }
        
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Error fetching events' });
    }
});

// Get Event Details with winners 
app.get('/api/events/:id', async (req, res) => {
    try {
        const [events] = await pool.query(`
            SELECT e.*, 
            DATE_FORMAT(e.start_date, '%Y-%m-%d') as start_date,
            DATE_FORMAT(e.end_date, '%Y-%m-%d') as end_date,
            (SELECT COUNT(*) FROM Matches WHERE event_id = e.event_id) as match_count,
            (SELECT COUNT(*) FROM Teams WHERE event_id = e.event_id AND status = 'approved') as team_count
            FROM Events e
            WHERE e.event_id = ?
        `, [req.params.id]);
        
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        // Get sports in this event
        const [sports] = await pool.query(`
            SELECT DISTINCT s.* FROM Sports s
            JOIN Teams t ON s.sport_id = t.sport_id
            WHERE t.event_id = ? AND t.status = 'approved'
        `, [req.params.id]);
        
        //  Get winners for each sport
        const [winners] = await pool.query(`
            SELECT 
                s.sport_name,
                t.team_name as winner_team,
                p.points,
                p.wins,
                p.goals_for,
                p.goals_against,
                (p.goals_for - p.goals_against) as goal_difference
            FROM PointsTable p
            JOIN Teams t ON p.team_id = t.team_id
            JOIN Sports s ON p.sport_id = s.sport_id
            WHERE p.event_id = ? AND p.points = (
                SELECT MAX(p2.points) 
                FROM PointsTable p2 
                WHERE p2.event_id = p.event_id 
                AND p2.sport_id = p.sport_id
            )
            ORDER BY s.sport_name, p.points DESC, 
            (p.goals_for - p.goals_against) DESC
        `, [req.params.id]);
        
        res.json({ ...events[0], sports, winners });
    } catch (error) {
        console.error('Error fetching event details:', error);
        res.status(500).json({ message: 'Error fetching event details' });
    }
});

// Get Active Event
app.get('/api/events/active/current', async (req, res) => {
    try {
        // Priority 1: Active event
        let [events] = await pool.query(`
            SELECT event_id, event_name, 
            DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
            DATE_FORMAT(registration_start_date, '%Y-%m-%d') as registration_start_date,
            DATE_FORMAT(registration_end_date, '%Y-%m-%d') as registration_end_date,
            registration_status,
            location, description, status
            FROM Events
            WHERE status = 'active'
            LIMIT 1
        `);
        
        // Priority 2: Registration open event with status 'open'
        if (events.length === 0) {
            [events] = await pool.query(`
                SELECT event_id, event_name, 
                DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
                DATE_FORMAT(registration_start_date, '%Y-%m-%d') as registration_start_date,
                DATE_FORMAT(registration_end_date, '%Y-%m-%d') as registration_end_date,
                registration_status,
                location, description, status
                FROM Events
                WHERE status = 'registration_open' AND registration_status = 'open'
                ORDER BY start_date ASC
                LIMIT 1
            `);
        }
        
        res.json(events.length > 0 ? events[0] : null);
    } catch (error) {
        console.error('Error fetching active event:', error);
        res.status(500).json({ message: 'Error fetching active event' });
    }
});

// Create Event (Admin only) 
app.post('/api/events', authenticateToken, requireAdmin, async (req, res) => {
    const { 
        event_name, 
        start_date, 
        end_date, 
        location, 
        description,
        registration_start_date,
        registration_end_date
    } = req.body;
    
    if (!event_name || !start_date || !end_date) {
        return res.status(400).json({ message: 'Event name, start date, and end date are required' });
    }
    
    if (!registration_start_date || !registration_end_date) {
        return res.status(400).json({ message: 'Registration start and end dates are required' });
    }
    
    // Validate all dates
    const dateErrors = validateRegistrationDates(
        registration_start_date,
        registration_end_date,
        start_date,
        end_date
    );
    
    if (dateErrors.length > 0) {
        return res.status(400).json({ message: dateErrors.join('; ') });
    }
    
    try {
        //Comprehensive overlap check
        const [overlapping] = await pool.query(`
            SELECT event_name, 
                   DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
                   DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
                   DATE_FORMAT(registration_start_date, '%Y-%m-%d') as reg_start,
                   DATE_FORMAT(registration_end_date, '%Y-%m-%d') as reg_end
            FROM Events 
            WHERE status != 'completed'
            AND (
                -- Check Event Date Overlap
                (start_date <= ? AND end_date >= ?) OR
                (start_date <= ? AND end_date >= ?) OR
                (start_date >= ? AND end_date <= ?) OR
                
                -- Check Registration Date Overlap
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date >= ? AND registration_end_date <= ?) OR
                
                -- Check Cross Overlap (Event dates with other Registration dates)
                (start_date <= ? AND end_date >= ?) OR
                (start_date <= ? AND end_date >= ?) OR
                
                -- Check Cross Overlap (Registration dates with other Event dates)
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date <= ? AND registration_end_date >= ?)
            )
        `, [
            // Event date checks
            start_date, start_date,
            end_date, end_date,
            start_date, end_date,
            
            // Registration date checks
            registration_start_date, registration_start_date,
            registration_end_date, registration_end_date,
            registration_start_date, registration_end_date,
            
            // Cross overlap checks
            registration_end_date, registration_start_date,
            registration_start_date, registration_end_date,
            end_date, start_date,
            start_date, end_date
        ]);
        
        if (overlapping.length > 0) {
            const existing = overlapping[0];
            return res.status(400).json({ 
                message: `Cannot create event. Date conflict with "${existing.event_name}"\n` +
                        `Existing Event: ${existing.start_date} to ${existing.end_date}\n` +
                        `Existing Registration: ${existing.reg_start} to ${existing.reg_end}\n` +
                        `Your Event: ${start_date} to ${end_date}\n` +
                        `Your Registration: ${registration_start_date} to ${registration_end_date}`
            });
        }
        
        // Calculate initial registration status
        const regStatus = calculateRegistrationStatus(registration_start_date, registration_end_date);
        
        const [result] = await pool.query(
            `INSERT INTO Events 
            (event_name, start_date, end_date, location, description, status, 
             registration_start_date, registration_end_date, registration_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [event_name, start_date, end_date, location || 'TBD', description || '', 
             'planned', registration_start_date, registration_end_date, regStatus]
        );
        
        res.status(201).json({ 
            message: 'Event created successfully', 
            eventId: result.insertId,
            registrationStatus: regStatus
        });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Error creating event' });
    }
});


// Open Registrations for an Event (Admin only) 

app.post('/api/events/:id/open-registrations', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        if (events.length === 0) return res.status(404).json({ message: 'Event not found' });
        
        const event = events[0];
        
        // Cannot open if already registration_open or active
        if (event.status === 'registration_open') {
            return res.status(400).json({ message: 'Registrations are already open for this event' });
        }
        
        if (event.status === 'active' || event.status === 'completed') {
            return res.status(400).json({ message: `Cannot open registrations for ${event.status} event` });
        }
        
        // Must have registration dates set
        if (!event.registration_start_date || !event.registration_end_date) {
            return res.status(400).json({ message: 'Please set registration dates before opening registrations' });
        }

        //Check if any other event has overlapping registration window
        const [overlappingReg] = await pool.query(`
            SELECT event_name,
                   DATE_FORMAT(registration_start_date, '%Y-%m-%d') as reg_start,
                   DATE_FORMAT(registration_end_date, '%Y-%m-%d') as reg_end
            FROM Events 
            WHERE event_id != ? 
            AND status IN ('registration_open', 'active')
            AND (
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date >= ? AND registration_end_date <= ?)
            )
        `, [
            eventId, 
            event.registration_start_date, event.registration_start_date, 
            event.registration_end_date, event.registration_end_date, 
            event.registration_start_date, event.registration_end_date
        ]);

        if (overlappingReg.length > 0) {
            const existing = overlappingReg[0];
            return res.status(400).json({ 
                message: `Cannot open registrations. Registration period overlaps with "${existing.event_name}" (${existing.reg_start} to ${existing.reg_end})` 
            });
        }

        // Calculate current status
        const calculatedStatus = calculateRegistrationStatus(
            event.registration_start_date,
            event.registration_end_date
        );
        
        if (calculatedStatus === 'not_started') {
            return res.status(400).json({ 
                message: `Registrations cannot be opened yet. They will automatically open on ${event.registration_start_date}` 
            });
        }
        
        if (calculatedStatus === 'closed') {
            return res.status(400).json({ 
                message: `Registration period has ended on ${event.registration_end_date}. Use "Reopen Registrations" to set new dates.` 
            });
        }

        await pool.query(
            "UPDATE Events SET status = 'registration_open', registration_status = 'open' WHERE event_id = ?",
            [eventId]
        );
        
        res.json({ message: `Registrations opened for "${event.event_name}".` });
    } catch (error) {
        res.status(500).json({ message: 'Error: ' + error.message });
    }
});


// UPDATED UPDATE EVENT ENDPOINT


app.put('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    const { 
        event_name, 
        start_date, 
        end_date, 
        location, 
        description,
        registration_start_date,
        registration_end_date
    } = req.body;
    
    try {
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        const event = events[0];
        
        // Cannot modify completed event
        if (event.status === 'completed') {
            return res.status(400).json({ 
                message: 'Cannot modify completed event' 
            });
        }
        
        // Prepare final values
        const finalStartDate = start_date || event.start_date;
        const finalEndDate = end_date || event.end_date;
        const finalRegStart = registration_start_date || event.registration_start_date;
        const finalRegEnd = registration_end_date || event.registration_end_date;
        
        // Validate dates if any registration date is being updated
        if (registration_start_date || registration_end_date) {
            const dateErrors = validateRegistrationDates(
                finalRegStart,
                finalRegEnd,
                finalStartDate,
                finalEndDate
            );
            
            if (dateErrors.length > 0) {
                return res.status(400).json({ message: dateErrors.join('; ') });
            }
        }
        
        // Check overlap with other events (excluding current event)
        if (registration_start_date || registration_end_date || start_date || end_date) {
            const [clash] = await pool.query(`
                SELECT event_name,
                       DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
                       DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
                       DATE_FORMAT(registration_start_date, '%Y-%m-%d') as reg_start,
                       DATE_FORMAT(registration_end_date, '%Y-%m-%d') as reg_end
                FROM Events 
                WHERE event_id != ? 
                AND status != 'completed'
                AND (
                    -- Event date overlap
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date >= ? AND end_date <= ?) OR
                    
                    -- Registration date overlap
                    (registration_start_date <= ? AND registration_end_date >= ?) OR
                    (registration_start_date <= ? AND registration_end_date >= ?) OR
                    (registration_start_date >= ? AND registration_end_date <= ?) OR
                    
                    -- Cross overlaps
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date <= ? AND end_date >= ?) OR
                    (registration_start_date <= ? AND registration_end_date >= ?) OR
                    (registration_start_date <= ? AND registration_end_date >= ?)
                )
            `, [
                eventId,
                finalStartDate, finalStartDate,
                finalEndDate, finalEndDate,
                finalStartDate, finalEndDate,
                finalRegStart, finalRegStart,
                finalRegEnd, finalRegEnd,
                finalRegStart, finalRegEnd,
                finalRegEnd, finalRegStart,
                finalRegStart, finalRegEnd,
                finalEndDate, finalStartDate,
                finalStartDate, finalEndDate
            ]);

            if (clash.length > 0) {
                const existing = clash[0];
                return res.status(400).json({ 
                    message: `Cannot update event. Date conflict with "${existing.event_name}"\n` +
                            `Existing Event: ${existing.start_date} to ${existing.end_date}\n` +
                            `Existing Registration: ${existing.reg_start} to ${existing.reg_end}`
                });
            }
        }
        
        const updates = [];
        const values = [];
        
        if (event_name) {
            updates.push('event_name = ?');
            values.push(event_name);
        }
        if (start_date) {
            updates.push('start_date = ?');
            values.push(start_date);
        }
        if (end_date) {
            updates.push('end_date = ?');
            values.push(end_date);
        }
        if (location !== undefined) {
            updates.push('location = ?');
            values.push(location);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (registration_start_date) {
            updates.push('registration_start_date = ?');
            values.push(registration_start_date);
        }
        if (registration_end_date) {
            updates.push('registration_end_date = ?');
            values.push(registration_end_date);
        }
        
        // Recalculate registration status if dates changed
        if (registration_start_date || registration_end_date) {
            const newStatus = calculateRegistrationStatus(finalRegStart, finalRegEnd);
            updates.push('registration_status = ?');
            values.push(newStatus);
        }
        
        if (updates.length > 0) {
            values.push(eventId);
            await pool.query(
                `UPDATE Events SET ${updates.join(', ')} WHERE event_id = ?`,
                values
            );
        }
        
        res.json({ message: 'Event updated successfully' });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ message: 'Error updating event: ' + error.message });
    }
});


// NEW: REOPEN REGISTRATIONS ENDPOINT



app.post('/api/events/:id/reopen-registrations', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    const { registration_start_date, registration_end_date } = req.body;
    
    if (!registration_start_date || !registration_end_date) {
        return res.status(400).json({ message: 'Registration dates required' });
    }
    
    try {
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        const event = events[0];
        
        // Can only reopen for registration_open or planned events
        if (event.status === 'completed') {
            return res.status(400).json({ message: 'Cannot reopen registrations for completed event' });
        }
        
        // Validate: current date must be before event start
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventStart = new Date(event.start_date);
        
        if (today >= eventStart) {
            return res.status(400).json({ 
                message: 'Cannot reopen registrations after event has started' 
            });
        }
        
        // Validate new registration dates
        const dateErrors = validateRegistrationDates(
            registration_start_date,
            registration_end_date,
            event.start_date,
            event.end_date
        );
        
        if (dateErrors.length > 0) {
            return res.status(400).json({ message: dateErrors.join('; ') });
        }
        
        //Check overlap with other events' registration periods
        const [overlappingReg] = await pool.query(`
            SELECT event_name,
                   DATE_FORMAT(registration_start_date, '%Y-%m-%d') as reg_start,
                   DATE_FORMAT(registration_end_date, '%Y-%m-%d') as reg_end
            FROM Events 
            WHERE event_id != ? 
            AND status IN ('registration_open', 'active')
            AND (
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date <= ? AND registration_end_date >= ?) OR
                (registration_start_date >= ? AND registration_end_date <= ?)
            )
        `, [
            eventId,
            registration_start_date, registration_start_date,
            registration_end_date, registration_end_date,
            registration_start_date, registration_end_date
        ]);

        if (overlappingReg.length > 0) {
            const existing = overlappingReg[0];
            return res.status(400).json({ 
                message: `Cannot reopen registrations. Period overlaps with "${existing.event_name}" (${existing.reg_start} to ${existing.reg_end})` 
            });
        }
        
        const newStatus = calculateRegistrationStatus(registration_start_date, registration_end_date);
        
        await pool.query(
            `UPDATE Events 
            SET registration_start_date = ?, 
                registration_end_date = ?, 
                registration_status = ?,
                status = 'registration_open'
            WHERE event_id = ?`,
            [registration_start_date, registration_end_date, newStatus, eventId]
        );
        
        // Get all managers with approved/pending teams in this event
        const [managers] = await pool.query(`
            SELECT DISTINCT u.email, u.username
            FROM Users u
            JOIN Teams t ON u.user_id = t.manager_id
            WHERE t.event_id = ? AND t.status IN ('approved', 'pending')
        `, [eventId]);
        
        // Send email notifications
        for (const manager of managers) {
            await sendEmail(manager.email, 'Registrations Reopened!', `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #0078ff;">Team Registrations Reopened! 🎉</h2>
                    <p>Hi <strong>${manager.username}</strong>,</p>
                    <p>Good news! Team registrations have been reopened for <strong>${event.event_name}</strong>.</p>
                    <p><strong>New Registration Period:</strong></p>
                    <ul>
                        <li>Opens: ${registration_start_date}</li>
                        <li>Closes: ${registration_end_date}</li>
                    </ul>
                    <p>This is your chance to register additional teams or update your registrations.</p>
                    <p>Don't miss out!</p>
                </div>
            `);
        }
        
        res.json({ 
            message: `Registrations reopened successfully. ${managers.length} manager(s) notified.`,
            newStatus,
            notifiedManagers: managers.length
        });
    } catch (error) {
        console.error('Error reopening registrations:', error);
        res.status(500).json({ message: 'Error reopening registrations' });
    }
});


// MANUALLY CLOSE REGISTRATIONS
app.post('/api/events/:id/close-registrations', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        console.log('Closing registrations for event:', eventId);
        
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        if (events.length === 0) {
            console.log('Event not found');
            return res.status(404).json({ message: 'Event not found' });
        }

        const event = events[0];
        console.log('Event status:', event.status, 'Registration status:', event.registration_status);
        
        if (event.status === 'active' || event.status === 'completed') {
            return res.status(400).json({ message: `Cannot close registrations for ${event.status} event` });
        }
        
        if (event.registration_status === 'closed') {
            return res.status(400).json({ message: 'Registrations are already closed' });
        }

        // Check for pending teams with proper filtering
        const [pendingTeams] = await pool.query(
            'SELECT COUNT(*) as count FROM Teams WHERE event_id = ? AND status = "pending"',
            [eventId]
        );
        
        console.log('Pending teams count:', pendingTeams[0].count);
        
        if (pendingTeams[0].count > 0) {
            return res.status(400).json({ 
                message: `Cannot close registrations. ${pendingTeams[0].count} team registration${pendingTeams[0].count > 1 ? 's are' : ' is'} still pending. Please approve or reject all teams before closing registrations.` 
            });
        }

        // CRITICAL FIX: Update registration_status to 'closed'
        console.log('Updating registration_status to closed for event:', eventId);
        
        const [updateResult] = await pool.query(
            'UPDATE Events SET registration_status = ? WHERE event_id = ?',
            ['closed', eventId]
        );
        
        console.log('Update result:', updateResult);
        
        // Verify the update
        const [updatedEvent] = await pool.query(
            'SELECT registration_status FROM Events WHERE event_id = ?',
            [eventId]
        );
        
        console.log('Updated event registration_status:', updatedEvent[0].registration_status);
        
        res.json({ 
            message: 'Registrations closed successfully. The event is now ready for activation.',
            event_id: eventId,
            new_registration_status: 'closed',
            verified: updatedEvent[0].registration_status === 'closed'
        });
    } catch (error) {
        console.error('Error closing registrations:', error);
        res.status(500).json({ message: 'Error closing registrations: ' + error.message });
    }
});


// Delete Event (Admin only)  Add confirmation
app.delete('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        //Prevent deletion if teams with match history exist
        const [matches] = await pool.query(
            'SELECT COUNT(*) as count FROM Matches WHERE event_id = ? AND status = "completed"', 
            [req.params.id]
        );
        
        if (matches[0].count > 0) {
            return res.status(400).json({ 
                message: 'Cannot delete event with completed matches' 
            });
        }
        
        await pool.query('DELETE FROM Events WHERE event_id = ?', [req.params.id]);
        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Error deleting event' });
    }
});

// Complete Event
app.post('/api/events/:id/complete', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        const event = events[0];
        
        if (event.status !== 'active') {
            return res.status(400).json({ message: 'Only active events can be marked as completed' });
        }
        
        await pool.query("UPDATE Events SET status = 'completed' WHERE event_id = ?", [eventId]);
        
        res.json({ message: `Event "${event.event_name}" marked as completed` });
    } catch (error) {
        console.error('Error completing event:', error);
        res.status(500).json({ message: 'Error completing event' });
    }
});

// Reopen Completed Event
app.post('/api/events/:id/reopen', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const [events] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        const event = events[0];
        
        if (event.status !== 'completed') {
            return res.status(400).json({ message: 'Only completed events can be reopened' });
        }
        
        await pool.query("UPDATE Events SET status = 'active' WHERE event_id = ?", [eventId]);
        
        res.json({ message: `Event "${event.event_name}" reopened and set to active` });
    } catch (error) {
        console.error('Error reopening event:', error);
        res.status(500).json({ message: 'Error reopening event' });
    }
});

// Updated Activate Event Endpoint
app.post('/api/events/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    const { force } = req.body;
    
    try {
        const [eventData] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [eventId]);
        
        if (eventData.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        const event = eventData[0];
        
        // Must have closed registrations
        if (event.registration_status !== 'closed') {
            return res.status(400).json({ 
                message: 'Registrations must be closed before activating event' 
            });
        }
        
        // Check for pending teams
        const [pendingTeams] = await pool.query(
            'SELECT COUNT(*) as count FROM Teams WHERE event_id = ? AND status = "pending"',
            [eventId]
        );
        
        if (pendingTeams[0].count > 0) {
            return res.status(400).json({ 
                message: `Cannot activate: ${pendingTeams[0].count} team registrations still pending approval` 
            });
        }
        
        // Check for active events
        const [activeEvents] = await pool.query("SELECT * FROM Events WHERE status = 'active'");
        
        if (activeEvents.length > 0 && !force) {
            const [pendingMatches] = await pool.query(
                "SELECT COUNT(*) as count FROM Matches WHERE event_id = ? AND status IN ('scheduled', 'live')",
                [activeEvents[0].event_id]
            );
            
            if (pendingMatches[0].count > 0) {
                return res.status(400).json({ 
                    message: `Current event "${activeEvents[0].event_name}" has ${pendingMatches[0].count} pending matches`,
                    requiresForce: true
                });
            }
        }
        
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            if (force && activeEvents.length > 0) {
                await connection.query(
                    "UPDATE Matches SET status = 'cancelled' WHERE event_id = ? AND status IN ('scheduled', 'live')",
                    [activeEvents[0].event_id]
                );
            }
            
            await connection.query("UPDATE Events SET status = 'completed' WHERE status = 'active'");
            await connection.query("UPDATE Events SET status = 'active' WHERE event_id = ?", [eventId]);
            
            await connection.commit();
            
            res.json({ message: `Event "${event.event_name}" activated successfully` });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error activating event:', error);
        res.status(500).json({ message: 'Error activating event' });
    }
});

app.delete('/api/sports/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Check if sport exists
        const [sportCheck] = await pool.query('SELECT * FROM Sports WHERE sport_id = ?', [req.params.id]);
        
        if (sportCheck.length === 0) {
            return res.status(404).json({ message: 'Sport not found' });
        }
        
        // Check for teams registered for this sport
        const [teams] = await pool.query(
            'SELECT COUNT(*) as count FROM Teams WHERE sport_id = ? AND status = "approved"',
            [req.params.id]
        );
        
        if (teams[0].count > 0) {
            return res.status(400).json({ 
                message: `Cannot delete sport. ${teams[0].count} approved team${teams[0].count > 1 ? 's' : ''} registered.` 
            });
        }
        
        // Delete from EventSports junction table first
        await pool.query('DELETE FROM EventSports WHERE sport_id = ?', [req.params.id]);
        
        // Delete the sport
        await pool.query('DELETE FROM Sports WHERE sport_id = ?', [req.params.id]);
        
        res.json({ message: `Sport "${sportCheck[0].sport_name}" deleted successfully` });
    } catch (error) {
        console.error('Error deleting sport:', error);
        res.status(500).json({ message: 'Error deleting sport' });
    }
});

// Delete Venue
app.delete('/api/venues/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [venue] = await pool.query('SELECT * FROM Venues WHERE venue_id = ?', [req.params.id]);
        
        if (venue.length === 0) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        
        // Check for ANY matches (past, present, or future)
        const [allMatches] = await pool.query(`
            SELECT COUNT(*) as count 
            FROM Matches 
            WHERE venue_id = ?
        `, [req.params.id]);
        
        if (allMatches[0].count > 0) {
            return res.status(400).json({ 
                message: `Cannot delete venue "${venue[0].venue_name}". It has ${allMatches[0].count} match${allMatches[0].count > 1 ? 'es' : ''} scheduled. Please reassign or remove these matches first.` 
            });
        }
        
        // Only delete if no matches exist
        await pool.query('DELETE FROM Venues WHERE venue_id = ?', [req.params.id]);
        
        res.json({ message: `Venue "${venue[0].venue_name}" deleted successfully` });
    } catch (error) {
        console.error('Error deleting venue:', error);
        res.status(500).json({ message: 'Error deleting venue' });
    }
});

// Get Sports for Event
app.get('/api/events/:id/sports', async (req, res) => {
    try {
        const [sports] = await pool.query(`
            SELECT DISTINCT s.* FROM Sports s
            JOIN EventSports es ON s.sport_id = es.sport_id
            WHERE es.event_id = ?
            ORDER BY s.sport_name ASC
        `, [req.params.id]);
        res.json(sports);
    } catch (error) {
        console.error('Error fetching event sports:', error);
        res.status(500).json({ message: 'Error fetching event sports' });
    }
});

// Add Sport to Event (Admin only) Check EventSports junction
app.post('/api/events/:id/sports', authenticateToken, requireAdmin, async (req, res) => {
    const { sport_id } = req.body;
    const event_id = req.params.id;
    
    try {
        const [existing] = await pool.query(
            'SELECT * FROM EventSports WHERE event_id = ? AND sport_id = ?',
            [event_id, sport_id]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Sport already added to this event' });
        }
        
        await pool.query(
            'INSERT INTO EventSports (event_id, sport_id) VALUES (?, ?)',
            [event_id, sport_id]
        );
        res.status(201).json({ message: 'Sport added to event successfully' });
    } catch (error) {
        console.error('Error adding sport to event:', error);
        res.status(500).json({ message: 'Error adding sport to event' });
    }
});


// NEW: GET EVENTS WITH REGISTRATION INFO


// Update the GET /api/events endpoint to include registration info
app.get('/api/events', async (req, res) => {
    try {
        const [events] = await pool.query(`
            SELECT e.event_id, e.event_name, 
            DATE_FORMAT(e.start_date, '%Y-%m-%d') as start_date,
            DATE_FORMAT(e.end_date, '%Y-%m-%d') as end_date,
            DATE_FORMAT(e.registration_start_date, '%Y-%m-%d') as registration_start_date,
            DATE_FORMAT(e.registration_end_date, '%Y-%m-%d') as registration_end_date,
            e.registration_status,
            e.location, e.description, e.status,
            (SELECT COUNT(*) FROM Teams WHERE event_id = e.event_id AND status = 'approved') as team_count,
            (SELECT COUNT(*) FROM Matches WHERE event_id = e.event_id) as match_count,
            (SELECT COUNT(DISTINCT sport_id) FROM Teams WHERE event_id = e.event_id AND status = 'approved') as sport_count
            FROM Events e
            ORDER BY 
                CASE e.status
                    WHEN 'registration_open' THEN 1
                    WHEN 'active' THEN 2
                    WHEN 'planned' THEN 3
                    WHEN 'completed' THEN 4
                END,
                e.start_date DESC
        `);
        
        // Auto-update registration status based on current date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const event of events) {
            if (event.registration_start_date && event.registration_end_date) {
                const regStart = new Date(event.registration_start_date);
                regStart.setHours(0, 0, 0, 0);
                
                const regEnd = new Date(event.registration_end_date);
                regEnd.setHours(23, 59, 59, 999);
                
                let calculatedStatus;
                if (today < regStart) {
                    calculatedStatus = 'not_started';
                } else if (today > regEnd) {
                    calculatedStatus = 'closed';
                } else {
                    calculatedStatus = 'open';
                }
                
                // Update if status changed
                if (calculatedStatus !== event.registration_status) {
                    await pool.query(
                        'UPDATE Events SET registration_status = ? WHERE event_id = ?',
                        [calculatedStatus, event.event_id]
                    );
                    event.registration_status = calculatedStatus;
                }
            }
        }
        
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Error fetching events' });
    }
});


// Remove Sport from Event with validation
app.delete('/api/events/:eventId/sports/:sportId', authenticateToken, requireAdmin, async (req, res) => {
    const { eventId, sportId } = req.params;
    
    try {
        // Check if this is the active event
        const [activeEvent] = await pool.query(
            'SELECT * FROM Events WHERE event_id = ? AND status = "active"',
            [eventId]
        );
        
        if (activeEvent.length === 0) {
            return res.status(400).json({ 
                message: 'Can only remove sports from the active event' 
            });
        }
        
        // Check if teams exist for this sport in this event
        const [teams] = await pool.query(
            'SELECT COUNT(*) as count FROM Teams WHERE event_id = ? AND sport_id = ? AND status = "approved"',
            [eventId, sportId]
        );
        
        if (teams[0].count > 0) {
            return res.status(400).json({ 
                message: `Cannot remove sport. ${teams[0].count} approved team${teams[0].count > 1 ? 's' : ''} registered for this sport in this event.` 
            });
        }
        
        // Remove from EventSports table
        await pool.query(
            'DELETE FROM EventSports WHERE event_id = ? AND sport_id = ?',
            [eventId, sportId]
        );
        
        res.json({ message: 'Sport removed from event successfully' });
    } catch (error) {
        console.error('Error removing sport:', error);
        res.status(500).json({ message: 'Error removing sport from event' });
    }
});


// SPORTS ROUTES


// Get All Sports
app.get('/api/sports', async (req, res) => {
    try {
        const [sports] = await pool.query('SELECT * FROM Sports ORDER BY sport_name ASC');
        res.json(sports);
    } catch (error) {
        console.error('Error fetching sports:', error);
        res.status(500).json({ message: 'Error fetching sports' });
    }
});

// Get Sport Details
app.get('/api/sports/:id', async (req, res) => {
    try {
        const [sports] = await pool.query('SELECT * FROM Sports WHERE sport_id = ?', [req.params.id]);
        
        if (sports.length === 0) {
            return res.status(404).json({ message: 'Sport not found' });
        }
        
        // Get active event
        const [activeEvent] = await pool.query("SELECT event_id FROM Events WHERE status = 'active' LIMIT 1");

        let teams = [];
        if (activeEvent.length > 0) {
        // Only show teams from active event
        const [teamResults] = await pool.query(`
        SELECT t.*, u.username as manager_name, e.event_name
        FROM Teams t
        JOIN Users u ON t.manager_id = u.user_id
        JOIN Events e ON t.event_id = e.event_id
        WHERE t.sport_id = ? AND t.event_id = ? AND t.status = 'approved'
        ORDER BY t.team_name ASC
        `, [req.params.id, activeEvent[0].event_id]);
        teams = teamResults;
}
        
        let matches = [];
        if (activeEvent.length > 0) {
        const [matchResults] = await pool.query(`
        SELECT m.*, 
        t1.team_name as team1_name, t2.team_name as team2_name,
        e.event_name,
        DATE_FORMAT(m.match_date, '%Y-%m-%d %H:%i:%s') as match_date
        FROM Matches m
        JOIN Teams t1 ON m.team1_id = t1.team_id
        JOIN Teams t2 ON m.team2_id = t2.team_id
        JOIN Events e ON m.event_id = e.event_id
        WHERE m.sport_id = ? AND m.event_id = ?
        ORDER BY m.match_date DESC
        `, [req.params.id, activeEvent[0].event_id]);
        matches = matchResults;
}
        
        let leaderboard = [];
        if (activeEvent.length > 0) {
        const [leaderboardResults] = await pool.query(`
        SELECT p.*, t.team_name, t.status as team_status, e.event_name,
        (p.goals_for - p.goals_against) as goal_difference
        FROM PointsTable p
        JOIN Teams t ON p.team_id = t.team_id
        JOIN Events e ON p.event_id = e.event_id
        WHERE p.sport_id = ? AND p.event_id = ?
        ORDER BY p.points DESC, 
        (p.goals_for - p.goals_against) DESC,
        p.goals_for DESC
        `, [req.params.id, activeEvent[0].event_id]);
        leaderboard = leaderboardResults;
}
        
        res.json({ ...sports[0], teams, matches, leaderboard });
    } catch (error) {
        console.error('Error fetching sport details:', error);
        res.status(500).json({ message: 'Error fetching sport details' });
    }
});

// Create Sport (Admin only) - Updated with fee
app.post('/api/sports', authenticateToken, requireAdmin, async (req, res) => {
    const { sport_name, team_size, max_substitutes, registration_fee, rules, status } = req.body;
    
    if (!sport_name || !team_size) {
        return res.status(400).json({ message: 'Sport name and team size required' });
    }
    
    if (team_size < 1 || team_size > 50) {
        return res.status(400).json({ message: 'Team size must be between 1 and 50' });
    }
    
    // Validate fee range
    const fee = parseFloat(registration_fee) || 0;
    if (fee > 0 && (fee < 200 || fee > 5000)) {
        return res.status(400).json({ message: 'Registration fee must be between ₹200 and ₹5000, or 0 for free' });
    }
    
    try {
        const [exists] = await pool.query(
            'SELECT sport_id FROM Sports WHERE LOWER(sport_name) = LOWER(?)', 
            [sport_name]
        );
        
        if (exists.length > 0) {
            return res.status(400).json({ message: 'Sport with this name already exists' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO Sports (sport_name, team_size, max_substitutes, registration_fee, rules, status) VALUES (?, ?, ?, ?, ?, ?)',
            [sport_name, team_size, max_substitutes || 0, fee, rules, status || 'planned']
        );
        
        res.status(201).json({ message: 'Sport created successfully', sportId: result.insertId });
    } catch (error) {
        console.error('Error creating sport:', error);
        res.status(500).json({ message: 'Error creating sport' });
    }
});

// Get Sport Positions
app.get('/api/sports/:sportName/positions', async (req, res) => {
    const sportName = decodeURIComponent(req.params.sportName);
    const positions = SPORT_POSITIONS[sportName] || [];
    res.json({ positions });
});

// TEAM MANAGEMENT ROUTES


//  Get teams filtered by active event
app.get('/api/teams', async (req, res) => {
    try {
        const { event_id } = req.query;
        
        let query = `
            SELECT t.team_id, t.team_name, t.logo, t.sport_id, t.event_id, t.status,
            u.username AS manager_name, u.user_id as manager_id, u.email as manager_email,
            s.sport_name, e.event_name
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.status IN ('approved', 'disqualified')
        `;
        
        const params = [];
        
        // Filter by event if specified
        if (event_id) {
            query += ' AND t.event_id = ?';
            params.push(event_id);
        }
        
        query += ' ORDER BY t.team_name ASC';
        
        const [teams] = await pool.query(query, params);
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

// Get Team Details
app.get('/api/teams/:id/details', async (req, res) => {
    try {
        const [teams] = await pool.query(`
            SELECT t.*, u.username as manager_name, u.email as manager_email,
            s.sport_name, e.event_name
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.team_id = ?
        `, [req.params.id]);
        
        if (teams.length === 0) {
            return res.status(404).json({ message: 'Team not found' });
        }
        
        const [players] = await pool.query(`
            SELECT * FROM Players WHERE team_id = ?
            ORDER BY 
                CASE player_type 
                    WHEN 'main' THEN 1 
                    WHEN 'substitute' THEN 2 
                END,
                player_name ASC
        `, [req.params.id]);
        
        const [matches] = await pool.query(`
            SELECT m.*, 
            DATE_FORMAT(m.match_date, '%Y-%m-%d %H:%i:%s') as match_date,
            t1.team_name as team1_name, t2.team_name as team2_name,
            s.sport_name, e.event_name
            FROM Matches m
            JOIN Teams t1 ON m.team1_id = t1.team_id
            JOIN Teams t2 ON m.team2_id = t2.team_id
            JOIN Sports s ON m.sport_id = s.sport_id
            JOIN Events e ON m.event_id = e.event_id
            WHERE m.team1_id = ? OR m.team2_id = ?
            ORDER BY m.match_date ASC
        `, [req.params.id, req.params.id]);
        
        res.json({ ...teams[0], players, matches });
    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({ message: 'Error fetching team details' });
    }
});

// Get Manager's Teams
app.get('/api/teams/my/all', authenticateToken, async (req, res) => {
    try {
        const [teams] = await pool.query(`
            SELECT t.*, s.sport_name, e.event_name,
            (SELECT COUNT(*) FROM Players WHERE team_id = t.team_id) as player_count
            FROM Teams t
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.manager_id = ?
            ORDER BY t.created_at DESC
        `, [req.user.userId]);
        res.json(teams);
    } catch (error) {
        console.error('Error fetching manager teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

// Get Pending Teams (Admin only)
app.get('/api/teams/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [teams] = await pool.query(`
            SELECT t.*, u.username as manager_name, u.email as manager_email,
            s.sport_name, e.event_name,
            (SELECT COUNT(*) FROM Players WHERE team_id = t.team_id AND player_type = 'main') as main_count,
            (SELECT COUNT(*) FROM Players WHERE team_id = t.team_id AND player_type = 'substitute') as sub_count
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.status = 'pending'
            ORDER BY t.created_at ASC
        `);
        res.json(teams);
    } catch (error) {
        console.error('Error fetching pending teams:', error);
        res.status(500).json({ message: 'Error fetching pending teams' });
    }
});

// UPDATED TEAM REGISTRATION ENDPOINT

app.post('/api/teams/register', authenticateToken, upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'payment_screenshot', maxCount: 1 }
]), async (req, res) => {
    const { team_name, sport_id, event_id, players } = req.body;
    const manager_id = req.user.userId;
    const logo = req.files?.logo ? `/uploads/${req.files.logo[0].filename}` : null;
    const paymentScreenshot = req.files?.payment_screenshot ? `/uploads/${req.files.payment_screenshot[0].filename}` : null;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [events] = await connection.query('SELECT * FROM Events WHERE event_id = ?', [event_id]);
        
        if (events.length === 0) {
            throw new Error('Event not found');
        }
        
        const event = events[0];
        
        // Check if registrations are open
        if (event.registration_status === 'not_started') {
            throw new Error(`Registrations not yet open. Opens on ${event.registration_start_date}`);
        }
        
        if (event.registration_status === 'closed') {
            throw new Error(`Registrations closed on ${event.registration_end_date}`);
        }
        
        // Double-check dates 
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const regStart = new Date(event.registration_start_date);
        regStart.setHours(0, 0, 0, 0);
        
        const regEnd = new Date(event.registration_end_date);
        regEnd.setHours(23, 59, 59, 999);
        
        if (today < regStart) {
            throw new Error(`Registrations open on ${event.registration_start_date}`);
        }
        
        if (today > regEnd) {
            throw new Error(`Registration deadline passed on ${event.registration_end_date}`);
        }
        
        
        // CHECK FOR EXISTING TEAMS (INCLUDING DISQUALIFIED)
        
        const [existingTeams] = await connection.query(
            `SELECT * FROM Teams 
            WHERE manager_id = ? 
            AND sport_id = ? 
            AND event_id = ? 
            AND status IN ('pending', 'approved', 'disqualified')`,
            [manager_id, sport_id, event_id]
        );
        
        if (existingTeams.length > 0) {
            const team = existingTeams[0];
            
            if (team.status === 'disqualified') {
                throw new Error('Your previous team was disqualified. You cannot register another team for this sport in this event.');
            }
            
            if (team.status === 'approved') {
                throw new Error('You already have an approved team for this sport in this event');
            }
            
            if (team.status === 'pending') {
                throw new Error('You already have a pending registration for this sport. Please wait for admin approval.');
            }
        }
        
        
        // EXISTING VALIDATION CODE CONTINUES...
        
        if (!team_name || team_name.trim().length < 3) {
            throw new Error('Team name must be at least 3 characters');
        }
        
        if (team_name.trim().length > 50) {
            throw new Error('Team name too long (maximum 50 characters)');
        }
        
        const [sport] = await connection.query('SELECT * FROM Sports WHERE sport_id = ?', [sport_id]);
        if (sport.length === 0) {
            throw new Error('Invalid sport');
        }
        
        // Check if payment is required
        if (sport[0].registration_fee > 0 && !paymentScreenshot) {
            throw new Error(`Payment screenshot required. Registration fee: Rs.${sport[0].registration_fee}`);
        }
        
        const playersList = JSON.parse(players);
        
        const validationErrors = validatePlayers(
            playersList, 
            sport[0].sport_name, 
            sport[0].team_size,
            sport[0].max_substitutes
        );
        
        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join('; '));
        }
        
        // Insert team
        const [teamResult] = await connection.query(
            'INSERT INTO Teams (team_name, manager_id, sport_id, event_id, logo, payment_screenshot, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [team_name.trim(), manager_id, sport_id, event_id, logo, paymentScreenshot, 'pending']
        );
        
        const teamId = teamResult.insertId;
        
        // Insert players
        for (const player of playersList) {
            if (!player.player_name || !player.jersey_no) {
                throw new Error('Player name and jersey number required for all players');
            }
            
            const nameRegex = /^[a-zA-Z\s'-]+$/;
            if (!nameRegex.test(player.player_name)) {
                throw new Error(`Invalid player name: ${player.player_name}`);
            }
            
            if (player.player_name.trim().length < 2 || player.player_name.trim().length > 50) {
                throw new Error(`Player name must be between 2 and 50 characters`);
            }
            
            const jerseyRegex = /^\d+$/;
            if (!jerseyRegex.test(player.jersey_no)) {
                throw new Error(`Invalid jersey number: ${player.jersey_no}`);
            }
            
            const jerseyNum = parseInt(player.jersey_no);
            if (jerseyNum < 0 || jerseyNum > 99) {
                throw new Error(`Jersey number must be between 0 and 99`);
            }
            
            await connection.query(
                'INSERT INTO Players (team_id, player_name, jersey_no, age, position, player_type) VALUES (?, ?, ?, ?, ?, ?)',
                [teamId, player.player_name.trim(), player.jersey_no.trim(), player.age || null, player.position || null, player.player_type]
            );
        }
        
        await connection.query(
            'INSERT INTO TeamRegistrationHistory (team_id, action, performed_by, notes) VALUES (?, ?, ?, ?)',
            [teamId, 'created', manager_id, 'Team registered by manager']
        );
        
        await connection.commit();
        
        const [user] = await connection.query('SELECT email, username FROM Users WHERE user_id = ?', [manager_id]);
        const [eventData] = await connection.query('SELECT event_name FROM Events WHERE event_id = ?', [event_id]);
        
        await sendEmail(user[0].email, 'Team Registration Received', `
            <div style="font-family: Arial, sans-serif;">
                <h2>Team Registration Submitted</h2>
                <p>Hi ${user[0].username},</p>
                <p>Your team <strong>${team_name}</strong> has been submitted for approval.</p>
                <p><strong>Event:</strong> ${eventData[0].event_name}</p>
                <p><strong>Sport:</strong> ${sport[0].sport_name}</p>
                ${sport[0].registration_fee > 0 ? `<p><strong>Fee:</strong> Rs.${sport[0].registration_fee}</p>` : ''}
                <p>You'll receive an email once the admin reviews your registration.</p>
            </div>
        `);
        
        res.status(201).json({ 
            message: 'Team registered successfully! Awaiting admin approval.',
            teamId 
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error registering team:', error);
        res.status(500).json({ message: error.message || 'Error registering team' });
    } finally {
        connection.release();
    }
});

// Approve Team Audit log
app.post('/api/teams/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    const teamId = req.params.id;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [teams] = await connection.query(`
            SELECT t.*, u.email, u.username, s.sport_name, e.event_name
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.team_id = ?
        `, [teamId]);
        
        if (teams.length === 0) {
            throw new Error('Team not found');
        }
        
        const team = teams[0];
        
        await connection.query(
            'UPDATE Teams SET status = ? WHERE team_id = ?',
            ['approved', teamId]
        );
        
        //  Initialize points table entry
        await connection.query(
            'INSERT INTO PointsTable (event_id, sport_id, team_id, matches_played, wins, draws, losses, points, goals_for, goals_against) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0)',
            [team.event_id, team.sport_id, teamId]
        );
        
        //  Audit log
        await connection.query(
            'INSERT INTO TeamRegistrationHistory (team_id, action, performed_by, notes) VALUES (?, ?, ?, ?)',
            [teamId, 'approved', req.user.userId, 'Approved by admin']
        );
        
        await connection.commit();
        
        //  Email notification
        await sendEmail(team.email, `Team Approved - ${team.team_name}`, `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #10b981;">Congratulations! 🎉</h2>
                <p>Hi <strong>${team.username}</strong>,</p>
                <p>Your team <strong>${team.team_name}</strong> has been approved!</p>
                <p><strong>Event:</strong> ${team.event_name}</p>
                <p><strong>Sport:</strong> ${team.sport_name}</p>
                <p>Good luck in the tournament!</p>
            </div>
        `);
        
        res.json({ message: 'Team approved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving team:', error);
        res.status(500).json({ message: error.message || 'Error approving team' });
    } finally {
        connection.release();
    }
});


// REJECT TEAM ENDPOINT 

app.post('/api/teams/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
    const teamId = req.params.id;
    const { reason } = req.body;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [teams] = await connection.query(`
            SELECT t.*, u.email, u.username, e.event_name, s.sport_name
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Events e ON t.event_id = e.event_id
            JOIN Sports s ON t.sport_id = s.sport_id
            WHERE t.team_id = ?
        `, [teamId]);
        
        if (teams.length === 0) {
            throw new Error('Team not found');
        }
        
        const team = teams[0];
        
        await connection.query(
            'UPDATE Teams SET status = ?, rejection_reason = ? WHERE team_id = ?',
            ['rejected', reason || null, teamId]
        );
        
        await connection.query(
            'INSERT INTO TeamRegistrationHistory (team_id, action, performed_by, notes) VALUES (?, ?, ?, ?)',
            [teamId, 'rejected', req.user.userId, reason || 'Rejected by admin']
        );
        
        await connection.commit();
        
        // Updated email with reapply message
        await sendEmail(team.email, `Team Registration Status - ${team.team_name}`, `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #ef4444;">Team Registration Update</h2>
                <p>Hi <strong>${team.username}</strong>,</p>
                <p>Your team <strong>${team.team_name}</strong> registration for <strong>${team.sport_name}</strong> in <strong>${team.event_name}</strong> was not approved.</p>
                ${reason ? `
                    <div style="background: #fef2f2; padding: 12px; border-left: 4px solid #ef4444; margin: 16px 0;">
                        <strong>Reason:</strong> ${reason}
                    </div>
                ` : ''}
                <div style="background: #eff6ff; padding: 12px; border-left: 4px solid #0078ff; margin: 16px 0;">
                    <strong>📝 You can reapply!</strong>
                    <p style="margin: 8px 0 0 0;">Please review the rejection reason, make necessary changes, and submit a new registration. You can register again at any time during the registration period.</p>
                </div>
                <p>If you have questions, please contact the admin.</p>
            </div>
        `);
        
        res.json({ message: 'Team rejected. Manager can reapply.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error rejecting team:', error);
        res.status(500).json({ message: error.message || 'Error rejecting team' });
    } finally {
        connection.release();
    }
});



// Disqualify Team (Admin only) 
app.post('/api/teams/:id/disqualify', authenticateToken, requireAdmin, async (req, res) => {
    const teamId = req.params.id;
    const { reason } = req.body;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [teams] = await connection.query(`
            SELECT t.*, u.email, u.username, s.sport_name, e.event_name
            FROM Teams t
            JOIN Users u ON t.manager_id = u.user_id
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            WHERE t.team_id = ?
        `, [teamId]);
        
        if (teams.length === 0) {
            throw new Error('Team not found');
        }
        
        const team = teams[0];
        
        if (team.status === 'disqualified') {
            throw new Error('Team is already disqualified');
        }
        
        // Update team status to disqualified
        await connection.query(
            'UPDATE Teams SET status = ?, rejection_reason = ? WHERE team_id = ?',
            ['disqualified', reason || 'Disqualified by admin', teamId]
        );
        
        // Set points to 0 for disqualified team
        await connection.query(`
            UPDATE PointsTable 
            SET points = 0,
                wins = 0,
                draws = 0
            WHERE team_id = ?
        `, [teamId]);
        
        // Cancel all future scheduled matches for this team
        await connection.query(`
            UPDATE Matches 
            SET status = 'cancelled' 
            WHERE (team1_id = ? OR team2_id = ?) 
            AND status = 'scheduled'
            AND match_date > NOW()
        `, [teamId, teamId]);
        
        // Audit log
        await connection.query(
            'INSERT INTO TeamRegistrationHistory (team_id, action, performed_by, notes) VALUES (?, ?, ?, ?)',
            [teamId, 'disqualified', req.user.userId, reason || 'Disqualified by admin']
        );
        
        await connection.commit();
        
        // Email notification
        await sendEmail(team.email, `Team Disqualified - ${team.team_name}`, `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #ef4444;">Team Disqualified</h2>
                <p>Hi <strong>${team.username}</strong>,</p>
                <p>Your team <strong>${team.team_name}</strong> has been disqualified from the tournament.</p>
                <p><strong>Event:</strong> ${team.event_name}</p>
                <p><strong>Sport:</strong> ${team.sport_name}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                <p>All points have been reset to 0 and future matches have been cancelled.</p>
            </div>
        `);
        
        res.json({ message: 'Team disqualified. Points reset to 0, future matches cancelled.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error disqualifying team:', error);
        res.status(500).json({ message: error.message || 'Error disqualifying team' });
    } finally {
        connection.release();
    }
});

// Update Team - MODIFIED to allow player updates
app.put('/api/teams/:id', authenticateToken, upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'payment_screenshot', maxCount: 1 }
]), async (req, res) => {
    const teamId = req.params.id;
    const { team_name, players } = req.body;
    const logo = req.file ? `/uploads/${req.file.filename}` : null;
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [teams] = await connection.query('SELECT * FROM Teams WHERE team_id = ?', [teamId]);
        if (teams.length === 0) {
            throw new Error('Team not found');
        }
        
        const team = teams[0];
        
        if (req.user.role !== 'admin' && team.manager_id !== req.user.userId) {
            throw new Error('Not authorized to edit this team');
        }
        
        // Only allow updates for pending teams (for managers)
        if (req.user.role !== 'admin' && team.status !== 'pending') {
            throw new Error('Can only edit pending teams');
        }
        
        const updates = [];
        const values = [];
        
        if (team_name) {
            if (team_name.trim().length < 3 || team_name.trim().length > 50) {
                throw new Error('Team name must be 3-50 characters');
            }
            updates.push('team_name = ?');
            values.push(team_name.trim());
        }
        
        if (logo) {
            updates.push('logo = ?');
            values.push(logo);
        }
        
        // Update team details if any
        if (updates.length > 0) {
            values.push(teamId);
            await connection.query(`UPDATE Teams SET ${updates.join(', ')} WHERE team_id = ?`, values);
        }
        
        // UPDATE PLAYERS if provided
        if (players) {
            const playersList = JSON.parse(players);
            
            // Get sport details for validation
            const [sport] = await connection.query('SELECT * FROM Sports WHERE sport_id = ?', [team.sport_id]);
            
            // Validate players
            const validationErrors = validatePlayers(
                playersList, 
                sport[0].sport_name, 
                sport[0].team_size,
                sport[0].max_substitutes
            );
            
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join('; '));
            }
            
            // Delete old players
            await connection.query('DELETE FROM Players WHERE team_id = ?', [teamId]);
            
            // Insert updated players
            for (const player of playersList) {
                if (!player.player_name || !player.jersey_no) {
                    throw new Error('Player name and jersey number required for all players');
                }
                
                const nameRegex = /^[a-zA-Z\s'-]+$/;
                if (!nameRegex.test(player.player_name)) {
                    throw new Error(`Invalid player name: ${player.player_name}`);
                }
                
                if (player.player_name.trim().length < 2 || player.player_name.trim().length > 50) {
                    throw new Error(`Player name must be between 2 and 50 characters`);
                }
                
                const jerseyRegex = /^\d+$/;
                if (!jerseyRegex.test(player.jersey_no)) {
                    throw new Error(`Invalid jersey number: ${player.jersey_no}`);
                }
                
                const jerseyNum = parseInt(player.jersey_no);
                if (jerseyNum < 0 || jerseyNum > 99) {
                    throw new Error(`Jersey number must be between 0 and 99`);
                }
                
                await connection.query(
                    'INSERT INTO Players (team_id, player_name, jersey_no, age, position, player_type) VALUES (?, ?, ?, ?, ?, ?)',
                    [teamId, player.player_name.trim(), player.jersey_no.trim(), player.age || null, player.position || null, player.player_type]
                );
            }
        }
        
        await connection.query(
            'INSERT INTO TeamRegistrationHistory (team_id, action, performed_by, notes) VALUES (?, ?, ?, ?)',
            [teamId, 'updated', req.user.userId, 'Team details updated']
        );
        
        await connection.commit();
        
        res.json({ message: 'Team updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating team:', error);
        res.status(500).json({ message: error.message || 'Error updating team' });
    } finally {
        connection.release();
    }
});

// Delete Team Prevent deletion with match history
app.delete('/api/teams/:id', authenticateToken, async (req, res) => {
    const teamId = req.params.id;
    
    try {
        const [teams] = await pool.query('SELECT * FROM Teams WHERE team_id = ?', [teamId]);
        if (teams.length === 0) {
            return res.status(404).json({ message: 'Team not found' });
        }
        
        if (req.user.role !== 'admin') {
            if (teams[0].manager_id !== req.user.userId) {
                return res.status(403).json({ message: 'Not authorized' });
            }
            if (teams[0].status !== 'pending') {
                return res.status(400).json({ message: 'Can only delete pending teams' });
            }
        }
        
        //Check for match history
        const [matches] = await pool.query(
            'SELECT COUNT(*) as count FROM Matches WHERE (team1_id = ? OR team2_id = ?) AND status = "completed"',
            [teamId, teamId]
        );
        
        if (matches[0].count > 0) {
            return res.status(400).json({ 
                message: 'Cannot delete team with completed match history' 
            });
        }
        
        await pool.query('DELETE FROM Teams WHERE team_id = ?', [teamId]);
        
        res.json({ message: 'Team deleted successfully' });
    } catch (error) {
        console.error('Error deleting team:', error);
        res.status(500).json({ message: 'Error deleting team' });
    }
});

// Get Team Players
app.get('/api/players/:teamId', async (req, res) => {
    try {
        const [players] = await pool.query(
            'SELECT * FROM Players WHERE team_id = ? ORDER BY player_type ASC, player_name ASC',
            [req.params.teamId]
        );
        res.json(players);
    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).json({ message: 'Error fetching players' });
    }
});



// MATCH ROUTES


// Get Matches filtered by active event
app.get('/api/matches', async (req, res) => {
    try {
        const { event_id, sport_id, date_from, date_to } = req.query;
        
        let query = `
            SELECT m.match_id, m.event_id, m.sport_id, m.team1_id, m.team2_id, 
            DATE_FORMAT(m.match_date, '%Y-%m-%d %H:%i:%s') as match_date, m.status,
            m.venue_id,
            t1.team_name as team1_name, t2.team_name as team2_name,
            s.sport_name, e.event_name, v.venue_name,
            sc.team1_score, sc.team2_score
            FROM Matches m
            JOIN Teams t1 ON m.team1_id = t1.team_id
            JOIN Teams t2 ON m.team2_id = t2.team_id
            JOIN Sports s ON m.sport_id = s.sport_id
            JOIN Events e ON m.event_id = e.event_id
            LEFT JOIN Venues v ON m.venue_id = v.venue_id
            LEFT JOIN Scores sc ON m.match_id = sc.match_id
            WHERE 1=1
        `;
        
        const params = [];
        
        //  Search and filter functionality
        if (event_id) {
            query += ' AND m.event_id = ?';
            params.push(event_id);
        }
        
        if (sport_id) {
            query += ' AND m.sport_id = ?';
            params.push(sport_id);
        }
        
        if (date_from) {
            query += ' AND m.match_date >= ?';
            params.push(date_from);
        }
        
        if (date_to) {
            query += ' AND m.match_date <= ?';
            params.push(date_to);
        }
        
        query += ' ORDER BY m.match_date ASC';
        
        const [matches] = await pool.query(query, params);
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ message: 'Error fetching matches' });
    }
});

// Get Manager's Matches
app.get('/api/matches/my', authenticateToken, async (req, res) => {
    try {
        const [matches] = await pool.query(`
            SELECT m.*, 
            DATE_FORMAT(m.match_date, '%Y-%m-%d %H:%i:%s') as match_date,
            t1.team_name as team1_name, t2.team_name as team2_name,
            s.sport_name, e.event_name, v.venue_name,
            sc.team1_score, sc.team2_score
            FROM Matches m
            JOIN Teams t1 ON m.team1_id = t1.team_id
            JOIN Teams t2 ON m.team2_id = t2.team_id
            JOIN Sports s ON m.sport_id = s.sport_id
            JOIN Events e ON m.event_id = e.event_id
            LEFT JOIN Venues v ON m.venue_id = v.venue_id
            LEFT JOIN Scores sc ON m.match_id = sc.match_id
            WHERE t1.manager_id = ? OR t2.manager_id = ?
            ORDER BY m.match_date ASC
        `, [req.user.userId, req.user.userId]);
        res.json(matches);
    } catch (error) {
        console.error('Error fetching manager matches:', error);
        res.status(500).json({ message: 'Error fetching matches' });
    }
});

// Schedule Match
app.post('/api/matches', authenticateToken, requireAdmin, async (req, res) => {
    const { event_id, sport_id, team1_id, team2_id, venue_id, match_date } = req.body;
    
    if (!event_id || !sport_id || !team1_id || !team2_id || !match_date) {
        return res.status(400).json({ message: 'All fields except venue required' });
    }
    
    if (team1_id === team2_id) {
        return res.status(400).json({ message: 'Teams must be different' });
    }

    // Check venue availability and Venue time conflict validation
if (venue_id) {
    // Check if venue is appropriate for this sport
    const [venueCheck] = await pool.query(
        'SELECT sport_id FROM Venues WHERE venue_id = ?',
        [venue_id]
    );
    
    if (venueCheck.length > 0 && venueCheck[0].sport_id && venueCheck[0].sport_id != sport_id) {
        return res.status(400).json({ 
            message: 'Selected venue is not suitable for this sport' 
        });
    }
    
    // Check venue availability
    const [venueConflicts] = await pool.query(`
        SELECT m.*, v.venue_name
        FROM Matches m
        JOIN Venues v ON m.venue_id = v.venue_id
        WHERE m.venue_id = ?
        AND m.status IN ('scheduled', 'live')
        AND ABS(TIMESTAMPDIFF(MINUTE, m.match_date, ?)) < 120
    `, [venue_id, match_date]);
    
    if (venueConflicts.length > 0) {
        return res.status(400).json({ 
            message: `Venue conflict: "${venueConflicts[0].venue_name}" has another match within 2 hours of this time` 
        });
    }
}
    
    try {
        //  Check minimum team requirement
        const [teamsCount] = await pool.query(
            'SELECT COUNT(*) as count FROM Teams WHERE event_id = ? AND sport_id = ? AND status = "approved"',
            [event_id, sport_id]
        );
        
        if (teamsCount[0].count < 2) {
            return res.status(400).json({ 
                message: 'At least 2 teams required in this sport to schedule a match' 
            });
        }
        
        // Validate both teams
        const [team1] = await pool.query('SELECT * FROM Teams WHERE team_id = ?', [team1_id]);
        const [team2] = await pool.query('SELECT * FROM Teams WHERE team_id = ?', [team2_id]);
        
        if (team1.length === 0 || team2.length === 0) {
            return res.status(400).json({ message: 'One or both teams not found' });
        }
        
        if (team1[0].status !== 'approved' || team2[0].status !== 'approved') {
            return res.status(400).json({ message: 'Both teams must be approved' });
        }
        
        //  Match time validation
        const matchDateTime = new Date(match_date);
        const hours = matchDateTime.getHours();
        
        if (hours < 8 || hours >= 22) {
            return res.status(400).json({ 
                message: 'Match time must be between 8:00 AM and 10:00 PM' 
            });
        }
        
        // Validate within event dates
        const [event] = await pool.query('SELECT * FROM Events WHERE event_id = ?', [event_id]);
        if (event.length === 0) {
            return res.status(400).json({ message: 'Event not found' });
        }
        
        const eventStart = new Date(event[0].start_date);
        const eventEnd = new Date(event[0].end_date);
        eventEnd.setHours(23, 59, 59, 999);
        
        if (matchDateTime < eventStart || matchDateTime > eventEnd) {
            return res.status(400).json({ 
                message: `Match date must be between ${event[0].start_date} and ${event[0].end_date}` 
            });
        }
        
        //  Match date conflict validation
        const [conflicts] = await pool.query(`
            SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
            FROM Matches m
            JOIN Teams t1 ON m.team1_id = t1.team_id
            JOIN Teams t2 ON m.team2_id = t2.team_id
            WHERE (m.team1_id = ? OR m.team2_id = ? OR m.team1_id = ? OR m.team2_id = ?)
            AND m.status IN ('scheduled', 'live')
            AND ABS(TIMESTAMPDIFF(MINUTE, m.match_date, ?)) < 120
        `, [team1_id, team1_id, team2_id, team2_id, match_date]);
        
        if (conflicts.length > 0) {
            return res.status(400).json({ 
                message: `Match conflict: ${conflicts[0].team1_name} or ${conflicts[0].team2_name} already has a match within 2 hours of this time` 
            });
        }
        
        const [result] = await pool.query(
            'INSERT INTO Matches (event_id, sport_id, team1_id, team2_id, venue_id, match_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [event_id, sport_id, team1_id, team2_id, venue_id || null, match_date, 'scheduled']
        );
        
        //  Send notifications to managers
        const [managers] = await pool.query(`
            SELECT DISTINCT u.email, u.username, t.team_name
            FROM Users u
            JOIN Teams t ON u.user_id = t.manager_id
            WHERE t.team_id IN (?, ?)
        `, [team1_id, team2_id]);
        
        for (const mgr of managers) {
            await sendEmail(mgr.email, 'Match Scheduled', `
                <div style="font-family: Arial, sans-serif;">
                    <h2>New Match Scheduled</h2>
                    <p>Hi ${mgr.username},</p>
                    <p>Your team <strong>${mgr.team_name}</strong> has a match scheduled:</p>
                    <p><strong>Date:</strong> ${new Date(match_date).toLocaleString()}</p>
                    <p><strong>Opponent:</strong> ${team1[0].team_name === mgr.team_name ? team2[0].team_name : team1[0].team_name}</p>
                </div>
            `);
        }
        
        res.status(201).json({ message: 'Match scheduled successfully', matchId: result.insertId });
    } catch (error) {
        console.error('Error scheduling match:', error);
        res.status(500).json({ message: 'Error scheduling match' });
    }
});

// Update Match - Reschedule capability
app.put('/api/matches/:id', authenticateToken, requireAdmin, async (req, res) => {
    const matchId = req.params.id;
    const { match_date, venue_id, status } = req.body;
    
    try {
        const [matches] = await pool.query('SELECT * FROM Matches WHERE match_id = ?', [matchId]);
        
        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found' });
        }
        
        const match = matches[0];
        
        if (match.status === 'completed' && status !== 'completed') {
            return res.status(400).json({ message: 'Cannot modify completed matches' });
        }
        
        const updates = [];
        const values = [];
        
        if (match_date) {
            // Validate time
            const matchDateTime = new Date(match_date);
            const hours = matchDateTime.getHours();
            
            if (hours < 8 || hours >= 22) {
                return res.status(400).json({ 
                    message: 'Match time must be between 8:00 AM and 10:00 PM' 
                });
            }
            
            // Check conflicts
            const [conflicts] = await pool.query(`
                SELECT COUNT(*) as count FROM Matches
                WHERE match_id != ?
                AND (team1_id IN (?, ?) OR team2_id IN (?, ?))
                AND status IN ('scheduled', 'live')
                AND ABS(TIMESTAMPDIFF(MINUTE, match_date, ?)) < 120
            `, [matchId, match.team1_id, match.team2_id, match.team1_id, match.team2_id, match_date]);
            
            if (conflicts[0].count > 0) {
                return res.status(400).json({ 
                    message: 'Match conflict: Teams have another match within 2 hours' 
                });
            }
            
            updates.push('match_date = ?');
            values.push(match_date);
            
            //  Audit log
            await pool.query(
                'INSERT INTO MatchHistory (match_id, action, performed_by, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
                [matchId, 'rescheduled', req.user.userId, match.match_date, match_date]
            );
        }
        
        if (venue_id !== undefined) {
            updates.push('venue_id = ?');
            values.push(venue_id);
        }
        
        if (status) {
            updates.push('status = ?');
            values.push(status);
        }
        
        if (updates.length > 0) {
            values.push(matchId);
            await pool.query(`UPDATE Matches SET ${updates.join(', ')} WHERE match_id = ?`, values);
        }
        
        res.json({ message: 'Match updated successfully' });
    } catch (error) {
        console.error('Error updating match:', error);
        res.status(500).json({ message: 'Error updating match' });
    }
});

// Update Match Score
app.post('/api/matches/:id/score', authenticateToken, requireAdmin, async (req, res) => {
    const matchId = req.params.id;
    const { team1_score, team2_score } = req.body;
    
    if (team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ message: 'Both team scores required' });
    }
    
    if (team1_score < 0 || team2_score < 0) {
        return res.status(400).json({ message: 'Scores cannot be negative' });
    }
    if (team1_score > 100 || team2_score > 100) {
    return res.status(400).json({ 
        message: 'Score seems unusually high. Please verify. (Maximum 100 per team)' 
    });
}
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [matches] = await connection.query(`
            SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
            FROM Matches m
            JOIN Teams t1 ON m.team1_id = t1.team_id
            JOIN Teams t2 ON m.team2_id = t2.team_id
            WHERE m.match_id = ?
        `, [matchId]);
        
        if (matches.length === 0) {
            throw new Error('Match not found');
        }
        
        const match = matches[0];
        
        // Check scheduled time has passed
        const matchDate = new Date(match.match_date);
        const now = new Date();
        
        if (now < matchDate) {
            throw new Error('Cannot complete match before scheduled time');
        }
        
        // Check if score already exists
        const [existingScores] = await connection.query(
            'SELECT * FROM Scores WHERE match_id = ?',
            [matchId]
        );
        
        // Rollback previous points if updating score
        if (existingScores.length > 0) {
            const oldScore = existingScores[0];
            
            // Rollback team1 points
            const oldTeam1Points = oldScore.winner_team_id === match.team1_id ? 3 : (oldScore.winner_team_id === null ? 1 : 0);
            await connection.query(`
                UPDATE PointsTable
                SET matches_played = matches_played - 1,
                    wins = wins - ?,
                    draws = draws - ?,
                    losses = losses - ?,
                    goals_for = goals_for - ?,
                    goals_against = goals_against - ?,
                    points = points - ?
                WHERE team_id = ? AND event_id = ? AND sport_id = ?
            `, [
                oldScore.winner_team_id === match.team1_id ? 1 : 0,
                oldScore.winner_team_id === null ? 1 : 0,
                oldScore.winner_team_id === match.team2_id ? 1 : 0,
                oldScore.team1_score,
                oldScore.team2_score,
                oldTeam1Points,
                match.team1_id,
                match.event_id,
                match.sport_id
            ]);
            
            // Rollback team2 points
            const oldTeam2Points = oldScore.winner_team_id === match.team2_id ? 3 : (oldScore.winner_team_id === null ? 1 : 0);
            await connection.query(`
                UPDATE PointsTable
                SET matches_played = matches_played - 1,
                    wins = wins - ?,
                    draws = draws - ?,
                    losses = losses - ?,
                    goals_for = goals_for - ?,
                    goals_against = goals_against - ?,
                    points = points - ?
                WHERE team_id = ? AND event_id = ? AND sport_id = ?
            `, [
                oldScore.winner_team_id === match.team2_id ? 1 : 0,
                oldScore.winner_team_id === null ? 1 : 0,
                oldScore.winner_team_id === match.team1_id ? 1 : 0,
                oldScore.team2_score,
                oldScore.team1_score,
                oldTeam2Points,
                match.team2_id,
                match.event_id,
                match.sport_id
            ]);
            
            //  Audit log for score change
            await connection.query(
                'INSERT INTO MatchHistory (match_id, action, performed_by, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
                [matchId, 'score_updated', req.user.userId, 
                `${oldScore.team1_score}-${oldScore.team2_score}`, 
                `${team1_score}-${team2_score}`]
            );
        }
        
        // Determine winner
        let winnerId = null;
        if (team1_score > team2_score) winnerId = match.team1_id;
        else if (team2_score > team1_score) winnerId = match.team2_id;
        
        // Insert or update score
        await connection.query(`
            INSERT INTO Scores (match_id, team1_score, team2_score, winner_team_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            team1_score = VALUES(team1_score),
            team2_score = VALUES(team2_score),
            winner_team_id = VALUES(winner_team_id)
        `, [matchId, team1_score, team2_score, winnerId]);
        
        // Update match status
        await connection.query(
            'UPDATE Matches SET status = ? WHERE match_id = ?',
            ['completed', matchId]
        );
        
        //  Update points table with goal difference
        const team1Points = winnerId === match.team1_id ? 3 : (winnerId === null ? 1 : 0);
        await connection.query(`
            UPDATE PointsTable
            SET matches_played = matches_played + 1,
                wins = wins + ?,
                draws = draws + ?,
                losses = losses + ?,
                goals_for = goals_for + ?,
                goals_against = goals_against + ?,
                points = points + ?
            WHERE team_id = ? AND event_id = ? AND sport_id = ?
        `, [
            winnerId === match.team1_id ? 1 : 0,
            winnerId === null ? 1 : 0,
            winnerId === match.team2_id ? 1 : 0,
            team1_score,
            team2_score,
            team1Points,
            match.team1_id,
            match.event_id,
            match.sport_id
        ]);
        
        const team2Points = winnerId === match.team2_id ? 3 : (winnerId === null ? 1 : 0);
        await connection.query(`
            UPDATE PointsTable
            SET matches_played = matches_played + 1,
                wins = wins + ?,
                draws = draws + ?,
                losses = losses + ?,
                goals_for = goals_for + ?,
                goals_against = goals_against + ?,
                points = points + ?
            WHERE team_id = ? AND event_id = ? AND sport_id = ?
        `, [
            winnerId === match.team2_id ? 1 : 0,
            winnerId === null ? 1 : 0,
            winnerId === match.team1_id ? 1 : 0,
            team2_score,
            team1_score,
            team2Points,
            match.team2_id,
            match.event_id,
            match.sport_id
        ]);
        
        await connection.commit();
        
        res.json({ 
            message: 'Match score updated successfully',
            winner: winnerId ? (winnerId === match.team1_id ? match.team1_name : match.team2_name) : 'Draw'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating match score:', error);
        res.status(500).json({ message: error.message || 'Error updating match score' });
    } finally {
        connection.release();
    }
});

app.delete('/api/matches/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [matches] = await pool.query('SELECT * FROM Matches WHERE match_id = ?', [req.params.id]);
        
        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found' });
        }
        
        const match = matches[0];
        const matchDate = new Date(match.match_date);
        const now = new Date();
        
        // Cannot delete completed matches
        if (match.status === 'completed') {
            return res.status(400).json({ 
                message: 'Cannot delete completed match. Scores are recorded in the points table.' 
            });
        }
        
        // Cannot delete matches whose time has passed
        if (now > matchDate) {
            return res.status(400).json({ 
                message: 'Cannot delete past matches. If the match didn\'t take place, use "Cancel Match (No Show)" instead to preserve the record.' 
            });
        }
        
        // Only allow deletion of future scheduled matches
        await pool.query('DELETE FROM Matches WHERE match_id = ?', [req.params.id]);
        
        res.json({ message: 'Match deleted successfully' });
    } catch (error) {
        console.error('Error deleting match:', error);
        res.status(500).json({ message: 'Error deleting match' });
    }
});

// LEADERBOARD / POINTS ROUTES


//  Get Points with goal difference and team status
app.get('/api/points', async (req, res) => {
    const { event_id, sport_id } = req.query;
    
    try {
        let query = `
            SELECT p.*, t.team_name, t.status as team_status, s.sport_name, e.event_name,
            (p.goals_for - p.goals_against) as goal_difference
            FROM PointsTable p
            JOIN Teams t ON p.team_id = t.team_id
            JOIN Sports s ON p.sport_id = s.sport_id
            JOIN Events e ON p.event_id = e.event_id
            WHERE 1=1
        `;
        const params = [];
        
        if (event_id) {
            query += ' AND p.event_id = ?';
            params.push(event_id);
        }
        
        if (sport_id && sport_id !== 'overall') {
            query += ' AND p.sport_id = ?';
            params.push(sport_id);
        }
        
        // Order: non-disqualified first, then by points and goal difference
        query += ` ORDER BY 
            CASE WHEN t.status = 'disqualified' THEN 1 ELSE 0 END,
            p.points DESC, 
            (p.goals_for - p.goals_against) DESC, 
            p.goals_for DESC`;
        
        const [points] = await pool.query(query, params);
        res.json(points);
    } catch (error) {
        console.error('Error fetching points:', error);
        res.status(500).json({ message: 'Error fetching points' });
    }
});

// VENUES ROUTES 

app.get('/api/venues', async (req, res) => {
    try {
        const [venues] = await pool.query('SELECT * FROM Venues ORDER BY venue_name ASC');
        res.json(venues);
    } catch (error) {
        console.error('Error fetching venues:', error);
        res.status(500).json({ message: 'Error fetching venues' });
    }
});

// Create Venue at runtime - UPDATED with sport_id
app.post('/api/venues', authenticateToken, requireAdmin, async (req, res) => {
    const { venue_name, location, capacity, contact, sport_id } = req.body;
    
    if (!venue_name) {
        return res.status(400).json({ message: 'Venue name required' });
    }
    
    if (!sport_id) {
        return res.status(400).json({ message: 'Sport selection required' });
    }
    
    try {
        const [result] = await pool.query(
            'INSERT INTO Venues (venue_name, location, capacity, contact, sport_id) VALUES (?, ?, ?, ?, ?)',
            [venue_name, location || null, capacity || null, contact || null, sport_id]
        );
        
        res.status(201).json({ message: 'Venue created', venueId: result.insertId });
    } catch (error) {
        console.error('Error creating venue:', error);
        res.status(500).json({ message: 'Error creating venue' });
    }
});


// SEARCH ENDPOINTS 

app.get('/api/search/teams', async (req, res) => {
    const { name, event_id, sport_id } = req.query;
    
    try {
        let query = `
            SELECT t.*, s.sport_name, e.event_name, u.username as manager_name
            FROM Teams t
            JOIN Sports s ON t.sport_id = s.sport_id
            JOIN Events e ON t.event_id = e.event_id
            JOIN Users u ON t.manager_id = u.user_id
            WHERE t.status = 'approved'
        `;
        const params = [];
        
        if (name) {
            query += ' AND t.team_name LIKE ?';
            params.push(`%${name}%`);
        }
        
        if (event_id) {
            query += ' AND t.event_id = ?';
            params.push(event_id);
        }
        
        if (sport_id) {
            query += ' AND t.sport_id = ?';
            params.push(sport_id);
        }
        
        query += ' ORDER BY t.team_name ASC LIMIT 50';
        
        const [teams] = await pool.query(query, params);
        res.json(teams);
    } catch (error) {
        console.error('Error searching teams:', error);
        res.status(500).json({ message: 'Error searching teams' });
    }
});


// ERROR HANDLING & SERVER START


app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum 5MB.' });
        }
        return res.status(400).json({ message: err.message });
    }
    
    res.status(500).json({ message: err.message || 'Internal server error' });
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📧 Email: ${EMAIL_USER || '⚠️  NOT CONFIGURED'}`);
    console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
    console.log(`📁 Uploads: ${fs.existsSync('uploads') ? '✅ Ready' : '❌ Missing'}`);
});

