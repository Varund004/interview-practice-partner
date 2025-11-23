// Global state
let currentSession = null;
let timerInterval = null;
let startTime = null;
let roles = {};
let conversationHistory = [];

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