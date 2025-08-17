// Vybe Frontend with Spotify Web Playback SDK
console.log('🎵 Vybe app initializing...');

// Global state
let currentRecommendations = [];
let currentTrackIndex = 0;
let spotifyPlayer = null;
let spotifyToken = null;
let isSpotifyReady = false;

// DOM ready
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
function connectSpotify() {
    console.log('🔗 Connecting to Spotify...');
    
    // For demo purposes, we'll simulate auth
    // In production, this would redirect to Spotify OAuth
    const clientId = 'your_spotify_client_id'; // This would come from environment
    const redirectUri = window.location.origin;
    const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing'
    ].join(' ');
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}`;
    
    // For demo, just show connected state
    showSpotifyConnected();
    
    // In production, uncomment this to redirect to Spotify:
    // window.location.href = authUrl;
}

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
    });

    // Not Ready
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('❌ Device ID has gone offline', device_id);
        isSpotifyReady = false;
    });

    // Player state changed
    spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        
        const { current_track, paused } = state.track_window;
        
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
        currentTrackIndex = 0;
        
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
        // In production, use Spotify Web API to start playback
        // For demo, just update UI
        updateAudioStatus('🎵 Playing via Spotify');
        updatePlayPauseButton(true);
        
        // Simulate track progress
        simulateTrackProgress();
        
    } catch (error) {
        console.error('❌ Error playing Spotify track:', error);
        updateAudioStatus('❌ Playback failed');
    }
}

function simulateTrackProgress() {
    // Demo progress bar animation
    const progressBar = document.getElementById('progress-bar');
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
        sendTrackFeedback(track.trackId, 'upvote');
    }
}

function dislikeTrack() {
    const track = currentRecommendations[currentTrackIndex];
    if (track) {
        console.log('👎 Disliked track:', track.name);
        updateAudioStatus('👎 Track disliked');
        
        // Send feedback and skip to next
        sendTrackFeedback(track.trackId, 'downvote');
        nextTrack();
    }
}

async function sendTrackFeedback(trackId, feedbackType) {
    try {
        const response = await fetch('/api/v1/vybes/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                trackId,
                feedbackType
            })
        });
        
        if (response.ok) {
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
    const counter = document.getElementById('char-counter');
    
    if (input && counter) {
        const currentLength = input.value.length;
        const maxLength = input.getAttribute('maxlength') || 500;
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