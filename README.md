# Sports Tournament Portal

A web app I built for managing sports tournaments. You can handle everything from team registrations to match scheduling and live leaderboards.

**Live Demo:** https://sports-management-portal-kma6.onrender.com/

## What it does

- Admins can create events, add sports, approve teams, and schedule matches
- Managers can register their teams and track their performance
- Everyone can view live leaderboards sorted by points and goal difference
- Automated points calculation after each match
- Email notifications for important updates (approvals, match schedules, etc.)

## Tech I used

**Backend:**
- Node.js + Express for the API
- MySQL for data storage
- JWT for auth
- Bcrypt for passwords
- Nodemailer for emails
- Multer for file uploads (team logos, payment screenshots)

**Frontend:**
- Just vanilla JavaScript, no frameworks
- HTML/CSS with a custom design
- Responsive layout (works on mobile too)

## How to run locally

1. Clone this repo
```bash
git clone https://github.com/atifsarfraz80/Sports_Management_Portal
cd Sports_Management_Portal
```

2. Install packages
```bash
npm install
```

3. Set up your database
```bash
# Create a MySQL database called 'sports_management'
# Then import the schema (you'll need to create this from your existing DB)
mysql -u root -p sports_management < schema.sql
```

4. Configure environment variables

Create a `.env` file:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sports_management
JWT_SECRET=your-secret-key-here
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
PORT=3000
```

5. Start the server
```bash
npm start
```

Open http://localhost:3000 in your browser.

## Features worth checking out

**Event Management**
- Multiple events can exist at once (one active, others accepting registrations or planned)
- Registration periods with automatic open/close based on dates
- Event lifecycle: planned → registration_open → active → completed

**Team Registration**
- Sport-specific validation (e.g., cricket teams need exactly 1 wicket-keeper)
- Jersey number uniqueness checks
- Payment screenshot upload for paid events
- Admin approval workflow with email notifications

**Match Scheduling**
- Smart conflict detection (teams can't play 2 matches within 2 hours)
- Venue availability checking
- Time slot validation (matches only between 8 AM - 10 PM)
- Overdue match alerts (red indicators for matches past their time without scores)

**Points System**
- Win = 3 points, Draw = 1 point, Loss = 0 points
- Goal difference as tie-breaker
- Real-time leaderboard updates
- Team disqualification handling (sets points to 0, cancels future matches)

**User Roles**
- Admins: Full access to everything
- Managers: Register teams, view schedules, track performance

## Project structure

```
├── server.js          # Backend API
├── app.js            # Frontend logic
├── index.html        # Main page
├── style.css         # Styling
├── uploads/          # Team logos and payment proofs
└── .env             # Config (not in git)
```

## Some challenges I faced

- Getting the registration workflow right took a few tries. Had to think through all the edge cases (what if admin closes registrations early? what if a team gets disqualified?)
- Match conflict detection was tricky. Initially just checked if teams were busy, but also needed venue conflicts and time slot validation
- Points calculation with goal difference required careful SQL queries, especially when updating scores for matches that were already completed
- Making sure foreign key constraints don't break when inserting dummy data

## Things I'd add if I had more time

- Real-time updates with WebSockets (right now you need to refresh)
- More detailed analytics (team performance trends, head-to-head records)
- Bracket/knockout stage support (currently just round-robin)
- Mobile app (React Native maybe?)
- PDF report generation for final standings

## Known issues

- Email notifications require Gmail app passwords (regular password won't work due to 2FA)
- File uploads are limited to 5MB
- No pagination yet, so if you have 100+ teams it might get slow
- Date/time handling assumes server timezone (should use UTC everywhere)

## API endpoints

Just the main ones:

```
POST   /api/auth/login              # Login
POST   /api/auth/signup             # Create account
GET    /api/events                  # List all events
POST   /api/events                  # Create event (admin)
GET    /api/teams                   # List teams
POST   /api/teams/register          # Register team (manager)
POST   /api/teams/:id/approve       # Approve team (admin)
GET    /api/matches                 # List matches
POST   /api/matches                 # Schedule match (admin)
POST   /api/matches/:id/score       # Enter score (admin)
GET    /api/points                  # Leaderboard
```

## Contributing

Feel free to open issues or submit PRs if you find bugs or have ideas for improvements.

## License

MIT

## Contact

If you have questions or want to chat about the project:
- Email: atifsarfraz80@gmail.com
- LinkedIn: www.linkedin.com/in/atif-sarfraz-59805a3a0

---

Built this as a learning project to practice full-stack development. Learned a lot about handling complex business logic and state management without frameworks.
