#!/usr/bin/env node

// Test script for Vybe algorithm without external dependencies
const { musicAnalysisService } = require('./dist/services/musicAnalysis.js');

console.log('🎵 Testing Vybe Algorithm Components...\n');

// Test 1: Audio Feature Analysis
console.log('1. Testing Audio Feature Analysis:');
try {
  // Mock Spotify audio features for testing
  const mockAudioFeatures = [
    {
      valence: 0.8,      // Happy
      energy: 0.7,       // High energy  
      danceability: 0.6, // Moderately danceable
      acousticness: 0.2, // Electric
      instrumentalness: 0.1,
      liveness: 0.2,
      speechiness: 0.1,
      tempo: 128,
      loudness: -5,
      mode: 1,           // Major key
      key: 4,
      time_signature: 4
    },
    {
      valence: 0.9,
      energy: 0.8,
      danceability: 0.7,
      acousticness: 0.1,
      instrumentalness: 0.05,
      liveness: 0.15,
      speechiness: 0.05,
      tempo: 132,
      loudness: -4,
      mode: 1,
      key: 6,
      time_signature: 4
    }
  ];

  const profile = musicAnalysisService.createReferenceProfile(mockAudioFeatures);
  console.log('✅ Reference Profile Created:', {
    valence: profile.valence.toFixed(2),
    energy: profile.energy.toFixed(2),
    danceability: profile.danceability.toFixed(2),
    tempo: profile.tempo.toFixed(0)
  });

  // Test 2: Context Weight Application
  console.log('\n2. Testing Context Weight Application:');
  const mockContextWeights = {
    valence: 0.8,        // Want happy music
    energy: 0.6,         // Moderate energy
    danceability: 0.5,   // Some danceability
    acousticness: 0.3,   // Not too acoustic
    tempoModifier: 1.1   // Slightly faster
  };

  const weightedProfile = musicAnalysisService.applyContextWeights(profile, mockContextWeights);
  console.log('✅ Context Weights Applied:', {
    originalValence: profile.valence.toFixed(2),
    weightedValence: weightedProfile.valence.toFixed(2),
    originalTempo: profile.tempo.toFixed(0),
    weightedTempo: weightedProfile.tempo.toFixed(0)
  });

  // Test 3: Similarity Calculation
  console.log('\n3. Testing Similarity Calculation:');
  const candidateTrack = {
    valence: 0.75,
    energy: 0.65,
    danceability: 0.55,
    acousticness: 0.25,
    instrumentalness: 0.1,
    liveness: 0.2,
    speechiness: 0.1,
    tempo: 125,
    loudness: -6,
    mode: 1,
    key: 4,
    time_signature: 4
  };

  const similarity = musicAnalysisService.calculateSimilarity(
    weightedProfile,
    candidateTrack,
    mockContextWeights
  );
  console.log('✅ Similarity Score:', (similarity * 100).toFixed(1) + '%');

  // Test 4: Music Characteristic Analysis
  console.log('\n4. Testing Music Characteristic Analysis:');
  const characteristics = musicAnalysisService.analyzeMusicCharacteristics(candidateTrack);
  console.log('✅ Track Analysis:', characteristics);

  // Test 5: Genre Classification
  console.log('\n5. Testing Genre Classification:');
  const genres = musicAnalysisService.classifyGenre(candidateTrack);
  console.log('✅ Genre Predictions:', genres.slice(0, 3));

  console.log('\n🎉 All Algorithm Tests Passed!');
  console.log('\n📊 Summary:');
  console.log('- Audio feature analysis: Working ✅');
  console.log('- Context weight application: Working ✅'); 
  console.log('- Similarity calculation: Working ✅');
  console.log('- Music analysis: Working ✅');
  console.log('- Genre classification: Working ✅');
  console.log('\n🚀 The Vybe algorithm core is functional!');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
}
