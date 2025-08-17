// Vybe Frontend JavaScript
const API_BASE = 'https://vybe-fm-v123.vercel.app';

// Global state
let currentVybe = null;
let currentTrackIndex = 0;
let isPlaying = false;
let currentTracks = [];
let audioPlayer = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateCharCount();
});

function setupEventListeners() {
    // Character counter for context input
    const contextInput = document.getElementById('context-input');
    contextInput.addEventListener('input', updateCharCount);
    
    // Enter key to submit on context input
    contextInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            createVybe();
        }
    });
    
    // Create Vybe button
    const createVybeBtn = document.getElementById('create-vybe-btn');
    createVybeBtn.addEventListener('click', createVybe);
    
    // Test JS button
    const testJsBtn = document.getElementById('test-js-btn');
    testJsBtn.addEventListener('click', function() {
        console.log('🧪 Test JS button clicked!');
        alert('JavaScript is working! Check console for logs.');
    });
    
    // Remove track buttons
    document.querySelectorAll('.remove-track').forEach(btn => {
        btn.addEventListener('click', function() {
            const trackNumber = this.getAttribute('data-track');
            clearTrack(trackNumber);
        });
    });
    
    // Player controls
    const prevBtn = document.getElementById('prev-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const nextBtn = document.getElementById('next-btn');
    const backBtn = document.getElementById('back-btn');
    
    if (prevBtn) prevBtn.addEventListener('click', previousTrack);
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (nextBtn) nextBtn.addEventListener('click', nextTrack);
    if (backBtn) backBtn.addEventListener('click', goBack);
    
    // Feedback buttons
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    
    if (likeBtn) {
        likeBtn.addEventListener('click', function() {
            giveFeedback('like');
        });
    }
    
    if (dislikeBtn) {
        dislikeBtn.addEventListener('click', function() {
            giveFeedback('dislike');
        });
    }
}

function updateCharCount() {
    const contextInput = document.getElementById('context-input');
    const charCount = document.getElementById('char-count');
    const count = contextInput.value.length;
    charCount.textContent = count;
    
    // Update button state
    const createBtn = document.getElementById('create-vybe-btn');
    createBtn.disabled = count < 5; // Minimum 5 characters
}

function clearTrack(trackNumber) {
    document.getElementById(`ref-track-${trackNumber}`).value = '';
}

async function createVybe() {
    console.log('🎵 Create Vybe button clicked!');
    
    const contextInput = document.getElementById('context-input');
    const context = contextInput.value.trim();
    
    console.log('Context input:', context);
    
    if (!context || context.length < 5) {
        alert('Please describe your vybe (at least 5 characters)');
        return;
    }
    
    // Get reference tracks
    const referenceTrackIds = [];
    for (let i = 1; i <= 3; i++) {
        const trackInput = document.getElementById(`ref-track-${i}`);
        if (trackInput.value.trim()) {
            referenceTrackIds.push(trackInput.value.trim());
        }
    }
    
    console.log('Reference tracks:', referenceTrackIds);
    
    // Disable button and show loading
    const createBtn = document.getElementById('create-vybe-btn');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating Vybe...';
    showLoading(true);
    
    const requestData = {
        context: context,
        referenceTrackIds: referenceTrackIds
    };
    
    console.log('Sending request to:', `${API_BASE}/api/v1/vybes`);
    console.log('Request data:', requestData);
    
    try {
        const response = await fetch(`${API_BASE}/api/v1/vybes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', [...response.headers.entries()]);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error text:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        
        const vybeData = await response.json();
        console.log('✅ Vybe created successfully:', vybeData);
        
        // Store current vybe
        currentVybe = vybeData;
        currentTracks = vybeData.recommendations || [];
        currentTrackIndex = 0;
        
        console.log('Stored tracks:', currentTracks);
        
        // Navigate to player
        showPlayerPage();
        
    } catch (error) {
        console.error('❌ Error creating vybe:', error);
        alert(`Sorry, there was an error creating your vybe: ${error.message}\n\nPlease check the browser console for more details.`);
    } finally {
        // Re-enable button and reset text
        const createBtn = document.getElementById('create-vybe-btn');
        createBtn.disabled = false;
        createBtn.textContent = 'Create Vybe';
        showLoading(false);
    }
}

function showPlayerPage() {
    // Hide create page, show player page
    document.getElementById('create-vybe-page').classList.remove('active');
    document.getElementById('player-page').classList.add('active');
    
    // Update player with current vybe
    if (currentVybe) {
        document.getElementById('current-context').textContent = currentVybe.context;
        updatePlayerUI();
        populateQueue();
    }
}

function updatePlayerUI() {
    if (!currentTracks || currentTracks.length === 0) {
        // Show demo track
        document.getElementById('track-title').textContent = 'Demo Track';
        document.getElementById('track-artist').textContent = 'Demo Artist';
        document.getElementById('track-album').textContent = 'Demo Album';
        return;
    }
    
    const currentTrack = currentTracks[currentTrackIndex];
    if (currentTrack) {
        document.getElementById('track-title').textContent = currentTrack.name || 'Unknown Track';
        document.getElementById('track-artist').textContent = 
            currentTrack.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
        document.getElementById('track-album').textContent = currentTrack.album?.name || 'Unknown Album';
        
        // Update album cover if available
        if (currentTrack.album?.images && currentTrack.album.images.length > 0) {
            document.getElementById('album-cover').src = currentTrack.album.images[0].url;
        }
        
        // Load audio if preview URL is available
        loadAudio(currentTrack);
    }
    
    updatePlayButtonState();
}

function loadAudio(track) {
    // Stop current audio if playing
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        audioPlayer = null;
        console.log('🔄 Stopped previous audio');
    }
    
    // Create new audio player if preview URL exists
    if (track.previewUrl && track.previewUrl !== 'null') {
        console.log('🎵 Loading audio preview for:', track.name);
        console.log('🔗 Audio URL:', track.previewUrl);
        
        audioPlayer = new Audio();
        audioPlayer.crossOrigin = 'anonymous'; // Help with CORS
        audioPlayer.volume = 0.7; // Set to 70% volume
        audioPlayer.preload = 'auto';
        
        // Audio event listeners with detailed logging
        audioPlayer.addEventListener('loadstart', () => {
            console.log('📡 Audio loading started...');
            updateAudioStatus('📡 Loading audio...');
        });
        
        audioPlayer.addEventListener('loadeddata', () => {
            console.log('📊 Audio data loaded');
            updateAudioStatus('📊 Audio data loaded');
        });
        
        audioPlayer.addEventListener('canplay', () => {
            console.log('✅ Audio ready to play!');
            updateAudioStatus('✅ Audio ready to play!');
        });
        
        audioPlayer.addEventListener('canplaythrough', () => {
            console.log('🚀 Audio fully loaded');
            updateAudioStatus('🚀 Audio fully loaded');
        });
        
        audioPlayer.addEventListener('ended', () => {
            console.log('🏁 Audio ended, moving to next track');
            nextTrack();
        });
        
        audioPlayer.addEventListener('error', (e) => {
            console.error('❌ Audio error:', e);
            console.error('❌ Error details:', audioPlayer.error);
            updateAudioStatus('❌ Audio failed to load');
            console.log('💡 Trying next track...');
            // Try next track if this one fails
            setTimeout(() => nextTrack(), 1000);
        });
        
        audioPlayer.addEventListener('progress', () => {
            console.log('📥 Audio download progress');
        });
        
        // Set the source and load
        audioPlayer.src = track.previewUrl;
        audioPlayer.load();
        
        // Auto-play if currently playing
        if (isPlaying) {
            setTimeout(() => {
                audioPlayer.play().then(() => {
                    console.log('🎶 Auto-playing:', track.name);
                }).catch(e => {
                    console.log('🚫 Auto-play prevented by browser:', e.message);
                    console.log('💡 Click play button to start audio');
                });
            }, 100);
        }
    } else {
        console.log('❌ No preview URL available for:', track.name);
        console.log('📝 Track data:', track);
        updateAudioStatus('❌ No audio preview available');
    }
}

function updateAudioStatus(message) {
    const statusElement = document.getElementById('audio-status');
    if (statusElement) {
        statusElement.textContent = message;
        console.log('🔄 Audio Status:', message);
    }
}

function populateQueue() {
    const queueList = document.getElementById('queue-list');
    queueList.innerHTML = '';
    
    if (!currentTracks || currentTracks.length <= 1) {
        queueList.innerHTML = '<p style="color: #666; font-style: italic;">No upcoming tracks</p>';
        return;
    }
    
    // Show next tracks
    const upcomingTracks = currentTracks.slice(currentTrackIndex + 1);
    upcomingTracks.forEach((track, index) => {
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        queueItem.innerHTML = `
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23333'/%3E%3Ctext x='20' y='20' font-family='Arial' font-size='16' fill='white' text-anchor='middle' dominant-baseline='middle'%3E🎵%3C/text%3E%3C/svg%3E" alt="Album">
            <div class="queue-item-info">
                <h5>${track.name || 'Unknown Track'}</h5>
                <p>${track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}</p>
            </div>
        `;
        queueList.appendChild(queueItem);
    });
}

function togglePlayPause() {
    isPlaying = !isPlaying;
    updatePlayButtonState();
    
    // Control actual audio playback
    if (audioPlayer) {
        if (isPlaying) {
            audioPlayer.play().then(() => {
                console.log('🎵 Playing:', currentTracks[currentTrackIndex]?.name);
                updateAudioStatus('🎵 Playing audio');
            }).catch(e => {
                console.log('❌ Play failed:', e);
                updateAudioStatus('❌ Playback failed');
                isPlaying = false;
                updatePlayButtonState();
            });
        } else {
            audioPlayer.pause();
            console.log('⏸️ Paused');
            updateAudioStatus('⏸️ Paused');
        }
    } else {
        const status = isPlaying ? '🎵 Playing (no audio available)' : '⏸️ Paused';
        console.log(status);
        updateAudioStatus(status);
    }
}

function updatePlayButtonState() {
    const playBtn = document.getElementById('play-pause-btn');
    playBtn.textContent = isPlaying ? '⏸️' : '▶️';
}

function previousTrack() {
    if (currentTrackIndex > 0) {
        currentTrackIndex--;
        updatePlayerUI();
        populateQueue();
        console.log('⏮️ Previous track:', currentTracks[currentTrackIndex]?.name);
    }
}

function nextTrack() {
    if (currentTrackIndex < currentTracks.length - 1) {
        currentTrackIndex++;
        updatePlayerUI();
        populateQueue();
        console.log('⏭️ Next track:', currentTracks[currentTrackIndex]?.name);
    } else {
        // End of playlist - stop playing
        isPlaying = false;
        updatePlayButtonState();
        if (audioPlayer) {
            audioPlayer.pause();
        }
        console.log('🏁 End of playlist');
    }
}

function giveFeedback(type) {
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    
    // Reset both buttons
    likeBtn.classList.remove('active');
    dislikeBtn.classList.remove('active');
    
    // Activate the selected button
    if (type === 'like') {
        likeBtn.classList.add('active');
    } else {
        dislikeBtn.classList.add('active');
    }
    
    // In a real implementation, this would send feedback to the API
    console.log(`Feedback: ${type} for track:`, currentTracks[currentTrackIndex]);
    
    // Auto-advance to next track after feedback
    setTimeout(() => {
        nextTrack();
        // Reset feedback buttons for next track
        likeBtn.classList.remove('active');
        dislikeBtn.classList.remove('active');
    }, 1000);
}

function goBack() {
    document.getElementById('player-page').classList.remove('active');
    document.getElementById('create-vybe-page').classList.add('active');
    
    // Reset player state
    isPlaying = false;
    updatePlayButtonState();
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}

// Simulated progress bar animation
let progressInterval;

function startProgressAnimation() {
    const progressBar = document.getElementById('progress');
    let progress = 0;
    const duration = 45; // 45 seconds demo
    
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        progress += 100 / duration;
        if (progress >= 100) {
            progress = 0;
            nextTrack(); // Auto-advance when song "ends"
        }
        progressBar.style.width = `${progress}%`;
        
        // Update time display
        const currentSeconds = Math.floor((progress / 100) * duration);
        document.getElementById('current-time').textContent = formatTime(currentSeconds);
    }, 1000);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Start progress animation when entering player (for demo purposes)
document.addEventListener('DOMContentLoaded', function() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const playerPage = document.getElementById('player-page');
                if (playerPage.classList.contains('active')) {
                    startProgressAnimation();
                } else {
                    clearInterval(progressInterval);
                }
            }
        });
    });
    
    observer.observe(document.getElementById('player-page'), { attributes: true });
});
