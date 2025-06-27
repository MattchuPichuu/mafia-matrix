// app.js - Complete Mafia Matrix Death Detective System with Firebase
const { useState, useEffect, useMemo } = React;

// Lucide React icons wrapper
const Icon = ({ icon, className, ...props }) => {
  const IconComponent = lucide[icon];
  return React.createElement(IconComponent, { className, ...props });
};

const PlayerTrackerApp = () => {
  // Core state
  const [players, setPlayers] = useState({});
  const [lastScanPlayers, setLastScanPlayers] = useState(new Set());
  const [activeTab, setActiveTab] = useState('parse');
  const [parseInput, setParseInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState(new Set());
  const [notification, setNotification] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [deathReport, setDeathReport] = useState({ died: [], newPlayers: [], funeralDetails: null });
  const [showDeathReport, setShowDeathReport] = useState(false);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState(null);
  const [showPlayerProfile, setShowPlayerProfile] = useState(false);
  const [survivorInput, setSurvivorInput] = useState('');
  const [funeralInput, setFuneralInput] = useState('');

  // Firebase state
  const [currentGame, setCurrentGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [joinGameCode, setJoinGameCode] = useState('');
  const [showGameMenu, setShowGameMenu] = useState(false);

  // Initialize Firebase listeners
  useEffect(() => {
    // Check for existing game code
    const savedGameCode = localStorage.getItem('mafiaMatrixGameCode');
    if (savedGameCode) {
      joinGame(savedGameCode);
    } else {
      setIsLoading(false);
      setShowGameMenu(true);
    }

    // Monitor connection
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      setIsConnected(snap.val() === true);
    });

    return () => {
      connectedRef.off();
    };
  }, []);

  // Listen to game data
  useEffect(() => {
    if (!currentGame) return;

    const gameRef = database.ref(`games/${currentGame}`);
    
    // Listen to players
    const playersRef = gameRef.child('players');
    playersRef.on('value', (snapshot) => {
      const data = snapshot.val() || {};
      setPlayers(data);
    });

    // Listen to last scan
    const lastScanRef = gameRef.child('lastScan');
    lastScanRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLastScanPlayers(new Set(data));
      }
    });

    // Set online presence
    const presenceRef = gameRef.child('presence').push();
    presenceRef.set({
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      userAgent: navigator.userAgent
    });
    presenceRef.onDisconnect().remove();

    return () => {
      playersRef.off();
      lastScanRef.off();
      presenceRef.remove();
    };
  }, [currentGame]);

  // Save to Firebase
  const saveToFirebase = (path, data) => {
    if (!currentGame) return;
    
    const ref = database.ref(`games/${currentGame}/${path}`);
    ref.set(data).catch(err => {
      console.error('Firebase save error:', err);
      showNotification('Failed to save to cloud', 'error');
    });
  };

  // Game Management Functions
  const generateGameCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createNewGame = () => {
    const code = generateGameCode();
    const gameRef = database.ref(`games/${code}`);
    
    gameRef.set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastUpdated: firebase.database.ServerValue.TIMESTAMP,
      players: {},
      settings: {
        validCities: ['Beirut', 'Chicago', 'Auckland']
      }
    }).then(() => {
      joinGame(code);
      showNotification(`Created new game: ${code}`, 'success');
    });
  };

  const joinGame = (code) => {
    const upperCode = code.toUpperCase();
    const gameRef = database.ref(`games/${upperCode}`);
    
    gameRef.once('value', (snapshot) => {
      if (snapshot.exists() || upperCode === currentGame) {
        setCurrentGame(upperCode);
        localStorage.setItem('mafiaMatrixGameCode', upperCode);
        setShowGameMenu(false);
        setIsLoading(false);
        showNotification(`Joined game: ${upperCode}`, 'success');
      } else {
        showNotification('Game not found', 'error');
        setIsLoading(false);
      }
    });
  };

  const leaveGame = () => {
    localStorage.removeItem('mafiaMatrixGameCode');
    setCurrentGame(null);
    setPlayers({});
    setLastScanPlayers(new Set());
    setShowGameMenu(true);
  };

  // Notification system
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Player Management Functions
  const openPlayerProfile = (playerName) => {
    setSelectedPlayerProfile(playerName);
    setShowPlayerProfile(true);
  };

  const parsePlayerData = (rawData) => {
    const VALID_CITIES = ['Beirut', 'Chicago', 'Auckland'];
    const lines = rawData.trim().split('\n');
    let startLine = 0;
    
    if (lines.length > 0 && lines[0].includes('NAME') && lines[0].includes('OCCUPATION')) {
      startLine = 1;
    }

    let processedLines = 0;
    let skippedLines = 0;
    let invalidCityCount = 0;
    const currentScanPlayers = new Set();
    const updatedPlayers = { ...players };
    const newPlayersThisScan = [];
    const diedPlayers = [];

    // First pass: Process all players from current scan
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        skippedLines++;
        continue;
      }

      let parts = [];
      if (line.includes('\t')) {
        parts = line.split('\t').map(p => p.trim()).filter(p => p);
      } else {
        parts = line.split(/\s{2,}/).map(p => p.trim()).filter(p => p);
        if (parts.length < 4) {
          parts = line.split(/\s+/);
        }
      }

      if (parts.length < 4) {
        skippedLines++;
        continue;
      }

      const [name, occupation, rank, city] = parts;
      
      if (!name || !occupation || !rank || !city) {
        skippedLines++;
        continue;
      }

      if (!VALID_CITIES.includes(city)) {
        console.warn(`Invalid city detected: "${city}" for player ${name}`);
        invalidCityCount++;
        skippedLines++;
        continue;
      }
      
      // Additional validation
      if (VALID_CITIES.includes(occupation) || VALID_CITIES.includes(rank)) {
        console.warn(`City name found in wrong position for player ${name}`);
        invalidCityCount++;
        skippedLines++;
        continue;
      }

      processedLines++;
      currentScanPlayers.add(name);

      const occupationLower = occupation.toLowerCase().trim();
      const isCurrentlyHD = (occupationLower.includes('hospital') && occupationLower.includes('director')) || 
                           (occupationLower.includes('combat') && occupationLower.includes('medic'));

      if (!updatedPlayers[name]) {
        // New player
        updatedPlayers[name] = {
          currentOccupation: occupation,
          currentRank: rank,
          currentCity: city,
          firstSeen: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          isNew: true,
          notes: '',
          isOps: false,
          wasHD: isCurrentlyHD,
          isCurrentlyHD: isCurrentlyHD,
          isFriendly: false,
          whacksSurvived: 0,
          mhsSurvived: 0,
          isDead: false,
          careerHistory: [{
            occupation: occupation,
            rank: rank,
            city: city,
            startDate: new Date().toISOString(),
            endDate: null,
            isCurrent: true
          }]
        };
        newPlayersThisScan.push(name);
      } else {
        // Existing player
        const player = updatedPlayers[name];
        player.isDead = false;
        player.deathDate = null;
        player.isCurrentlyHD = isCurrentlyHD;
        
        // Check career history for ANY Hospital Director position
        const hasBeenHD = player.careerHistory && player.careerHistory.some(career => {
          const careerLower = (career.occupation || '').toLowerCase().trim();
          return (careerLower.includes('hospital') && careerLower.includes('director')) || 
                 (careerLower.includes('combat') && careerLower.includes('medic'));
        });
        
        if (isCurrentlyHD || hasBeenHD) {
          player.wasHD = true;
        }
        
        // Check for career changes
        const hasCareerChange = player.currentOccupation !== occupation || 
                               player.currentRank !== rank || 
                               player.currentCity !== city;
        
        if (hasCareerChange) {
          if (player.careerHistory && player.careerHistory.length > 0) {
            const currentCareer = player.careerHistory.find(c => c.isCurrent);
            if (currentCareer) {
              currentCareer.endDate = new Date().toISOString();
              currentCareer.isCurrent = false;
            }
          }
          
          if (!player.careerHistory) {
            player.careerHistory = [];
          }
          
          player.careerHistory.push({
            occupation: occupation,
            rank: rank,
            city: city,
            startDate: new Date().toISOString(),
            endDate: null,
            isCurrent: true
          });
          
          player.currentOccupation = occupation;
          player.currentRank = rank;
          player.currentCity = city;
        }
        
        player.lastUpdated = new Date().toISOString();
        player.isNew = false;
      }
    }

    // Second pass: Mark missing players as dead
    if (lastScanPlayers.size > 0) {
      for (const playerName of lastScanPlayers) {
        if (!currentScanPlayers.has(playerName) && updatedPlayers[playerName] && !updatedPlayers[playerName].isDead) {
          const player = updatedPlayers[playerName];
          player.isDead = true;
          player.deathDate = new Date().toISOString();
          player.isCurrentlyHD = false;
          
          if (player.careerHistory && player.careerHistory.length > 0) {
            const currentCareer = player.careerHistory.find(c => c.isCurrent);
            if (currentCareer) {
              currentCareer.endDate = player.deathDate;
              currentCareer.isCurrent = false;
            }
          }
          
          diedPlayers.push(playerName);
        }
      }
    }

    // Save to Firebase
    saveToFirebase('players', updatedPlayers);
    saveToFirebase('lastScan', [...currentScanPlayers]);
    saveToFirebase('lastUpdated', firebase.database.ServerValue.TIMESTAMP);
    
    setLastScanPlayers(currentScanPlayers);
    
    if (diedPlayers.length > 0 || newPlayersThisScan.length > 0) {
      setDeathReport({
        died: diedPlayers,
        newPlayers: newPlayersThisScan,
        funeralDetails: null
      });
      setShowDeathReport(true);
    }
    
    const alivePlayers = Object.entries(updatedPlayers).filter(([_, p]) => !p.isDead).length;
    const combatMedics = Object.entries(updatedPlayers).filter(([_, p]) => !p.isDead && p.wasHD).length;
    
    let summary = `Parsing complete!\nProcessed: ${processedLines} lines\nSkipped: ${skippedLines} lines`;
    if (invalidCityCount > 0) {
      summary += `\nInvalid cities: ${invalidCityCount} (check data format!)`;
    }
    summary += `\nAlive players: ${alivePlayers}\nCombat Medics (Ever HD): ${combatMedics}\nDied this scan: ${diedPlayers.length}\nNew players: ${newPlayersThisScan.length}`;
    
    showNotification(summary, 'success');
    setParseInput('');
  };

  const parseSurvivorData = (rawData) => {
    const tokens = rawData.trim().split(/\s+/);
    const updatedPlayers = { ...players };
    let updatedCount = 0;
    let notFoundCount = 0;
    
    let i = 0;
    while (i < tokens.length) {
      const name = tokens[i];
      
      if (!isNaN(name)) {
        i++;
        continue;
      }
      
      let whacks = 0;
      let mhs = 0;
      
      if (i + 1 < tokens.length && !isNaN(tokens[i + 1])) {
        whacks = parseInt(tokens[i + 1]);
        
        if (i + 2 < tokens.length && !isNaN(tokens[i + 2])) {
          mhs = parseInt(tokens[i + 2]);
          i += 3;
        } else {
          i += 2;
        }
      } else {
        i++;
        continue;
      }
      
      if (updatedPlayers[name]) {
        updatedPlayers[name].whacksSurvived = whacks;
        updatedPlayers[name].mhsSurvived = mhs;
        updatedCount++;
      } else {
        notFoundCount++;
        console.warn(`Player not found: ${name}`);
      }
    }
    
    saveToFirebase('players', updatedPlayers);
    setSurvivorInput('');
    
    const summary = `Survivor data updated!\nUpdated: ${updatedCount} players\nNot found: ${notFoundCount} players`;
    showNotification(summary, 'success');
  };

  const parseFuneralData = (rawData) => {
    const lines = rawData.trim().split('\n');
    const updatedPlayers = { ...players };
    let processedDeaths = 0;
    let notFoundCount = 0;
    let nameChanges = 0;
    const deathDetails = [];
    const VALID_CITIES = ['Beirut', 'Chicago', 'Auckland'];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }
      
      if (line.includes("'s last words:")) {
        i++;
        continue;
      }
      
      const dateTimeMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/);
      
      if (!dateTimeMatch) {
        console.warn(`Could not find date/time in funeral line: ${line}`);
        i++;
        continue;
      }
      
      const dateTime = dateTimeMatch[1];
      const dateTimeIndex = line.indexOf(dateTime);
      const beforeDateTime = line.substring(0, dateTimeIndex);
      const cause = line.substring(dateTimeIndex + dateTime.length).trim();
      
      let name = '';
      let city = '';
      let occupation = '';
      
      for (const validCity of VALID_CITIES) {
        const cityIndex = beforeDateTime.indexOf(validCity);
        if (cityIndex !== -1) {
          city = validCity;
          name = beforeDateTime.substring(0, cityIndex);
          occupation = beforeDateTime.substring(cityIndex + validCity.length);
          break;
        }
      }
      
      if (!city) {
        console.warn(`Could not find valid city in funeral line: ${line}`);
        i++;
        continue;
      }
      
      name = name.replace(/\*\*/g, '').trim();
      occupation = occupation.trim();
      
      let lastWords = '';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine.includes(`${name}'s last words:`) || 
            (name.includes('**') && nextLine.includes(`${name.replace(/\*\*/g, '')}'s last words:`))) {
          lastWords = nextLine.substring(nextLine.indexOf(':') + 1).trim();
          i++;
        }
      }
      
      if (cause.includes('Name Change')) {
        nameChanges++;
        deathDetails.push({
          name,
          city,
          occupation,
          dateTime,
          cause: 'Name Change',
          lastWords
        });
      } else {
        if (updatedPlayers[name]) {
          const player = updatedPlayers[name];
          player.isDead = true;
          player.deathDate = new Date(dateTime).toISOString();
          player.causeOfDeath = cause;
          player.lastWords = lastWords;
          player.isCurrentlyHD = false;
          
          const occupationLower = (occupation || '').toLowerCase().trim();
          const wasHDAtDeath = (occupationLower.includes('hospital') && occupationLower.includes('director')) || 
                              (occupationLower.includes('combat') && occupationLower.includes('medic'));
          if (wasHDAtDeath) {
            player.wasHD = true;
          }
          
          if (player.careerHistory && player.careerHistory.length > 0) {
            const currentCareer = player.careerHistory.find(c => c.isCurrent);
            if (currentCareer) {
              currentCareer.endDate = player.deathDate;
              currentCareer.isCurrent = false;
            }
          }
          
          processedDeaths++;
          deathDetails.push({
            name,
            city,
            occupation,
            dateTime,
            cause,
            lastWords,
            found: true
          });
        } else {
          notFoundCount++;
          deathDetails.push({
            name,
            city,
            occupation,
            dateTime,
            cause,
            lastWords,
            found: false
          });
        }
      }
      
      i++;
    }
    
    saveToFirebase('players', updatedPlayers);
    setFuneralInput('');
    
    setDeathReport({
      died: deathDetails.filter(d => d.found && d.cause !== 'Name Change').map(d => d.name),
      newPlayers: [],
      funeralDetails: deathDetails
    });
    setShowDeathReport(true);
    
    const summary = `Funeral parsing complete!\nProcessed deaths: ${processedDeaths}\nNot found: ${notFoundCount}\nName changes: ${nameChanges}`;
    showNotification(summary, 'success');
  };

  const recalculateCMStatus = () => {
    const updatedPlayers = { ...players };
    let updateCount = 0;
    
    Object.entries(updatedPlayers).forEach(([name, player]) => {
      const wasHDBefore = player.wasHD;
      
      const currentOccupationLower = (player.currentOccupation || '').toLowerCase().trim();
      const isCurrentlyHD = (currentOccupationLower.includes('hospital') && currentOccupationLower.includes('director')) || 
                           (currentOccupationLower.includes('combat') && currentOccupationLower.includes('medic'));
      
      const hasBeenHD = player.careerHistory && player.careerHistory.some(career => {
        const careerLower = (career.occupation || '').toLowerCase().trim();
        return (careerLower.includes('hospital') && careerLower.includes('director')) || 
               (careerLower.includes('combat') && careerLower.includes('medic'));
      });
      
      player.wasHD = isCurrentlyHD || hasBeenHD;
      
      if (player.wasHD !== wasHDBefore) {
        updateCount++;
      }
    });
    
    saveToFirebase('players', updatedPlayers);
    showNotification(`Recalculated CM status. Updated ${updateCount} players.`, 'success');
  };

  const deletePlayer = (playerName) => {
    const updatedPlayers = { ...players };
    delete updatedPlayers[playerName];
    saveToFirebase('players', updatedPlayers);
    showNotification(`Deleted ${playerName}`, 'success');
  };

  const removeDeadPlayers = () => {
    const updatedPlayers = { ...players };
    let removedCount = 0;
    
    Object.entries(players).forEach(([name, player]) => {
      if (player.isDead) {
        delete updatedPlayers[name];
        removedCount++;
      }
    });
    
    saveToFirebase('players', updatedPlayers);
    showNotification(`Permanently removed ${removedCount} dead players`, 'success');
  };

  const togglePlayerStatus = (playerName, statusField) => {
    const updatedPlayers = {
      ...players,
      [playerName]: {
        ...players[playerName],
        [statusField]: !players[playerName][statusField]
      }
    };
    saveToFirebase('players', updatedPlayers);
  };

  const bulkToggleStatus = (statusField) => {
    const updatedPlayers = { ...players };
    selectedPlayers.forEach(playerName => {
      if (updatedPlayers[playerName]) {
        updatedPlayers[playerName][statusField] = !updatedPlayers[playerName][statusField];
      }
    });
    saveToFirebase('players', updatedPlayers);
    setSelectedPlayers(new Set());
    showNotification(`Updated ${selectedPlayers.size} players`, 'success');
  };

  const updatePlayerNotes = (playerName, notes) => {
    const updatedPlayers = {
      ...players,
      [playerName]: {
        ...players[playerName],
        notes: notes
      }
    };
    saveToFirebase('players', updatedPlayers);
  };

  const updatePlayerCity = (playerName, city) => {
    const updatedPlayers = {
      ...players,
      [playerName]: {
        ...players[playerName],
        currentCity: city
      }
    };
    saveToFirebase('players', updatedPlayers);
  };

  const updatePlayerCombatStats = (playerName, field, value) => {
    const updatedPlayers = {
      ...players,
      [playerName]: {
        ...players[playerName],
        [field]: value
      }
    };
    saveToFirebase('players', updatedPlayers);
  };

  const handleSelectPlayer = (playerName) => {
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(playerName)) {
      newSelected.delete(playerName);
    } else {
      newSelected.add(playerName);
    }
    setSelectedPlayers(newSelected);
  };

  const handleSelectAll = () => {
    const filtered = getFilteredPlayers();
    if (selectedPlayers.size === filtered.length) {
      setSelectedPlayers(new Set());
    } else {
      setSelectedPlayers(new Set(filtered.map(([name]) => name)));
    }
  };

  const getFilteredPlayers = () => {
    return Object.entries(players).filter(([name, player]) => {
      if (filterStatus !== 'dead' && player.isDead) {
        return false;
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!name.toLowerCase().includes(query) &&
            !player.currentCity.toLowerCase().includes(query) &&
            !player.currentOccupation.toLowerCase().includes(query)) {
          return false;
        }
      }

      if (filterCity && player.currentCity !== filterCity) {
        return false;
      }

      if (filterStatus) {
        if (filterStatus.startsWith('career:')) {
          const career = filterStatus.substring(7);
          const careerMap = {
            'banking': ['bank', 'banker'],
            'funeral': ['funeral', 'mortician', 'undertaker'],
            'hospital': ['hospital', 'doctor', 'nurse', 'surgeon', 'medic'],
            'engineering': ['engineer'],
            'fire': ['fire', 'firefighter'],
            'customs': ['customs'],
            'police': ['police', 'officer', 'detective', 'cop'],
            'law': ['law', 'lawyer', 'attorney', 'judge'],
            'mayor': ['mayor'],
            'crime': ['gangster', 'criminal', 'mobster', 'mafia']
          };
          
          const keywords = careerMap[career] || [];
          const occupation = player.currentOccupation.toLowerCase();
          return keywords.some(keyword => occupation.includes(keyword));
        }
        
        switch (filterStatus) {
          case 'new': return player.isNew;
          case 'ops': return player.isOps;
          case 'cm': return player.wasHD;
          case 'friendly': return player.isFriendly;
          case 'dead': return player.isDead;
          default: return true;
        }
      }

      return true;
    });
  };

  const sortedPlayers = useMemo(() => {
    const filtered = getFilteredPlayers();
    
    return filtered.sort(([nameA, playerA], [nameB, playerB]) => {
      let compareValue = 0;
      
      switch (sortField) {
        case 'name':
          compareValue = nameA.localeCompare(nameB);
          break;
        case 'city':
          compareValue = playerA.currentCity.localeCompare(playerB.currentCity);
          break;
        case 'occupation':
          compareValue = playerA.currentOccupation.localeCompare(playerB.currentOccupation);
          break;
        case 'rank':
          compareValue = playerA.currentRank.localeCompare(playerB.currentRank);
          break;
        case 'whacks':
          compareValue = playerA.whacksSurvived - playerB.whacksSurvived;
          break;
        case 'mhs':
          compareValue = playerA.mhsSurvived - playerB.mhsSurvived;
          break;
        default:
          compareValue = 0;
      }
      
      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
  }, [players, searchQuery, filterCity, filterStatus, sortField, sortDirection]);

  const cities = useMemo(() => {
    const cityMap = {};
    const VALID_CITIES = ['Beirut', 'Chicago', 'Auckland'];
    
    Object.values(players).forEach(player => {
      if (!player.isDead && VALID_CITIES.includes(player.currentCity)) {
        if (!cityMap[player.currentCity]) {
          cityMap[player.currentCity] = { total: 0, ops: 0, cm: 0 };
        }
        cityMap[player.currentCity].total++;
        if (player.isOps) cityMap[player.currentCity].ops++;
        if (player.wasHD) cityMap[player.currentCity].cm++;
      }
    });
    return cityMap;
  }, [players]);

  const stats = useMemo(() => {
    const values = Object.values(players);
    const alive = values.filter(p => !p.isDead);
    return {
      total: alive.length,
      new: alive.filter(p => p.isNew).length,
      ops: alive.filter(p => p.isOps).length,
      cm: alive.filter(p => p.wasHD).length,
      friendly: alive.filter(p => p.isFriendly).length,
      totalMhs: alive.reduce((sum, p) => sum + (p.mhsSurvived || 0), 0),
      dead: values.filter(p => p.isDead).length
    };
  }, [players]);

  const exportToCSV = () => {
    const headers = ['Name', 'Current_Occupation', 'Current_Rank', 'Current_City', 'First_Seen', 'Last_Updated', 'Is_New', 'Notes', 'Is_Ops', 'Was_HD', 'Is_Currently_HD', 'Is_Friendly', 'Whacks_Survived', 'MHS_Survived', 'Is_Dead', 'Death_Date', 'Cause_Of_Death', 'Last_Words', 'Career_History'];
    
    const rows = Object.entries(players).map(([name, player]) => {
      const careerHistoryStr = (player.careerHistory || []).map(h => 
        `${h.occupation}|${h.rank}|${h.city}|${h.startDate}|${h.endDate || 'current'}`
      ).join(';');
      
      return [
        name,
        player.currentOccupation,
        player.currentRank,
        player.currentCity,
        player.firstSeen,
        player.lastUpdated,
        player.isNew ? 'Yes' : 'No',
        player.notes,
        player.isOps ? 'Yes' : 'No',
        player.wasHD ? 'Yes' : 'No',
        player.isCurrentlyHD ? 'Yes' : 'No',
        player.isFriendly ? 'Yes' : 'No',
        player.whacksSurvived || 0,
        player.mhsSurvived || 0,
        player.isDead ? 'Yes' : 'No',
        player.deathDate || '',
        player.causeOfDeath || '',
        player.lastWords || '',
        careerHistoryStr
      ];
    });

    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mafia_matrix_${currentGame}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully', 'success');
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setParseInput(text);
      showNotification('Pasted from clipboard', 'success');
    } catch (err) {
      showNotification('Failed to read clipboard', 'error');
    }
  };

  const handlePasteSurvivorData = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSurvivorInput(text);
      showNotification('Pasted survivor data from clipboard', 'success');
    } catch (err) {
      showNotification('Failed to read clipboard', 'error');
    }
  };

  const handlePasteFuneralData = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setFuneralInput(text);
      showNotification('Pasted funeral data from clipboard', 'success');
    } catch (err) {
      showNotification('Failed to read clipboard', 'error');
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const checkForRemakes = () => {
    const deadPlayers = Object.entries(players).filter(([_, p]) => p.isDead);
    const newPlayers = Object.entries(players).filter(([_, p]) => p.isNew && !p.isDead);
    
    const possibleRemakes = [];
    
    deadPlayers.forEach(([deadName, deadPlayer]) => {
      newPlayers.forEach(([newName, newPlayer]) => {
        if (deadPlayer.currentCity === newPlayer.currentCity) {
          const nameSimilarity = calculateNameSimilarity(deadName, newName);
          if (nameSimilarity > 0.5) {
            possibleRemakes.push({
              dead: deadName,
              new: newName,
              similarity: nameSimilarity,
              city: deadPlayer.currentCity
            });
          }
        }
      });
    });
    
    return possibleRemakes.sort((a, b) => b.similarity - a.similarity);
  };

  const calculateNameSimilarity = (name1, name2) => {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();
    
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;
    if (n2.match(new RegExp(`^${n1}\\d+$`)) || n1.match(new RegExp(`^${n2}\\d+$`))) return 0.9;
    
    let matches = 0;
    const minLen = Math.min(n1.length, n2.length);
    for (let i = 0; i < minLen; i++) {
      if (n1[i] === n2[i]) matches++;
    }
    
    return matches / Math.max(n1.length, n2.length);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Current';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  const calculateDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    
    if (days < 1) return 'Less than a day';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years`;
  };

  // Game Menu UI
  if (showGameMenu && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-xl">
          <h1 className="text-3xl font-bold mb-2 text-center flex items-center justify-center gap-2">
            <Icon icon="Skull" className="w-8 h-8 text-red-500" />
            MAFIA MATRIX
            <Icon icon="Skull" className="w-8 h-8 text-red-500" />
          </h1>
          <p className="text-gray-400 text-center mb-8">Death Detective System</p>
          
          <div className="space-y-4">
            <button
              onClick={createNewGame}
              className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Icon icon="Plus" className="w-5 h-5" />
              Create New Game
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">OR</span>
              </div>
            </div>
            
            <div>
              <input
                type="text"
                placeholder="Enter Game Code"
                value={joinGameCode}
                onChange={(e) => setJoinGameCode(e.target.value.toUpperCase())}
                className="w-full p-3 bg-gray-700 rounded-lg text-center text-xl font-mono tracking-wider"
                maxLength="6"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && joinGameCode.length >= 4) {
                    joinGame(joinGameCode);
                  }
                }}
              />
              <button
                onClick={() => joinGame(joinGameCode)}
                disabled={joinGameCode.length < 4}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                Join Game
              </button>
            </div>
          </div>
          
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Share the game code with others to collaborate in real-time</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Icon icon="Loader2" className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-xl">Loading game data...</p>
        </div>
      </div>
    );
  }

  // Main App UI
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      {/* Game Status Bar */}
      <div className="fixed top-4 left-4 bg-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-4 z-50">
        <div>
          <span className="text-sm text-gray-400">Game Code:</span>
          <span className="ml-2 font-bold text-green-400 font-mono text-lg">{currentGame}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-400">{isConnected ? 'Connected' : 'Offline'}</span>
        </div>
        <button
          onClick={() => {
            if (confirm('Leave this game? You can rejoin with the same code.')) {
              leaveGame();
            }
          }}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Leave
        </button>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-6 flex items-center justify-center gap-2">
            <Icon icon="Skull" className="w-8 h-8 text-red-500" />
            MAFIA MATRIX DEATH DETECTIVE SYSTEM
            <Icon icon="Skull" className="w-8 h-8 text-red-500" />
          </h1>
          
          {/* Primary Stats */}
          <div className="flex justify-center gap-8 mb-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-400">{stats.total}</div>
              <div className="text-sm text-gray-400">Players Alive</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-red-400">{stats.dead}</div>
              <div className="text-sm text-gray-400">Players Dead</div>
            </div>
            {stats.new > 0 && (
              <div className="text-center">
                <div className="text-4xl font-bold text-yellow-400">{stats.new}</div>
                <div className="text-sm text-gray-400">New This Scan</div>
              </div>
            )}
          </div>
          
          {/* City Breakdown */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-sm text-gray-400 text-center mb-3">City Distribution</h3>
            <div className="flex justify-center gap-6 flex-wrap">
              {Object.entries(cities).sort(([,a], [,b]) => b.total - a.total).map(([city, data]) => (
                <div key={city} className="text-center">
                  <div className="text-xl font-bold">{data.total}</div>
                  <div className="text-xs text-gray-400">{city}</div>
                  {(data.ops > 0 || data.cm > 0) && (
                    <div className="text-xs mt-1">
                      {data.ops > 0 && <span className="text-red-400 mr-2">⚔️{data.ops}</span>}
                      {data.cm > 0 && <span className="text-blue-400">✓{data.cm}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`fixed top-20 right-4 p-4 rounded-lg shadow-lg transition-all z-50 ${
            notification.type === 'success' ? 'bg-green-600' : 
            notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
          }`}>
            <div className="flex items-center gap-2">
              <Icon icon={notification.type === 'success' ? 'CheckCircle' : 'AlertCircle'} />
              <pre className="whitespace-pre-wrap">{notification.message}</pre>
            </div>
          </div>
        )}

        {/* Death Report Modal */}
        {showDeathReport && (deathReport.died.length > 0 || deathReport.newPlayers.length > 0 || deathReport.funeralDetails) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40" onClick={() => setShowDeathReport(false)}>
            <div className="bg-gray-800 rounded-lg p-6 max-w-3xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold mb-4 text-center">
                {deathReport.funeralDetails ? '⚰️ FUNERAL REPORT ⚰️' : '💀 DEATH REPORT 💀'}
              </h2>
              
              {/* Funeral Details */}
              {deathReport.funeralDetails && (
                <div className="mb-6">
                  <div className="space-y-3">
                    {deathReport.funeralDetails.map((death, idx) => (
                      <div key={idx} className={`p-3 rounded ${
                        death.cause === 'Name Change' ? 'bg-yellow-900' : 
                        death.found ? 'bg-gray-700' : 'bg-red-900'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {death.cause === 'Name Change' ? (
                              <span className="text-yellow-400">🔄</span>
                            ) : death.cause === 'Murdered' ? (
                              <span className="text-red-400">🗡️</span>
                            ) : (
                              <span className="text-gray-400">💊</span>
                            )}
                            <span className={death.found ? 'font-bold' : 'font-bold text-red-300'}>
                              {death.name} {!death.found && '(NOT FOUND)'}
                            </span>
                            <span className="text-sm text-gray-400">
                              - {death.occupation} in {death.city}
                            </span>
                          </div>
                          <span className="text-sm text-gray-400">
                            {death.cause}
                          </span>
                        </div>
                        {death.lastWords && (
                          <p className="mt-2 text-sm italic text-gray-300 pl-8">
                            Last words: "{death.lastWords}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Regular Death Report */}
              {!deathReport.funeralDetails && (
                <>
                  {deathReport.died.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-xl font-bold mb-2 text-red-400">Players Who Died ({deathReport.died.length}):</h3>
                      <div className="bg-gray-700 rounded p-4">
                        {deathReport.died.map(name => (
                          <div key={name} className="flex items-center gap-2 mb-1">
                            <Icon icon="Skull" className="w-4 h-4 text-red-500" />
                            <span>{name}</span>
                            {players[name] && (
                              <span className="text-gray-400 text-sm">
                                - was {players[name].currentOccupation} in {players[name].currentCity}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {deathReport.newPlayers.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-xl font-bold mb-2 text-green-400">New Players ({deathReport.newPlayers.length}):</h3>
                      <div className="bg-gray-700 rounded p-4">
                        {deathReport.newPlayers.map(name => (
                          <div key={name} className="flex items-center gap-2 mb-1">
                            <Icon icon="UserPlus" className="w-4 h-4 text-green-500" />
                            <span>{name}</span>
                            {players[name] && (
                              <span className="text-gray-400 text-sm">
                                - {players[name].currentOccupation} in {players[name].currentCity}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              
              <button
                onClick={() => setShowDeathReport(false)}
                className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Close Report
              </button>
            </div>
          </div>
        )}

        {/* Player Profile Modal */}
        {showPlayerProfile && selectedPlayerProfile && players[selectedPlayerProfile] && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40" onClick={() => setShowPlayerProfile(false)}>
            <div className="bg-gray-800 rounded-lg p-6 max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Icon icon="User" className="w-6 h-6" />
                  Player Profile: {selectedPlayerProfile}
                </h2>
                <button
                  onClick={() => setShowPlayerProfile(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              {(() => {
                const player = players[selectedPlayerProfile];
                const careerHistory = player.careerHistory || [];
                
                return (
                  <>
                    {/* Current Status */}
                    <div className="bg-gray-700 rounded p-4 mb-4">
                      <h3 className="font-bold mb-2 flex items-center gap-2">
                        <Icon icon="TrendingUp" className="w-5 h-5" />
                        Current Status
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p><span className="text-gray-400">Occupation:</span> {player.currentOccupation}</p>
                          <p><span className="text-gray-400">Rank:</span> {player.currentRank}</p>
                          <p className="flex items-center gap-2">
                            <span className="text-gray-400">City:</span> 
                            <select
                              value={player.currentCity}
                              onChange={(e) => updatePlayerCity(selectedPlayerProfile, e.target.value)}
                              className="bg-gray-600 rounded px-2 py-1 text-sm"
                            >
                              <option value="Beirut">Beirut</option>
                              <option value="Chicago">Chicago</option>
                              <option value="Auckland">Auckland</option>
                            </select>
                          </p>
                          <p><span className="text-gray-400">Status:</span> {player.isDead ? '💀 Dead' : '✓ Alive'}</p>
                        </div>
                        <div>
                          <p><span className="text-gray-400">First Seen:</span> {formatDate(player.firstSeen)}</p>
                          <p><span className="text-gray-400">Last Updated:</span> {formatDate(player.lastUpdated)}</p>
                          {player.deathDate && (
                            <>
                              <p><span className="text-gray-400">Death Date:</span> {formatDate(player.deathDate)}</p>
                              {player.causeOfDeath && (
                                <p><span className="text-gray-400">Cause:</span> {player.causeOfDeath}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Combat Stats */}
                      <div className="mt-4 pt-4 border-t border-gray-600">
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Icon icon="Target" className="w-4 h-4" />
                          Combat Statistics
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-600 rounded p-2">
                            <p className="text-2xl font-bold">{player.whacksSurvived || 0}</p>
                            <p className="text-sm text-gray-400">Whacks Survived</p>
                            <div className="flex gap-2 mt-2 justify-center">
                              <button
                                onClick={() => updatePlayerCombatStats(selectedPlayerProfile, 'whacksSurvived', Math.max(0, (player.whacksSurvived || 0) - 1))}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
                                title="Decrease whacks survived"
                              >
                                −
                              </button>
                              <button
                                onClick={() => updatePlayerCombatStats(selectedPlayerProfile, 'whacksSurvived', (player.whacksSurvived || 0) + 1)}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-bold"
                                title="Increase whacks survived"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="bg-gray-600 rounded p-2">
                            <p className="text-2xl font-bold">{player.mhsSurvived || 0}</p>
                            <p className="text-sm text-gray-400">MHS Survived</p>
                            <div className="flex gap-2 mt-2 justify-center">
                              <button
                                onClick={() => updatePlayerCombatStats(selectedPlayerProfile, 'mhsSurvived', Math.max(0, (player.mhsSurvived || 0) - 1))}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
                                title="Decrease MHS survived"
                              >
                                −
                              </button>
                              <button
                                onClick={() => updatePlayerCombatStats(selectedPlayerProfile, 'mhsSurvived', (player.mhsSurvived || 0) + 1)}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-bold"
                                title="Increase MHS survived"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Status Badges */}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {player.isNew && <span className="px-2 py-1 bg-green-700 rounded text-sm">🆕 New</span>}
                        {player.isOps && <span className="px-2 py-1 bg-red-700 rounded text-sm">⚔️ Opposition</span>}
                        {player.wasHD && <span className="px-2 py-1 bg-blue-700 rounded text-sm">✓ Combat Medic (Ever HD)</span>}
                        {player.isFriendly && <span className="px-2 py-1 bg-green-600 rounded text-sm">😊 Friendly</span>}
                      </div>
                    </div>
                    
                    {/* Last Words (if dead) */}
                    {player.isDead && player.lastWords && (
                      <div className="bg-red-900 rounded p-4 mb-4">
                        <h3 className="font-bold mb-2 flex items-center gap-2">
                          <span className="text-xl">⚰️</span>
                          Last Words
                        </h3>
                        <p className="italic text-gray-300">"{player.lastWords}"</p>
                      </div>
                    )}
                    
                    {/* Career History */}
                    <div className="bg-gray-700 rounded p-4 mb-4">
                      <h3 className="font-bold mb-3 flex items-center gap-2">
                        <Icon icon="History" className="w-5 h-5" />
                        Career History ({careerHistory.length} positions)
                      </h3>
                      
                      <div className="space-y-3">
                        {careerHistory.slice().reverse().map((career, idx) => (
                          <div key={idx} className={`border-l-4 pl-4 ${career.isCurrent ? 'border-green-500' : 'border-gray-500'}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold">
                                  {career.occupation} - {career.rank}
                                </p>
                                <p className="text-gray-400">📍 {career.city}</p>
                              </div>
                              <div className="text-right text-sm">
                                <p className="text-gray-400">
                                  <Icon icon="Calendar" className="inline w-4 h-4 mr-1" />
                                  {formatDate(career.startDate)} - {formatDate(career.endDate)}
                                </p>
                                <p className="text-gray-500">
                                  Duration: {calculateDuration(career.startDate, career.endDate)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Notes Section */}
                    <div className="bg-gray-700 rounded p-4">
                      <h3 className="font-bold mb-2">Notes</h3>
                      <textarea
                        value={player.notes || ''}
                        onChange={(e) => updatePlayerNotes(selectedPlayerProfile, e.target.value)}
                        className="w-full h-20 bg-gray-600 rounded p-2 text-sm"
                        placeholder="Add notes about this player..."
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-gray-800 rounded-lg shadow-xl">
          <div className="flex flex-wrap border-b border-gray-700">
            <button
              onClick={() => setActiveTab('parse')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'parse' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              📥 Parse Data
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'manage' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              👥 Manage Players
            </button>
            <button
              onClick={() => setActiveTab('survivors')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'survivors' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              💥 Survivor Data
            </button>
            <button
              onClick={() => setActiveTab('funeral')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'funeral' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              ⚰️ Funeral Parlor
            </button>
            <button
              onClick={() => setActiveTab('death')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'death' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              💀 Death Detective
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'stats' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              📊 Statistics
            </button>
          </div>

          <div className="p-6">
            {/* Parse Tab */}
            {activeTab === 'parse' && (
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-2">Parse Player Data</h2>
                  <div className="bg-yellow-700 text-yellow-100 p-3 rounded mb-4">
                    <p className="font-bold">🔍 Death Detective Active!</p>
                    <p>• Players missing from this scan will be marked as DEAD</p>
                    <p>• Anyone who has EVER been Hospital Director → Combat Medic</p>
                    <p>• New players will be flagged</p>
                    <p>• Full career history tracked for each player</p>
                    <p className="mt-2 font-bold">⚠️ VALID CITIES: Beirut, Chicago, Auckland</p>
                    <p className="text-sm mt-1">💡 Use "Fix CM Status" button in Manage tab if CMs aren't marked correctly</p>
                  </div>
                  <p className="text-gray-400 mb-4">Paste your player data below in the format: NAME [TAB/SPACES] OCCUPATION [TAB/SPACES] RANK [TAB/SPACES] CITY</p>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={handlePasteFromClipboard}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                    >
                      <Icon icon="Copy" className="w-4 h-4" />
                      Paste from Clipboard
                    </button>
                    <button
                      onClick={() => setParseInput('')}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to clear ALL player data? This cannot be undone!')) {
                          saveToFirebase('players', {});
                          saveToFirebase('lastScan', []);
                          setLastScanPlayers(new Set());
                          showNotification('All data cleared', 'success');
                        }
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded flex items-center gap-2"
                    >
                      <Icon icon="Trash2" className="w-4 h-4" />
                      Clear All Data
                    </button>
                  </div>
                  <textarea
                    value={parseInput}
                    onChange={(e) => setParseInput(e.target.value)}
                    className="w-full h-64 bg-gray-700 rounded p-3 font-mono text-sm"
                    placeholder="NAME    OCCUPATION    RANK    CITY&#10;John    Police Officer    Detective    Chicago&#10;Jane    Hospital Director    Chief    Auckland"
                  />
                  <button
                    onClick={() => parsePlayerData(parseInput)}
                    disabled={!parseInput.trim()}
                    className="mt-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                  >
                    Parse & Detect Deaths
                  </button>
                </div>
                
                {/* Manual Add Player */}
                <div className="mt-8 p-4 bg-gray-700 rounded">
                  <h3 className="text-lg font-bold mb-3">Manually Add Player</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="text"
                      placeholder="Player Name"
                      id="manual-name"
                      className="px-3 py-2 bg-gray-600 rounded"
                    />
                    <input
                      type="text"
                      placeholder="Occupation"
                      id="manual-occupation"
                      className="px-3 py-2 bg-gray-600 rounded"
                    />
                    <input
                      type="text"
                      placeholder="Rank"
                      id="manual-rank"
                      className="px-3 py-2 bg-gray-600 rounded"
                    />
                    <select
                      id="manual-city"
                      className="px-3 py-2 bg-gray-600 rounded"
                    >
                      <option value="">Select City</option>
                      <option value="Beirut">Beirut</option>
                      <option value="Chicago">Chicago</option>
                      <option value="Auckland">Auckland</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      const name = document.getElementById('manual-name').value.trim();
                      const occupation = document.getElementById('manual-occupation').value.trim();
                      const rank = document.getElementById('manual-rank').value.trim();
                      const city = document.getElementById('manual-city').value;
                      
                      if (name && occupation && rank && city) {
                        const updatedPlayers = { ...players };
                        const occupationLower = occupation.toLowerCase().trim();
                        const isCurrentlyHD = (occupationLower.includes('hospital') && occupationLower.includes('director')) || 
                                            (occupationLower.includes('combat') && occupationLower.includes('medic'));
                        
                        updatedPlayers[name] = {
                          currentOccupation: occupation,
                          currentRank: rank,
                          currentCity: city,
                          firstSeen: new Date().toISOString(),
                          lastUpdated: new Date().toISOString(),
                          isNew: true,
                          notes: '',
                          isOps: false,
                          wasHD: isCurrentlyHD,
                          isCurrentlyHD: isCurrentlyHD,
                          isFriendly: false,
                          whacksSurvived: 0,
                          mhsSurvived: 0,
                          isDead: false,
                          careerHistory: [{
                            occupation: occupation,
                            rank: rank,
                            city: city,
                            startDate: new Date().toISOString(),
                            endDate: null,
                            isCurrent: true
                          }]
                        };
                        
                        saveToFirebase('players', updatedPlayers);
                        
                        // Clear the inputs
                        document.getElementById('manual-name').value = '';
                        document.getElementById('manual-occupation').value = '';
                        document.getElementById('manual-rank').value = '';
                        document.getElementById('manual-city').value = '';
                        
                        showNotification(`Added ${name}`, 'success');
                      } else {
                        showNotification('Please fill in all fields', 'error');
                      }
                    }}
                    className="mt-3 px-6 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2"
                  >
                    <Icon icon="UserPlus" className="w-4 h-4" />
                    Add Player
                  </button>
                </div>
              </div>
            )}

            {/* Manage Tab */}
            {activeTab === 'manage' && (
              <div>
                {/* Quick Stats Summary */}
                <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>Total Alive: <strong className="text-green-400">{stats.total}</strong></span>
                    <span>Opposition: <strong className="text-red-400">{stats.ops}</strong></span>
                    <span>Combat Medics (Ever HD): <strong className="text-blue-400">{stats.cm}</strong></span>
                    <span>Friendly: <strong className="text-green-400">{stats.friendly}</strong></span>
                    <span>New Players: <strong className="text-yellow-400">{stats.new}</strong></span>
                  </div>
                </div>
                
                <div className="mb-4 space-y-4">
                  {/* Search and Filters */}
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Search players..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 rounded"
                      />
                    </div>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="px-4 py-2 bg-gray-700 rounded"
                    >
                      <option value="">All Cities</option>
                      <option value="Beirut">Beirut</option>
                      <option value="Chicago">Chicago</option>
                      <option value="Auckland">Auckland</option>
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-4 py-2 bg-gray-700 rounded"
                    >
                      <option value="">All Living</option>
                      <option value="new">🆕 New</option>
                      <option value="ops">⚔️ Opposition</option>
                      <option value="cm">✓ Combat Medic (Ever HD)</option>
                      <option value="friendly">😊 Friendly</option>
                      <option value="dead">💀 Dead</option>
                      <option value="" disabled>── By Career ──</option>
                      <option value="career:banking">💰 Banking</option>
                      <option value="career:funeral">⚰️ Funeral</option>
                      <option value="career:hospital">🏥 Hospital</option>
                      <option value="career:engineering">🔧 Engineering</option>
                      <option value="career:fire">🚒 Fire Department</option>
                      <option value="career:customs">📦 Customs</option>
                      <option value="career:police">👮 Police</option>
                      <option value="career:law">⚖️ Law</option>
                      <option value="career:mayor">🏛️ Mayor</option>
                      <option value="career:crime">💀 Crime</option>
                    </select>
                    <button
                      onClick={exportToCSV}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2"
                    >
                      <Icon icon="Download" className="w-4 h-4" />
                      Export CSV
                    </button>
                    <button
                      onClick={recalculateCMStatus}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                      title="Recalculate Combat Medic status for all players"
                    >
                      <Icon icon="Heart" className="w-4 h-4" />
                      Fix CM Status
                    </button>
                  </div>

                  {/* Bulk Actions */}
                  {selectedPlayers.size > 0 && (
                    <div className="bg-gray-700 rounded p-3 flex flex-wrap gap-2">
                      <span className="mr-4">{selectedPlayers.size} selected</span>
                      <button
                        onClick={() => bulkToggleStatus('wasHD')}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                      >
                        Toggle CM
                      </button>
                      <button
                        onClick={() => bulkToggleStatus('isOps')}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                      >
                        Toggle Ops
                      </button>
                      <button
                        onClick={() => bulkToggleStatus('isFriendly')}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                      >
                        Toggle Friendly
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${selectedPlayers.size} players?`)) {
                            const updatedPlayers = { ...players };
                            selectedPlayers.forEach(name => {
                              delete updatedPlayers[name];
                            });
                            saveToFirebase('players', updatedPlayers);
                            setSelectedPlayers(new Set());
                            showNotification(`Deleted ${selectedPlayers.size} players`, 'success');
                          }
                        }}
                        className="px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-sm flex items-center gap-1"
                      >
                        <Icon icon="Trash2" className="w-3 h-3" />
                        Delete Selected
                      </button>
                    </div>
                  )}
                </div>

                {/* Player Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-2">
                          <input
                            type="checkbox"
                            checked={selectedPlayers.size === sortedPlayers.length && sortedPlayers.length > 0}
                            onChange={handleSelectAll}
                            className="rounded"
                          />
                        </th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('name')}
                        >
                          Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('city')}
                        >
                          City {sortField === 'city' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('occupation')}
                        >
                          Occupation {sortField === 'occupation' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('rank')}
                        >
                          Rank {sortField === 'rank' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="text-left p-2">Notes</th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('whacks')}
                        >
                          💥 {sortField === 'whacks' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="text-left p-2 cursor-pointer hover:text-blue-400"
                          onClick={() => handleSort('mhs')}
                        >
                          🎯 {sortField === 'mhs' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map(([name, player]) => (
                        <tr key={name} className={`border-b border-gray-700 hover:bg-gray-700 ${player.isDead ? 'opacity-50' : ''}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selectedPlayers.has(name)}
                              onChange={() => handleSelectPlayer(name)}
                              className="rounded"
                            />
                          </td>
                          <td className="p-2 font-medium">
                            <span
                              onClick={() => openPlayerProfile(name)}
                              className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                            >
                              {name}
                            </span>
                            {player.isDead && <Icon icon="Skull" className="inline w-4 h-4 ml-1 text-red-500" />}
                          </td>
                          <td className="p-2">{player.currentCity}</td>
                          <td className="p-2">
                            {player.currentOccupation}
                          </td>
                          <td className="p-2">{player.currentRank}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={player.notes || ''}
                              onChange={(e) => updatePlayerNotes(name, e.target.value)}
                              className="w-full bg-gray-600 rounded px-2 py-1 text-sm"
                              placeholder="Add note..."
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-2 text-center">{player.whacksSurvived || 0}</td>
                          <td className="p-2 text-center">{player.mhsSurvived || 0}</td>
                          <td className="p-2">
                            <div className="flex gap-1 flex-wrap">
                              {player.isNew && <span className="text-green-400">🆕NEW</span>}
                              {player.isOps && <span className="text-red-400">⚔️OPS</span>}
                              {player.wasHD && <span className="text-blue-400">✓CM</span>}
                              {player.isFriendly && <span className="text-green-400">😊FRIEND</span>}
                              {player.isDead && <span className="text-gray-400">💀DEAD</span>}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => togglePlayerStatus(name, 'isOps')}
                                className={`p-1 rounded ${player.isOps ? 'bg-red-600' : 'bg-gray-600'}`}
                                title="Toggle Opposition"
                              >
                                <Icon icon="Sword" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => togglePlayerStatus(name, 'wasHD')}
                                className={`p-1 rounded ${player.wasHD ? 'bg-blue-600' : 'bg-gray-600'}`}
                                title="Toggle Combat Medic"
                              >
                                <Icon icon="Heart" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => togglePlayerStatus(name, 'isFriendly')}
                                className={`p-1 rounded ${player.isFriendly ? 'bg-green-600' : 'bg-gray-600'}`}
                                title="Toggle Friendly"
                              >
                                <Icon icon="Users" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete ${name}?`)) {
                                    deletePlayer(name);
                                  }
                                }}
                                className="p-1 rounded bg-red-700 hover:bg-red-800"
                                title="Delete Player"
                              >
                                <Icon icon="Trash2" className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {sortedPlayers.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      No players found matching your filters
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Survivor Data Tab */}
            {activeTab === 'survivors' && (
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold mb-2">Update Survivor Data</h2>
                  <div className="bg-blue-700 text-blue-100 p-3 rounded mb-4">
                    <p className="font-bold">💥 Whacks & MHS Survivor Parser</p>
                    <p>Format: <code>Name whacks [mhs] Name whacks [mhs]...</code></p>
                    <p>• First number = Whacks survived</p>
                    <p>• Second number (optional) = MHS survived</p>
                    <p className="mt-2">Example: <code>Khayra 55 Sheogorath 196 2 Loki 66</code></p>
                  </div>
                  
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={handlePasteSurvivorData}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                    >
                      <Icon icon="Copy" className="w-4 h-4" />
                      Paste from Clipboard
                    </button>
                    <button
                      onClick={() => setSurvivorInput('')}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                    >
                      Clear
                    </button>
                  </div>
                  
                  <textarea
                    value={survivorInput}
                    onChange={(e) => setSurvivorInput(e.target.value)}
                    className="w-full h-32 bg-gray-700 rounded p-3 font-mono text-sm"
                    placeholder="Khayra 55 Washed 102 MrPresident 147 Dodger 41 Sheogorath 196 2 Loki 66..."
                  />
                  
                  <button
                    onClick={() => parseSurvivorData(survivorInput)}
                    disabled={!survivorInput.trim()}
                    className="mt-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                  >
                    Update Survivor Data
                  </button>
                </div>
                
                {/* Top Survivors List */}
                <div className="mt-8">
                  <h3 className="text-lg font-bold mb-4">🏆 Top Survivors</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-700 rounded p-4">
                      <h4 className="font-bold mb-2 text-yellow-400">💥 Whacks Survived</h4>
                      {Object.entries(players)
                        .filter(([_, p]) => !p.isDead && p.whacksSurvived > 0)
                        .sort(([,a], [,b]) => b.whacksSurvived - a.whacksSurvived)
                        .slice(0, 10)
                        .map(([name, player], idx) => (
                          <div key={name} className="flex justify-between py-1">
                            <span className="flex items-center gap-2">
                              <span className="text-gray-400">{idx + 1}.</span>
                              <span
                                onClick={() => openPlayerProfile(name)}
                                className="text-blue-400 hover:text-blue-300 cursor-pointer"
                              >
                                {name}
                              </span>
                            </span>
                            <span className="font-bold">{player.whacksSurvived}</span>
                          </div>
                        ))}
                    </div>
                    
                    <div className="bg-gray-700 rounded p-4">
                      <h4 className="font-bold mb-2 text-yellow-400">🎯 MHS Survived</h4>
                      {Object.entries(players)
                        .filter(([_, p]) => !p.isDead && p.mhsSurvived > 0)
                        .sort(([,a], [,b]) => b.mhsSurvived - a.mhsSurvived)
                        .slice(0, 10)
                        .map(([name, player], idx) => (
                          <div key={name} className="flex justify-between py-1">
                            <span className="flex items-center gap-2">
                              <span className="text-gray-400">{idx + 1}.</span>
                              <span
                                onClick={() => openPlayerProfile(name)}
                                className="text-blue-400 hover:text-blue-300 cursor-pointer"
                              >
                                {name}
                              </span>
                            </span>
                            <span className="font-bold">{player.mhsSurvived}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Funeral Parlor Tab */}
            {activeTab === 'funeral' && (
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold mb-2">Parse Funeral Parlor Data</h2>
                  <div className="bg-red-900 text-red-100 p-3 rounded mb-4">
                    <p className="font-bold">⚰️ Funeral Parlor Parser</p>
                    <p>• Paste funeral data to mark players as DEAD</p>
                    <p>• Captures last words if provided</p>
                    <p>• Tracks cause of death (Murdered/Suicide)</p>
                    <p>• Handles name changes</p>
                    <p className="mt-2 text-xs">Format: NAME CITY OCCUPATION DATE TIME CAUSE</p>
                    <p className="text-xs">Optional: NAME's last words: MESSAGE</p>
                  </div>
                  
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={handlePasteFuneralData}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded flex items-center gap-2"
                    >
                      <Icon icon="Copy" className="w-4 h-4" />
                      Paste Funeral Data
                    </button>
                    <button
                      onClick={() => setFuneralInput('')}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                    >
                      Clear
                    </button>
                  </div>
                  
                  <textarea
                    value={funeralInput}
                    onChange={(e) => setFuneralInput(e.target.value)}
                    className="w-full h-64 bg-gray-700 rounded p-3 font-mono text-sm"
                    placeholder="HmRCAucklandUnemployed6/27/2025 7:11:42 AMSuicide&#10;milkdudzAucklandLawyer6/27/2025 12:22:15 AMMurdered&#10;LarbeightAucklandGangster6/26/2025 5:09:41 PMMurdered&#10;Larbeight's last words: Oh noo I am so devastated..."
                  />
                  
                  <button
                    onClick={() => parseFuneralData(funeralInput)}
                    disabled={!funeralInput.trim()}
                    className="mt-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                  >
                    Process Funeral Data
                  </button>
                </div>
                
                {/* Recent Deaths with Last Words */}
                <div className="mt-8">
                  <h3 className="text-lg font-bold mb-4">Recent Deaths with Last Words</h3>
                  <div className="space-y-3">
                    {Object.entries(players)
                      .filter(([_, p]) => p.isDead && p.lastWords)
                      .sort((a, b) => new Date(b[1].deathDate) - new Date(a[1].deathDate))
                      .slice(0, 10)
                      .map(([name, player]) => (
                        <div key={name} className="bg-gray-700 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span 
                              onClick={() => openPlayerProfile(name)}
                              className="font-bold text-blue-400 hover:text-blue-300 cursor-pointer"
                            >
                              {name}
                            </span>
                            <span className="text-sm text-gray-400">
                              {player.causeOfDeath} - {new Date(player.deathDate).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm italic text-gray-300">"{player.lastWords}"</p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Death Detective Tab */}
            {activeTab === 'death' && (
              <div>
                <h2 className="text-xl font-bold mb-4">Death Detective</h2>
                
                {/* Dead Players List */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold mb-2 text-red-400">Dead Players ({stats.dead})</h3>
                  {stats.dead > 0 ? (
                    <>
                      <div className="bg-gray-700 rounded p-4 mb-4 max-h-64 overflow-y-auto">
                        {Object.entries(players)
                          .filter(([_, p]) => p.isDead)
                          .map(([name, player]) => (
                            <div key={name} className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Icon icon="Skull" className="w-4 h-4 text-red-500" />
                                <span
                                  onClick={() => openPlayerProfile(name)}
                                  className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                                >
                                  {name}
                                </span>
                                <span className="text-gray-400 text-sm">
                                  - was {player.currentOccupation} in {player.currentCity}
                                </span>
                              </div>
                              <span className="text-gray-500 text-sm">
                                {player.deathDate && new Date(player.deathDate).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                      </div>
                      <button
                        onClick={removeDeadPlayers}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                      >
                        Permanently Remove All Dead Players
                      </button>
                    </>
                  ) : (
                    <p className="text-gray-400">No dead players detected yet.</p>
                  )}
                </div>

                {/* Possible Remakes */}
                <div>
                  <h3 className="text-lg font-bold mb-2 text-yellow-400">Possible Remakes</h3>
                  <p className="text-gray-400 mb-4">These new players might be remakes of dead players:</p>
                  {(() => {
                    const remakes = checkForRemakes();
                    return remakes.length > 0 ? (
                      <div className="space-y-2">
                        {remakes.slice(0, 10).map((match, idx) => (
                          <div key={idx} className="bg-gray-700 rounded p-3 flex items-center justify-between">
                            <div>
                              <span
                                onClick={() => openPlayerProfile(match.dead)}
                                className="text-red-400 hover:text-red-300 hover:underline cursor-pointer"
                              >
                                {match.dead}
                              </span>
                              <span className="mx-2">→</span>
                              <span
                                onClick={() => openPlayerProfile(match.new)}
                                className="text-green-400 hover:text-green-300 hover:underline cursor-pointer"
                              >
                                {match.new}
                              </span>
                              <span className="text-gray-400 ml-2">in {match.city}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                              {Math.round(match.similarity * 100)}% match
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400">No possible remakes detected.</p>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Statistics Tab */}
            {activeTab === 'stats' && (
              <div>
                <h2 className="text-xl font-bold mb-4">City Statistics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(cities).sort(([,a], [,b]) => b.total - a.total).map(([city, data]) => (
                    <div key={city} className="bg-gray-700 rounded p-4">
                      <h3 className="font-bold text-lg mb-2">{city}</h3>
                      <div className="space-y-1 text-sm">
                        <div>Total: {data.total} players</div>
                        {data.ops > 0 && <div className="text-red-400">Opposition: {data.ops}</div>}
                        {data.cm > 0 && <div className="text-blue-400">Combat Medics: {data.cm}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Render the app
ReactDOM.render(<PlayerTrackerApp />, document.getElementById('root'));
