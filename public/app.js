// Vybe Frontend with Spotify Web Playback SDK
console.log('🎵 Vybe app initializing...');

// Global state
let currentRecommendations = [];
let currentTrackIndex = 0;
let spotifyPlayer = null;
let spotifyToken = null;
let isSpotifyReady = false;
let spotifyDeviceId = null;
let currentVybeId = null;// DOM ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('📱 DOM loaded, setting up event listeners...');
    
    // Set up event listeners
    setupEventListeners();
    
    // Check for Spotify auth in URL params
    checkSpotifyAuth();
    
    // Initialize Spotify SDK when available
    window.onSpotifyWebPlaybackSDKReady = initializeSpotifyPlayer;
});

function setupEventListeners() {
    // Spotify login
    const spotifyLoginBtn = document.getElementById('spotify-login-btn');
    if (spotifyLoginBtn) {
        spotifyLoginBtn.addEventListener('click', connectSpotify);
    }
    
    // Create Vybe button
    const createBtn = document.getElementById('create-vybe-btn');
    if (createBtn) {
        createBtn.addEventListener('click', createVybe);
    }
    
    // Player controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    const backBtn = document.getElementById('back-btn');
    
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (prevBtn) prevBtn.addEventListener('click', previousTrack);
    if (nextBtn) nextBtn.addEventListener('click', nextTrack);
    if (likeBtn) likeBtn.addEventListener('click', likeTrack);
    if (dislikeBtn) dislikeBtn.addEventListener('click', dislikeTrack);
    if (backBtn) backBtn.addEventListener('click', () => showPage('create-vybe-page'));
    
    // Context character counter
    const contextInput = document.getElementById('context-input');
    if (contextInput) {
        contextInput.addEventListener('input', updateCharacterCount);
    }
}

// Spotify Authentication
    console.log("🔗 Connecting to Spotify...");
    
    // Use Authorization Code (PKCE) via backend
    fetch("/api/v1/spotify/auth-url")
        .then(r => r.json())
        .then(({ data }) => {
            if (data?.authUrl) {
                window.location.href = data.authUrl;
            } else {
                throw new Error("No authUrl returned");
            }
        })
        .catch(err => {
            console.error("❌ Failed to get Spotify auth URL", err);
            alert("Failed to start Spotify authentication. Please try again.");
        });
function checkSpotifyAuth() {
    // Check URL hash for Spotify access token
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
        const token = hash.match(/access_token=([^&]*)/);
        if (token) {
            spotifyToken = token[1];
            showSpotifyConnected();
            // Clean up URL
            window.location.hash = '';
        }
    }
}

function showSpotifyConnected() {
    const authSection = document.getElementById('spotify-auth');
    const authStatus = document.getElementById('auth-status');
    const loginBtn = document.getElementById('spotify-login-btn');
    
    if (authSection && authStatus && loginBtn) {
        loginBtn.style.display = 'none';
        authStatus.classList.remove('hidden');
        authSection.style.background = 'rgba(29, 185, 84, 0.2)';
    }
}

// Initialize Spotify Web Playback SDK
function initializeSpotifyPlayer() {
    console.log('🎵 Initializing Spotify Web Playback SDK...');
    
    // For demo purposes, simulate Spotify player
    // In production, use real Spotify token
    const demoToken = 'demo_spotify_token';
    
    if (!window.Spotify) {
        console.warn('⚠️ Spotify SDK not loaded, using demo mode');
        isSpotifyReady = true;
        return;
    }
    
    spotifyPlayer = new window.Spotify.Player({
        name: 'Vybe Music Player',
        getOAuthToken: cb => { 
            cb(spotifyToken || demoToken);
        },
        volume: 0.5
    });

    // Ready
    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('✅ Spotify player ready with Device ID', device_id);
        isSpotifyReady = true;
        spotifyDeviceId = device_id;    });

    // Not Ready
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('❌ Device ID has gone offline', device_id);
        isSpotifyReady = false;
    });

    // Player state changed
    spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        
        const { paused, track_window: { current_track } } = state;
        
        if (current_track) {
            updatePlayerUI({
                name: current_track.name,
                artists: current_track.artists.map(a => a.name),
                album: current_track.album.name,
                image: current_track.album.images[0]?.url
            });
        }
        
        updatePlayPauseButton(!paused);
    });

    // Connect to the player
    spotifyPlayer.connect();
}

// Create Vybe function
async function createVybe() {
    const contextInput = document.getElementById('context-input');
    const createBtn = document.getElementById('create-vybe-btn');
    const loadingElement = document.getElementById('loading');
    
    if (!contextInput || !createBtn) {
        console.error('❌ Required elements not found');
        return;
    }
    
    const context = contextInput.value.trim();
    
    if (!context) {
        alert('Please describe your vybe first!');
        return;
    }
    
    console.log('🎵 Creating vybe for context:', context);
    
    // Show loading state
    showLoading('Creating your vybe...');
    createBtn.disabled = true;
    
    try {
        const response = await fetch('/api/v1/vybes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                context: context,
                referenceTrackIds: [] // Could add reference tracks later
            })
        });
        
        console.log('📡 API Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Vybe created successfully:', data);
        
        // Store recommendations
        currentRecommendations = data.recommendations || [];
        currentVybeId = data.id;        currentTrackIndex = 0;
        
        if (currentRecommendations.length > 0) {
            // Show player page
            showPage('player-page');
            
            // Play first track
            playTrack(currentRecommendations[0]);
        } else {
            throw new Error('No recommendations received');
        }
        
    } catch (error) {
        console.error('❌ Error creating vybe:', error);
        alert('Failed to create vybe. Please try again.');
    } finally {
        hideLoading();
        createBtn.disabled = false;
    }
}

// Player functions
function playTrack(track) {
    console.log('🎵 Playing track:', track.name, 'by', track.artists.join(', '));
    
    // Update UI
    updatePlayerUI(track);
    
    // Play with Spotify SDK
    if (isSpotifyReady && spotifyPlayer && track.spotifyUri) {
        console.log('🎵 Playing via Spotify SDK:', track.spotifyUri);
        
        // Use Spotify Web API to play track
        playSpotifyTrack(track.spotifyUri);
    } else {
        console.log('🎵 Demo mode - simulating playback');
        updateAudioStatus('🎵 Playing (Demo Mode - Requires Spotify Premium)');
    }
}

async function playSpotifyTrack(uri) {
    try {
        if (!spotifyToken) {
            throw new Error("Missing Spotify access token");
        }
        if (!spotifyDeviceId) {
            throw new Error("Missing Spotify device ID");
        }
        const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${spotifyToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ uris: [uri] }),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Spotify API error: ${res.status} ${res.statusText} - ${errText}`);
        }
        updateAudioStatus("🎵 Playing via Spotify");
        updatePlayPauseButton(true);    } catch (error) {
        console.error('❌ Error playing Spotify track:', error);
        updateAudioStatus('❌ Playback failed');
    }
}

function simulateTrackProgress() {
    // Demo progress bar animation
    const progressBar = document.getElementById('progress');
    if (progressBar) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 1;
            progressBar.style.width = progress + '%';
            
            if (progress >= 100) {
                clearInterval(interval);
                nextTrack();
            }
        }, 1000); // 100 seconds demo track
    }
}

function togglePlayPause() {
    if (isSpotifyReady && spotifyPlayer) {
        spotifyPlayer.togglePlay().then(() => {
            console.log('🎵 Toggled playback');
        });
    } else {
        console.log('🎵 Demo toggle play/pause');
        updateAudioStatus('⏸️ Paused (Demo Mode)');
    }
}

function previousTrack() {
    if (currentTrackIndex > 0) {
        currentTrackIndex--;
        playTrack(currentRecommendations[currentTrackIndex]);
    }
}

function nextTrack() {
    if (currentTrackIndex < currentRecommendations.length - 1) {
        currentTrackIndex++;
        playTrack(currentRecommendations[currentTrackIndex]);
    }
}

function likeTrack() {
    const track = currentRecommendations[currentTrackIndex];
    if (track) {
        console.log('👍 Liked track:', track.name);
        updateAudioStatus('👍 Track liked!');
        
        // Send feedback to backend
        sendTrackFeedback(currentVybeId, track.id, "upvote");
    }
}

function dislikeTrack() {
    const track = currentRecommendations[currentTrackIndex];
    if (track) {
        console.log('👎 Disliked track:', track.name);
        updateAudioStatus('👎 Track disliked');
        
        // Send feedback and skip to next
        sendTrackFeedback(currentVybeId, track.id, "downvote");
        nextTrack();
    }
}

async function sendTrackFeedback(vybeId, trackId, feedbackType) {    try {
        const response = await fetch('/api/v1/vybes/feedback', {
        const response = await fetch(`/api/v1/vybes/${vybeId}/feedback`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${spotifyToken || "demo-token"}`,
            },
            body: JSON.stringify({
                trackId,
                feedbackType
            })
        });        if (response.ok) {
            console.log('✅ Feedback sent successfully');
        }
    } catch (error) {
        console.error('❌ Error sending feedback:', error);
    }
}

// UI Update functions
function updatePlayerUI(track) {
    const titleElement = document.getElementById('track-title');
    const artistElement = document.getElementById('track-artist');
    const albumElement = document.getElementById('track-album');
    const albumCover = document.getElementById('album-cover');
    
    if (titleElement) titleElement.textContent = track.name;
    if (artistElement) artistElement.textContent = track.artists.join(', ');
    if (albumElement) albumElement.textContent = track.album;
    
    if (albumCover && track.image) {
        albumCover.src = track.image;
    }
    
    // Update track counter
    const trackCounter = document.getElementById('track-counter');
    if (trackCounter) {
        trackCounter.textContent = `${currentTrackIndex + 1} of ${currentRecommendations.length}`;
    }
}

function updatePlayPauseButton(isPlaying) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
    }
}

function updateAudioStatus(message) {
    const audioStatus = document.getElementById('audio-status');
    if (audioStatus) {
        audioStatus.textContent = message;
    }
}

function updateCharacterCount() {
    const input = document.getElementById('context-input');
    const counter = document.getElementById('char-count');
    
    if (input && counter) {
        const currentLength = input.value.length;
        const maxLength = parseInt(input.getAttribute('maxlength') || '500', 10);
        counter.textContent = `${currentLength}/${maxLength}`;
        
        if (currentLength > maxLength * 0.9) {
            counter.style.color = '#ff6b6b';
        } else {
            counter.style.color = 'rgba(255,255,255,0.7)';
        }
    }
}

// Utility functions
function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

function showLoading(message = 'Loading...') {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.textContent = message;
        loadingElement.style.display = 'block';
    }
}

function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

console.log('✅ Vybe app JavaScript loaded successfully');