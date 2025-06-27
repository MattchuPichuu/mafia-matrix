# Mafia Matrix Death Detective System

A real-time collaborative player tracking system for Mafia games with death detection, career history, and combat statistics.

## Features

- 🎮 **Game Rooms** - Multiple games with unique codes
- 💀 **Death Detective** - Automatically detects who died between scans
- 🏥 **Combat Medic Tracking** - Tracks anyone who has ever been Hospital Director
- 📊 **Career History** - Full employment history for each player
- ⚰️ **Funeral Parser** - Import death data with last words
- 💥 **Combat Stats** - Track whacks and MHS survived
- 🔄 **Real-time Sync** - All players see updates instantly
- 📱 **Responsive Design** - Works on desktop and mobile

## Quick Start

### 1. Fork/Clone This Repository

```bash
git clone https://github.com/YOUR_USERNAME/mafia-matrix.git
cd mafia-matrix
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project called "mafia-matrix"
3. Enable Realtime Database (start in test mode)
4. Get your config from Project Settings > Your Apps > Web

### 3. Update Configuration

Edit `index.html` and replace the Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### 4. Deploy to GitHub Pages

1. Push your changes:
```bash
git add .
git commit -m "Add Firebase config"
git push origin main
```

2. Enable GitHub Pages:
   - Go to Settings → Pages
   - Source: Deploy from branch
   - Branch: main, folder: / (root)
   - Save

### 5. Access Your App

Your app will be live at:
```
https://YOUR_USERNAME.github.io/mafia-matrix/
```

## How to Use

### Creating/Joining Games

1. **Create New Game**: Click "Create New Game" to get a unique 6-character code
2. **Join Existing Game**: Enter the game code to join
3. Share the code with other players to collaborate

### Parse Player Data

1. Go to "Parse Data" tab
2. Paste player list (format: NAME TAB OCCUPATION TAB RANK TAB CITY)
3. Click "Parse & Detect Deaths"
4. Dead players are automatically detected if missing from scan

### Track Combat Stats

1. Go to "Survivor Data" tab
2. Paste format: `PlayerName whacks mhs PlayerName2 whacks ...`
3. Example: `Khayra 55 Sheogorath 196 2`

### Process Deaths

1. Go to "Funeral Parlor" tab
2. Paste funeral data from game
3. Captures last words and cause of death

### Player Management

- Click player names to view full profile
- Toggle status flags (Opposition, Combat Medic, Friendly)
- Add notes to track alliances and info
- Filter by city, career, or status

## Data Structure

```
games/
├── GAMECODE/
│   ├── players/
│   │   ├── PlayerName/
│   │   │   ├── currentOccupation
│   │   │   ├── currentCity
│   │   │   ├── wasHD (Combat Medic)
│   │   │   ├── isOps (Opposition)
│   │   │   ├── whacksSurvived
│   │   │   └── careerHistory[]
│   ├── lastScan[]
│   └── lastUpdated
```

## Valid Cities

- Beirut
- Chicago  
- Auckland

## Security

For production use, update Firebase rules:

```json
{
  "rules": {
    "games": {
      "$gameCode": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['players', 'lastUpdated'])"
      }
    }
  }
}
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use for your own Mafia games!
