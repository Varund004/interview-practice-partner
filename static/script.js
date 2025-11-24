// Global state
let currentSession = null;
let timerInterval = null;
let startTime = null;
let roles = {};
let conversationHistory = [];

// Voice Recognition
let recognition = null;
let isRecording = false;

// Text-to-Speech
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let voiceEnabled = true;
let autoPlayEnabled = true;
let selectedVoiceGender = 'female';
let speechRate = 1.0;
let availableVoices = [];

// DOM Elements
const landingPage = document.getElementById('landing-page');
const interviewPage = document.getElementById('interview-page');
const feedbackPage = document.getElementById('feedback-page');
const roleSelect = document.getElementById('roleSelect');
const roleDetails = document.getElementById('roleDetails');
const userNameInput = document.getElementById('userName');
const startInterviewBtn = document.getElementById('startInterview');
const addToCalendarBtn = document.getElementById('addToCalendar');
const scheduleDate = document.getElementById('scheduleDate');
const scheduleTime = document.getElementById('scheduleTime');
const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendMessageBtn = document.getElementById('sendMessage');
const endInterviewBtn = document.getElementById('endInterview');
const timerDisplay = document.getElementById('timer');
const currentRoleDisplay = document.getElementById('currentRole');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRoles();
    setupEventListeners();
    setDefaultDateTime();
    initVoiceRecognition();
    initTextToSpeech();
});

// Load available roles
async function loadRoles() {
    try {
        const response = await fetch('/api/roles');
        const data = await response.json();
        roles = data.roles;
        
        // Populate role select
        Object.entries(roles).forEach(([key, role]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = role.name;
            roleSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading roles:', error);
        showError('Failed to load interview roles. Please refresh the page.');
    }
}

// Setup event listeners
function setupEventListeners() {
    roleSelect.addEventListener('change', handleRoleChange);
    startInterviewBtn.addEventListener('click', startInterview);
    addToCalendarBtn.addEventListener('click', addToGoogleCalendar);
    sendMessageBtn.addEventListener('click', sendMessage);
    endInterviewBtn.addEventListener('click', endInterview);
    
    // Voice controls
    if (document.getElementById('micButton')) {
        document.getElementById('micButton').addEventListener('click', toggleRecording);
    }
    if (document.getElementById('toggleVoice')) {
        document.getElementById('toggleVoice').addEventListener('click', toggleVoice);
    }
    if (document.getElementById('voiceSettings')) {
        document.getElementById('voiceSettings').addEventListener('click', openVoiceSettings);
    }
    if (document.getElementById('closeSettings')) {
        document.getElementById('closeSettings').addEventListener('click', closeVoiceSettings);
    }
    if (document.getElementById('voiceGender')) {
        document.getElementById('voiceGender').addEventListener('change', (e) => {
            selectedVoiceGender = e.target.value;
        });
    }
    if (document.getElementById('speechRate')) {
        document.getElementById('speechRate').addEventListener('input', (e) => {
            speechRate = parseFloat(e.target.value);
            document.getElementById('rateValue').textContent = speechRate + 'x';
        });
    }
    if (document.getElementById('autoPlay')) {
        document.getElementById('autoPlay').addEventListener('change', (e) => {
            autoPlayEnabled = e.target.checked;
        });
    }
    
    // Enter key to send message
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Feedback page buttons
    document.getElementById('downloadTranscript').addEventListener('click', downloadTranscript);
    document.getElementById('downloadFeedback').addEventListener('click', downloadFeedback);
    document.getElementById('startNew').addEventListener('click', () => {
        location.reload();
    });
}

// Set default date and time to now
function setDefaultDateTime() {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    scheduleDate.value = date;
    scheduleTime.value = time;
}

// Handle role selection change
function handleRoleChange() {
    const selectedRole = roleSelect.value;
    
    if (!selectedRole) {
        roleDetails.style.display = 'none';
        return;
    }
    
    const role = roles[selectedRole];
    document.getElementById('roleName').textContent = role.name;
    document.getElementById('roleDescription').textContent = role.description;
    document.getElementById('numQuestions').textContent = `${role.num_questions} questions`;
    document.getElementById('estimatedTime').textContent = `${role.estimated_time} minutes`;
    
    roleDetails.style.display = 'block';
}

// Add to Google Calendar
function addToGoogleCalendar() {
    const selectedRole = roleSelect.value;
    if (!selectedRole) {
        alert('Please select a role first');
        return;
    }
    
    const role = roles[selectedRole];
    const date = scheduleDate.value;
    const time = scheduleTime.value;
    
    if (!date || !time) {
        alert('Please select date and time');
        return;
    }
    
    // Format for Google Calendar
    const startDateTime = new Date(`${date}T${time}`);
    const endDateTime = new Date(startDateTime.getTime() + role.estimated_time * 60000);
    
    const formatDate = (d) => {
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const title = encodeURIComponent(`Interview Practice - ${role.name}`);
    const details = encodeURIComponent(`Mock interview practice session for ${role.name} position using AI Interview Partner`);
    const startStr = formatDate(startDateTime);
    const endStr = formatDate(endDateTime);
    
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${startStr}/${endStr}`;
    
    window.open(calendarUrl, '_blank');
}

// Start interview
async function startInterview() {
    const selectedRole = roleSelect.value;
    const userName = userNameInput.value.trim() || 'Candidate';
    
    if (!selectedRole) {
        alert('Please select a role first');
        return;
    }
    
    startInterviewBtn.disabled = true;
    startInterviewBtn.innerHTML = '<span class="loading"></span> Starting...';
    
    try {
        const response = await fetch('/api/interview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: selectedRole, user_name: userName })
        });
        
        if (!response.ok) throw new Error('Failed to start interview');
        
        const data = await response.json();
        currentSession = data.session_id;
        conversationHistory = [];
        
        // Switch to interview page
        landingPage.style.display = 'none';
        interviewPage.style.display = 'block';
        
        // Set role name
        currentRoleDisplay.textContent = `${data.role_info.name} Interview`;
        
        // Add first message
        addMessage('ai', data.first_question);
        
        // Start timer
        startTimer();
        
        // Focus input
        userInput.focus();
        
    } catch (error) {
        console.error('Error starting interview:', error);
        alert('Failed to start interview. Please try again.');
        startInterviewBtn.disabled = false;
        startInterviewBtn.innerHTML = 'Start Interview Now';
    }
}

// Start timer
function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

// Add message to chat
function addMessage(role, content) {
    conversationHistory.push({ role, content });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    
    const avatar = role === 'ai' ? '🤖' : '👤';
    const name = role === 'ai' ? 'AI Interviewer' : userNameInput.value || 'You';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-avatar ${role}-avatar">${avatar}</div>
            <span class="message-name">${name}</span>
        </div>
        <div class="message-content">${escapeHtml(content)}</div>
    `;
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Add play button for AI messages
    if (role === 'ai') {
        addPlayButton(messageDiv, content);
        
        // Auto-play if enabled
        if (autoPlayEnabled && voiceEnabled) {
            speakText(content, true);
        }
    }
}

// Send message
async function sendMessage() {
    const message = userInput.value.trim();
    
    if (!message) {
        return;
    }
    
    // Disable input while processing
    userInput.disabled = true;
    sendMessageBtn.disabled = true;
    sendMessageBtn.innerHTML = '<span class="loading"></span>';
    
    // Add user message
    addMessage('user', message);
    userInput.value = '';
    
    try {
        const response = await fetch('/api/interview/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSession,
                message: message
            })
        });
        
        if (!response.ok) throw new Error('Failed to send message');
        
        const data = await response.json();
        
        // Add AI response
        addMessage('ai', data.response);
        
        // Check if interview is complete
        if (data.is_complete) {
            setTimeout(() => {
                showFeedback(data.feedback);
            }, 1000);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage('ai', 'I apologize, but I encountered an error. Please try again.');
    } finally {
        userInput.disabled = false;
        sendMessageBtn.disabled = false;
        sendMessageBtn.innerHTML = 'Send <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        userInput.focus();
    }
}

// End interview manually
async function endInterview() {
    if (!confirm('Are you sure you want to end the interview? You will receive feedback on your responses so far.')) {
        return;
    }
    
    endInterviewBtn.disabled = true;
    endInterviewBtn.textContent = 'Ending...';
    
    try {
        const response = await fetch(`/api/interview/end?session_id=${currentSession}`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to end interview');
        
        const data = await response.json();
        showFeedback(data.feedback);
        
    } catch (error) {
        console.error('Error ending interview:', error);
        alert('Failed to end interview properly. Please try again.');
        endInterviewBtn.disabled = false;
        endInterviewBtn.textContent = 'End Interview';
    }
}

// Show feedback page
function showFeedback(feedback) {
    clearInterval(timerInterval);
    
    interviewPage.style.display = 'none';
    feedbackPage.style.display = 'block';
    
    document.getElementById('feedbackContent').textContent = feedback;
}

// Download transcript
async function downloadTranscript() {
    try {
        const response = await fetch(`/api/interview/transcript/${currentSession}`);
        if (!response.ok) throw new Error('Failed to get transcript');
        
        const data = await response.json();
        const blob = new Blob([data.transcript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `interview_transcript_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading transcript:', error);
        alert('Failed to download transcript');
    }
}

// Download feedback
function downloadFeedback() {
    const feedback = document.getElementById('feedbackContent').textContent;
    const blob = new Blob([feedback], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview_feedback_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// Utility: Show error
function showError(message) {
    alert(message);
}

// ========== VOICE RECOGNITION ==========

function initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; // Indian English
        
        recognition.onstart = () => {
            isRecording = true;
            const micBtn = document.getElementById('micButton');
            const micText = document.getElementById('micText');
            const hint = document.getElementById('inputHint');
            
            if (micBtn) {
                micBtn.classList.add('recording');
                micText.textContent = 'Listening...';
            }
            if (hint) {
                hint.textContent = '🎤 Listening... Speak now!';
                hint.style.color = 'var(--danger-color)';
            }
        };
        
        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update textarea with transcript
            if (finalTranscript) {
                userInput.value = (userInput.value + ' ' + finalTranscript).trim();
            } else if (interimTranscript) {
                // Show interim results
                const currentValue = userInput.value;
                userInput.value = (currentValue + ' ' + interimTranscript).trim();
            }
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            resetMicButton();
            
            if (event.error === 'no-speech') {
                showError('No speech detected. Please try again.');
            } else if (event.error === 'not-allowed') {
                showError('Microphone access denied. Please allow microphone access in browser settings.');
            } else {
                showError('Voice recognition error: ' + event.error);
            }
        };
        
        recognition.onend = () => {
            resetMicButton();
        };
    } else {
        console.warn('Speech recognition not supported in this browser');
        const micBtn = document.getElementById('micButton');
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.title = 'Voice input not supported in this browser. Please use Chrome or Edge.';
        }
    }
}

function toggleRecording() {
    if (!recognition) {
        alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
        return;
    }
    
    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (error) {
            console.error('Error starting recognition:', error);
            showError('Could not start voice recognition. Please try again.');
        }
    }
}

function resetMicButton() {
    isRecording = false;
    const micBtn = document.getElementById('micButton');
    const micText = document.getElementById('micText');
    const hint = document.getElementById('inputHint');
    
    if (micBtn) {
        micBtn.classList.remove('recording');
        micText.textContent = 'Speak';
    }
    if (hint) {
        hint.textContent = 'Press Enter to send, Shift+Enter for new line • Click 🎤 to speak';
        hint.style.color = '';
    }
}

// ========== TEXT-TO-SPEECH ==========

function initTextToSpeech() {
    // Load available voices
    function loadVoices() {
        availableVoices = speechSynthesis.getVoices();
    }
    
    loadVoices();
    
    // Chrome loads voices asynchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
}

function getIndianVoice(gender) {
    // Try to find Indian English voice
    let voice = availableVoices.find(v => 
        v.lang.includes('en-IN') && 
        (gender === 'female' ? v.name.toLowerCase().includes('female') || !v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('male'))
    );
    
    // Fallback to any Indian English voice
    if (!voice) {
        voice = availableVoices.find(v => v.lang.includes('en-IN'));
    }
    
    // Fallback to any English voice
    if (!voice) {
        voice = availableVoices.find(v => 
            v.lang.includes('en') && 
            (gender === 'female' ? !v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('male'))
        );
    }
    
    // Final fallback
    if (!voice) {
        voice = availableVoices.find(v => v.lang.includes('en'));
    }
    
    return voice;
}

function speakText(text, autoPlay = true) {
    if (!voiceEnabled || !autoPlay) return;
    
    // Stop any ongoing speech
    if (currentUtterance) {
        speechSynthesis.cancel();
    }
    
    currentUtterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    const voice = getIndianVoice(selectedVoiceGender);
    if (voice) {
        currentUtterance.voice = voice;
    }
    
    currentUtterance.rate = speechRate;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;
    
    currentUtterance.onend = () => {
        currentUtterance = null;
    };
    
    currentUtterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        currentUtterance = null;
    };
    
    speechSynthesis.speak(currentUtterance);
}

function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    const toggleBtn = document.getElementById('toggleVoice');
    const voiceIcon = document.getElementById('voiceIcon');
    
    if (toggleBtn) {
        if (voiceEnabled) {
            toggleBtn.classList.remove('muted');
            toggleBtn.title = 'Mute AI Voice';
        } else {
            toggleBtn.classList.add('muted');
            toggleBtn.title = 'Unmute AI Voice';
            speechSynthesis.cancel(); // Stop current speech
        }
    }
    
    // Update icon
    if (voiceIcon && !voiceEnabled) {
        voiceIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
        `;
    } else if (voiceIcon) {
        voiceIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        `;
    }
}

function openVoiceSettings() {
    const modal = document.getElementById('voiceSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeVoiceSettings() {
    const modal = document.getElementById('voiceSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function addPlayButton(messageDiv, text) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    const playBtn = document.createElement('button');
    playBtn.className = 'btn-play';
    playBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Play</span>
    `;
    
    playBtn.onclick = () => {
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            playBtn.classList.remove('playing');
        } else {
            playBtn.classList.add('playing');
            const utterance = new SpeechSynthesisUtterance(text);
            const voice = getIndianVoice(selectedVoiceGender);
            if (voice) utterance.voice = voice;
            utterance.rate = speechRate;
            utterance.onend = () => playBtn.classList.remove('playing');
            speechSynthesis.speak(utterance);
        }
    };
    
    actionsDiv.appendChild(playBtn);
    messageDiv.appendChild(actionsDiv);
}
