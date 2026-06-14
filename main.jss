/**
 * Traffic Signal Detector - Frontend JavaScript
 * Handles status polling and audio alerts using Web Speech API
 */
(function() {
    'use strict';
    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------
    const CONFIG = {
        pollInterval: 200,      // Status polling interval in ms
        speechRate: 1.0,        // Speech speed (0.1 to 10)
        speechPitch: 1.0,       // Speech pitch (0 to 2)
        speechVolume: 1.0       // Speech volume (0 to 1)
    };
    // -------------------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------------------
    const elements = {
        videoFeed: document.getElementById('video-feed'),
        videoOverlay: document.getElementById('video-overlay'),
        colorDisplay: document.getElementById('color-display'),
        colorText: document.getElementById('color-text'),
        confidenceFill: document.getElementById('confidence-fill'),
        confidenceValue: document.getElementById('confidence-value'),
        audioToggle: document.getElementById('audio-toggle'),
        lightRed: document.getElementById('light-red'),
        lightYellow: document.getElementById('light-yellow'),
        lightGreen: document.getElementById('light-green')
    };
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    let currentColor = 'None';
    let audioEnabled = true;
    let speechSynthesis = window.speechSynthesis;
    let isSpeaking = false;
    // -------------------------------------------------------------------------
    // Speech Functions
    // -------------------------------------------------------------------------
    
    /**
     * Speak the detected color using Web Speech API
     */
    function speakColor(color) {
        // Don't speak if audio is disabled or already speaking
        if (!audioEnabled || isSpeaking || color === 'None') {
            return;
        }
        // Check if speech synthesis is available
        if (!speechSynthesis) {
            console.warn('Speech synthesis not available');
            return;
        }
        // Cancel any ongoing speech
        speechSynthesis.cancel();
        // Create speech utterance
        const utterance = new SpeechSynthesisUtterance(color);
        utterance.rate = CONFIG.speechRate;
        utterance.pitch = CONFIG.speechPitch;
        utterance.volume = CONFIG.speechVolume;
        // Set speaking flag
        isSpeaking = true;
        utterance.onend = function() {
            isSpeaking = false;
        };
        utterance.onerror = function(event) {
            console.error('Speech error:', event.error);
            isSpeaking = false;
        };
        // Speak
        speechSynthesis.speak(utterance);
    }
    // -------------------------------------------------------------------------
    // UI Update Functions
    // -------------------------------------------------------------------------
    
    /**
     * Update the traffic light indicator
     */
    function updateTrafficLight(color) {
        // Remove active class from all lights
        elements.lightRed.classList.remove('active');
        elements.lightYellow.classList.remove('active');
        elements.lightGreen.classList.remove('active');
        // Add active class to detected color
        switch (color) {
            case 'Red':
                elements.lightRed.classList.add('active');
                break;
            case 'Yellow':
                elements.lightYellow.classList.add('active');
                break;
            case 'Green':
                elements.lightGreen.classList.add('active');
                break;
        }
    }
    /**
     * Update the color display box
     */
    function updateColorDisplay(color) {
        // Remove all color classes
        elements.colorDisplay.classList.remove('red', 'yellow', 'green');
        // Add appropriate color class
        switch (color) {
            case 'Red':
                elements.colorDisplay.classList.add('red');
                break;
            case 'Yellow':
                elements.colorDisplay.classList.add('yellow');
                break;
            case 'Green':
                elements.colorDisplay.classList.add('green');
                break;
        }
        // Update text
        elements.colorText.textContent = color;
    }
    /**
     * Update the confidence meter
     */
    function updateConfidence(confidence) {
        elements.confidenceFill.style.width = confidence + '%';
        elements.confidenceValue.textContent = confidence + '%';
    }
    /**
     * Handle status update from server
     */
    function handleStatusUpdate(data) {
        const { color, changed, confidence } = data;
        // Update UI
        updateTrafficLight(color);
        updateColorDisplay(color);
        updateConfidence(confidence);
        // Play audio if color changed
        if (changed && color !== currentColor) {
            speakColor(color);
            currentColor = color;
        }
    }
    // -------------------------------------------------------------------------
    // API Functions
    // -------------------------------------------------------------------------
    
    /**
     * Fetch current detection status from server
     */
    async function fetchStatus() {
        try {
            const response = await fetch('/status');
            if (!response.ok) {
                throw new Error('Status request failed');
            }
            const data = await response.json();
            handleStatusUpdate(data);
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    }
    // -------------------------------------------------------------------------
    // Event Handlers
    // -------------------------------------------------------------------------
    
    /**
     * Handle video feed load
     */
    function onVideoLoad() {
        elements.videoOverlay.classList.add('hidden');
    }
    /**
     * Handle video feed error
     */
    function onVideoError() {
        elements.videoOverlay.innerHTML = '<span>Camera not available.<br>Check console for details.</span>';
        elements.videoOverlay.classList.remove('hidden');
    }
    /**
     * Handle audio toggle change
     */
    function onAudioToggle() {
        audioEnabled = elements.audioToggle.checked;
        
        // Cancel any ongoing speech if audio is disabled
        if (!audioEnabled && speechSynthesis) {
            speechSynthesis.cancel();
            isSpeaking = false;
        }
    }
    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------
    
    function init() {
        // Set up event listeners
        elements.videoFeed.addEventListener('load', onVideoLoad);
        elements.videoFeed.addEventListener('error', onVideoError);
        elements.audioToggle.addEventListener('change', onAudioToggle);
        // Start polling for status updates
        setInterval(fetchStatus, CONFIG.pollInterval);
        // Initial status fetch
        fetchStatus();
        // Log initialization
        console.log('Traffic Signal Detector initialized');
        console.log('Audio alerts:', audioEnabled ? 'enabled' : 'disabled');
    }
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})
