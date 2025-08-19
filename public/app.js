// Vybe Frontend with Spotify Web Playback SDK
console.log('🎵 Vybe app initializing...');

// Global state
let currentRecommendations = [];
let currentTrackIndex = 0;
let spotifyPlayer = null;
let spotifyToken = null;
let isSpotifyReady = false;
let spotifyDeviceId = null;
let currentVybeId = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, setting up event listeners...');
    
    // Set up event listeners
    setupEventListeners();
    
    // Check for Spotify auth callback
    checkSpotifyAuth();
    
    // Initialize Spotify if SDK is ready
    if (window.Spotify) {
        console.log('🎵 Spotify SDK already loaded');
        initializeSpotifyPlayer();
    }
});

function setupEventListeners() {
    // Create Vybe button
    const createBtn = document.getElementById('create-vybe-btn');
    if (createBtn) {
        createBtn.addEventListener('click', createVybe);
    }
    
    // Spotify login button  
    const spotifyBtn = document.getElementById('spotify-login-btn');
    if (spotifyBtn) {
        spotifyBtn.addEventListener('click', connectSpotify);
    }
    
    // Player controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }
    
    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn) {
        prevBtn.addEventListener('click', previousTrack);
    }
    
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextTrack);
    }
    
    // Like/Dislike buttons
    const likeBtn = document.getElementById('like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', likeTrack);
    }
    
    const dislikeBtn = document.getElementById('dislike-btn');
    if (dislikeBtn) {
        dislikeBtn.addEventListener('click', dislikeTrack);
    }
    
    // Back to create button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => showPage('create-vybe-page'));
    }
    
    // Context character counter
    const contextInput = document.getElementById('context-input');
    if (contextInput) {
        contextInput.addEventListener('input', updateCharacterCount);
    }
}

// Spotify Authentication
function connectSpotify() {
    console.log("🔗 Connecting to Spotify...");
    fetch("/api/v1/spotify/auth-url")
        .then(r => r.json())
        .then(({ authUrl }) => {
            if (authUrl) {
                window.location.href = authUrl;
            } else {
                throw new Error("No authUrl returned");
            }
        })
        .catch(err => {
            console.error("❌ Failed to get Spotify auth URL", err);
            alert("Failed to start Spotify authentication. Please try again.");
        });
}

function checkSpotifyAuth() {
    // Check query string for authorization code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    
    // Exchange the code at the backend
    fetch('/api/v1/spotify/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    })
        .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t || `HTTP ${r.status}`); }))
        .then(({ accessToken }) => {
            if (!accessToken) throw new Error('No accessToken returned');
            spotifyToken = accessToken;
            showSpotifyConnected();
            // Initialize the player now that we have a token
            if (window.Spotify && !spotifyPlayer) {
                initializeSpotifyPlayer();
            }
            // Clean up query string
            window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(err => {
            console.error('❌ Spotify code exchange failed', err);
            alert('Failed to authenticate with Spotify. Please try again.');
        });
}

function showSpotifyConnected() {
    const authSection = document.getElementById('spotify-auth');
    const authStatus = document.getElementById('auth-status');
    const loginBtn = document.getElementById('spotify-login-btn');
    
    if (authSection && authStatus && loginBtn) {
        loginBtn.style.display = 'none';
        authStatus.classList.remove('hidden');
        authStatus.style.display = 'block';
    }
}

// Spotify Web Playback SDK Integration
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('🎵 Spotify Web Playback SDK Ready');
    initializeSpotifyPlayer();
};

function initializeSpotifyPlayer() {
    if (!spotifyToken) {
        console.log('⏳ Waiting for Spotify token...');
        return;
    }
    
    console.log('🎵 Initializing Spotify Player...');
    spotifyPlayer = new Spotify.Player({
        name: 'Vybe Music Player',
        getOAuthToken: cb => { cb(spotifyToken); },
        volume: 0.8
    });

    // Error handling
    spotifyPlayer.addListener('initialization_error', ({ message }) => {
        console.error('❌ Spotify initialization error:', message);
    });

    spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('❌ Spotify authentication error:', message);
        alert('Spotify authentication failed. This may be due to missing permissions. Please reconnect and grant all requested permissions.');
    });

    spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('❌ Spotify account error:', message);
        alert('Spotify Premium is required for playback.');
    });

    spotifyPlayer.addListener('playback_error', ({ message }) => {
        console.error('❌ Spotify playback error:', message);
    });

    // Playback status updates
    spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        
        const { paused, track_window: { current_track } } = state;
        if (current_track) {
            updatePlayerUI({
                name: current_track.name,
                artists: current_track.artists.map(a => a.name),
                album: current_track.album.name,
                image: current_track.album.images[0]?.url,
                id: current_track.id
            });
        }
        updatePlayPauseButton(!paused);
    });

    // Ready
    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('✅ Spotify player ready with Device ID', device_id);
        isSpotifyReady = true;
        spotifyDeviceId = device_id;
    });

    // Connect to the player
    spotifyPlayer.connect().then(success => {
        if (success) {
            console.log('✅ Successfully connected to Spotify');
        } else {
            console.error('❌ Failed to connect to Spotify');
        }
    });
}

// Create Vybe Function
async function createVybe() {
    const contextInput = document.getElementById('context-input');
    const createBtn = document.getElementById('create-vybe-btn');
    
    if (!contextInput || !createBtn) return;
    
    const context = contextInput.value.trim();
    if (!context) {
        alert('Please enter a context for your vybe!');
        return;
    }
    
    // Show loading state
    createBtn.disabled = true;
    createBtn.textContent = 'Creating Vybe...';
    
    try {
        const response = await fetch('/api/v1/vybes', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                context: context,
                referenceTrackIds: [] // Context-only mode - no reference tracks needed
            })
        });
        
        console.log('📡 API Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const json = await response.json();
        console.log('✅ Vybe created successfully:', json);
        
        // Unwrap API response data
        const data = json.data || json;
        
        // Store recommendations
        currentRecommendations = data.recommendations || [];
        currentVybeId = data.id;
        currentTrackIndex = 0;
        
        if (currentRecommendations.length > 0) {
            // Show player page
            showPage('player-page');
            
            // Load first track
            loadTrack(currentTrackIndex);
        } else {
            alert('No recommendations found. Try a different context!');
        }
        
    } catch (error) {
        console.error('❌ Error creating vybe:', error);
        alert('Failed to create vybe. Please try again.');
    } finally {
        // Reset button
        createBtn.disabled = false;
        createBtn.textContent = 'Create Vybe';
    }
}

// Player Functions
function loadTrack(index) {
    if (!currentRecommendations || index >= currentRecommendations.length) return;
    
    const track = currentRecommendations[index];
    updatePlayerUI(track);
    
    // Try to play if Spotify is ready
    if (isSpotifyReady && track.spotifyUri) {
        playSpotifyTrack(track.spotifyUri);
    } else {
        updateAudioStatus('🎵 Track loaded (Spotify Premium required for playback)');
    }
}

async function playSpotifyTrack(uri) {
    try {
        if (!spotifyToken) {
            throw new Error('Missing Spotify access token');
        }
        if (!spotifyDeviceId) {
            throw new Error('Missing Spotify device ID');
        }
        
        const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uris: [uri]
            })
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Spotify API error: ${res.status} - ${errorText}`);
        }
        
        updateAudioStatus('🎵 Playing via Spotify');
        updatePlayPauseButton(true);
        
    } catch (error) {
        console.error('❌ Failed to play Spotify track:', error);
        updateAudioStatus(`❌ Playback failed: ${error.message}`);
    }
}

function updatePlayerUI(track) {
    // Update track info
    const titleElement = document.getElementById('track-title');
    const artistElement = document.getElementById('track-artist');
    const albumElement = document.getElementById('track-album');
    const imageElement = document.getElementById('album-cover');
    
    if (titleElement) titleElement.textContent = track.name || 'Unknown Track';
    
    // Handle artists (can be array of objects or strings)
    const artistNames = Array.isArray(track.artists) 
        ? track.artists.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
        : [];
    if (artistElement) artistElement.textContent = artistNames.join(', ') || 'Unknown Artist';
    
    // Handle album (can be object or string)
    const albumName = typeof track.album === 'string' ? track.album : (track.album?.name ?? '');
    if (albumElement) albumElement.textContent = albumName || 'Unknown Album';
    
    // Update album cover
    if (imageElement && track.image) {
        imageElement.src = track.image;
        imageElement.alt = `${track.name} album cover`;
    }
    
    // Update progress bar (placeholder)
    const progressBar = document.getElementById('progress');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
}

function updatePlayPauseButton(isPlaying) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
    }
}

function updateAudioStatus(status) {
    const statusElement = document.getElementById('audio-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Player Control Functions
function togglePlayPause() {
    if (spotifyPlayer) {
        spotifyPlayer.togglePlay().then(() => {
            console.log('🎵 Toggled playback');
        });
    }
}

function previousTrack() {
    if (currentTrackIndex > 0) {
        currentTrackIndex--;
        loadTrack(currentTrackIndex);
    }
}

function nextTrack() {
    if (currentTrackIndex < currentRecommendations.length - 1) {
        currentTrackIndex++;
        loadTrack(currentTrackIndex);
    }
}

// Feedback Functions
function likeTrack() {
    const track = currentRecommendations[currentTrackIndex];
    if (track && currentVybeId) {
        sendTrackFeedback(currentVybeId, track.id, "upvote");
        console.log('👍 Track liked');
    }
}

function dislikeTrack() {
    const track = currentRecommendations[currentTrackIndex];
    if (track && currentVybeId) {
        sendTrackFeedback(currentVybeId, track.id, "downvote");
        console.log('👎 Track disliked');
        
        // Auto-skip to next track
        nextTrack();
    }
}

async function sendTrackFeedback(vybeId, trackId, feedbackType) {
    try {
        const response = await fetch(`/api/v1/vybes/${vybeId}/feedback`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                trackId: trackId,
                feedbackType: feedbackType
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Feedback sent: ${feedbackType}`, data);
    } catch (error) {
        console.error(`❌ Failed to send ${feedbackType} feedback:`, error);
    }
}

// Utility Functions
function showPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

function updateCharacterCount() {
    const contextInput = document.getElementById('context-input');
    const charCount = document.getElementById('char-count');
    
    if (contextInput && charCount) {
        const count = contextInput.value.length;
        charCount.textContent = `${count}/200`;
        
        if (count > 200) {
            charCount.style.color = '#ff4444';
        } else {
            charCount.style.color = '#888';
        }
    }
}

console.log('✅ Vybe app loaded successfully');